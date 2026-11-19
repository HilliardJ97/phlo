/**
 * Settle: how wet words (spoken or typed) become organized ink.
 *
 *   renderer snapshots wet blocks + their revs  ->  SettleRequest
 *   host routes it (local rules or a model)     ->  SettlePlan (structured, by block id)
 *   compilePlan() turns the plan into engine ops, every op guarded by the rev
 *   the plan was computed against. If you kept typing in a block, its rev moved
 *   and that op conflicts: the words stay wet and settle on the next pass.
 *
 * The model never writes HTML or touches the page directly. It proposes; the
 * engine validates and applies.
 */
import { z } from "zod";
import type { Op } from "./engine";
import { newId } from "./ids";
import type { Block, BlockKind, Draft, IdeaColor, Role } from "./model";
import { IDEA_COLORS, sections } from "./model";

// ---------------------------------------------------------------------------
// Wire types
// ---------------------------------------------------------------------------

export interface WetItem {
  id: string;
  text: string;
  rev: number;
  origin: "typed" | "voice";
  /** Heading the wet block currently sits under, if any. */
  under: string | null;
}

export interface OutlineItem {
  id: string;
  kind: BlockKind;
  text: string;
  /** Heading id this block sits under (null for headings / top). */
  under: string | null;
}

export interface SettleRequest {
  requestId: string;
  draftId: string;
  version: number;
  role: Role;
  title: string;
  titleAuto: boolean;
  outline: OutlineItem[];
  wet: WetItem[];
  /** Heading of the section the user is working in (spotlight). */
  currentHeadingId: string | null;
  /** Most recently settled block ids, newest first. "Scratch that" targets. */
  recent: string[];
  /** Reference titles the user can mention by name. */
  references: string[];
}

export const SettlePlanSchema = z.object({
  title: z.string().nullable().describe("A short title for the draft, only if the draft has no title yet and the content now makes one obvious. Otherwise null."),
  new_headings: z
    .array(
      z.object({
        ref: z.string().describe("Temporary id such as h1, used by placements."),
        text: z.string().describe("Short heading, 1-5 words, sentence case, no trailing punctuation."),
        after: z.string().nullable().describe("Existing heading id or new heading ref to place this section after. null = end of page."),
      }),
    )
    .describe("Only create a heading when no existing heading fits."),
  placements: z
    .array(
      z.object({
        wet_id: z.string().describe("Which wet item these words came from."),
        under: z.string().describe("Existing heading id, new heading ref, or 'here' to settle in place."),
        kind: z.enum(["paragraph", "bullet", "question"]),
        text: z.string().describe("The settled words: speech cleaned up (fillers, false starts, repetition removed), meaning unchanged."),
        tangent: z.boolean().describe("True if this is an aside unrelated to the current thread (Partner only)."),
      }),
    )
    .describe("Every wet item must be placed at least once or listed in consumed. One wet item may split into several placements."),
  revisions: z
    .array(
      z.object({
        block_id: z.string().describe("Existing settled block to revise."),
        text: z.string().describe("Its new text."),
      }),
    )
    .describe("Only when the speaker explicitly changes their mind (\"scratch that\", \"actually\", \"change X to Y\")."),
  consumed: z.array(z.string()).describe("Wet ids that were only instructions (e.g. 'new section pricing', 'scratch that') and carry no content of their own."),
  question: z.string().nullable().describe("Partner only: one short question if the thinking has an obvious open gap. Usually null."),
});

export type SettlePlan = z.infer<typeof SettlePlanSchema>;

