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
import { turnIntoOps } from "./forms";

const FORM_NAME: Partial<Record<BlockKind, string>> = { numbered: "numbered step", question: "question", decision: "decision", idea: "idea", callout: "note", bullet: "bullet", paragraph: "paragraph", heading: "heading" };

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
  /** Rev the model saw. Revisions are guarded by it, not by the current rev. */
  rev: number;
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
        under: z.string().describe("Existing heading id, new heading ref, 'here' to settle in place, or 'next' for an action item (goes to the Next list at the end)."),
        kind: z.enum(["paragraph", "bullet", "numbered", "question", "decision"]),
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
  structure: z
    .array(
      z.object({
        op: z.enum(["rename", "merge", "move_before", "move_after", "park", "retype"]),
        target: z.string().describe("Existing block or heading id the instruction is about."),
        dest: z.string().nullable().describe("merge: heading id to merge into. move_before/move_after: heading id. Otherwise null."),
        text: z.string().nullable().describe("rename: the new heading text. Otherwise null."),
        kind: z.enum(["paragraph", "bullet", "numbered", "question", "decision", "idea", "callout", "heading", "subheading", "table", "flow", "chart", "timeline", "columns"]).nullable().describe("retype: the new kind ('flow' = flowchart of steps, 'chart' needs real numbers, 'subheading' = a smaller heading that can fold). Otherwise null."),
      }),
    )
    .describe("Only for explicit instructions about the page's structure: 'rename X to Y', 'move X under Y' (merge), 'put X before Y', 'park/remove X', 'make that a question'. The instruction's own wet id goes in consumed."),
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
    outline.push({ id: b.id, kind: b.kind, text: b.text, under: b.kind === "heading" ? null : h, rev: b.rev });
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

/**
 * "not forty, sixty" / "change forty to sixty": find the block being corrected
 * by the words being replaced and put it first in `recent`, so every route
 * (model or local) revises the right line, not merely the latest one.
 */
