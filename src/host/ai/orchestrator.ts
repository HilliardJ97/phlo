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
import { assembleContext, wantsRecall, type RecallItem } from "../../engine/context";
import { enforceScribe, withCorrectionTarget, type SettlePlan, type SettleRequest, type SettleResponse } from "../../engine/settle";
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
  /** Ordered: your plan's model, then a backup cloud model. Local rules are always the floor. */
  private chain: SettleProvider[] = [];
  /** Per-provider cool-down after errors a retry won't fix (signed out, plan limit, no credit). */
  private coolUntil = new Map<SettleProvider, number>();
  private calls: number[] = [];
  /** Recall source (the store's full-text index), set by the host. */
  recall: ((draftId: string, text: string) => Promise<RecallItem[]>) | null = null;

  constructor(provider: SettleProvider | null, opts: OrchestratorOptions = {}) {
    this.deadlineMs = opts.deadlineMs ?? 9000;
    this.chain = provider ? [provider] : [];
  }

  setProvider(p: SettleProvider | null, deadlineMs?: number) {
    this.setProviders(p ? [p] : [], deadlineMs);
  }

  setProviders(list: SettleProvider[], deadlineMs?: number) {
    this.chain = list;
    if (deadlineMs) this.deadlineMs = deadlineMs;
    this.coolUntil.clear();
  }

  private ready(): SettleProvider[] {
    const now = Date.now();
    return this.chain.filter((p) => (this.coolUntil.get(p) ?? 0) <= now && p.available());
  }

  private cool(p: SettleProvider, err: unknown) {
    const code = (err as { code?: string })?.code;
    const msg = err instanceof Error ? err.message : String(err);
    const minutes =
      code === "USAGE_LIMIT" || / 429| 402/.test(msg) ? 30 : code === "SIGNED_OUT" || code === "NOT_INSTALLED" || / 401| 403/.test(msg) ? 5 : 0;
    if (minutes) this.coolUntil.set(p, Date.now() + minutes * 60_000);
  }

  status() {
    const ready = this.ready();
    const primary = this.chain[0];
    const primaryCooling = primary ? (this.coolUntil.get(primary) ?? 0) : 0;
    return {
      provider: ready[0]?.name ?? "local",
      model: ready[0] ? ready[0].model || "default" : null,
      backup: this.chain[1] ? `${this.chain[1].name}${this.chain[1].model ? ` · ${this.chain[1].model}` : ""}` : null,
      coolingUntil: primaryCooling > Date.now() ? primaryCooling : null,
      /** Model calls in the last 5 hours: the ChatGPT plan's usage window. */
      callsLast5h: this.calls.filter((t) => Date.now() - t < 5 * 3600_000).length,
      deadlineMs: this.deadlineMs,
    };
  }

  async settle(input: SettleRequest): Promise<SettleResponse> {
    const started = performance.now();
    const req = withCorrectionTarget(input);

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

    const local = () => localPlan(req) ?? { title: null, new_headings: [], placements: [], revisions: [], consumed: [], structure: [], question: null };

    if (!req.wet.length) return finish(local(), "local");
    const allCommands = req.wet.every((w) => isExplicitCommand(w.text));
    const ready = this.ready();
    if (allCommands || !ready.length) return finish(local(), "local");

    // Fixed-size packet: the model never sees an ever-growing page.
    const said = req.wet.map((w) => w.text).join(" ");
    const hits = this.recall && wantsRecall(said) ? await this.recall(req.draftId, said).catch(() => []) : [];
    const packet = assembleContext(req, hits);

    const timer = setTimeout(() => ctrl.abort("deadline"), this.deadlineMs);
    const notes: string[] = [];
    try {
      for (const p of ready) {
        // Don't start a backup with too little time left to finish.
        if (p !== ready[0] && this.deadlineMs - (performance.now() - started) < 2500) break;
        this.calls.push(Date.now());
        if (this.calls.length > 2000) this.calls.splice(0, 1000);
        try {
          const plan = await p.settle(packet, { signal: ctrl.signal });
          return finish(plan, "model", `${p.name}${p.model ? ` · ${p.model}` : ""}`, notes.length ? notes.join("; ") : undefined);
        } catch (err) {
          if (ctrl.signal.aborted) throw err;
          this.cool(p, err);
          notes.push(`${p.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return finish(local(), "fallback", undefined, notes.join("; "));
    } catch (err) {
      const reason = ctrl.signal.aborted ? String(ctrl.signal.reason) : err instanceof Error ? err.message : String(err);
      if (reason === "superseded") {
        this.trace({ requestId: req.requestId, draftId: req.draftId, at: Date.now(), route: "superseded", latencyMs: Math.round(performance.now() - started), wetCount: req.wet.length });
        throw new SupersededError();
      }
      return finish(local(), "fallback", undefined, [...notes, reason].join("; "));
    } finally {
      clearTimeout(timer);
    }
  }

  /** Partner's stall question. Model only; returns null when unavailable or slow. */
  async ask(req: AskRequest): Promise<{ question: string | null }> {
    const p = this.ready()[0];
    if (!p) return { question: null };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort("deadline"), 8000);
    try {
      this.calls.push(Date.now());
      return { question: await p.ask(req, { signal: ctrl.signal }) };
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
