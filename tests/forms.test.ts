import { describe, expect, it } from "vitest";
import { DocEngine } from "../src/engine/engine";
import { emptyDraft, type Block } from "../src/engine/model";
import { listRun, listToTable, splitItem, tableToItems, turnIntoOps } from "../src/engine/forms";

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
    expect(table.data!.columns[0]).toBe("Item");
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

  it("text forms are a kind change only", () => {
    const e = eng();
    const t = turnIntoOps(e.state.blocks, "p", "decision");
    e.commit({ id: "t", actor: "user", label: "x", ops: t.ops });
    expect(e.block("p")).toMatchObject({ kind: "decision", text: "We should win on flow." });
    expect(tableToItems(listToTable([b("x", "bullet", "solo")]))).toEqual(["solo"]);
  });
});
