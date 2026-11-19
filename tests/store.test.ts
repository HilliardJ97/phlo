import { mkdtempSync, mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DocEngine } from "../src/engine/engine";
import { emptyDraft, type Block } from "../src/engine/model";
import { Store, VersionConflictError, ftsQuery } from "../src/host/store";

const blk = (id: string, text: string, kind: Block["kind"] = "paragraph"): Block => ({ id, kind, text, wet: false, rev: 0, origin: "typed" });
const open: Store[] = [];
async function fresh(dir = mkdtempSync(path.join(tmpdir(), "phlo-"))) {
  const s = new Store(dir);
  await s.init();
  open.push(s);
  return { s, dir };
}
afterEach(() => open.splice(0).forEach((s) => s.close()));

describe("Store (SQLite)", () => {
  it("saves, lists, loads and journals with authors", async () => {
    const { s } = await fresh();
    const e = new DocEngine(emptyDraft("d1"));
    const a = e.commit({ id: "t1", actor: "voice", label: "Speech", ops: [{ t: "insert", block: blk("h", "Pricing", "heading"), after: null }] });
    const b = e.commit({ id: "t2", actor: "phlo", label: "Settle", ops: [{ t: "insert", block: blk("p", "Two hundred dollars per book"), after: "h" }] });
    if (!a.ok || !b.ok) throw new Error("commit");
    await s.saveDraft(e.snapshot(), [a.tx, b.tx]);
    expect((await s.loadDraft("d1"))?.blocks.map((x) => x.id)).toEqual(["h", "p"]);
    const [sum] = await s.listDrafts();
    expect(sum).toMatchObject({ id: "d1", sections: 1, words: 6 });
    const j = await s.readJournal("d1");
    expect(j.map((x) => x.author)).toEqual(["you", "phlo"]);
    expect(j[1].inverse?.length).toBe(1);
    expect((await s.readJournal("d1", 1)).length).toBe(1);
  });

  it("rejects a stale save", async () => {
    const { s } = await fresh();
    const d = emptyDraft("d2");
    await s.saveDraft({ ...d, version: 5 });
    await expect(s.saveDraft({ ...d, version: 4 })).rejects.toBeInstanceOf(VersionConflictError);
    expect((await s.loadDraft("d2"))?.version).toBe(5);
  });

  it("searches settled text with BM25 and reindexes on save", async () => {
    const { s } = await fresh();
    const d = { ...emptyDraft("d3"), blocks: [blk("a", "Weddings in May"), blk("b", "Pricing around two hundred dollars")] };
    await s.saveDraft(d);
    expect((await s.search("d3", "what did I say about pricing?")).map((h) => h.blockId)).toEqual(["b"]);
    await s.saveDraft({ ...d, version: 1, blocks: [blk("a", "Weddings in May")] });
    expect(await s.search("d3", "pricing")).toEqual([]);
    expect(ftsQuery('"); DROP')).toBe('"drop"');
  });

  it("imports legacy JSON drafts once and soft-deletes to trash", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "phlo-"));
    mkdirSync(path.join(dir, "drafts"));
    writeFileSync(path.join(dir, "drafts", "old.json"), JSON.stringify({ ...emptyDraft("old"), title: "Old one", version: 3 }));
    writeFileSync(path.join(dir, "drafts", "old.journal.jsonl"), `${JSON.stringify({ v: 3, at: 1, actor: "user", label: "x", ops: [] })}\n`);
    const { s } = await fresh(dir);
    expect((await s.loadDraft("old"))?.title).toBe("Old one");
    expect((await s.readJournal("old"))[0].author).toBe("you");
    expect(existsSync(path.join(dir, "drafts", "migrated", "old.json"))).toBe(true);
    s.close();
    const { s: again } = await fresh(dir);
    expect((await again.readJournal("old")).length).toBe(1);
    await again.deleteDraft("old");
    expect(await again.loadDraft("old")).toBeNull();
    expect(readdirSync(path.join(dir, "trash")).length).toBe(1);
  });
});

describe("per-author undo", () => {
  it("undoes Phlo's last change without touching yours", () => {
    const e = new DocEngine(emptyDraft("d"));
    e.commit({ id: "u1", actor: "user", label: "Add", ops: [{ t: "insert", block: blk("a", "mine"), after: null }] });
    e.commit({ id: "p1", actor: "phlo", label: "Settle", ops: [{ t: "insert", block: blk("b", "phlo's"), after: "a" }] });
    e.commit({ id: "u2", actor: "voice", label: "Speech", ops: [{ t: "insert", block: blk("c", "said"), after: "b" }] });
    expect(e.undoLastBy("phlo")?.ok).toBe(true);
    expect(e.state.blocks.map((b) => b.id)).toEqual(["a", "c"]);
    expect(e.undoLastBy("gardener")).toBeNull();
  });
});
