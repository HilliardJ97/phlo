/**
 * Local-first persistence on SQLite (built-in `node:sqlite`, WAL).
 *
 *   data/
 *     phlo.db          drafts, journal, full-text index (one file, all drafts,
 *                      so memory and Recall can reach across drafts later)
 *     published.json
 *     settings.json
 *     trash/           soft-deleted drafts, exported as JSON
 *
 * Saves carry the version they were built from. A save older than what is
 * stored is rejected, so a stale window can never silently overwrite newer
 * work. Snapshot, journal and index are written in one SQLite transaction:
 * a crash leaves either the old state or the new one, never half.
 *
 * Legacy `drafts/<id>.json` + `.journal.jsonl` files are imported on first
 * open and moved to `drafts/migrated/`.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { authorOf, type CommittedTx } from "../engine/engine";
import type { Draft, PublishedPiece } from "../engine/model";

export interface DraftSummary {
  id: string;
  title: string;
  updatedAt: number;
  createdAt: number;
  sections: number;
  words: number;
  role: Draft["role"];
}

export interface JournalEntry {
  version: number;
  at: number;
  actor: string;
  author: string;
  label: string;
  ops: unknown[];
  inverse: unknown[] | null;
}

export interface SearchHit {
  blockId: string;
  text: string;
  rank: number;
}

export class VersionConflictError extends Error {
  constructor(
    readonly onDisk: number,
    readonly attempted: number,
  ) {
    super(`Draft on disk is at version ${onDisk}; refusing to save version ${attempted}`);
    this.name = "VersionConflictError";
  }
}

const SAFE_ID = /^[a-z0-9_]{1,64}$/i;

function assertId(id: string) {
  if (!SAFE_ID.test(id)) throw new Error("Invalid id");
}

async function atomicWrite(file: string, data: string) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const fh = await fs.open(tmp, "w");
  try {
    await fh.writeFile(data, "utf8");
    await fh.sync();
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, file);
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

function countWords(d: Draft): number {
  return d.blocks.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0);
}

/** Turn free text into a safe FTS5 query: each word quoted, OR-joined. */
export function ftsQuery(text: string): string {
  const words = text.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [];
  return [...new Set(words)].slice(0, 16).map((w) => `"${w}"`).join(" OR ");
}

/**
 * Schema migrations, applied in order and tracked by `PRAGMA user_version`.
 * Append only; never edit a shipped step.
 */
const MIGRATIONS: string[] = [
  `CREATE TABLE drafts (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     role TEXT NOT NULL,
     version INTEGER NOT NULL,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     sections INTEGER NOT NULL,
     words INTEGER NOT NULL,
     doc TEXT NOT NULL
   );
   CREATE TABLE journal (
     draft_id TEXT NOT NULL,
     version INTEGER NOT NULL,
     at INTEGER NOT NULL,
     actor TEXT NOT NULL,
     author TEXT NOT NULL,
     label TEXT NOT NULL,
     ops TEXT NOT NULL,
     inverse TEXT
   );
   CREATE INDEX journal_draft ON journal(draft_id, version);
   CREATE VIRTUAL TABLE blocks_fts USING fts5(
     text, draft_id UNINDEXED, block_id UNINDEXED, tokenize = 'porter unicode61'
   );`,
];

export class Store {
  private draftsDir: string;
  private db!: DatabaseSync;
  private locks = new Map<string, Promise<unknown>>();

  constructor(readonly root: string) {
    this.draftsDir = path.join(root, "drafts");
  }

  async init() {
    await fs.mkdir(this.root, { recursive: true });
    this.db = new DatabaseSync(path.join(this.root, "phlo.db"));
    this.db.exec("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON;");
    this.migrate();
    await this.importLegacy();
  }

  close() {
    if (this.db?.isOpen) this.db.close();
  }

  private migrate() {
    const at = (this.db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
    for (let v = at; v < MIGRATIONS.length; v++) {
      this.tx(() => {
        this.db.exec(MIGRATIONS[v]);
        this.db.exec(`PRAGMA user_version = ${v + 1}`);
      });
    }
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }

  /** Serialize file writes per key so concurrent saves can't interleave. */
  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  private async importLegacy() {
    let files: string[];
    try {
      files = (await fs.readdir(this.draftsDir)).filter((f) => f.endsWith(".json"));
    } catch {
      return;
    }
    if (!files.length) return;
    const done = path.join(this.draftsDir, "migrated");
    await fs.mkdir(done, { recursive: true });
    for (const f of files) {
      const id = f.slice(0, -5);
      const journalFile = path.join(this.draftsDir, `${id}.journal.jsonl`);
      try {
        const draft = JSON.parse(await fs.readFile(path.join(this.draftsDir, f), "utf8")) as Draft;
        assertId(draft.id);
        const lines = (await fs.readFile(journalFile, "utf8").catch(() => ""))
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as { v: number; at: number; actor: string; label: string; ops: unknown[] });
        this.tx(() => {
          const exists = this.db.prepare("SELECT version FROM drafts WHERE id = ?").get(draft.id) as { version: number } | undefined;
          if (exists && exists.version >= draft.version) return;
          for (const l of lines) this.appendJournal(draft.id, { version: l.v, at: l.at, actor: l.actor, label: l.label, ops: l.ops, inverse: null });
          this.writeSnapshot(draft);
        });
      } catch {
        // A corrupt legacy file is left in place for a human to look at.
        continue;
      }
      await fs.rename(path.join(this.draftsDir, f), path.join(done, f)).catch(() => undefined);
      await fs.rename(journalFile, path.join(done, `${id}.journal.jsonl`)).catch(() => undefined);
    }
  }