export const CORRECTION = /\b(?:not|instead of|change|swap)\s+(?:the\s+)?([\w$%.,-]+(?:\s+[\w$%.,-]+)?)\s*(?:,|\bto\b|\bbut\b|\bit'?s\b|\bmore like\b|\bactually\b)/i;

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** "four thousand" → "4000", "a hundred fifty" → "150", "$4,000" → "$4000". Spoken and written numbers compare equal. */
export function numberize(text: string): string {
  const out = text.toLowerCase().replace(/(\d),(\d{3})/g, "$1$2");
  return out.replace(/\b(?:(?:a|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)(?:[\s-]+(?:and\s+)?|\b))+/g, (m) => {
    const words = m.trim().split(/[\s-]+/).filter((w) => w !== "and");
    if (words.length === 1 && words[0] === "a") return m;
    let total = 0;
    let cur = 0;
    for (const w of words) {
      if (w === "a") cur = cur || 1;
      else if (w in SMALL) cur += SMALL[w];
      else if (w === "hundred") cur = (cur || 1) * 100;
      else if (w === "thousand") {
        total += (cur || 1) * 1000;
        cur = 0;
      }
    }
    return `${total + cur}${/\s$/.test(m) ? " " : ""}`;
  });
}

export function withCorrectionTarget(req: SettleRequest): SettleRequest {
  for (const w of req.wet) {
    const m = CORRECTION.exec(w.text);
    if (!m) continue;
    const needle = numberize(m[1].replace(/[,.]+$/, "")).trim();
    const hit = [...req.outline].reverse().find((o) => o.kind !== "heading" && numberize(o.text).includes(needle));
    if (hit) return { ...req, recent: [hit.id, ...req.recent.filter((id) => id !== hit.id)] };
  }
  return req;
}

// ---------------------------------------------------------------------------
// Speech hints: make the hard-to-hear structure explicit before any model sees it.
// ---------------------------------------------------------------------------

export interface SpeechHints {
  /** Words before a mid-utterance cue ("The prompt is X. Let me start by clarifying the goal…"). */
  lead: string;
  /** A section cue the speaker signposted ("pain points.", "for solutions,", "the metric I'd use"). */
  cue: string | null;
  /** The words after the cue. */
  rest: string;
  /** Enumerated items ("one, X. two, Y" / "first… second…"), in order. */
  items: string[];
}

const CUE_PATTERNS: RegExp[] = [
  // "let me start by clarifying the goal. I think…" / "let's talk about pricing,"
  /^(?:ok(?:ay)?,?\s+|so,?\s+)*(?:let me|let's|i'll|i want to)\s+(?:start|begin|move on|talk|go)\s+(?:by|with|to|about|on)\s+(?:clarifying\s+|defining\s+|thinking about\s+)?(?:the\s+)?([a-z][a-z' ]{1,28}?)\s*[.,:;]\s*(.*)$/i,
  // "for solutions, one…" / "as for pricing:" / "in terms of risks,"
  /^(?:ok(?:ay)?,?\s+|so,?\s+|and\s+)*(?:for|as for|about|regarding|in terms of|on)\s+(?:the\s+)?([a-z][a-z' ]{1,28}?)\s*[,:]\s*(.+)$/i,
  // "the metric I'd use is…" / "the users I'd focus on are…"
  /^(?:ok(?:ay)?,?\s+|so,?\s+|um,?\s+)*the\s+([a-z][a-z' ]{1,24}?)\s+(?:i'?d|we'?d|i|we)\s+(?:use|focus on|pick|choose|track|target)\b\s*(.*)$/i,
  // "pain points. picking forty…" (a short label, then a full stop)
  /^(?:ok(?:ay)?,?\s+|so,?\s+|um,?\s+)*([a-z][a-z' ]{2,24}?)\s*[.:]\s+(.{12,})$/i,
];

const ENUM = /(?:^|[.,;]\s*|\s)(?:one|two|three|four|five|first|second|third|fourth|fifth|1|2|3|4|5)[,:.)]\s+/gi;

export function speechHints(text: string): SpeechHints {
  const whole = text.trim();
  // A cue can start mid-utterance: try each sentence start; words before it are the lead.
  const sentences = whole.split(/(?<=[.!?])\s+/);
  for (let i = 0; i < sentences.length; i++) {
    const h = cueAt(sentences.slice(i).join(" "), i > 0);
    if (h) return { lead: sentences.slice(0, i).join(" "), ...h, items: enumerate(h.rest) };
  }
  return { lead: "", cue: null, rest: whole, items: enumerate(whole) };
}

function cueAt(t: string, midUtterance: boolean): { cue: string; rest: string } | null {
  let cue: string | null = null;
  let rest = t;
  for (const [k, re] of CUE_PATTERNS.entries()) {
    const m = re.exec(t);
    if (!m) continue;
    const label = m[1].trim();
    const words = label.split(/\s+/);
    // A cue is a short label, not a sentence ("i think", "that's it" are not cues).
    if (words.length > 3 || /^(?:i|we|it|that|this|so|and|but|yes|yeah|no|ok|okay|well|um|uh|right|anyway|alright|cool|great|sure|hmm)\b/i.test(label)) continue;
    // Mid-utterance, only explicit signposts count ("let me start by…", "for X,"), not any short sentence.
    if (midUtterance && k === 3) continue;
    cue = label.replace(/\b\w/, (c) => c.toUpperCase());
    // "the metric I'd use is X": the whole sentence is the content; elsewhere the cue is a label to drop.
    rest = k === 2 ? t : (m[2] ?? "").trim();
    break;
  }
  return cue ? { cue, rest } : null;
}

function enumerate(rest: string): string[] {
  const items: string[] = [];
  const marks = [...rest.matchAll(ENUM)];
  if (marks.length >= 2) {
    for (let i = 0; i < marks.length; i++) {
      const start = marks[i].index! + marks[i][0].length;
      const end = i + 1 < marks.length ? marks[i + 1].index! : rest.length;
      const item = rest.slice(start, end).trim().replace(/[.,;]+$/, "");
      if (item) items.push(item);
    }
  }
  return items;
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
  // Spoken openers carry no meaning: "so", "okay so", "and so", "well".
  t = t.replace(/^(?:(?:ok(?:ay)?|so|and|well|right|alright)[,\s]+)+(?=\w)/i, "");
  if (!t) return t;
  t = t[0].toUpperCase() + t.slice(1);
  // Speech recognizers rarely capitalize after a full stop.
  t = t.replace(/([.!?]\s+)([a-z])/g, (_, p, c) => p + c.toUpperCase());
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
  // Split hyphenated and slashed words too: "auto-pick" is "auto" + "pick", not a new word.
  return text
    .split(/[\s\-–—/]+/)
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
    // "Next" is structure, not words: action items may go there in Scribe too.
    return { ...p, text, under, tangent: false };
  });

  const outlineText = new Map(req.outline.map((o) => [o.id, o.text]));
  const revisions = plan.revisions.filter((r) => {
    // A correction may keep the rest of the speaker's earlier sentence: both are their words.
    const ok = noveltyRatio(r.text, `${allSpoken} ${outlineText.get(r.block_id) ?? ""}`) <= SCRIBE_MAX_NOVELTY;
    if (!ok) violations++;
    return ok;
  });

  const structure = (plan.structure ?? []).filter((st) => {
    const ok = st.op !== "rename" || !st.text || noveltyRatio(st.text, pool) <= 0.34;
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
    plan: { ...plan, title, new_headings: keptHeadings, placements, revisions, structure, question: null },
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
  /** Human-readable summary of structural changes, for the undo toast. */
  structural: string[];
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

  /** "End of page" means just before the Next list, which always stays last. */
  let nextId: string | null = draft.blocks.find((b) => b.kind === "heading" && NEXT_RE.test(b.text))?.id ?? null;
  const endAnchor = (): string | null => {
    if (nextId) {
      const i = order.indexOf(nextId);
      return i > 0 ? order[i - 1] : null;
    }
    return order.length ? order[order.length - 1] : null;
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
    else after = endAnchor();
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
    // Empty text = route-only: Phlo cleans the speaker's words deterministically.
    const text = p.text.trim() || (p.kind === "question" ? cleanSpeech(wet.text).replace(/[.!]+$/, "").replace(/\?*$/, "?") : ensureSentence(cleanSpeech(wet.text)));
    if (!text) continue;
    if (p.under === "next" && !nextId) {
      nextId = newId("h");
      const after = order.length ? order[order.length - 1] : null;
      ops.push({ t: "insert", block: { id: nextId, kind: "heading", text: "Next", wet: false, rev: 0, origin: "phlo" }, after });
      insertAfter(nextId, after);
      kindOf.set(nextId, "heading");
      createdIds.push(nextId);
    }
    // Tangents stay where they were spoken; they're shown in the margin, never inside the section.
    const underId = p.tangent || p.under === "here" ? null : p.under === "next" ? nextId : (refToId.get(p.under) ?? p.under);
    if (underId && kindOf.get(underId) !== "heading") {
      issues.push(`placement under non-heading ${p.under}`);
    }
    const target = underId && kindOf.get(underId) === "heading" ? underId : null;
    const kind: BlockKind = p.under === "next" ? "bullet" : p.kind;

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
        depth: kind === "bullet" ? 0 : undefined,
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

  // 5. Structure: explicit rename / merge / move / park / retype. Guarded by the revs the plan saw.
  const structuralLabels: string[] = [];
  const seenStruct = new Map(req.outline.map((o) => [o.id, o]));
  for (const st of plan.structure ?? []) {
    const t = byId.get(st.target);
    const seen = seenStruct.get(st.target);
    if (!t || !seen) {
      issues.push(`bad structure target ${st.target}`);
      continue;
    }
    const sectionIds = (h: string) => {
      const i = order.indexOf(h);
      const out = [h];
      for (let k = i + 1; k < order.length && kindOf.get(order[k]) !== "heading"; k++) out.push(order[k]);
      return out;
    };
    if (st.op === "rename" && st.text?.trim() && t.kind === "heading") {
      const text = st.text.trim().replace(/[.:]+$/, "");
      ops.push({ t: "update", id: t.id, expectRev: seen.rev, patch: { text, trail: [...(t.trail ?? []), t.text] } });
      structuralLabels.push(`Renamed ${t.text} → ${text}`);
    } else if (st.op === "merge" && st.dest && t.kind === "heading" && kindOf.get(st.dest) === "heading" && st.dest !== t.id) {
      const moving = sectionIds(t.id).slice(1);
      let after = sectionEnd(st.dest);
      for (const id of moving) {
        removeFromOrder(id);
        ops.push({ t: "move", id, after });
        insertAfter(id, after);
        after = id;
      }
      ops.push({ t: "park", id: t.id, expectRev: seen.rev });
      removeFromOrder(t.id);
      structuralLabels.push(`Merged ${t.text} into ${byId.get(st.dest)?.text ?? refToId.get(st.dest) ?? "section"}`);
    } else if ((st.op === "move_before" || st.op === "move_after") && st.dest && t.kind === "heading" && kindOf.get(st.dest) === "heading" && st.dest !== t.id) {
      const moving = sectionIds(t.id);
      moving.forEach(removeFromOrder);
      let after: string | null = st.op === "move_after" ? sectionEnd(st.dest) : (order[order.indexOf(st.dest) - 1] ?? null);
      for (const id of moving) {
        ops.push({ t: "move", id, after });
        insertAfter(id, after);
        after = id;
      }
      structuralLabels.push(`Moved ${t.text}`);
    } else if (st.op === "park") {
      const ids = t.kind === "heading" ? sectionIds(t.id) : [t.id];
      for (const id of ids) {
        ops.push({ t: "park", id, ...(id === t.id ? { expectRev: seen.rev } : {}) });
        removeFromOrder(id);
      }
      structuralLabels.push(`Parked ${t.kind === "heading" ? t.text : `“${t.text.slice(0, 32)}”`}`);
    } else if (st.op === "retype" && st.kind === "subheading") {
      ops.push({ t: "update", id: t.id, expectRev: seen.rev, patch: { kind: "heading", level: 2, wet: false } });
      kindOf.set(t.id, "heading");
      structuralLabels.push("Made it a subheading");
    } else if (st.op === "retype" && st.kind && st.kind !== t.kind && (["table", "flow", "chart", "timeline", "columns"] as string[]).some((k) => k === st.kind || k === t.kind)) {
      const conv = turnIntoOps(draft.blocks, t.id, st.kind as BlockKind);
      if (!conv.ops.length) {
        issues.push(conv.label || `can't make ${st.kind}`);
        if (conv.label) structuralLabels.push(conv.label);
        continue;
      }
      ops.push(...conv.ops);
      structuralLabels.push(conv.label || `Made it a ${st.kind}`);
    } else if (st.op === "retype" && st.kind && st.kind !== t.kind) {
      ops.push({ t: "update", id: t.id, expectRev: seen.rev, patch: { kind: st.kind as BlockKind, wet: false, ...(st.kind === "bullet" ? { depth: 0 } : {}) } });
      kindOf.set(t.id, st.kind as BlockKind);
      structuralLabels.push(`Made it ${/^[aeiou]/.test(st.kind) ? "an" : "a"} ${FORM_NAME[st.kind as BlockKind] ?? st.kind}`);
    } else {
      issues.push(`unsupported structure ${st.op} on ${st.target}`);
    }
  }

  // 6. Revisions ("scratch that"): old text folds into a trail.
  const seenRev = new Map(req.outline.map((o) => [o.id, o]));
  for (const r of plan.revisions) {
    const b = byId.get(r.block_id);
    const seen = seenRev.get(r.block_id);
    if (!b || b.wet || !seen) {
      issues.push(`bad revision target ${r.block_id}`);
      continue;
    }
    // Tables and flows keep their meaning in cells/steps: apply the correction there.
    if ((b.kind === "flow" && b.steps) || (b.kind === "table" && b.data)) {
      const edit = spanEdit(seen.text, r.text.trim());
      const fix = (cell: string) => (edit && edit.from && cell.includes(edit.from) ? cell.replace(edit.from, edit.to) : cell);
      if (!edit?.from) {
        issues.push(`revision on ${b.kind} had no single change`);
        continue;
      }
      if (b.kind === "flow") {
        const steps = b.steps!.map(fix);
        ops.push({ t: "update", id: b.id, expectRev: seen.rev, patch: { steps, text: `Flow · ${steps.join(" → ")}`, trail: [...(b.trail ?? []), b.steps!.join(" → ")] } });
      } else {
        const data = { columns: b.data!.columns.map(fix), rows: b.data!.rows.map((row) => row.map(fix)) };
        ops.push({ t: "update", id: b.id, expectRev: seen.rev, patch: { data, text: r.text.trim(), trail: [...(b.trail ?? []), seen.text] } });
      }
      continue;
    }
    ops.push({
      t: "update",
      id: b.id,
      // Guard with the rev the model saw: if you edited it since, this conflicts.
      expectRev: seen.rev,
      patch: { text: r.text.trim(), trail: [...(b.trail ?? []), seen.text] },
    });
  }

  // 6. Title.
  if (plan.title && draft.titleAuto && !draft.title.trim()) {
    ops.push({ t: "meta", patch: { title: plan.title.trim().replace(/[.]+$/, "") } });
  }

  // 7. Earned color: headings with real substance get an idea color (max 3).
  ops.push(...themeOps(draft, order, kindOf, ops));

  return { ops, settledIds, createdIds, issues, question: plan.question, structural: structuralLabels };
}

/** The one changed span between two versions of a text: "best sixty" → "best forty" gives sixty → forty. */
export function spanEdit(before: string, after: string): { from: string; to: string } | null {
  let p = 0;
  while (p < before.length && p < after.length && before[p] === after[p]) p++;
  let q = 0;
  while (q < before.length - p && q < after.length - p && before[before.length - 1 - q] === after[after.length - 1 - q]) q++;
  // Widen to whole words so "sixty" → "forty" doesn't become "six" → "for".
  while (p > 0 && /\w/.test(before[p - 1])) p--;
  while (q > 0 && /\w/.test(before[before.length - q])) q--;
  const from = before.slice(p, before.length - q);
  const to = after.slice(p, after.length - q);
  return from === to ? null : { from, to };
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
export const NEXT_RE = /^next( steps)?$/i;

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
    if (!b || b.theme || pendingUpdate.has(hid) || NEXT_RE.test(b.text)) continue;
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