export interface SettleResponse {
  requestId: string;
  plan: SettlePlan;
  route: "local" | "model" | "fallback";
  model?: string;
  latencyMs: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// Building a request from the current draft
// ---------------------------------------------------------------------------

export function headingOf(blocks: Block[], id: string): string | null {
  let h: string | null = null;
  for (const b of blocks) {
    if (b.kind === "heading") h = b.id;
    if (b.id === id) return b.kind === "heading" ? null : h;
  }
  return null;
}

export function buildRequest(
  draft: Draft,
  wetIds: string[],
  opts: { currentHeadingId: string | null; recent: string[]; requestId?: string },
): SettleRequest {
  const outline: OutlineItem[] = [];
  let h: string | null = null;
  for (const b of draft.blocks) {
    if (b.kind === "heading") h = b.id;
    if (b.wet) continue;
    outline.push({ id: b.id, kind: b.kind, text: b.text, under: b.kind === "heading" ? null : h });
  }
  const wet: WetItem[] = wetIds
    .map((id) => draft.blocks.find((b) => b.id === id))
    .filter((b): b is Block => !!b && b.wet && b.text.trim().length > 0)
    .map((b) => ({
      id: b.id,
      text: b.text,
      rev: b.rev,
      origin: b.origin === "voice" ? "voice" : "typed",
      under: headingOf(draft.blocks, b.id),
    }));
  return {
    requestId: opts.requestId ?? newId("req"),
    draftId: draft.id,
    version: draft.version,
    role: draft.role,
    title: draft.title,
    titleAuto: draft.titleAuto,
    outline,
    wet,
    currentHeadingId: opts.currentHeadingId,
    recent: opts.recent,
    references: draft.references.map((r) => r.title),
  };
}

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------

const FILLERS = [
  /\b(um+|uh+|erm+|er|ah+|hmm+|mm+)\b[,.]?\s*/gi,
  /\byou know,?\s*/gi,
  /\bI mean,?\s*/gi,
  /(^|,\s*)like,\s*/gi,
  /\bkind of\s+(?=kind of)/gi,
  /\bbasically,?\s*/gi,
  /\bso yeah,?\s*/gi,
];

const STOP = new Set(
  "a an the and or but if then so to of in on at for with by from as is are was were be been being it its this that these those i we you they he she me my our your their them us do does did have has had not no yes just very really also can could should would will about into over than more most some any all what which who how why when where there here".split(
    " ",
  ),
);

export function cleanSpeech(text: string): string {
  let t = ` ${text} `;
  for (const re of FILLERS) t = t.replace(re, (m, p1) => (typeof p1 === "string" && p1.startsWith(",") ? p1 : " "));
  // Immediate word repetition: "the the" -> "the"
  t = t.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
  t = t.replace(/\s+([,.!?;:])/g, "$1").replace(/\s{2,}/g, " ").trim();
  t = t.replace(/^[,;:\s]+/, "");
  if (!t) return t;
  t = t[0].toUpperCase() + t.slice(1);
  return t;
}

export function ensureSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return /[.!?:)"'”]$/.test(t) ? t : `${t}.`;
}

export function stem(w: string): string {
  return w
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/(ing|ed|es|s|ly)$/, "");
}

export function contentWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(stem)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

// ---------------------------------------------------------------------------
// Scribe guard: "Phlo never puts words in your mouth when someone's watching."
// ---------------------------------------------------------------------------

/** Fraction of content words in `out` that do not appear in `source`. */
export function noveltyRatio(out: string, source: string): number {
  const src = new Set(contentWords(source));
  const words = contentWords(out);
  if (!words.length) return 0;
  const novel = words.filter((w) => !src.has(w));
  return novel.length / words.length;
}

export const SCRIBE_MAX_NOVELTY = 0.2;

/**
 * Enforce Scribe rules on a plan. Not a prompt instruction: a hard check.
 * Placements that add words fall back to the cleaned original speech.
 * Headings must be built from words already spoken or on the page.
 */
export function enforceScribe(plan: SettlePlan, req: SettleRequest): { plan: SettlePlan; violations: number } {
  let violations = 0;
  const wetById = new Map(req.wet.map((w) => [w.id, w.text]));
  const allSpoken = req.wet.map((w) => w.text).join(" ");
  const pageText = req.outline.map((o) => o.text).join(" ");
  const pool = `${allSpoken} ${pageText}`;

  const keptHeadings = plan.new_headings.filter((h) => {
    const ok = noveltyRatio(h.text, pool) <= 0.34;
    if (!ok) violations++;
    return ok;
  });
  const dropped = new Set(plan.new_headings.filter((h) => !keptHeadings.includes(h)).map((h) => h.ref));

  const placements = plan.placements.map((p) => {
    const src = wetById.get(p.wet_id) ?? "";
    let { text, under } = p;
    if (noveltyRatio(text, src) > SCRIBE_MAX_NOVELTY) {
      violations++;
      text = ensureSentence(cleanSpeech(src));
    }
    if (dropped.has(under)) under = "here";
    return { ...p, text, under, tangent: false };
  });

  const revisions = plan.revisions.filter((r) => {
    const ok = noveltyRatio(r.text, allSpoken) <= SCRIBE_MAX_NOVELTY;
    if (!ok) violations++;
    return ok;
  });

  let title = plan.title;
  if (title && noveltyRatio(title, pool) > 0.34) {
    violations++;
    title = null;
  }
  if (plan.question) violations++;

  return {
    plan: { ...plan, title, new_headings: keptHeadings, placements, revisions, question: null },
    violations,
  };
}

