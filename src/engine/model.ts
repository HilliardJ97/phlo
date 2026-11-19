/**
 * Phlo document model.
 *
 * A Draft is an ordered list of blocks. Sections are implied by headings:
 * every block belongs to the nearest heading above it. Every block has a
 * stable id and a monotonically increasing `rev`. Any change to a block bumps
 * its rev, and every edit that was computed against an older rev is rejected
 * (or turned into a suggestion) instead of overwriting newer work.
 */

export type BlockKind = "heading" | "paragraph" | "bullet" | "question";

/** Where a block's words came from. Scribe uses this to prove "your words only". */
export type Origin = "typed" | "voice" | "phlo";

export type IdeaColor = "cobalt" | "teal" | "saffron";

export interface Block {
  id: string;
  kind: BlockKind;
  text: string;
  /** Bullet nesting depth (0-based). */
  depth?: number;
  /** Wet = not yet settled. Rendered in ink-wet. Transient. */
  wet: boolean;
  rev: number;
  origin: Origin;
  /** Idea color for theme headings. Max three per draft. */
  theme?: IdeaColor;
  /** Phlo touched this: tangent, pulled-out idea. Rendered with a sticky tab. */
  tab?: "tangent" | "idea" | "reference";
  /** "Scratch that" history. Oldest first. Nothing is ever deleted. */
  trail?: string[];
  /** Transcript segment ids this block's words came from (provenance). */
  sources?: string[];
}

export type Role = "partner" | "scribe";

export interface TranscriptSegment {
  id: string;
  at: number;
  text: string;
}

export interface Reference {
  id: string;
  kind: "link" | "image" | "note";
  title: string;
  url?: string;
  dataUrl?: string;
  text?: string;
  addedAt: number;
}

/** A side card: Partner's single stall question, or a pending proposal. */
export interface Card {
  id: string;
  kind: "question" | "suggestion";
  text: string;
  anchorId?: string;
  createdAt: number;
}

export interface Draft {
  id: string;
  title: string;
  /** True until the user types a title themselves. Phlo may name it. */
  titleAuto: boolean;
  role: Role;
  blocks: Block[];
  /** Blocks removed from the page. Recoverable. */
  parked: Block[];
  transcript: TranscriptSegment[];
  references: Reference[];
  cards: Card[];
  /** Document version: bumps on every committed transaction. */
  version: number;
  createdAt: number;
  updatedAt: number;
}

export interface PublishedPiece {
  id: string;
  draftId: string;
  title: string;
  format: "doc";
  palette: [IdeaColorOrVermilion, IdeaColorOrVermilion];
  blocks: Block[];
  publishedAt: number;
}

export type IdeaColorOrVermilion = IdeaColor | "vermilion";

/** Fixed riso pairings. Every cover differs, the shelf reads as one press. */
export const COVER_PAIRINGS: [IdeaColorOrVermilion, IdeaColorOrVermilion][] = [
  ["vermilion", "cobalt"],
  ["teal", "saffron"],
  ["cobalt", "saffron"],
  ["teal", "vermilion"],
];

export const IDEA_COLORS: IdeaColor[] = ["cobalt", "teal", "saffron"];

export function emptyDraft(id: string, now = Date.now()): Draft {
  return {
    id,
    title: "",
    titleAuto: true,
    role: "partner",
    blocks: [],
    parked: [],
    transcript: [],
    references: [],
    cards: [],
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
}

/** A section is a heading plus the blocks under it (until the next heading). */
export interface Section {
  heading: Block | null;
  blocks: Block[];
}

export function sections(blocks: Block[]): Section[] {
  const out: Section[] = [];
  let cur: Section = { heading: null, blocks: [] };
  for (const b of blocks) {
    if (b.kind === "heading") {
      if (cur.heading || cur.blocks.length) out.push(cur);
      cur = { heading: b, blocks: [] };
    } else {
      cur.blocks.push(b);
    }
  }
  if (cur.heading || cur.blocks.length) out.push(cur);
  return out;
}

/** Sections that have a heading and at least one settled, non-empty block. */
export function substantiveSectionCount(blocks: Block[]): number {
  return sections(blocks).filter(
    (s) => s.heading && s.blocks.some((b) => !b.wet && b.text.trim().length > 0),
  ).length;
}
