/**
 * Local-first persistence.
 *
 *   data/
 *     drafts/<id>.json            snapshot (atomic: write tmp, fsync, rename)
 *     drafts/<id>.journal.jsonl   append-only transaction log since the snapshot
 *     published.json
 *     settings.json
 *
 * Saves carry the version they were built from. A save older than what is on
 * disk is rejected, so a stale window can never silently overwrite newer work.
 * The journal makes every change auditable (who: user/voice/phlo, what, when)
 * and lets a crash between snapshots lose nothing that was journaled.
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import type { CommittedTx } from "../engine/engine";
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

export class Store {
  private draftsDir: string;
  private locks = new Map<string, Promise<unknown>>();

  constructor(readonly root: string) {
    this.draftsDir = path.join(root, "drafts");
  }

  async init() {
    await fs.mkdir(this.draftsDir, { recursive: true });
  }

  /** Serialize writes per key so concurrent saves can't interleave. */
  private async locked<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.locks.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.locks.set(
      key,
      next.catch(() => undefined),
    );
    return next;
  }

  private file(id: string) {
    assertId(id);
    return path.join(this.draftsDir, `${id}.json`);
  }

  async listDrafts(): Promise<DraftSummary[]> {
    const files = (await fs.readdir(this.draftsDir)).filter((f) => f.endsWith(".json"));
    const out: DraftSummary[] = [];
    for (const f of files) {
      try {
        const d = JSON.parse(await fs.readFile(path.join(this.draftsDir, f), "utf8")) as Draft;
        out.push({
          id: d.id,
          title: d.title,
          updatedAt: d.updatedAt,
          createdAt: d.createdAt,
          sections: d.blocks.filter((b) => b.kind === "heading").length,
          words: d.blocks.reduce((n, b) => n + (b.text.trim() ? b.text.trim().split(/\s+/).length : 0), 0),
          role: d.role,
        });
      } catch {
        // A corrupt file never takes down the list.
      }
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async loadDraft(id: string): Promise<Draft | null> {
    return readJson<Draft | null>(this.file(id), null);
  }

  async saveDraft(draft: Draft, journal: CommittedTx[] = []): Promise<{ version: number }> {
    return this.locked(draft.id, async () => {
      const file = this.file(draft.id);
      const current = await readJson<Draft | null>(file, null);
      if (current && current.version > draft.version) {
        throw new VersionConflictError(current.version, draft.version);
      }
      if (journal.length) {
        const lines = journal
          .map((t) => JSON.stringify({ v: t.version, at: t.at, actor: t.actor, label: t.label, ops: t.ops }))
          .join("\n");
        await fs.appendFile(path.join(this.draftsDir, `${draft.id}.journal.jsonl`), `${lines}\n`, "utf8");
      }
      await atomicWrite(file, JSON.stringify(draft));
      return { version: draft.version };
    });
  }

  async deleteDraft(id: string): Promise<void> {
    await this.locked(id, async () => {
      // Soft delete: move aside, never destroy.
      const trash = path.join(this.root, "trash");
      await fs.mkdir(trash, { recursive: true });
      for (const suffix of [".json", ".journal.jsonl"]) {
        const src = path.join(this.draftsDir, `${id}${suffix}`);
        await fs.rename(src, path.join(trash, `${id}.${Date.now()}${suffix}`)).catch(() => undefined);
      }
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
