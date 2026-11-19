/**
 * Live settle-quality eval. Runs each case through the real orchestrator
 * (model route) and scores placement, invention, and latency.
 *
 *   ANTHROPIC_API_KEY=... npm run eval
 *
 * Metrics per case: correct placements, wrong-target placements, Scribe
 * invention violations, latency. Without a key, it runs the local route so
 * the harness itself stays tested.
 */
import { DocEngine, type Op } from "../src/engine/engine";
import { localPlan } from "../src/engine/local";
import { emptyDraft, type Block } from "../src/engine/model";
import { buildRequest, compilePlan, headingOf, noveltyRatio } from "../src/engine/settle";
import { ClaudeProvider } from "../src/host/ai/claude";
import { Orchestrator } from "../src/host/ai/orchestrator";

interface Case {
  name: string;
  role?: "partner" | "scribe";
  page: [kind: Block["kind"], text: string][];
  speech: string;
  /** Expected heading text each settled idea lands under (in order). null = no heading. */
  expect: (string | null)[];
}

const PAGE: Case["page"] = [
  ["heading", "Problem"],
  ["paragraph", "Interviews are hard to follow when you are managing a doc."],
  ["heading", "Pricing"],
  ["paragraph", "Per seat for teams."],
  ["heading", "Risks"],
  ["paragraph", "Latency could break trust."],
];

const CASES: Case[] = [
  { name: "routes to pricing", page: PAGE, speech: "um I think we should also have a free tier for students", expect: ["Pricing"] },
  { name: "routes to risks", page: PAGE, speech: "another worry is that people won't trust the AI to write in front of a client", expect: ["Risks"] },
  { name: "splits two ideas", page: PAGE, speech: "the real problem is context switching, and on price maybe twelve dollars a month", expect: ["Problem", "Pricing"] },
  { name: "new topic gets a heading", page: PAGE, speech: "for go to market we should start with product managers who do interviews", expect: ["*new*"] },
  { name: "scribe keeps words", role: "scribe", page: PAGE, speech: "so basically the thing is we lose people right at signup you know", expect: ["*any*"] },
];

async function main() {
  const key = process.env.ANTHROPIC_API_KEY;
  const provider = key ? new ClaudeProvider(() => key) : null;
  const orch = new Orchestrator(provider, { deadlineMs: 30_000 });
  console.log(`route: ${provider ? provider.model : "local (no key)"}\n`);
  let correct = 0;
  let wrong = 0;
  let violations = 0;
  const lat: number[] = [];

  for (const c of CASES) {
    const e = new DocEngine({ ...emptyDraft("eval"), role: c.role ?? "partner" });
    let after: string | null = null;
    const ops: Op[] = c.page.map(([kind, text], i) => {
      const id = `p${i}`;
      const op: Op = { t: "insert", block: { id, kind, text, wet: false, rev: 0, origin: "typed" }, after };
      after = id;
      return op;
    });
    ops.push({ t: "insert", block: { id: "w", kind: "paragraph", text: c.speech, wet: true, rev: 0, origin: "voice" }, after });
    e.commit({ id: "seed", actor: "user", label: "seed", ops });

    const req = buildRequest(e.snapshot(), ["w"], { currentHeadingId: null, recent: [] });
    const res = provider ? await orch.settle(req) : { plan: localPlan(req)!, latencyMs: 0, route: "local" as const };
    lat.push(res.latencyMs);
    const comp = compilePlan(e.state, req, res.plan);
    e.commit({ id: "s", actor: "phlo", label: "Settle", ops: comp.ops });

    const headings = new Set(c.page.filter((p) => p[0] === "heading").map((p) => p[1]));
    const placed = comp.settledIds.map((id) => {
      const h = headingOf(e.state.blocks, id);
      return h ? e.block(h)!.text : null;
    });
    let ok = 0;
    c.expect.forEach((want, i) => {
      const got = placed[i];
      const hit = want === "*any*" || (want === "*new*" ? !!got && !headings.has(got) : got === want);
      if (hit) ok++;
    });
    const caseWrong = c.expect.length - ok;
    correct += ok;
    wrong += caseWrong;
    if (c.role === "scribe") {
      for (const id of comp.settledIds) if (noveltyRatio(e.block(id)?.text ?? "", c.speech) > 0.2) violations++;
    }
    console.log(`${caseWrong ? "✗" : "✓"} ${c.name.padEnd(28)} ${res.route.padEnd(8)} ${String(res.latencyMs).padStart(6)}ms  -> ${placed.map((p) => p ?? "(here)").join(", ")}`);
  }
  lat.sort((a, b) => a - b);
  console.log(`\ncorrect=${correct} wrongTarget=${wrong} scribeViolations=${violations} p50=${lat[Math.floor(lat.length / 2)]}ms max=${lat[lat.length - 1]}ms`);
}

void main();
