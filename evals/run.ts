/**
 * Settle eval: replays each golden scenario turn by turn through the same path
 * the app uses (buildRequest -> Orchestrator -> compilePlan -> DocEngine.commit)
 * and grades every turn against its goldens.
 *
 *   npm run eval                      # ChatGPT via Codex if signed in (or Claude if ANTHROPIC_API_KEY), else local
 *   npm run eval -- --chatgpt         # ChatGPT plan through Codex (~35 requests: mind your 5-hour window)
 *   PHLO_MODEL=<id> PHLO_REASONING=minimal npm run eval -- --chatgpt   # compare models / effort
 *   PHLO_MODEL=qwen3:8b npm run eval -- --open                          # open model via Ollama (route mode)
 *   PHLO_MODEL=qwen3:8b PHLO_MODE=full npm run eval -- --open           # open model also rewrites
 *   PHLO_BASE_URL=https://openrouter.ai/api/v1 PHLO_API_KEY=… PHLO_MODEL=<id> npm run eval -- --open
 *   npm run eval -- --local           # force the local route
 *   npm run eval -- --only interview  # one scenario
 *
 * Writes evals/out/<route>/<scenario>.md (the final page, for eyeballing) and
 * evals/out/<route>/report.json. Metrics: checks passed, wrong-target placements,
 * invented-word rate, instructions transcribed, latency p50/p95.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { DocEngine, type Op } from "../src/engine/engine";
import { newId } from "../src/engine/ids";
import { emptyDraft, type Block } from "../src/engine/model";
import { buildRequest, compilePlan, headingOf, noveltyRatio, NEXT_RE } from "../src/engine/settle";
import { ClaudeProvider } from "../src/host/ai/claude";
import { CodexWarmProvider } from "../src/host/ai/codexWarm";
import { CompatProvider } from "../src/host/ai/compat";
import type { SettleProvider } from "../src/host/ai/provider";
import { Orchestrator } from "../src/host/ai/orchestrator";
import { SCENARIOS, type Check, type Scenario } from "./goldens";

const args = process.argv.slice(2);
const forceLocal = args.includes("--local");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const want = forceLocal ? "local" : args.includes("--claude") ? "claude" : args.includes("--chatgpt") ? "chatgpt" : args.includes("--open") ? "open" : "auto";
const key = process.env.ANTHROPIC_API_KEY;
function pick(): SettleProvider | null {
  if (want === "local") return null;
  if (want === "open") {
    const model = process.env.PHLO_MODEL;
    if (!model) return null;
    return new CompatProvider({
      baseUrl: process.env.PHLO_BASE_URL || "http://127.0.0.1:11434/v1",
      model,
      apiKey: process.env.PHLO_API_KEY,
      mode: (process.env.PHLO_MODE as "route" | "full") || "route",
      reasoning: (process.env.PHLO_REASONING as "none" | "low") || undefined,
    });
  }
  if (want === "claude" || (want === "auto" && key)) return key ? new ClaudeProvider(() => key, process.env.PHLO_MODEL || undefined) : null;
  const codex = new CodexWarmProvider(process.env.PHLO_MODEL || "", (process.env.PHLO_REASONING as "minimal" | "low" | "medium") || "low");
  return codex.available() ? codex : null;
}
const provider = pick();
if (want !== "local" && !provider) console.log(`(${want === "claude" ? "no ANTHROPIC_API_KEY" : want === "open" ? "set PHLO_MODEL" : "Codex not installed or not signed in"}: falling back to local rules)\n`);
const orch = new Orchestrator(provider, { deadlineMs: 60_000 });
const route = provider ? `${provider.name}${provider.model ? `-${provider.model}` : ""}${want === "open" ? `-${process.env.PHLO_MODE || "route"}` : ""}` : "local";

const lc = (s: string) => s.toLowerCase();
/** Each word may list alternatives: "200|two hundred" passes on either. */
const has = (text: string, words: string[]) => words.every((w) => w.split("|").some((alt) => lc(text).includes(lc(alt.trim()))));
const hmatch = (heading: string, want: string) => want.split("|").some((alt) => lc(heading).includes(lc(alt.trim())));

interface CheckResult {
  turn: number;
  check: string;
  pass: boolean;
  gap: boolean;
  note: string;
}

