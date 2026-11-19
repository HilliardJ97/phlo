/**
 * Orchestrator: routes every settle request and owns its deadline.
 *
 *  1. Explicit instructions ("new section X", "under Y: ...", "scratch that")
 *     take the local route: instant, deterministic, offline.
 *  2. Otherwise the model proposes a plan, under a hard deadline.
 *  3. Slow, failed or unavailable model -> local plan. Phlo always settles.
 *  4. A newer request for the same draft supersedes an older in-flight one
 *     (its words are included in the newer request), so stale plans never land.
 *  5. In Scribe, the "your words only" guard runs on every plan, whatever produced it.
 *
 * Every request is traced (route, latency, outcome) so quality and speed are
 * measurable rather than anecdotal.
 */
import { isExplicitCommand, localPlan } from "../../engine/local";
import { enforceScribe, type SettlePlan, type SettleRequest, type SettleResponse } from "../../engine/settle";
import type { AskRequest, SettleProvider } from "./provider";

export interface TraceEntry {
  requestId: string;
  draftId: string;
  at: number;
  route: SettleResponse["route"] | "superseded" | "error";
  model?: string;
  latencyMs: number;
  wetCount: number;
  scribeViolations?: number;
  error?: string;
}

export interface OrchestratorOptions {
  /** Hard deadline for a model plan before the local plan is used. */
  deadlineMs?: number;
}

export class Orchestrator {
  private inflight = new Map<string, AbortController>();
  private traces: TraceEntry[] = [];
  private deadlineMs: number;
  /** After a plan-limit error, settle locally until this time instead of failing every call. */
  private coolUntil = 0;
  private calls: number[] = [];

  constructor(
    private provider: SettleProvider | null,
    opts: OrchestratorOptions = {},
  ) {
    this.deadlineMs = opts.deadlineMs ?? 9000;
  }

  setProvider(p: SettleProvider | null, deadlineMs?: number) {
    this.provider = p;
    if (deadlineMs) this.deadlineMs = deadlineMs;
    this.coolUntil = 0;
  }

  private modelReady(): boolean {
    return !!this.provider?.available() && Date.now() >= this.coolUntil;
  }

  status() {
    return {
      provider: this.modelReady() ? this.provider!.name : "local",
      model: this.modelReady() ? this.provider!.model || "default" : null,
      coolingUntil: this.coolUntil > Date.now() ? this.coolUntil : null,
      /** Model calls in the last 5 hours: the ChatGPT plan's usage window. */
      callsLast5h: this.calls.filter((t) => Date.now() - t < 5 * 3600_000).length,
      deadlineMs: this.deadlineMs,
    };
  }

  async settle(req: SettleRequest): Promise<SettleResponse> {
    const started = performance.now();

    // Supersede older work for this draft.
    this.inflight.get(req.draftId)?.abort("superseded");
    const ctrl = new AbortController();
    this.inflight.set(req.draftId, ctrl);

    const finish = (plan: SettlePlan, route: SettleResponse["route"], model?: string, note?: string): SettleResponse => {
      let violations: number | undefined;
      if (req.role === "scribe") {
        const g = enforceScribe(plan, req);
        plan = g.plan;
        violations = g.violations;
      }
      const latencyMs = Math.round(performance.now() - started);
      this.trace({ requestId: req.requestId, draftId: req.draftId, at: Date.now(), route, model, latencyMs, wetCount: req.wet.length, scribeViolations: violations, error: note });
      if (this.inflight.get(req.draftId) === ctrl) this.inflight.delete(req.draftId);
      return { requestId: req.requestId, plan, route, model, latencyMs, note };
    };

    const local = () => localPlan(req) ?? { title: null, new_headings: [], placements: [], revisions: [], consumed: [], question: null };

    if (!req.wet.length) return finish(local(), "local");

    const allCommands = req.wet.every((w) => isExplicitCommand(w.text));
    if (allCommands || !this.modelReady()) return finish(local(), "local");
    this.calls.push(Date.now());
    if (this.calls.length > 2000) this.calls.splice(0, 1000);

    const timer = setTimeout(() => ctrl.abort("deadline"), this.deadlineMs);
    try {
      const plan = await this.provider!.settle(req, { signal: ctrl.signal });
      return finish(plan, "model", this.provider!.model);
    } catch (err) {
      const reason = ctrl.signal.aborted ? String(ctrl.signal.reason) : err instanceof Error ? err.message : String(err);
      if (reason === "superseded") {
        this.trace({ requestId: req.requestId, draftId: req.draftId, at: Date.now(), route: "superseded", latencyMs: Math.round(performance.now() - started), wetCount: req.wet.length });
        throw new SupersededError();
      }
      if ((err as { code?: string })?.code === "USAGE_LIMIT") this.coolUntil = Date.now() + 30 * 60_000;
      return finish(local(), "fallback", undefined, reason);
    } finally {
      clearTimeout(timer);
    }
  }

  /** Partner's stall question. Model only; returns null when unavailable or slow. */
  async ask(req: AskRequest): Promise<{ question: string | null }> {
    if (!this.modelReady()) return { question: null };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("deadline"), 8000);
    try {
      this.calls.push(Date.now());
      return { question: await this.provider!.ask(req, { signal: ctrl.signal }) };
    } catch {
      return { question: null };
    } finally {
      clearTimeout(timer);
    }
  }

  stats() {
    const recent = this.traces.slice(-200);
    const lat = (route: string) =>
      recent
        .filter((t) => t.route === route)
        .map((t) => t.latencyMs)
        .sort((a, b) => a - b);
    const pct = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor(p * xs.length))] : null);
    const routes = ["local", "model", "fallback", "superseded"].map((r) => {
      const xs = lat(r);
      return { route: r, count: xs.length, p50: pct(xs, 0.5), p95: pct(xs, 0.95) };
    });
    return { ...this.status(), routes, recent: recent.slice(-20).reverse() };
  }

  private trace(t: TraceEntry) {
    this.traces.push(t);
    if (this.traces.length > 1000) this.traces.splice(0, 500);
  }
}

export class SupersededError extends Error {
  constructor() {
    super("superseded");
    this.name = "SupersededError";
  }
}
