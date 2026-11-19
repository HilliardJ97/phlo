/**
 * Context assembler: a fixed-size packet for every model call.
 *
 * The renderer sends the whole outline; the model gets a bounded one. Sections
 * you're working in (current, where the wet words sit, where recent edits and
 * correction targets live) go in full, with ids and revs. Every other section
 * collapses to its heading id plus a one-line digest, so the model can still
 * place words under it. Recall adds back specific earlier blocks when what you
 * just said reaches for them ("earlier", "go back to", "the X thing").
 *
 * Only the prompt sees the packet; compilePlan still checks revs against the
 * full request, so recalled ids stay revisable.
 *
 * Pure and deterministic: same request + hits → same packet. Replayable.
 */
import type { OutlineItem, SettleRequest } from "./settle";

export interface RecallItem {
  id: string;
  under: string | null;
  text: string;
}

export interface Packet extends SettleRequest {
  /** Earlier blocks pulled back in for this request. Ids are revisable. */
  recall?: RecallItem[];
  /** Collapsed sections: heading id → one-line digest and hidden block count. */
  digests?: Record<string, { digest: string; hidden: number }>;
}

export const BUDGET = {
  /** ~800 tokens of draft map. */
  mapChars: 3200,
  /** ~600 tokens of recall. */
  recallChars: 2400,
  blockChars: 240,
  digestWords: 12,
};

const RECALL_CUE =
  /\b(earlier|before|i said|we said|i mentioned|go back to|back to the|going back|the (\w+\s){0,3}(thing|point|idea|part|one|number|bit)|that (point|idea|number|thing)|remember)\b/i;

/** Deterministic: does this utterance reach back for something not in view? */
export function wantsRecall(text: string): boolean {
  return RECALL_CUE.test(text);
}

function clip(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}

function digestOf(items: OutlineItem[]): string {
  const first = items.find((o) => o.text.trim());
  if (!first) return "";
  const words = first.text.trim().split(/\s+/);
  return words.length <= BUDGET.digestWords ? words.join(" ") : `${words.slice(0, BUDGET.digestWords).join(" ")}…`;
}

function outlineChars(items: OutlineItem[]): number {
  return items.reduce((n, o) => n + o.text.length + o.id.length + 16, 0);
}

export function assembleContext(req: SettleRequest, ftsHits: RecallItem[] = []): Packet {
  // Ledger matches first (pushed by the Memory keeper), then full-text hits.
  const hits = [...(req.memory?.recall ?? []), ...ftsHits];
  // Group blocks by section (null = before the first heading).
  const sections = new Map<string | null, OutlineItem[]>();
  const headings: OutlineItem[] = [];
  const sectionOf = new Map<string, string | null>();
  for (const o of req.outline) {
    if (o.kind === "heading") {
      headings.push(o);
      sections.set(o.id, []);
      sectionOf.set(o.id, o.id);
    } else {
      if (!sections.has(o.under)) sections.set(o.under, []);
      sections.get(o.under)!.push(o);
      sectionOf.set(o.id, o.under);
    }
  }

  // Already small: send as is (with long blocks clipped).
  const clipped = req.outline.map((o) => ({ ...o, text: clip(o.text, BUDGET.blockChars) }));
  if (outlineChars(clipped) <= BUDGET.mapChars && !hits.length) return { ...req, outline: clipped };

  // Hot sections, in priority order.
  const hot: (string | null)[] = [];
  const add = (h: string | null | undefined) => {
    if (h === undefined || hot.includes(h)) return;
    hot.push(h);
  };
  add(req.currentHeadingId);
  for (const w of req.wet) add(w.under);
  for (const id of req.recent) add(sectionOf.get(id));
  add(null);

  // Fill full sections until the map budget is spent; the current section always fits.
  const full = new Set<string | null>();
  let used = headings.reduce((n, h) => n + h.text.length + h.id.length + 16 + BUDGET.digestWords * 7, 0);
  for (const h of hot) {
    const cost = outlineChars((sections.get(h) ?? []).map((o) => ({ ...o, text: clip(o.text, BUDGET.blockChars) })));
    if (full.size && used + cost > BUDGET.mapChars) continue;
    full.add(h);
    used += cost;
  }

  const outline: OutlineItem[] = [];
  const digests: Packet["digests"] = {};
  const keep = (o: OutlineItem) => outline.push({ ...o, text: clip(o.text, BUDGET.blockChars) });
  for (const o of sections.get(null) ?? []) if (full.has(null)) keep(o);
  for (const h of headings) {
    keep(h);
    const items = sections.get(h.id) ?? [];
    if (full.has(h.id)) items.forEach(keep);
    else if (items.length) digests[h.id] = { digest: digestOf(items), hidden: items.length };
  }

  // Recall: earlier blocks not already in view, within budget.
  const inView = new Set(outline.map((o) => o.id));
  const recall: RecallItem[] = [];
  let r = 0;
  for (const hit of hits) {
    if (!sectionOf.has(hit.id) || inView.has(hit.id) || recall.some((x) => x.id === hit.id)) continue;
    const text = clip(hit.text, BUDGET.blockChars);
    if (r + text.length > BUDGET.recallChars) break;
    r += text.length;
    recall.push({ ...hit, under: sectionOf.get(hit.id) ?? hit.under, text });
  }
  return { ...req, outline, digests, recall: recall.length ? recall : undefined };
}