function seed(s: Scenario): DocEngine {
  const e = new DocEngine({ ...emptyDraft(`eval_${s.id}`), role: s.role });
  let after: string | null = null;
  const ops: Op[] = s.page.map((line) => {
    const id = newId("b");
    const heading = line.startsWith("# ");
    const op: Op = { t: "insert", block: { id, kind: heading ? "heading" : "paragraph", text: heading ? line.slice(2) : line, wet: false, rev: 0, origin: "typed" }, after };
    after = id;
    return op;
  });
  if (ops.length) e.commit({ id: "seed", actor: "user", label: "seed", ops });
  return e;
}

/** Same rule as the app: end of the current section, else end of page before Next. */
function anchor(e: DocEngine, heading: string | null): string | null {
  const blocks = e.state.blocks.filter((b) => b.tab !== "tangent");
  if (heading && blocks.some((b) => b.id === heading)) {
    let i = blocks.findIndex((b) => b.id === heading);
    while (i + 1 < blocks.length && blocks[i + 1].kind !== "heading") i++;
    return blocks[i].id;
  }
  const n = blocks.findIndex((b) => b.kind === "heading" && NEXT_RE.test(b.text));
  if (n > 0) return blocks[n - 1].id;
  return blocks.at(-1)?.id ?? null;
}

function headingText(e: DocEngine, id: string): string | null {
  const h = headingOf(e.state.blocks, id);
  return h ? (e.block(h)?.text ?? null) : null;
}

function grade(e: DocEngine, c: Check, touched: string[], source: string, before: Set<string>, turn: number): CheckResult {
  const blocks = e.state.blocks;
  const pageText = blocks.map((b) => b.text).join("\n");
  const gap = !!c.gap;
  const r = (check: string, pass: boolean, note: string): CheckResult => ({ turn, check, pass, gap, note });

  if ("scraps" in c) {
    const n = blocks.filter((b) => b.kind !== "heading" && b.text.trim() && b.text.trim().split(/\s+/).length < 5).length;
    return r(`scraps ≤ ${c.scraps}`, n <= c.scraps, `${n} short lines`);
  }
  if ("linesAtMost" in c) {
    const n = blocks.filter((b) => b.kind !== "heading" && b.text.trim()).length;
    return r(`lines ≤ ${c.linesAtMost}`, n <= c.linesAtMost, `${n} lines`);
  }
  if ("kept" in c) {
    const missing = c.kept.filter((p) => !p.split("|").some((alt) => lc(pageText).includes(lc(alt))));
    return r(`kept: ${c.kept.join(", ")}`, !missing.length, missing.length ? `missing: ${missing.join(", ")}` : "");
  }
  if ("lands" in c) {
    const cands = touched.map((id) => e.block(id)).filter((b): b is Block => !!b && !b.wet && b.tab !== "tangent");
    const hit = cands.find((b) => {
      const h = headingText(e, b.id) ?? "";
      const okHeading = c.lands === "*new*" ? !!h && !before.has(lc(h)) : hmatch(h, c.lands);
      return okHeading && has(b.text, c.contains) && (!c.kind || b.kind === c.kind);
    });
    const where = cands.map((b) => `"${b.text.slice(0, 60)}" → ${headingText(e, b.id) ?? "(no heading)"}`).join("; ");
    return r(`lands under ${c.lands}: ${c.contains.join(", ")}`, !!hit, hit ? "" : `got: ${where || "nothing settled"}`);
  }
  if ("tangent" in c) {
    const hit = blocks.find((b) => b.tab === "tangent" && has(b.text, c.tangent));
    return r(`tangent: ${c.tangent.join(", ")}`, !!hit, hit ? "" : "not kept as a tangent");
  }
  if ("next" in c) {
    let inNext = false;
    const hit = blocks.find((b) => {
      if (b.kind === "heading") inNext = NEXT_RE.test(b.text);
      return inNext && b.kind !== "heading" && has(b.text, c.next);
    });
    return r(`next: ${c.next.join(", ")}`, !!hit, hit ? "" : "not on the Next list");
  }
  if ("revised" in c) {
    const hit = blocks.find((b) => has(b.text, c.revised) && (b.trail ?? []).some((t) => has(t, c.trail)));
    return r(`revised to ${c.revised.join(", ")} (trail: ${c.trail.join(", ")})`, !!hit, hit ? "" : "no block revised with the old version in its trail");
  }
  if ("heading" in c) {
    const hit = blocks.some((b) => b.kind === "heading" && hmatch(b.text, c.heading));
    return r(`heading "${c.heading}"`, hit, hit ? "" : `headings: ${blocks.filter((b) => b.kind === "heading").map((b) => b.text).join(", ")}`);
  }
  if ("headings" in c) {
    const n = blocks.filter((b) => b.kind === "heading" && !NEXT_RE.test(b.text)).length;
    return r(`${c.headings} heading(s)`, n === c.headings, `found ${n}`);
  }
  if ("absent" in c) {
    const found = c.absent.filter((p) => lc(pageText).includes(lc(p)));
    return r(`absent: ${c.absent.join(" | ")}`, !found.length, found.length ? `found: ${found.join(", ")}` : "");
  }
  if ("order" in c) {
    const hs = blocks.filter((b) => b.kind === "heading").map((b) => lc(b.text));
    const idx = c.order.map((w) => hs.findIndex((h) => h.includes(lc(w))));
    const ok = idx.every((i) => i >= 0) && idx.every((v, i) => i === 0 || v > idx[i - 1]);
    return r(`order: ${c.order.join(" → ")}`, ok, ok ? "" : `headings: ${hs.join(", ")}`);
  }
  if ("chart" in c) {
    const ch = blocks.find((b) => b.kind === "chart" && b.chart && c.chart.every((v) => b.chart!.series.some((sr) => sr.values.includes(v))));
    return r(`chart with ${c.chart.join(", ")}`, !!ch, ch ? "" : `no chart with those values (kinds: ${blocks.map((b) => b.kind).join(",")})`);
  }
  if ("flow" in c) {
    const f = blocks.find((b) => b.kind === "flow" && b.steps && has(b.steps.join(" "), c.flow));
    return r(`flow with ${c.flow.join(", ")}`, !!f, f ? "" : `no flow with those steps (kinds: ${blocks.map((b) => b.kind).join(",")})`);
  }
  if ("table" in c) {
    const t = blocks.find((b) => b.kind === "table" && b.data && has(b.data.rows.flat().join(" "), c.table));
    return r(`table with ${c.table.join(", ")}`, !!t, t ? "" : "no table with those items");
  }
  if ("title" in c) {
    const ok = c.title.some((w) => lc(e.state.title).includes(lc(w)));
    return r(`title mentions ${c.title.join("/")}`, ok, `title: "${e.state.title}"`);
  }
  void source;
  return r("unknown check", false, "");
}

