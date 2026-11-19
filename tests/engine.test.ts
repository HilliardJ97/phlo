import { describe, expect, it } from "vitest";
import { DocEngine } from "../src/engine/engine";
import type { Block, Draft } from "../src/engine/model";
import { emptyDraft } from "../src/engine/model";
import { localPlan } from "../src/engine/local";
import { buildRequest, compilePlan, enforceScribe, noveltyRatio, cleanSpeech, numberize, speechHints } from "../src/engine/settle";

function blk(id: string, kind: Block["kind"], text: string, wet = false, origin: Block["origin"] = "typed"): Block {
  return { id, kind, text, wet, rev: 0, origin };
}

function seeded(): DocEngine {
  const d: Draft = emptyDraft("d1");
  const e = new DocEngine(d);
  e.commit({
    id: "seed",
    actor: "user",
    label: "seed",
    ops: [
      { t: "insert", block: blk("h1", "heading", "Problem"), after: null },
      { t: "insert", block: blk("p1", "paragraph", "Interviews are hard to follow."), after: "h1" },
      { t: "insert", block: blk("h2", "heading", "Pricing"), after: "p1" },
      { t: "insert", block: blk("p2", "paragraph", "We charge per seat."), after: "h2" },
      { t: "insert", block: blk("h3", "heading", "Recommendation"), after: "p2" },
      { t: "insert", block: blk("p3", "paragraph", "Ship the voice-first editor."), after: "h3" },
    ],
  });
  return e;
}

describe("DocEngine", () => {
  it("rejects stale edits instead of overwriting newer typing", () => {
    const e = seeded();
    const rev = e.block("p2")!.rev;
    e.commit({ id: "t1", actor: "user", label: "type", ops: [{ t: "update", id: "p2", patch: { text: "We charge per seat, monthly." } }] });
    const res = e.commit({
      id: "t2",
      actor: "phlo",
      label: "settle",
      ops: [{ t: "update", id: "p2", expectRev: rev, patch: { text: "Model text" } }],
    });
    expect(res.ok).toBe(false);
    expect(e.block("p2")!.text).toBe("We charge per seat, monthly.");
  });

  it("is atomic: one stale op rejects the whole transaction", () => {
    const e = seeded();
    const p1rev = e.block("p1")!.rev;
    e.commit({ id: "t1", actor: "user", label: "type", ops: [{ t: "update", id: "p3", patch: { text: "x" } }] });
    const p3old = 1;
    const res = e.commit({
      id: "t2",
      actor: "phlo",
      label: "settle",
      ops: [
        { t: "update", id: "p1", expectRev: p1rev, patch: { text: "changed" } },
        { t: "update", id: "p3", expectRev: p3old, patch: { text: "changed" } },
      ],
    });
    expect(res.ok).toBe(false);
    expect(e.block("p1")!.text).toBe("Interviews are hard to follow.");
  });

  it("selective undo reverses one edit and keeps later unrelated typing", () => {
    const e = seeded();
    const r = e.commit({
      id: "phlo1",
      actor: "phlo",
      label: "Settle",
      ops: [{ t: "update", id: "p3", patch: { text: "Delay launch; study B changes it." } }],
    });
    expect(r.ok).toBe(true);
    e.commit({ id: "u1", actor: "user", label: "type", ops: [{ t: "update", id: "p1", patch: { text: "Typed meanwhile." } }] });
    const u = e.undo("phlo1");
    expect(u?.ok).toBe(true);
    expect(e.block("p3")!.text).toBe("Ship the voice-first editor.");
    expect(e.block("p1")!.text).toBe("Typed meanwhile.");
  });

  it("refuses to undo an edit whose block changed since", () => {
    const e = seeded();
    e.commit({ id: "phlo1", actor: "phlo", label: "Settle", ops: [{ t: "update", id: "p3", patch: { text: "A" } }] });
    e.commit({ id: "u1", actor: "user", label: "type", ops: [{ t: "update", id: "p3", patch: { text: "AB" } }] });
    const u = e.undo("phlo1");
    expect(u?.ok).toBe(false);
    expect(e.block("p3")!.text).toBe("AB");
  });

  it("park keeps removed blocks recoverable and undo brings them back in place", () => {
    const e = seeded();
    e.commit({ id: "p", actor: "voice", label: "Park", ops: [{ t: "park", id: "p2" }] });
    expect(e.state.blocks.find((b) => b.id === "p2")).toBeUndefined();
    expect(e.state.parked.map((b) => b.id)).toContain("p2");
    e.undo();
    expect(e.state.blocks.map((b) => b.id)).toEqual(["h1", "p1", "h2", "p2", "h3", "p3"]);
  });

  it("coalesces typing into one undo step", () => {
    const e = seeded();
    for (const t of ["W", "We", "We s"]) {
      e.commit({ id: `k${t}`, actor: "user", label: "Typing", coalesce: "type:p1", ops: [{ t: "update", id: "p1", patch: { text: t } }] });
    }
    e.undo();
    expect(e.block("p1")!.text).toBe("Interviews are hard to follow.");
  });

  it("redo reapplies", () => {
    const e = seeded();
    e.commit({ id: "x", actor: "user", label: "edit", ops: [{ t: "update", id: "p1", patch: { text: "new" } }] });
    e.undo();
    e.redo();
    expect(e.block("p1")!.text).toBe("new");
  });
});