  private appendJournal(
    draftId: string,
    t: { version: number; at: number; actor: string; label: string; ops: unknown[]; inverse: unknown[] | null },
  ) {
    this.db
      .prepare("INSERT INTO journal (draft_id, version, at, actor, author, label, ops, inverse) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        draftId,
        t.version,
        t.at,
        t.actor,
        authorOf(t.actor),
        t.label,
        JSON.stringify(t.ops),
        t.inverse ? JSON.stringify(t.inverse) : null,
      );
  }

  private writeSnapshot(d: Draft) {
    this.db
      .prepare(
        `INSERT INTO drafts (id, title, role, version, created_at, updated_at, sections, words, doc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title = excluded.title, role = excluded.role, version = excluded.version,
           updated_at = excluded.updated_at, sections = excluded.sections, words = excluded.words, doc = excluded.doc`,
      )
      .run(
        d.id,
        d.title,
        d.role,
        d.version,
        d.createdAt,
        d.updatedAt,
        d.blocks.filter((b) => b.kind === "heading").length,
        countWords(d),
        JSON.stringify(d),
      );
    // Reindex this draft's settled text. A few hundred rows; well under a ms.
    this.db.prepare("DELETE FROM blocks_fts WHERE draft_id = ?").run(d.id);
    const ins = this.db.prepare("INSERT INTO blocks_fts (text, draft_id, block_id) VALUES (?, ?, ?)");
    for (const b of d.blocks) if (b.text.trim()) ins.run(b.text, d.id, b.id);
  }

  async listDrafts(): Promise<DraftSummary[]> {
    const rows = this.db
      .prepare("SELECT id, title, role, created_at, updated_at, sections, words FROM drafts ORDER BY updated_at DESC")
      .all() as { id: string; title: string; role: Draft["role"]; created_at: number; updated_at: number; sections: number; words: number }[];
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      role: r.role,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sections: r.sections,
      words: r.words,
    }));
  }

  async loadDraft(id: string): Promise<Draft | null> {
    assertId(id);
    const row = this.db.prepare("SELECT doc FROM drafts WHERE id = ?").get(id) as { doc: string } | undefined;
    return row ? (JSON.parse(row.doc) as Draft) : null;
  }

  async saveDraft(draft: Draft, journal: CommittedTx[] = []): Promise<{ version: number }> {
    assertId(draft.id);
    return this.tx(() => {
      const current = this.db.prepare("SELECT version FROM drafts WHERE id = ?").get(draft.id) as { version: number } | undefined;
      if (current && current.version > draft.version) {
        throw new VersionConflictError(current.version, draft.version);
      }
      for (const t of journal) this.appendJournal(draft.id, t);
      this.writeSnapshot(draft);
      return { version: draft.version };
    });
  }

  /** Journal for a draft, oldest first. `sinceVersion` is exclusive. */
  async readJournal(id: string, sinceVersion = 0): Promise<JournalEntry[]> {
    assertId(id);
    const rows = this.db
      .prepare("SELECT version, at, actor, author, label, ops, inverse FROM journal WHERE draft_id = ? AND version > ? ORDER BY rowid")
      .all(id, sinceVersion) as { version: number; at: number; actor: string; author: string; label: string; ops: string; inverse: string | null }[];
    return rows.map((r) => ({ ...r, ops: JSON.parse(r.ops), inverse: r.inverse ? JSON.parse(r.inverse) : null }));
  }

  /** Full-text search over settled blocks (BM25). Feeds Recall. */
  async search(id: string, text: string, limit = 8): Promise<SearchHit[]> {
    assertId(id);
    const q = ftsQuery(text);
    if (!q) return [];
    return (
      this.db
        .prepare("SELECT block_id, text, bm25(blocks_fts) AS rank FROM blocks_fts WHERE blocks_fts MATCH ? AND draft_id = ? ORDER BY rank LIMIT ?")
        .all(q, id, limit) as { block_id: string; text: string; rank: number }[]
    ).map((r) => ({ blockId: r.block_id, text: r.text, rank: r.rank }));
  }

  async deleteDraft(id: string): Promise<void> {
    assertId(id);
    // Soft delete: export to trash/ first, then remove from the store.
    const draft = await this.loadDraft(id);
    if (!draft) return;
    const journal = await this.readJournal(id);
    const trash = path.join(this.root, "trash");
    await fs.mkdir(trash, { recursive: true });
    await atomicWrite(path.join(trash, `${id}.${Date.now()}.json`), JSON.stringify({ draft, journal }));
    this.tx(() => {
      this.db.prepare("DELETE FROM drafts WHERE id = ?").run(id);
      this.db.prepare("DELETE FROM journal WHERE draft_id = ?").run(id);
      this.db.prepare("DELETE FROM blocks_fts WHERE draft_id = ?").run(id);
    });
  }

  async listPublished(): Promise<PublishedPiece[]> {
    return readJson<PublishedPiece[]>(path.join(this.root, "published.json"), []);
  }

  async addPublished(piece: PublishedPiece): Promise<void> {
    await this.locked("published", async () => {
      const all = await this.listPublished();
      all.unshift(piece);
      await atomicWrite(path.join(this.root, "published.json"), JSON.stringify(all));
    });
  }

  async readSettings<T extends object>(fallback: T): Promise<T> {
    return { ...fallback, ...(await readJson<Partial<T>>(path.join(this.root, "settings.json"), {})) };
  }

  async writeSettings<T extends object>(s: T): Promise<void> {
    await this.locked("settings", () => atomicWrite(path.join(this.root, "settings.json"), JSON.stringify(s, null, 2)));
  }
}