// ---------------------------------------------------------------------------
// Plan validation + compilation into guarded engine ops
// ---------------------------------------------------------------------------

export interface Compiled {
  ops: Op[];
  /** Wet ids settled by this plan (for animation). */
  settledIds: string[];
  /** Ids of brand-new blocks created by splits/headings. */
  createdIds: string[];
  issues: string[];
  question: string | null;
}

/**
 * Turn a plan into ops against the CURRENT draft, guarded by the revs in the
 * request. Unknown ids are dropped (reported as issues), never guessed.
 */
export function compilePlan(draft: Draft, req: SettleRequest, plan: SettlePlan): Compiled {
  const issues: string[] = [];
  const ops: Op[] = [];
  const settledIds: string[] = [];
  const createdIds: string[] = [];

  // Simulated order of ids so successive inserts land in the right place.
  const order = draft.blocks.map((b) => b.id);
  const kindOf = new Map<string, BlockKind>(draft.blocks.map((b) => [b.id, b.kind]));
  const byId = new Map(draft.blocks.map((b) => [b.id, b]));
  const wetRev = new Map(req.wet.map((w) => [w.id, w.rev]));

  const removeFromOrder = (id: string) => {
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
  };
  const insertAfter = (id: string, after: string | null) => {
    if (after === null) order.unshift(id);
    else order.splice(order.indexOf(after) + 1, 0, id);
  };
  /** Last id in the section that starts at heading `h` (the heading itself if empty). */
  const sectionEnd = (h: string): string => {
    let i = order.indexOf(h);
    while (i + 1 < order.length && kindOf.get(order[i + 1]) !== "heading") i++;
    return order[i];
  };

  // 1. New headings.
  const refToId = new Map<string, string>();
  for (const h of plan.new_headings) {
    const text = h.text.trim().replace(/[.:]+$/, "");
    if (!text) continue;
    const id = newId("h");
    refToId.set(h.ref, id);
    let after: string | null;
    const anchor = h.after ? (refToId.get(h.after) ?? h.after) : null;
    if (anchor && kindOf.get(anchor) === "heading") after = sectionEnd(anchor);
    else after = order.length ? order[order.length - 1] : null;
    // A heading must not land inside a wet block run the user is still on: append at end instead.
    const block: Block = { id, kind: "heading", text, wet: false, rev: 0, origin: "phlo" };
    ops.push({ t: "insert", block, after });
    insertAfter(id, after);
    kindOf.set(id, "heading");
    createdIds.push(id);
  }

  // 2. Placements.
  const usedWet = new Set<string>();
  for (const p of plan.placements) {
    const wet = byId.get(p.wet_id);
    const rev = wetRev.get(p.wet_id);
    if (!wet || rev === undefined) {
      issues.push(`unknown wet id ${p.wet_id}`);
      continue;
    }
    const text = p.text.trim();
    if (!text) continue;
    const underId = p.under === "here" ? null : (refToId.get(p.under) ?? p.under);
    if (underId && kindOf.get(underId) !== "heading") {
      issues.push(`placement under non-heading ${p.under}`);
    }
    const target = underId && kindOf.get(underId) === "heading" ? underId : null;
    const kind: BlockKind = p.kind;

    if (!usedWet.has(wet.id)) {
      usedWet.add(wet.id);
      // Reuse the wet block itself: settle its text, then glide it under its heading.
      ops.push({
        t: "update",
        id: wet.id,
        expectRev: rev,
        patch: { text, kind, wet: false, tab: p.tangent ? "tangent" : undefined, depth: kind === "bullet" ? (wet.depth ?? 0) : undefined },
      });
      if (target && headingOfOrder(order, kindOf, wet.id) !== target) {
        removeFromOrder(wet.id);
        const after = sectionEnd(target);
        ops.push({ t: "move", id: wet.id, after });
        insertAfter(wet.id, after);
      }
      settledIds.push(wet.id);
    } else {
      // Split: an extra idea from the same breath becomes its own block.
      const id = newId("b");
      const after = target ? sectionEnd(target) : wet.id;
      const block: Block = {
        id,
        kind,
        text,
        wet: false,
        rev: 0,
        origin: wet.origin,
        sources: wet.sources,
        tab: p.tangent ? "tangent" : undefined,
      };
      ops.push({ t: "insert", block, after });
      insertAfter(id, after);
      kindOf.set(id, kind);
      createdIds.push(id);
      settledIds.push(id);
    }
  }

  // 3. Instruction-only wet items are parked (recoverable), not deleted.
  for (const id of plan.consumed) {
    const rev = wetRev.get(id);
    if (rev === undefined || usedWet.has(id)) continue;
    usedWet.add(id);
    ops.push({ t: "park", id, expectRev: rev });
    removeFromOrder(id);
  }

  // 4. Anything the plan forgot settles in place, verbatim but cleaned.
  for (const w of req.wet) {
    if (usedWet.has(w.id)) continue;
    issues.push(`unplaced wet id ${w.id}`);
    ops.push({ t: "update", id: w.id, expectRev: w.rev, patch: { text: ensureSentence(cleanSpeech(w.text)), wet: false } });
    settledIds.push(w.id);
  }

  // 5. Revisions ("scratch that"): old text folds into a trail.
  for (const r of plan.revisions) {
    const b = byId.get(r.block_id);
    if (!b || b.wet) {
      issues.push(`bad revision target ${r.block_id}`);
      continue;
    }
    ops.push({
      t: "update",
      id: b.id,
      expectRev: b.rev,
      patch: { text: r.text.trim(), trail: [...(b.trail ?? []), b.text] },
    });
  }

  // 6. Title.
  if (plan.title && draft.titleAuto && !draft.title.trim()) {
    ops.push({ t: "meta", patch: { title: plan.title.trim().replace(/[.]+$/, "") } });
  }

  // 7. Earned color: headings with real substance get an idea color (max 3).
  ops.push(...themeOps(draft, order, kindOf, ops));

  return { ops, settledIds, createdIds, issues, question: plan.question };
}