function toMarkdown(e: DocEngine): string {
  const out: string[] = [`# ${e.state.title || "Untitled"}`, ""];
  for (const b of e.state.blocks) {
    const tab = b.tab === "tangent" ? " ⟶ [TANGENT · LATER]" : "";
    const trail = b.trail?.length ? `  _(earlier: ${b.trail.join(" | ")})_` : "";
    const wet = b.wet ? " [WET]" : "";
    if (b.kind === "table" && b.data) {
      out.push("", `| ${b.data.columns.join(" | ")} |`, `|${b.data.columns.map(() => "---").join("|")}|`, ...b.data.rows.map((r) => `| ${r.join(" | ")} |`), "");
      continue;
    }
    if (b.kind === "flow" && b.steps) {
      out.push("", b.steps.map((x, i) => `[${i + 1}. ${x}]`).join(" → "), "");
      continue;
    }
    if (b.kind === "heading") out.push("", `## ${b.text}`);
    else if (b.kind === "decision") out.push(`**Decision:** ${b.text}${trail}${wet}`);
    else if (b.kind === "numbered") out.push(`1. ${b.text}${trail}${wet}`);
    else if (b.kind === "bullet") out.push(`- ${b.text}${trail}${tab}${wet}`);
    else if (b.kind === "question") out.push(`> ? ${b.text}${trail}${tab}${wet}`);
    else out.push(`${b.text}${trail}${tab}${wet}`);
  }
  return out.join("\n") + "\n";
}