describe("settle", () => {
  function withWet(text: string, origin: Block["origin"] = "voice") {
    const e = seeded();
    e.commit({ id: "w", actor: "voice", label: "speech", ops: [{ t: "insert", block: blk("w1", "paragraph", text, true, origin), after: "p3" }] });
    return e;
  }

  it("finds signposted sections and enumerations in speech", () => {
    expect(speechHints("pain points. picking forty photos out of four thousand is the wall")).toMatchObject({ cue: "Pain points", items: [] });
    expect(speechHints("for solutions, one, auto pick the best moments. two, a designer layout that looks like a real book")).toEqual({
      lead: "",
      cue: "Solutions",
      rest: "one, auto pick the best moments. two, a designer layout that looks like a real book",
      items: ["auto pick the best moments", "a designer layout that looks like a real book"],
    });
    expect(speechHints("the metric I'd use is the percent of started books printed").cue).toBe("Metric");
    expect(speechHints("okay so let me start by clarifying the goal. I think the goal is more printed books").cue).toBe("Goal");
    expect(speechHints("I think we should price it at two hundred").cue).toBeNull();
    expect(speechHints("the prompt is photo books. let me start by clarifying the goal. I think the goal is printed books")).toMatchObject({ lead: "the prompt is photo books.", cue: "Goal" });
    expect(speechHints("we lose people at signup. it hurts. pricing is fine").cue).toBeNull();
    expect(speechHints("so yeah. that's basically it for now").cue).toBeNull();
  });

  it("spoken and written numbers compare equal", () => {
    expect(numberize("picking forty photos out of four thousand")).toBe("picking 40 photos out of 4000");
    expect(numberize("a hundred fifty to two hundred dollars")).toBe("150 to 200 dollars");
    expect(numberize("Picking 40 photos out of 4,000")).toBe("picking 40 photos out of 4000");
  });

  it("cleans fillers and repetition", () => {
    expect(cleanSpeech("um so the the price is, you know, too high")).toBe("The price is, too high");
    expect(cleanSpeech("it's the wall. and the layouts look generic")).toBe("It's the wall. And the layouts look generic");
    expect(cleanSpeech("okay so we charge per seat")).toBe("We charge per seat");
  });

  it("local route places speech under the matching heading", () => {
    const e = withWet("pricing should be usage based not per seat");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h3", recent: [] });
    const plan = localPlan(req)!;
    expect(plan.placements[0].under).toBe("h2");
    const c = compilePlan(e.snapshot(), req, plan);
    const res = e.commit({ id: "s", actor: "phlo", label: "Settle", ops: c.ops });
    expect(res.ok).toBe(true);
    expect(e.state.blocks.map((b) => b.id)).toEqual(["h1", "p1", "h2", "p2", "w1", "h3", "p3"]);
    expect(e.block("w1")!.wet).toBe(false);
  });

  it("local route handles 'new section X: content'", () => {
    const e = withWet("new section risks: latency could break trust");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const plan = localPlan(req)!;
    const c = compilePlan(e.snapshot(), req, plan);
    expect(e.commit({ id: "s", actor: "phlo", label: "Settle", ops: c.ops }).ok).toBe(true);
    const texts = e.state.blocks.map((b) => b.text);
    expect(texts).toContain("Risks");
    expect(texts[texts.indexOf("Risks") + 1]).toBe("Latency could break trust.");
  });

  it("never drops words after a comma in a new-section command", () => {
    const e = withWet("new section approach: talk, and the page organizes itself, then you publish");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const plan = localPlan(req)!;
    expect(plan.new_headings[0].text).toBe("Approach");
    expect(plan.placements[0].text).toBe("Talk, and the page organizes itself, then you publish.");
  });

  it("action items collect in a Next list that stays last", () => {
    const e = withWet("talk to 5 couples about the price");
    let req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h2", recent: [] });
    e.commit({ id: "s", actor: "phlo", label: "Settle", ops: compilePlan(e.snapshot(), req, localPlan(req)!).ops });
    e.commit({ id: "w2", actor: "voice", label: "speech", ops: [{ t: "insert", block: blk("w2", "paragraph", "new section risks: churn", true, "voice"), after: "p3" }] });
    req = buildRequest(e.snapshot(), ["w2"], { currentHeadingId: null, recent: [] });
    e.commit({ id: "s2", actor: "phlo", label: "Settle", ops: compilePlan(e.snapshot(), req, localPlan(req)!).ops });
    const texts = e.state.blocks.map((b) => b.text);
    expect(texts.slice(-2)).toEqual(["Next", "Talk to 5 couples about the price"]);
    expect(e.block("w1")!.kind).toBe("bullet");
    expect(texts.indexOf("Risks")).toBeLessThan(texts.indexOf("Next"));
  });

  it("matches headings made only of stop words", () => {
    const e = seeded();
    e.commit({ id: "h", actor: "user", label: "h", ops: [{ t: "insert", block: blk("h9", "heading", "Who it's for"), after: "p3" }, { t: "insert", block: blk("w1", "paragraph", "under who it's for: grandparents", true, "voice"), after: "h9" }] });
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    expect(localPlan(req)!.placements[0]).toMatchObject({ under: "h9", text: "Grandparents." });
  });

  it("voice restructuring: rename, merge, park, retype — and none of it lands as text", () => {
    const e = seeded();
    const run = (text: string, recent: string[] = []) => {
      const id = `w${Math.random().toString(36).slice(2, 7)}`;
      e.commit({ id: `i${id}`, actor: "voice", label: "speech", ops: [{ t: "insert", block: blk(id, "paragraph", text, true, "voice"), after: "p3" }] });
      const req = buildRequest(e.snapshot(), [id], { currentHeadingId: null, recent });
      const c = compilePlan(e.snapshot(), req, localPlan(req)!);
      expect(e.commit({ id: `s${id}`, actor: "phlo", label: "Settle", ops: c.ops }).ok).toBe(true);
      return c.structural;
    };
    expect(run("rename pricing to business model")).toEqual(["Renamed Pricing → Business model"]);
    expect(e.block("h2")!.trail).toEqual(["Pricing"]);
    expect(run("move problem under business model, it's all one thing")).toEqual(["Merged Problem into Business model"]);
    expect(e.state.blocks.map((b) => b.id)).toEqual(["h2", "p2", "p1", "h3", "p3"]);
    expect(e.state.parked.map((b) => b.id)).toContain("h1");
    expect(run("make that a question", ["p3"])).toEqual(["Made it a question"]);
    expect(e.block("p3")!.kind).toBe("question");
    expect(run("park recommendation")).toEqual(["Parked Recommendation"]);
    expect(e.state.blocks.map((b) => b.id)).toEqual(["h2", "p2", "p1"]);
    expect(e.state.blocks.map((b) => b.text).join(" ")).not.toMatch(/rename|move|park|make that/i);
  });

  it("a tangent never lands inside the section being worked on", () => {
    const e = withWet("oh also, could this be a subscription, one book a year");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h3", recent: [] });
    const plan = localPlan(req)!;
    expect(plan.placements[0].tangent).toBe(true);
    e.commit({ id: "s", actor: "phlo", label: "Settle", ops: compilePlan(e.snapshot(), req, plan).ops });
    expect(e.block("w1")!.tab).toBe("tangent");
  });

  it("scratch that folds the old version into a trail", () => {
    const e = withWet("scratch that, ship the typing-first editor");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: "h3", recent: ["p3"] });
    const c = compilePlan(e.snapshot(), req, localPlan(req)!);
    expect(e.commit({ id: "s", actor: "phlo", label: "Settle", ops: c.ops }).ok).toBe(true);
    expect(e.block("p3")!.text).toBe("Ship the typing-first editor.");
    expect(e.block("p3")!.trail).toEqual(["Ship the voice-first editor."]);
    expect(e.state.parked.map((b) => b.id)).toContain("w1");
  });

  it("a settle computed before more typing conflicts and leaves the words wet", () => {
    const e = withWet("pricing should be usage based", "typed");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const plan = localPlan(req)!;
    // user keeps typing while the model thinks
    e.commit({ id: "k", actor: "user", label: "Typing", ops: [{ t: "update", id: "w1", patch: { text: "pricing should be usage based, metered" } }] });
    const c = compilePlan(e.snapshot(), req, plan);
    const res = e.commit({ id: "s", actor: "phlo", label: "Settle", ops: c.ops });
    expect(res.ok).toBe(false);
    expect(e.block("w1")!.wet).toBe(true);
    expect(e.block("w1")!.text).toBe("pricing should be usage based, metered");
  });

  it("scribe guard replaces invented words with the speaker's own", () => {
    const e = withWet("we lose people at the signup step");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const { plan, violations } = enforceScribe(
      {
        title: "Growth strategy masterplan",
        new_headings: [{ ref: "h", text: "Funnel optimization opportunities", after: null }],
        placements: [{ wet_id: "w1", under: "h", kind: "paragraph", text: "Onboarding friction drives significant churn among enterprise prospects.", tangent: true }],
        revisions: [],
        consumed: [],
        structure: [],
        question: "Have you considered SSO?",
      },
      req,
    );
    expect(violations).toBeGreaterThanOrEqual(3);
    expect(plan.placements[0].text).toBe("We lose people at the signup step.");
    expect(plan.placements[0].under).toBe("here");
    expect(plan.new_headings).toHaveLength(0);
    expect(plan.question).toBeNull();
    expect(plan.title).toBeNull();
    expect(noveltyRatio(plan.placements[0].text, "we lose people at the signup step")).toBe(0);
  });

  it("scribe guard accepts the speaker's own words in new shapes", () => {
    const e = withWet("for solutions one auto pick the best moments");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: ["p3"] });
    const { plan, violations } = enforceScribe(
      {
        title: null,
        new_headings: [{ ref: "s", text: "Solutions", after: null }],
        placements: [{ wet_id: "w1", under: "s", kind: "bullet", text: "Auto-pick the best moments", tangent: false }],
        revisions: [{ block_id: "p3", text: "Ship the voice-first editor with auto-pick." }],
        consumed: [],
        structure: [],
        question: null,
      },
      req,
    );
    expect(violations).toBe(0);
    expect(plan.placements[0].text).toBe("Auto-pick the best moments");
    expect(plan.revisions).toHaveLength(1);
  });

  it("unknown ids from a model are dropped, never guessed", () => {
    const e = withWet("hello there friend");
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const c = compilePlan(e.snapshot(), req, {
      title: null,
      new_headings: [],
      placements: [{ wet_id: "nope", under: "h2", kind: "paragraph", text: "x", tangent: false }],
      revisions: [{ block_id: "ghost", text: "y" }],
      consumed: [],
      structure: [],
      question: null,
    });
    expect(c.issues.length).toBeGreaterThanOrEqual(2);
    expect(e.commit({ id: "s", actor: "phlo", label: "Settle", ops: c.ops }).ok).toBe(true);
    expect(e.block("w1")!.wet).toBe(false);
  });

  it("earns an idea color once a section has substance", () => {
    const e = seeded();
    e.commit({
      id: "more",
      actor: "user",
      label: "more",
      ops: [
        { t: "insert", block: blk("x1", "paragraph", "a"), after: "p2" },
        { t: "insert", block: blk("w1", "paragraph", "pricing tiers for teams", true, "voice"), after: "p3" },
      ],
    });
    const req = buildRequest(e.snapshot(), ["w1"], { currentHeadingId: null, recent: [] });
    const c = compilePlan(e.snapshot(), req, localPlan(req)!);
    e.commit({ id: "s", actor: "phlo", label: "Settle", ops: c.ops });
    expect(e.block("h2")!.theme).toBe("cobalt");
  });
});

