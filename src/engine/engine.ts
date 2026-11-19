/**
 * DocEngine: the single authority every edit goes through.
 *
 * Keyboard, voice and Phlo (the model) all submit Transactions. A transaction
 * is a list of small ops, each carrying the block rev it was computed against.
 * The engine validates every precondition first and applies all-or-nothing.
 * A stale op never overwrites newer typing: the transaction is rejected with
 * the list of conflicts, and the caller decides (retry, or show a suggestion).
 *
 * Every committed transaction stores its inverse, so undo is selective:
 * undoing a settle restores the wet text without touching what you typed in
 * another section afterwards.
 */
import type { Block, Card, Draft, MemoryItem, Reference, Role, TranscriptSegment } from "./model";

export type Actor = "user" | "voice" | "phlo" | "gardener" | "verb" | "system";

/** Who a change belongs to, for per-author undo. Typing and speech are both "you". */
export type Author = "you" | "phlo" | "gardener" | "verb" | "system";

export function authorOf(actor: string): Author {
  if (actor === "user" || actor === "voice") return "you";
  if (actor === "phlo" || actor === "gardener" || actor === "verb") return actor;
  return "system";
}

type BlockPatch = Partial<Omit<Block, "id" | "rev">>;
type MetaPatch = Partial<Pick<Draft, "title" | "titleAuto" | "role">>;

export type Op =
  /** Insert a new block after `after` (null = top of page). */
  | { t: "insert"; block: Block; after: string | null }
  /** Patch fields of a block. `expectRev` guards against stale edits. */
  | { t: "update"; id: string; patch: BlockPatch; expectRev?: number }
  /** Move a block to sit after `after` (null = top). */
  | { t: "move"; id: string; after: string | null; expectRev?: number }
  /** Remove from the page into the parked list. Recoverable. */
  | { t: "park"; id: string; expectRev?: number }
  /** Bring a parked block back after `after`. */
  | { t: "unpark"; id: string; after: string | null }
  /** Hard delete. Used for the user's own deletions and for undoing inserts. */
  | { t: "delete"; id: string; expectRev?: number }
  /** Recreate a hard-deleted block (inverse of delete). */
  | { t: "restore"; block: Block; after: string | null }
  | { t: "meta"; patch: MetaPatch }
  | { t: "transcript"; segment: TranscriptSegment }
  | { t: "card.add"; card: Card }
  | { t: "card.remove"; id: string }
  | { t: "ref.add"; ref: Reference }
  | { t: "ref.remove"; id: string }
  /** Add or replace a memory item (aim, standing instruction). */
  | { t: "memory.set"; item: MemoryItem }
  | { t: "memory.remove"; id: string };

export interface Transaction {
  id: string;
  actor: Actor;
  label: string;
  ops: Op[];
  /** Consecutive transactions with the same key merge for undo (typing). */
  coalesce?: string;
  /** Keep out of the undo stack (transcript appends, card bookkeeping). */
  noHistory?: boolean;
}

export interface Conflict {
  opIndex: number;
  id: string;
  reason: "missing" | "stale";
  expected?: number;
  actual?: number;
}

export type CommitResult =
  | { ok: true; version: number; tx: CommittedTx }
  | { ok: false; conflicts: Conflict[] };

export interface CommittedTx extends Transaction {
  version: number;
  at: number;
  inverse: Op[];
  /** Rev each touched block ended with. Undo checks these. */
  touched: Record<string, number>;
}

export type Listener = (draft: Draft, tx: CommittedTx | null) => void;

const COALESCE_MS = 1200;

function clone<T>(v: T): T {
  return structuredClone(v);
}

function blockRefs(op: Op): string[] {
  switch (op.t) {
    case "insert":
    case "restore":
      return op.after ? [op.block.id, op.after] : [op.block.id];
    case "move":
    case "unpark":
      return op.after ? [op.id, op.after] : [op.id];
    case "update":
    case "park":
    case "delete":
      return [op.id];
    default:
      return [];
  }
}

/** Group index per op: union-find over the block ids each op names. */
export function dependencyGroups(ops: Op[]): number[] {
  const parent = ops.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const owner = new Map<string, number>();
  ops.forEach((op, i) => {
    for (const id of blockRefs(op)) {
      const j = owner.get(id);
      if (j === undefined) owner.set(id, i);
      else parent[find(i)] = find(j);
    }
  });
  return ops.map((_, i) => find(i));
}

