/**
 * The local route: deterministic, instant (<5ms), offline.
 *
 * Handles explicit spoken/typed instructions ("new section pricing",
 * "under risks: ...", "scratch that ...") and does reasonable placement by
 * keyword overlap. It is also the fallback when a model is slow, down, or not
 * configured, so Phlo always settles.
 */
import type { SettlePlan, SettleRequest, WetItem } from "./settle";
import { cleanSpeech, contentWords, ensureSentence } from "./settle";

const NEW_SECTION =
  /^(?:ok(?:ay)?,?\s+)?(?:new|add(?: a)?|start(?: a)?|make(?: a)?|create(?: a)?)\s+(?:section|heading|header)(?:\s+(?:called|named|for|on|about))?\s*[:,-]?\s*(.+?)[.!]?$/i;
const UNDER = /^(?:under|in|for|to)\s+(?:the\s+)?(.+?)(?:\s+(?:section|heading))?\s*[:,—-]\s*(.+)$/i;
const SCRATCH = /^(?:scratch that|strike that|actually,?\s*no|no wait|never ?mind|change that)[,.:!\s-]*(?:(?:it'?s|make it|to|instead|rather)[,:\s]+)?(.*)$/i;
const TANGENT = /^(?:oh,?\s+)?(?:also|side note|tangent|unrelated|random thought|by the way|btw)[,:\s]+(.+)$/i;
const ACTION = /^(?:(?:i|we)\s+(?:need|have|should|must|will|gotta|got)\s+to\s+|todo[,:\s]+|to do[,:\s]+|next step[,:\s]+|remember to\s+|action item[,:\s]+)(.+)$|^(?:talk to|call|email|text|follow up with|send|schedule|book|ask|reach out to|interview)\s+.+$/i;
const QUESTION_START = /^(?:what|why|how|who|when|where|which|should|could|would|can|do|does|is|are|will)\b/i;

export interface LocalOptions {
  /** If true, only explicit commands are handled; anything else returns null. */
  commandsOnly?: boolean;
}

/** True when every wet item is an explicit instruction the local route fully understands. */
export function isExplicitCommand(text: string): boolean {
  const t = text.trim();
  return NEW_SECTION.test(t) || UNDER.test(t) || SCRATCH.test(t);
}

function kindFor(text: string, origin: WetItem["origin"]): "paragraph" | "bullet" | "question" {
  const t = text.trim();
  if (/^[-*•]\s+/.test(t)) return "bullet";
  if (/\?$/.test(t) || (origin === "voice" && QUESTION_START.test(t) && t.split(/\s+/).length < 16)) return "question";
  return "paragraph";
}

function polish(text: string, kind: "paragraph" | "bullet" | "question"): string {
  let t = cleanSpeech(text.replace(/^[-*•]\s+/, ""));
  if (kind === "question") t = t.replace(/[.!]+$/, "").replace(/\?*$/, "?");
  else if (kind === "paragraph") t = ensureSentence(t);
  return t;
}

function headingText(raw: string): string {
  const t = raw.trim().replace(/[.!?:]+$/, "");
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Best matching heading by content-word overlap. Ties go to the current section. */
export function matchHeading(text: string, req: SettleRequest): { id: string; score: number } | null {
  const words = new Set(contentWords(text));
  if (!words.size) return null;
  const headings = req.outline.filter((o) => o.kind === "heading");
  let best: { id: string; score: number } | null = null;
  for (const h of headings) {
    const hw = contentWords(h.text);
    // Section body words count for a bit, so "pricing" lands near other pricing talk.
    const body = req.outline.filter((o) => o.under === h.id).flatMap((o) => contentWords(o.text));
    let score = 0;
    for (const w of hw) if (words.has(w)) score += 2;
    const bodySet = new Set(body);
    let bodyHits = 0;
    for (const w of words) if (bodySet.has(w)) bodyHits++;
    score += Math.min(bodyHits, 3) * 0.5;
    if (h.id === req.currentHeadingId) score += 0.25;
    if (!best || score > best.score) best = { id: h.id, score };
  }
  return best && best.score >= 1 ? best : null;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();

function findHeadingByName(name: string, req: SettleRequest, refs: Map<string, string>): string | null {
  // Exact name first: "who it's for" is all stop words, so it can't be matched by content words.
  const exactName = norm(name);
  for (const [text, ref] of refs) if (norm(text) === exactName) return ref;
  const byName = req.outline.find((o) => o.kind === "heading" && norm(o.text) === exactName);
  if (byName) return byName.id;
  const target = contentWords(name).join(" ");
  if (!target) return null;
  for (const [text, ref] of refs) if (contentWords(text).join(" ") === target) return ref;
  const headings = req.outline.filter((o) => o.kind === "heading");
  const exact = headings.find((h) => contentWords(h.text).join(" ") === target);
  if (exact) return exact.id;
  const partial = headings.find((h) => {
    const hw = contentWords(h.text);
    return contentWords(name).every((w) => hw.includes(w));
  });
  return partial?.id ?? null;
}

export function localPlan(req: SettleRequest, opts: LocalOptions = {}): SettlePlan | null {
  const plan: SettlePlan = { title: null, new_headings: [], placements: [], revisions: [], consumed: [], question: null };
  const newRefs = new Map<string, string>(); // heading text -> ref
  let lastNewHeading: string | null = null;
  let refN = 0;

  for (const w of req.wet) {
    const text = w.text.trim();

    const ns = NEW_SECTION.exec(text);
    if (ns) {
      // "new section pricing: we charge per seat" -> heading + content
      // Split only at the first ":" or dash; never drop words after it.
      const cut = ns[1].search(/\s*[:—–]\s*|\s+-\s+/);
      const name = cut >= 0 ? ns[1].slice(0, cut) : ns[1];
      const rest = cut >= 0 ? ns[1].slice(cut).replace(/^\s*[:—–-]\s*/, "") : undefined;
      const ref = `h${++refN}`;
      const title = headingText(name);
      plan.new_headings.push({ ref, text: title, after: null });
      newRefs.set(title, ref);
      lastNewHeading = ref;
      if (rest && rest.trim()) {
        const kind = kindFor(rest, w.origin);
        plan.placements.push({ wet_id: w.id, under: ref, kind, text: polish(rest, kind), tangent: false });
      } else {
        plan.consumed.push(w.id);
      }
      continue;
    }

    const sc = SCRATCH.exec(text);
    if (sc) {
      const target = req.recent[0];
      const replacement = sc[1]?.trim();
      if (target && replacement) {
        const prev = req.outline.find((o) => o.id === target);
        const kind = prev?.kind === "bullet" || prev?.kind === "question" ? prev.kind : "paragraph";
        plan.revisions.push({ block_id: target, text: polish(replacement, kind as "paragraph") });
        plan.consumed.push(w.id);
      } else if (target) {
        // Bare "scratch that": fold the last thing into its trail with empty text is
        // destructive; instead leave a revision that keeps it and mark the command consumed.
        plan.consumed.push(w.id);
      } else if (replacement) {
        const kind = kindFor(replacement, w.origin);
        plan.placements.push({ wet_id: w.id, under: "here", kind, text: polish(replacement, kind), tangent: false });
      } else {
        plan.consumed.push(w.id);
      }
      continue;
    }

    const un = UNDER.exec(text);
    if (un) {
      const hid = findHeadingByName(un[1], req, newRefs);
      if (hid) {
        const kind = kindFor(un[2], w.origin);
        plan.placements.push({ wet_id: w.id, under: hid, kind, text: polish(un[2], kind), tangent: false });
        continue;
      }
    }

    if (opts.commandsOnly) return null;

    const tg = req.role === "partner" && w.origin === "voice" ? TANGENT.exec(text) : null;
    if (tg && req.outline.some((o) => o.kind === "heading")) {
      const kind = kindFor(tg[1], w.origin);
      plan.placements.push({ wet_id: w.id, under: "here", kind, text: polish(tg[1], kind), tangent: true });
      continue;
    }
    const act = ACTION.exec(text);
    if (act) {
      const body = (act[1] ?? text).replace(/[.!]+$/, "");
      plan.placements.push({ wet_id: w.id, under: "next", kind: "bullet", text: polish(body, "bullet"), tangent: false });
      continue;
    }

    const kind = kindFor(text, w.origin);
    let under: string = "here";
    if (lastNewHeading) under = lastNewHeading;
    else if (w.origin === "voice") {
      const m = matchHeading(text, req);
      under = m?.id ?? req.currentHeadingId ?? "here";
    } else if (!w.under) {
      // Typed at the top of an unstructured page: leave it where the user put it.
      under = "here";
    }
    plan.placements.push({ wet_id: w.id, under, kind, text: polish(text, kind), tangent: false });
  }
  return plan;
}
