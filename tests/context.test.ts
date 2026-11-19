import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { assembleContext, BUDGET, wantsRecall } from "../src/engine/context";
import { emptyDraft, type Block, type Draft } from "../src/engine/model";
import { buildRequest } from "../src/engine/settle";
import { settleUserMessage } from "../src/host/ai/prompts";
import { Store } from "../src/host/store";

const blk = (id: string, kind: Block["kind"], text: string, wet = false): Block => ({ id, kind, text, wet, rev: 0, origin: "voice" });

/** A 45-minute session: ~60 sections, 6 lines each, pricing said in minute 3. */
function longDraft(): Draft {
  const blocks: Block[] = [];
  for (let s = 0; s < 60; s++) {
    blocks.push(blk(`h${s}`, "heading", s === 1 ? "Pricing" : `Section ${s}`));
    for (let i = 0; i < 6; i++) {
      const text = s === 1 && i === 2 ? "Priced around forty dollars a month for the starter plan" : `Line ${i} of section ${s} about members, onboarding and the weekly ritual`;
      blocks.push(blk(`b${s}_${i}`, "paragraph", text));
    }
  }
  blocks.push(blk("w1", "paragraph", "go back to the pricing thing, make the starter plan sixty", true));
  return { ...emptyDraft("long"), blocks, version: 400 };
}

describe("context packet", () => {
  it("leaves a short draft as is", () => {
    const d = { ...emptyDraft("s"), blocks: [blk("h", "heading", "Goal"), blk("p", "paragraph", "Grow members"), blk("w", "paragraph", "and keep them", true)] };
    const req = buildRequest(d, ["w"], { currentHeadingId: "h", recent: [] });
    expect(assembleContext(req).outline.map((o) => o.id)).toEqual(["h", "p"]);
  });

  it("stays fixed-size at minute 45 and recalls minute 3", async () => {
    const d = longDraft();
    const store = new Store(mkdtempSync(path.join(tmpdir(), "phlo-")));
    await store.init();
    await store.saveDraft({ ...d, blocks: d.blocks.filter((b) => !b.wet) });
    const req = buildRequest(d, ["w1"], { currentHeadingId: "h59", recent: ["b59_5"] });
    const said = req.wet[0].text;
    expect(wantsRecall(said)).toBe(true);
    const hits = (await store.search("long", said)).map((h) => ({ id: h.blockId, text: h.text, under: null }));
    const packet = assembleContext(req, hits);
    const msg = settleUserMessage(packet);
    // Bounded: whole page is ~25k chars; the packet stays near the budget.
    expect(JSON.stringify(req.outline).length).toBeGreaterThan(25_000);
    expect(msg.length).toBeLessThan(BUDGET.mapChars + BUDGET.recallChars + 2400);
    // Every heading stays placeable; the current section is in full.
    expect(packet.outline.filter((o) => o.kind === "heading").length).toBe(60);
    expect(packet.outline.some((o) => o.id === "b59_5")).toBe(true);
    expect(packet.digests?.h3?.hidden).toBe(6);
    // The callback lands: the minute-3 pricing line is recalled with its section.
    expect(packet.recall?.[0]).toMatchObject({ id: "b1_2", under: "h1" });
    expect(msg).toContain("[b1_2] (under h1) Priced around forty dollars");
    store.close();
  });

  it("only recalls on deterministic cues", () => {
    expect(wantsRecall("and the onboarding has three steps")).toBe(false);
    expect(wantsRecall("like I said earlier, members first")).toBe(true);
  });
});

import { contradictions, detectAim, detectInstruction, ledgerMatches } from "../src/engine/memory";
import { DocEngine } from "../src/engine/engine";

describe("memory keeper", () => {
  it("detects aim and standing instructions, not ordinary content", () => {
    expect(detectAim("The goal of this is to land the product sense interview")).toBe("land the product sense interview");
    expect(detectInstruction("keep it to three pillars")).toBe("Keep it to three pillars");
    expect(detectInstruction("Let's call them members.")).toBe("Call them members");
    expect(detectInstruction("We keep members for about three years")).toBeNull();
  });

  it("pushes Ledger lines into the request and finds contradictions", () => {
    const d = longDraft();
    d.blocks.push(blk("x", "paragraph", "The starter plan is sixty dollars"));
    expect(ledgerMatches(d.blocks, "what about the starter plan").map((e) => e.blockId)).toContain("b1_2");
    const c = contradictions(d.blocks).find((c) => c.key === "starter plan");
    expect(c?.values.map((v) => v.value).sort()).toEqual(["40dollars", "60dollars"]);
    const req = buildRequest(d, ["w1"], { currentHeadingId: "h59", recent: [] });
    expect(assembleContext(req).recall?.[0].id).toBe("b1_2");
  });

  it("memory ops are undoable", () => {
    const e = new DocEngine(emptyDraft("m"));
    e.commit({ id: "r", actor: "phlo", label: "Remember", ops: [{ t: "memory.set", item: { id: "aim", kind: "aim", text: "x", refs: [], at: 1 } }] });
    expect(e.state.memory?.length).toBe(1);
    e.undoLastBy("phlo");
    expect(e.state.memory?.length).toBe(0);
  });
});