describe("partial apply", () => {
  it("drops only the stale group and commits the rest", () => {
    const e = seeded();
    const ids = e.state.blocks.map((b) => b.id);
    const [a, b] = ids;
    const revA = e.block(a)!.rev;
    const revB = e.block(b)!.rev;
    // You type in `a` after the plan was made.
    e.commit({ id: "typing", actor: "user", label: "Type", ops: [{ t: "update", id: a, patch: { text: "edited" } }] });
    const out = e.commitPartial({
      id: "plan",
      actor: "phlo",
      label: "Settle",
      ops: [
        { t: "update", id: a, patch: { text: "stale rewrite" }, expectRev: revA },
        { t: "insert", block: { id: "n1", kind: "paragraph", text: "after a", wet: false, rev: 0, origin: "typed" }, after: a },
        { t: "update", id: b, patch: { wet: false }, expectRev: revB },
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.dropped.length).toBe(2);
    expect(e.block(a)!.text).toBe("edited");
    expect(e.block("n1")).toBeUndefined();
    expect(e.block(b)!.wet).toBe(false);
  });

  it("is a plain commit when nothing is stale", () => {
    const e = seeded();
    const a = e.state.blocks[0];
    const out = e.commitPartial({ id: "p", actor: "phlo", label: "x", ops: [{ t: "update", id: a.id, patch: { text: "y" }, expectRev: a.rev }] });
    expect(out.ok && out.dropped.length === 0).toBe(true);
  });
});