export class DocEngine {
  private draft: Draft;
  private listeners = new Set<Listener>();
  private undoStack: CommittedTx[] = [];
  private redoStack: CommittedTx[] = [];
  private journal: CommittedTx[] = [];

  constructor(draft: Draft) {
    this.draft = clone(draft);
  }

  get state(): Readonly<Draft> {
    return this.draft;
  }

  get version(): number {
    return this.draft.version;
  }

  snapshot(): Draft {
    return clone(this.draft);
  }

  block(id: string): Block | undefined {
    return this.draft.blocks.find((b) => b.id === id);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Transactions committed since the last drain. The host persists these. */
  drainJournal(): CommittedTx[] {
    const j = this.journal;
    this.journal = [];
    return j;
  }

  /** Validate every precondition without changing anything. */
  check(ops: Op[]): Conflict[] {
    const conflicts: Conflict[] = [];
    // Simulate presence so ops within a tx can reference blocks inserted earlier in it.
    const present = new Map(this.draft.blocks.map((b) => [b.id, b.rev]));
    const parked = new Set(this.draft.parked.map((b) => b.id));
    ops.forEach((op, i) => {
      switch (op.t) {
        case "insert":
        case "restore": {
          const id = op.block.id;
          if (op.after && !present.has(op.after)) conflicts.push({ opIndex: i, id: op.after, reason: "missing" });
          present.set(id, op.block.rev);
          break;
        }
        case "unpark":
          if (!parked.has(op.id)) conflicts.push({ opIndex: i, id: op.id, reason: "missing" });
          if (op.after && !present.has(op.after)) conflicts.push({ opIndex: i, id: op.after, reason: "missing" });
          present.set(op.id, 0);
          break;
        case "update":
        case "move":
        case "park":
        case "delete": {
          const rev = present.get(op.id);
          if (rev === undefined) {
            conflicts.push({ opIndex: i, id: op.id, reason: "missing" });
          } else if (op.expectRev !== undefined && op.expectRev !== rev) {
            conflicts.push({ opIndex: i, id: op.id, reason: "stale", expected: op.expectRev, actual: rev });
          }
          if (op.t === "move" && op.after && !present.has(op.after)) {
            conflicts.push({ opIndex: i, id: op.after, reason: "missing" });
          }
          if (op.t === "park" || op.t === "delete") present.delete(op.id);
          break;
        }
        default:
          break;
      }
    });
    return conflicts;
  }

  commit(tx: Transaction): CommitResult {
    const conflicts = this.check(tx.ops);
    if (conflicts.length) return { ok: false, conflicts };

    const version = this.draft.version + 1;
    const inverse: Op[] = [];
    const touched: Record<string, number> = {};
    for (const op of tx.ops) {
      inverse.unshift(...this.apply(op, version, touched));
    }
    this.draft.version = version;
    this.draft.updatedAt = Date.now();

    let committed: CommittedTx = { ...tx, version, at: Date.now(), inverse, touched };

    if (!tx.noHistory) {
      const last = this.undoStack[this.undoStack.length - 1];
      if (
        tx.coalesce &&
        last &&
        last.coalesce === tx.coalesce &&
        committed.at - last.at < COALESCE_MS &&
        last.version === version - 1
      ) {
        // Merge with the previous typing transaction for undo purposes.
        committed = {
          ...committed,
          ops: [...last.ops, ...tx.ops],
          inverse: [...inverse, ...last.inverse],
          touched: { ...last.touched, ...touched },
        };
        this.undoStack[this.undoStack.length - 1] = committed;
      } else {
        this.undoStack.push(committed);
        if (this.undoStack.length > 500) this.undoStack.shift();
      }
      this.redoStack = [];
    }
    this.journal.push(committed);
    this.emit(committed);
    return { ok: true, version, tx: committed };
  }

  /**
   * Commit the parts of a transaction that still hold. Ops are split into
   * dependency groups (ops that name the same block, as target or anchor,
   * share a group); a group with any stale or missing precondition is dropped
   * whole, the rest commit as one transaction. Nothing is rebased: the caller
   * re-asks for what was dropped. Ops without a block (meta, cards, refs)
   * stand alone.
   */
  commitPartial(tx: Transaction): CommitResult & { dropped: Op[] } {
    const groups = dependencyGroups(tx.ops);
    const conflicts = this.check(tx.ops);
    if (!conflicts.length) return { ...this.commit(tx), dropped: [] };
    const bad = new Set(conflicts.map((c) => groups[c.opIndex]));
    const keep = tx.ops.filter((_, i) => !bad.has(groups[i]));
    const dropped = tx.ops.filter((_, i) => bad.has(groups[i]));
    if (!keep.length) return { ok: false, conflicts, dropped };
    const res = this.commit({ ...tx, ops: keep });
    return res.ok ? { ...res, dropped } : { ...res, dropped: tx.ops };
  }

  /**
   * Undo a specific transaction (default: the most recent one). Selective:
   * each inverse op is guarded by the rev the block had right after the
   * original transaction, so undo never clobbers later, unrelated edits.
   */
  undo(txId?: string): CommitResult | null {
    const idx = txId ? this.undoStack.findIndex((t) => t.id === txId) : this.undoStack.length - 1;
    if (idx < 0) return null;
    const target = this.undoStack[idx];
    const guarded = target.inverse.map((op) => this.guard(op, target.touched));
    const res = this.commitRaw(
      { id: `undo:${target.id}`, actor: "user", label: `Undo ${target.label}`, ops: guarded },
      true,
    );
    if (res.ok) {
      this.undoStack.splice(idx, 1);
      this.redoStack.push({ ...target, inverse: res.tx.inverse, touched: res.tx.touched });
    }
    return res;
  }

  /**
   * Undo the most recent change by one author ("undo what Phlo just did")
   * without touching anyone else's later work.
   */
  undoLastBy(author: Author): CommitResult | null {
    for (let i = this.undoStack.length - 1; i >= 0; i--) {
      if (authorOf(this.undoStack[i].actor) === author) return this.undo(this.undoStack[i].id);
    }
    return null;
  }

  redo(): CommitResult | null {
    const target = this.redoStack.pop();
    if (!target) return null;
    const guarded = target.inverse.map((op) => this.guard(op, target.touched));
    const res = this.commitRaw({ id: `redo:${target.id}`, actor: "user", label: target.label, ops: guarded }, true);
    if (res.ok) this.undoStack.push({ ...res.tx, label: target.label });
    else this.redoStack.push(target);
    return res;
  }

  /** Most recent undoable transactions, newest first. */
  history(limit = 20): { id: string; label: string; actor: Actor; at: number }[] {
    return this.undoStack
      .slice(-limit)
      .reverse()
      .map(({ id, label, actor, at }) => ({ id, label, actor, at }));
  }

  /** Replace the whole draft (load). Clears history. */
  load(draft: Draft): void {
    this.draft = clone(draft);
    this.undoStack = [];
    this.redoStack = [];
    this.journal = [];
    this.emit(null);
  }

  private commitRaw(tx: Transaction, skipHistory: boolean): CommitResult {
    const conflicts = this.check(tx.ops);
    if (conflicts.length) return { ok: false, conflicts };
    const version = this.draft.version + 1;
    const inverse: Op[] = [];
    const touched: Record<string, number> = {};
    for (const op of tx.ops) inverse.unshift(...this.apply(op, version, touched));
    this.draft.version = version;
    this.draft.updatedAt = Date.now();
    const committed: CommittedTx = { ...tx, version, at: Date.now(), inverse, touched, noHistory: skipHistory };
    this.journal.push(committed);
    this.emit(committed);
    return { ok: true, version, tx: committed };
  }

  private guard(op: Op, touched: Record<string, number>): Op {
    if (op.t === "update" || op.t === "move" || op.t === "park" || op.t === "delete") {
      const rev = touched[op.id];
      return rev === undefined ? op : { ...op, expectRev: rev };
    }
    return op;
  }

  private emit(tx: CommittedTx | null) {
    for (const fn of this.listeners) fn(this.draft, tx);
  }

  private indexOf(id: string): number {
    return this.draft.blocks.findIndex((b) => b.id === id);
  }

  private insertAt(block: Block, after: string | null) {
    const blocks = this.draft.blocks;
    if (after === null) blocks.unshift(block);
    else blocks.splice(this.indexOf(after) + 1, 0, block);
  }

  private prevId(i: number): string | null {
    return i > 0 ? this.draft.blocks[i - 1].id : null;
  }

  /** Apply one op in place. Returns the ops that reverse it. */
  private apply(op: Op, version: number, touched: Record<string, number>): Op[] {
    const d = this.draft;
    switch (op.t) {
      case "insert":
      case "restore": {
        const block = { ...clone(op.block), rev: version };
        this.insertAt(block, op.after);
        touched[block.id] = version;
        return [{ t: "delete", id: block.id }];
      }
      case "update": {
        const b = d.blocks[this.indexOf(op.id)];
        const before: BlockPatch = {};
        for (const k of Object.keys(op.patch) as (keyof BlockPatch)[]) {
          (before as Record<string, unknown>)[k] = clone(b[k]);
        }
        Object.assign(b, clone(op.patch));
        for (const k of Object.keys(op.patch) as (keyof BlockPatch)[]) {
          if (op.patch[k] === undefined) delete (b as unknown as Record<string, unknown>)[k];
        }
        b.rev = version;
        touched[b.id] = version;
        return [{ t: "update", id: b.id, patch: before }];
      }
      case "move": {
        const i = this.indexOf(op.id);
        const from = this.prevId(i);
        const [b] = d.blocks.splice(i, 1);
        b.rev = version;
        this.insertAt(b, op.after);
        touched[b.id] = version;
        return [{ t: "move", id: b.id, after: from }];
      }
      case "park": {
        const i = this.indexOf(op.id);
        const from = this.prevId(i);
        const [b] = d.blocks.splice(i, 1);
        b.rev = version;
        d.parked.push(b);
        return [{ t: "unpark", id: b.id, after: from }];
      }
      case "unpark": {
        const pi = d.parked.findIndex((b) => b.id === op.id);
        const [b] = d.parked.splice(pi, 1);
        b.rev = version;
        this.insertAt(b, op.after);
        touched[b.id] = version;
        return [{ t: "park", id: b.id }];
      }
      case "delete": {
        const i = this.indexOf(op.id);
        const from = this.prevId(i);
        const [b] = d.blocks.splice(i, 1);
        return [{ t: "restore", block: clone(b), after: from }];
      }
      case "meta": {
        const before: MetaPatch = {};
        for (const k of Object.keys(op.patch) as (keyof MetaPatch)[]) {
          (before as Record<string, unknown>)[k] = d[k];
        }
        Object.assign(d, op.patch);
        return [{ t: "meta", patch: before }];
      }
      case "transcript":
        d.transcript.push(clone(op.segment));
        return [];
      case "card.add":
        d.cards.push(clone(op.card));
        return [{ t: "card.remove", id: op.card.id }];
      case "card.remove": {
        const i = d.cards.findIndex((c) => c.id === op.id);
        if (i < 0) return [];
        const [c] = d.cards.splice(i, 1);
        return [{ t: "card.add", card: c }];
      }
      case "ref.add":
        d.references.push(clone(op.ref));
        return [{ t: "ref.remove", id: op.ref.id }];
      case "ref.remove": {
        const i = d.references.findIndex((r) => r.id === op.id);
        if (i < 0) return [];
        const [r] = d.references.splice(i, 1);
        return [{ t: "ref.add", ref: r }];
      }
      case "memory.set": {
        const mem = (d.memory ??= []);
        const i = mem.findIndex((m) => m.id === op.item.id);
        if (i < 0) {
          mem.push(clone(op.item));
          return [{ t: "memory.remove", id: op.item.id }];
        }
        const prev = mem[i];
        mem[i] = clone(op.item);
        return [{ t: "memory.set", item: prev }];
      }
      case "memory.remove": {
        const mem = d.memory ?? [];
        const i = mem.findIndex((m) => m.id === op.id);
        if (i < 0) return [];
        const [m] = mem.splice(i, 1);
        return [{ t: "memory.set", item: m }];
      }
    }
  }
}

export function setRole(role: Role): Op {
  return { t: "meta", patch: { role } };
}
