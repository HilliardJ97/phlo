import * as http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DocEngine } from "../src/engine/engine";
import { emptyDraft } from "../src/engine/model";
import { buildRequest, compilePlan } from "../src/engine/settle";
import { CompatProvider } from "../src/host/ai/compat";

// A fake OpenAI-compatible server: first reply is broken JSON wrapped in <think>, second is valid.
let server: http.Server;
let base = "";
const seen: Record<string, unknown>[] = [];
let mode: "broken-then-ok" | "ok" = "ok";
beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const j = JSON.parse(body);
      seen.push(j);
      const wetId = /\[(w_[^\]]+)\]/.exec(j.messages[1].content)?.[1] ?? "w";
      const plan = { title: null, new_headings: [], placements: [{ wet_id: wetId, under: "h2", kind: "paragraph", text: "", tangent: false }], revisions: [], consumed: [], structure: [], question: null };
      const content = mode === "broken-then-ok" && seen.length % 2 === 1 ? "<think>hmm</think> {not json" : `<think>placing</think>\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});
afterAll(() => server.close());

function draft() {
  const e = new DocEngine(emptyDraft("d"));
  e.commit({
    id: "s",
    actor: "user",
    label: "s",
    ops: [
      { t: "insert", block: { id: "h1", kind: "heading", text: "Problem", wet: false, rev: 0, origin: "typed" }, after: null },
      { t: "insert", block: { id: "h2", kind: "heading", text: "Pricing", wet: false, rev: 0, origin: "typed" }, after: "h1" },
      { t: "insert", block: { id: "w_1", kind: "paragraph", text: "um so we charge per seat for teams", wet: true, rev: 0, origin: "voice" }, after: "h2" },
    ],
  });
  return e;
}

describe("OpenAI-compatible provider (open models)", () => {
  it("sends a strict json_schema request and route mode lets Phlo clean the words", async () => {
    mode = "ok";
    const e = draft();
    const p = new CompatProvider({ baseUrl: base, model: "qwen3:8b", mode: "route" });
    const req = buildRequest(e.snapshot(), ["w_1"], { currentHeadingId: null, recent: [] });
    const plan = await p.settle(req, { signal: new AbortController().signal });
    const sent = seen.at(-1) as { response_format: { type: string; json_schema: { strict: boolean } }; messages: { content: string }[]; temperature: number };
    expect(sent.response_format.type).toBe("json_schema");
    expect(sent.response_format.json_schema.strict).toBe(true);
    expect(sent.messages[0].content).toContain("ROUTE-ONLY MODE");
    expect(sent.temperature).toBe(0);
    e.commit({ id: "x", actor: "phlo", label: "Settle", ops: compilePlan(e.state, req, plan).ops });
    expect(e.block("w_1")!.text).toBe("We charge per seat for teams.");
    expect(e.block("w_1")!.wet).toBe(false);
  });

  it("repairs one invalid reply, and strips <think> and code fences", async () => {
    mode = "broken-then-ok";
    seen.length = 0;
    const e = draft();
    const p = new CompatProvider({ baseUrl: base, model: "qwen3:8b", mode: "route" });
    const req = buildRequest(e.snapshot(), ["w_1"], { currentHeadingId: null, recent: [] });
    const plan = await p.settle(req, { signal: new AbortController().signal });
    expect(seen.length).toBe(2);
    expect(plan.placements[0].under).toBe("h2");
  });
});