async function run() {
  const outDir = path.join("evals", "out", route.replace(/[^a-z0-9.-]/gi, "_"));
  mkdirSync(outDir, { recursive: true });
  console.log(`Settle eval · route: ${route}\n`);
  const all: CheckResult[] = [];
  const latencies: number[] = [];
  let novelty = 0;
  let placed = 0;
  let scribeViolations = 0;
  const perScenario: { id: string; passed: number; total: number; gaps: number }[] = [];

  for (const s of SCENARIOS.filter((x) => !only || x.id.includes(only))) {
    const e = seed(s);
    let current: string | null = null;
    let lastPlaced: string | null = null;
    const recent: string[] = [];
    const results: CheckResult[] = [];
    console.log(`▸ ${s.name}`);

    for (const [ti, turn] of s.turns.entries()) {
      const before = new Set(e.state.blocks.filter((b) => b.kind === "heading").map((b) => lc(b.text)));
      const text = (turn.say ?? turn.type)!;
      const id = newId("w");
      let after = anchor(e, current);
      if (turn.type && turn.under) {
        const h = e.state.blocks.find((b) => b.kind === "heading" && hmatch(b.text, turn.under!));
        after = anchor(e, h?.id ?? null);
      }
      e.commit({
        id: newId("tx"),
        actor: turn.say ? "voice" : "user",
        label: "input",
        ops: [{ t: "insert", block: { id, kind: "paragraph", text, wet: true, rev: 0, origin: turn.say ? "voice" : "typed" }, after }],
      });
      const req = buildRequest(e.snapshot(), [id], { currentHeadingId: current, recent });
      const res = await orch.settle(req);
      latencies.push(res.latencyMs);
      const comp = compilePlan(e.state, req, res.plan);
      const commit = e.commit({ id: newId("tx"), actor: "phlo", label: "Settle", ops: comp.ops });
      const touched = [...comp.settledIds, ...res.plan.revisions.map((r) => r.block_id)];
      if (!commit.ok) console.log(`   turn ${ti + 1}: commit conflict ${JSON.stringify(commit.conflicts)}`);

      for (const sid of comp.settledIds) {
        const b = e.block(sid);
        if (!b) continue;
        placed++;
        const nv = noveltyRatio(b.text, text);
        novelty += nv;
        if (s.role === "scribe" && nv > 0.2) scribeViolations++;
      }
      // Follow the speaker like the app does: the section the last idea landed in.
      lastPlaced = comp.settledIds.filter((x) => e.block(x)?.tab !== "tangent").at(-1) ?? lastPlaced;
      if (lastPlaced) current = headingOf(e.state.blocks, lastPlaced) ?? current;
      recent.unshift(...comp.settledIds.slice().reverse());

      for (const c of turn.expect) {
        const g = grade(e, c, touched, text, before, ti + 1);
        results.push(g);
        if (!g.pass && process.env.PHLO_DEBUG) console.log(`     plan: ${JSON.stringify(res.plan)}\n     issues: ${comp.issues.join("; ")}`);
        const mark = g.pass ? "✓" : g.gap ? "◌" : "✗";
        console.log(`   ${mark} t${ti + 1} ${g.check}${g.pass ? "" : `  — ${g.note}`}${g.gap && !g.pass ? " (known gap)" : ""}`);
      }
      console.log(`     ${res.route} ${res.latencyMs}ms${res.note ? ` (${res.note})` : ""}`);
    }
    const scored = results.filter((r) => !r.gap);
    perScenario.push({ id: s.id, passed: scored.filter((r) => r.pass).length, total: scored.length, gaps: results.filter((r) => r.gap && !r.pass).length });
    writeFileSync(path.join(outDir, `${s.id}.md`), toMarkdown(e));
    all.push(...results);
    console.log("");
  }

  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))] ?? 0;
  const scored = all.filter((r) => !r.gap);
  const passed = scored.filter((r) => r.pass).length;
  const wrongTarget = scored.filter((r) => !r.pass && r.check.startsWith("lands")).length;
  const transcribed = scored.filter((r) => !r.pass && r.check.startsWith("absent")).length;
  const summary = {
    route,
    checks: { passed, total: scored.length, rate: +(passed / Math.max(1, scored.length)).toFixed(3) },
    knownGaps: all.filter((r) => r.gap && !r.pass).length,
    wrongTargetPlacements: wrongTarget,
    instructionsTranscribed: transcribed,
    meanNovelty: +(novelty / Math.max(1, placed)).toFixed(3),
    scribeViolations,
    latencyMs: { p50: pct(0.5), p95: pct(0.95), max: latencies.at(-1) ?? 0 },
    scenarios: perScenario,
  };
  writeFileSync(path.join(outDir, "report.json"), JSON.stringify({ summary, results: all }, null, 2));
  console.log("Scenario".padEnd(22), "Pass");
  for (const p of perScenario) console.log(p.id.padEnd(22), `${p.passed}/${p.total}${p.gaps ? `  (+${p.gaps} known gap${p.gaps > 1 ? "s" : ""})` : ""}`);
  console.log(`\nchecks ${passed}/${scored.length} (${Math.round(summary.checks.rate * 100)}%) · wrong-target ${wrongTarget} · instructions transcribed ${transcribed} · scribe violations ${scribeViolations} · mean novelty ${summary.meanNovelty} · p50 ${summary.latencyMs.p50}ms p95 ${summary.latencyMs.p95}ms`);
  console.log(`pages: ${outDir}/*.md`);
  (provider as { dispose?: () => void } | null)?.dispose?.();
}

void run();
