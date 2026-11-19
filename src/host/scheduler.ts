/**
 * Lanes: work split by how long the person will wait for it.
 *
 *   hot   Settle. One in flight per draft; a newer job supersedes the older.
 *   warm  Ask, Suggest, Gardener. One at a time; a newer job of the same kind
 *         for the same draft replaces a queued one. Late or failing: skipped.
 *   cold  Verbs, Memory keeper, export. Up to 3 verbs and 1 background job.
 *         Waits while you're talking or a hot job is in flight.
 *
 * Every job has a turnId. Running the same turnId twice returns the first
 * run's promise, so a retry after a dropped connection never applies twice.
 * Closing a draft cancels its jobs.
 */

export type Lane = "hot" | "warm" | "cold";

export interface JobSpec<T> {
  lane: Lane;
  draftId: string;
  turnId: string;
  /** Warm/cold: jobs of the same kind for a draft replace each other while queued. Cold "background" uses the background slot. */
  kind: string;
  /** Hard budget. The signal aborts with "deadline" when it runs out. */
  timeoutMs?: number;
  run: (signal: AbortSignal) => Promise<T>;
}

export class CancelledError extends Error {
  constructor(readonly reason: "superseded" | "replaced" | "closed" | "deadline") {
    super(reason);
    this.name = "CancelledError";
  }
}

interface Job {
  spec: JobSpec<unknown>;
  ctrl: AbortController;
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  started: boolean;
}

const DEFAULT_TIMEOUT: Record<Lane, number> = { hot: 4000, warm: 8000, cold: 5 * 60_000 };
const DONE_TTL_MS = 5 * 60_000;

export class Scheduler {
  private queue: Job[] = [];
  private running = new Set<Job>();
  private byTurn = new Map<string, { p: Promise<unknown>; at: number }>();
  private talking = false;
  readonly caps = { warm: 1, verbs: 3, background: 1 };

  run<T>(spec: JobSpec<T>): Promise<T> {
    this.sweep();
    const seen = this.byTurn.get(spec.turnId);
    if (seen) return seen.p as Promise<T>;

    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const p = new Promise<unknown>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const job: Job = { spec: spec as JobSpec<unknown>, ctrl: new AbortController(), resolve, reject, started: false };
    this.byTurn.set(spec.turnId, { p, at: Date.now() });

    if (spec.lane === "hot") {
      for (const j of [...this.running, ...this.queue]) {
        if (j.spec.lane === "hot" && j.spec.draftId === spec.draftId) this.cancel(j, "superseded");
      }
    } else {
      for (const j of this.queue) {
        if (j.spec.lane === spec.lane && j.spec.draftId === spec.draftId && j.spec.kind === spec.kind) this.cancel(j, "replaced");
      }
    }
    this.queue.push(job);
    this.pump();
    return p as Promise<T>;
  }

  /** Cold work backs off while you talk. */
  setTalking(on: boolean) {
    this.talking = on;
    if (!on) this.pump();
  }

  /** Cancel everything for a draft (closed or switched away). */
  cancelDraft(draftId: string) {
    for (const j of [...this.running, ...this.queue]) if (j.spec.draftId === draftId) this.cancel(j, "closed");
  }

  /** Cancel everything not for this draft. */
  focus(draftId: string) {
    for (const j of [...this.running, ...this.queue]) if (j.spec.draftId !== draftId) this.cancel(j, "closed");
  }

  stats() {
    const count = (lane: Lane, set: Iterable<Job>) => [...set].filter((j) => j.spec.lane === lane).length;
    return {
      running: { hot: count("hot", this.running), warm: count("warm", this.running), cold: count("cold", this.running) },
      queued: { hot: count("hot", this.queue), warm: count("warm", this.queue), cold: count("cold", this.queue) },
    };
  }

  private canStart(j: Job): boolean {
    const running = [...this.running];
    switch (j.spec.lane) {
      case "hot":
        return true;
      case "warm":
        return running.filter((r) => r.spec.lane === "warm").length < this.caps.warm;
      case "cold": {
        if (this.talking || running.some((r) => r.spec.lane === "hot")) return false;
        const bg = j.spec.kind === "background";
        const same = running.filter((r) => r.spec.lane === "cold" && (r.spec.kind === "background") === bg).length;
        return same < (bg ? this.caps.background : this.caps.verbs);
      }
    }
  }

  private pump() {
    // Hot first, then warm, then cold; FIFO within a lane.
    const order: Lane[] = ["hot", "warm", "cold"];
    for (const lane of order) {
      for (const j of this.queue.filter((q) => q.spec.lane === lane)) {
        if (this.canStart(j)) this.start(j);
      }
    }
  }

  private start(j: Job) {
    this.queue.splice(this.queue.indexOf(j), 1);
    this.running.add(j);
    j.started = true;
    const timer = setTimeout(() => j.ctrl.abort("deadline"), j.spec.timeoutMs ?? DEFAULT_TIMEOUT[j.spec.lane]);
    const done = () => {
      clearTimeout(timer);
      this.running.delete(j);
      this.pump();
    };
    // A deadline is final; any other abort was settled by cancel().
    j.ctrl.signal.addEventListener("abort", () => {
      if (j.ctrl.signal.reason === "deadline") j.reject(new CancelledError("deadline"));
    });
    j.spec.run(j.ctrl.signal).then(
      (v) => {
        if (!j.ctrl.signal.aborted) j.resolve(v);
        done();
      },
      (e) => {
        if (!j.ctrl.signal.aborted) j.reject(e);
        done();
      },
    );
  }

  private cancel(j: Job, reason: CancelledError["reason"]) {
    const i = this.queue.indexOf(j);
    if (i >= 0) this.queue.splice(i, 1);
    j.reject(new CancelledError(reason));
    j.ctrl.abort(reason);
    // Let a later retry of a cancelled turn run again.
    this.byTurn.delete(j.spec.turnId);
    if (!j.started) this.pump();
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.byTurn) if (now - v.at > DONE_TTL_MS) this.byTurn.delete(k);
  }
}