function headingOfOrder(order: string[], kindOf: Map<string, BlockKind>, id: string): string | null {
  let h: string | null = null;
  for (const x of order) {
    if (kindOf.get(x) === "heading") h = x;
    if (x === id) return h;
  }
  return null;
}

const THEME_MIN_BLOCKS = 3;

function themeOps(draft: Draft, order: string[], kindOf: Map<string, BlockKind>, pending: Op[]): Op[] {
  const counts = new Map<string, number>();
  let h: string | null = null;
  for (const id of order) {
    if (kindOf.get(id) === "heading") {
      h = id;
      counts.set(id, 0);
    } else if (h) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const existing = draft.blocks.filter((b) => b.kind === "heading" && b.theme);
  const used = new Set<IdeaColor>(existing.map((b) => b.theme!));
  const ops: Op[] = [];
  if (used.size >= IDEA_COLORS.length) return ops;
  const pendingUpdate = new Set(pending.filter((o) => o.t === "update").map((o) => (o as { id: string }).id));
  for (const [hid, n] of counts) {
    if (n < THEME_MIN_BLOCKS) continue;
    const b = draft.blocks.find((x) => x.id === hid);
    if (!b || b.theme || pendingUpdate.has(hid)) continue;
    const color = IDEA_COLORS.find((c) => !used.has(c));
    if (!color) break;
    used.add(color);
    ops.push({ t: "update", id: hid, patch: { theme: color } });
  }
  return ops;
}

/** Ops that settle wet blocks verbatim, in place. Used when nothing smarter is possible. */
export function settleInPlaceOps(draft: Draft, ids: string[]): Op[] {
  return ids
    .map((id) => draft.blocks.find((b) => b.id === id))
    .filter((b): b is Block => !!b && b.wet)
    .map((b) => ({ t: "update", id: b.id, expectRev: b.rev, patch: { text: ensureSentence(cleanSpeech(b.text)), wet: false } }) as Op);
}

export { sections };
