import { describe, expect, it } from "vitest";
import { DocEngine } from "../src/engine/engine";
import { emptyDraft, type Block } from "../src/engine/model";
import { listRun, listToTable, splitItem, suggestForm, tableToItems, turnIntoOps } from "../src/engine/forms";
import { buildRequest, compilePlan, spanEdit } from "../src/engine/settle";
import { localPlan } from "../src/engine/local";
import { withCorrectionTarget } from "../src/engine/settle";

const b = (id: string, kind: Block["kind"], text: string): Block => ({ id, kind, text, wet: false, rev: 0, origin: "typed" });

function eng() {
  const e = new DocEngine(emptyDraft("f"));
  e.commit({
    id: "s",
    actor: "user",
    label: "s",
    ops: [
      { t: "insert", block: b("h", "heading", "Competitors"), after: null },
      { t: "insert", block: b("a", "bullet", "Notion: $10, cloud only"), after: "h" },
      { t: "insert", block: b("c", "bullet", "Granola – $14; meetings, desktop"), after: "a" },
      { t: "insert", block: b("d", "bullet", "Phlo: free, local-first"), after: "c" },
      { t: "insert", block: b("p", "paragraph", "We should win on flow."), after: "d" },
    ],
  });
  return e;
}

describe("Turn into", () => {
  it("splits list items into cells", () => {
    expect(splitItem("Notion: $10, cloud only")).toEqual(["Notion", "$10", "cloud only"]);
    expect(splitItem("Granola – $14; meetings")).toEqual(["Granola", "$14", "meetings"]);
    expect(splitItem("Just a thought.")).toEqual(["Just a thought"]);
    expect(splitItem("Notion is ten dollars a month, cloud only")).toEqual(["Notion", "ten dollars a month", "cloud only"]);
  });

  it("finds the list run around a block", () => {
    expect(listRun(eng().state.blocks, "c").map((x) => x.id)).toEqual(["a", "c", "d"]);
  });

  it("list → table → list keeps every word, and originals are recoverable", () => {
    const e = eng();
    const t = turnIntoOps(e.state.blocks, "c", "table");
    expect(e.commit({ id: "t", actor: "user", label: t.label, ops: t.ops }).ok).toBe(true);
    const table = e.state.blocks.find((x) => x.kind === "table")!;
    expect(table.data!.columns.slice(0, 2)).toEqual(["Item", "Price"]);
    expect(table.data!.rows).toEqual([
      ["Notion", "$10", "cloud only", ""],
      ["Granola", "$14", "meetings", "desktop"],
      ["Phlo", "free", "local-first", ""],
    ]);
    expect(e.state.blocks.map((x) => x.kind)).toEqual(["heading", "table", "paragraph"]);
    expect(e.state.parked.map((x) => x.id)).toEqual(["a", "c", "d"]);
    const back = turnIntoOps(e.state.blocks, table.id, "bullet");
    e.commit({ id: "u", actor: "user", label: back.label, ops: back.ops });
    expect(e.state.blocks.filter((x) => x.kind === "bullet").map((x) => x.text)).toEqual(["Notion: $10, cloud only", "Granola: $14, meetings, desktop", "Phlo: free, local-first"]);
  });

  it("undo restores the list exactly", () => {
    const e = eng();
    const t = turnIntoOps(e.state.blocks, "a", "table");
    e.commit({ id: "t", actor: "user", label: t.label, ops: t.ops });
    e.undo("t");
    expect(e.state.blocks.map((x) => x.id)).toEqual(["h", "a", "c", "d", "p"]);
  });

  it("steps become a flow and back, every word kept", () => {
    const e = new DocEngine(emptyDraft("f2"));
    e.commit({ id: "s", actor: "user", label: "s", ops: [
      { t: "insert", block: b("n1", "numbered", "Upload photos"), after: null },
      { t: "insert", block: b("n2", "numbered", "Phlo picks the best 60"), after: "n1" },
      { t: "insert", block: b("n3", "numbered", "Order the book."), after: "n2" },
    ] });
    const f = turnIntoOps(e.state.blocks, "n2", "flow");
    e.commit({ id: "f", actor: "user", label: f.label, ops: f.ops });
    const flow = e.state.blocks.find((x) => x.kind === "flow")!;
    expect(flow.steps).toEqual(["Upload photos", "Phlo picks the best 60", "Order the book"]);
    const back = turnIntoOps(e.state.blocks, flow.id, "numbered");
    e.commit({ id: "g", actor: "user", label: back.label, ops: back.ops });
    expect(e.state.blocks.map((x) => [x.kind, x.text])).toEqual([["numbered", "Upload photos"], ["numbered", "Phlo picks the best 60"], ["numbered", "Order the book"]]);
    const one = new DocEngine(emptyDraft("f3"));
    one.commit({ id: "s", actor: "user", label: "s", ops: [{ t: "insert", block: b("p", "paragraph", "Sign up, then pick photos, then pay."), after: null }] });
    const g = turnIntoOps(one.state.blocks, "p", "flow");
    one.commit({ id: "f", actor: "user", label: g.label, ops: g.ops });
    expect(one.state.blocks[0].steps).toEqual(["Sign up", "pick photos", "pay"]);
  });

  it("a spoken correction changes the step inside a flow", () => {
    expect(spanEdit("Phlo picks the best sixty", "Phlo picks the best forty")).toEqual({ from: "sixty", to: "forty" });
    const e = new DocEngine(emptyDraft("f4"));
    e.commit({ id: "s", actor: "user", label: "s", ops: [
      { t: "insert", block: { ...b("fl", "flow", "Flow · Upload → Phlo picks the best sixty → Order"), steps: ["Upload", "Phlo picks the best sixty", "Order"] }, after: null },
      { t: "insert", block: { ...b("w", "paragraph", "no wait, not sixty, it's more like forty"), wet: true, origin: "voice" }, after: "fl" },
    ] });
    const req = withCorrectionTarget(buildRequest(e.snapshot(), ["w"], { currentHeadingId: null, recent: [] }));
    const c = compilePlan(e.state, req, localPlan(req)!);
    expect(e.commit({ id: "x", actor: "phlo", label: "Settle", ops: c.ops }).ok).toBe(true);
    expect(e.block("fl")!.steps).toEqual(["Upload", "Phlo picks the best forty", "Order"]);
    expect(e.block("fl")!.trail).toEqual(["Upload → Phlo picks the best sixty → Order"]);
  });

  it("suggests a form only when the words already have its shape", () => {
    const blocks = eng().state.blocks;
    expect(suggestForm(blocks, new Set())).toMatchObject({ id: "a", kind: "table" });
    expect(suggestForm(blocks, new Set(["a"]))).toBeNull();
    const steps = [b("1", "numbered", "Upload"), b("2", "numbered", "Pick"), b("3", "numbered", "Order")];
    expect(suggestForm(steps, new Set())).toMatchObject({ kind: "flow" });
    expect(suggestForm([b("x", "bullet", "just a thought"), b("y", "bullet", "another"), b("z", "bullet", "third")], new Set())).toBeNull();
  });

  it("text forms are a kind change only", () => {
    const e = eng();
    const t = turnIntoOps(e.state.blocks, "p", "decision");
    e.commit({ id: "t", actor: "user", label: "x", ops: t.ops });
    expect(e.block("p")).toMatchObject({ kind: "decision", text: "We should win on flow." });
    expect(tableToItems(listToTable([b("x", "bullet", "solo")]))).toEqual(["solo"]);
  });
});
