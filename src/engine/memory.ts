/**
 * Memory keeper: what Phlo remembers about a draft, so minute 60 knows what
 * minute 3 said. Deterministic and cheap; runs on every settle request.
 *
 *  - Aim and standing instructions come from what you say ("this is for…",
 *    "keep it to three pillars", "call them members"). They're yours: visible
 *    and editable in What Phlo remembers.
 *  - The Ledger (numbers and names, with every block they appear in) is
 *    derived from the page each time, so it's always rebuildable.
 *  - A number that changes for the same thing is a contradiction: Partner
 *    may ask about it once.
 */
import type { Block, Draft, MemoryItem } from "./model";
import { numberize } from "./settle";

const AIM = /^(?:so\s+)?(?:the\s+)?(?:goal|aim|point|purpose)\s+(?:of\s+this(?:\s+\w+)?\s+)?is\s+(?:to\s+)?(.{6,160})$|^this\s+(?:draft\s+|page\s+)?is\s+(?:for|about)\s+(.{6,160})$/i;
const INSTRUCTION =
  /^(?:(?:let'?s|please|phlo,?)\s+)?(?:(keep\s+(?:it|this|them|each\s+\w+)\s+(?:to|under)\s+.+)|(call\s+(?:them|it|those)\s+.+)|((?:always|never|don'?t)\s+.+)|(use\s+.+\s+instead\s+of\s+.+))$/i;

function clean(t: string): string {
  return t.trim().replace(/^[,.\s]+|[,.\s]+$/g, "");
}

/** "The goal of this is to…" → aim text, or null. */
export function detectAim(text: string): string | null {
  const m = AIM.exec(clean(text));
  return m ? clean(m[1] ?? m[2]) : null;
}

/** A standing instruction to Phlo, or null. Whole-utterance only, so ordinary content never trips it. */
export function detectInstruction(text: string): string | null {
  const t = clean(text);
  if (t.split(/\s+/).length > 16) return null;
  const m = INSTRUCTION.exec(t);
  if (!m) return null;
  const s = clean(m[1] ?? m[2] ?? m[3] ?? m[4]);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function aimOf(d: Draft): string | null {
  return d.memory?.find((m) => m.kind === "aim")?.text ?? null;
}

export function instructionsOf(d: Draft): string[] {
  return (d.memory ?? []).filter((m) => m.kind === "instruction").map((m) => m.text);
}

// ---------------------------------------------------------------- the Ledger

export interface LedgerEntry {
  /** What the number is about: up to two words before it ("starter plan"). */
  key: string;
  value: string;
  blockId: string;
}

const STOP = new Set(["a", "an", "the", "of", "for", "to", "at", "is", "are", "was", "be", "around", "about", "roughly", "and", "or", "it", "its", "that", "this", "we", "i", "per", "by", "in", "on", "with", "like", "maybe", "say", "make", "set", "priced", "price", "costs", "cost", "month", "year", "week", "day", "hour", "each", "every", "per", "mo", "yr"]);
const NUM = /\$?\d+(?:\.\d+)?\s*(?:%|percent|k|m|x|dollars?)?/g;

function stem(w: string): string {
  return w.replace(/(ies)$/, "y").replace(/s$/, "");
}

function formatValue(raw: string): string {
  const v = raw.replace(/\s+/g, "");
  const n = v.replace(/^\$/, "").replace(/dollars?$/, "");
  if (v.startsWith("$") || /dollars?$/.test(v)) return `$${n}`;
  return v.replace(/percent$/, "%");
}

/** Numbers on the page with what they're about. */
export function ledger(blocks: Block[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const b of blocks) {
    if (b.wet || b.kind === "heading") continue;
    const text = numberize(b.text);
    for (const m of text.matchAll(NUM)) {
      const before = text
        .slice(0, m.index)
        .split(/[^a-z]+/)
        .filter((w) => w && !STOP.has(w))
        .slice(-2)
        .map(stem);
      const after = text
        .slice((m.index ?? 0) + m[0].length)
        .split(/[^a-z]+/)
        .filter((w) => w && !STOP.has(w))
        .slice(0, 2)
        .map(stem);
      // "40 a month for the starter plan": the thing named after "for/on/of" wins over the verb before.
      const rest = text.slice((m.index ?? 0) + m[0].length);
      const named = /^\s*(?:a|an|per|each)?\s*(?:month|year|week|day|hour|seat|user)?s?\s*(?:for|on|of)\b/.test(rest);
      const key = (named && after.length ? after : before.length ? before : after).join(" ");
      if (key) out.push({ key, value: formatValue(m[0]), blockId: b.id });
    }
  }
  return out;
}

/** Ledger entries whose key the utterance mentions: pushed into the next request as Recall. */
export function ledgerMatches(blocks: Block[], said: string): LedgerEntry[] {
  const words = new Set(numberize(said).split(/[^a-z]+/).filter((w) => w && !STOP.has(w)).map(stem));
  return ledger(blocks).filter((e) => e.key.split(" ").every((w) => words.has(w)));
}

/** Same thing, different numbers, in different blocks. */
export function contradictions(blocks: Block[]): { key: string; values: LedgerEntry[] }[] {
  const by = new Map<string, LedgerEntry[]>();
  for (const e of ledger(blocks)) by.set(e.key, [...(by.get(e.key) ?? []), e]);
  return [...by]
    .filter(([, es]) => new Set(es.map((e) => e.value)).size > 1 && new Set(es.map((e) => e.blockId)).size > 1)
    .map(([key, values]) => ({ key, values }));
}

export function memoryItem(kind: MemoryItem["kind"], text: string, refs: string[], id = `${kind}_${Date.now().toString(36)}`): MemoryItem {
  return { id: kind === "aim" ? "aim" : id, kind, text, refs, at: Date.now() };
}
