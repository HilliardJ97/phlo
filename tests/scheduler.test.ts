import { describe, expect, it } from "vitest";
import { CancelledError, Scheduler } from "../src/host/scheduler";

const later = <T>(v: T, ms = 20) => (signal: AbortSignal) =>
  new Promise<T>((res, rej) => {
    const t = setTimeout(() => res(v), ms);
    signal.addEventListener("abort", () => (clearTimeout(t), rej(new Error("aborted"))));
  });

describe("Scheduler lanes", () => {
  it("is idempotent per turnId", async () => {
    const s = new Scheduler();
    let runs = 0;
    const spec = { lane: "hot" as const, kind: "settle", draftId: "d", turnId: "t1", run: async () => ++runs };
    const [a, b] = await Promise.all([s.run(spec), s.run(spec)]);
    expect([a, b, runs]).toEqual([1, 1, 1]);
  });

  it("a newer hot job supersedes the older one for the same draft", async () => {
    const s = new Scheduler();
    const first = s.run({ lane: "hot", kind: "settle", draftId: "d", turnId: "a", run: later("old", 50) });
    const second = s.run({ lane: "hot", kind: "settle", draftId: "d", turnId: "b", run: later("new") });
    await expect(first).rejects.toMatchObject({ reason: "superseded" });
    expect(await second).toBe("new");
  });

  it("cold waits while talking or while hot is in flight", async () => {
    const s = new Scheduler();
    s.setTalking(true);
    let started = false;
    const cold = s.run({ lane: "cold", kind: "look", draftId: "d", turnId: "c", run: async () => ((started = true), "done") });
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toBe(false);
    const hot = s.run({ lane: "hot", kind: "settle", draftId: "d", turnId: "h", run: later("h", 20) });
    s.setTalking(false);
    await new Promise((r) => setTimeout(r, 5));
    expect(started).toBe(false);
    await hot;
    expect(await cold).toBe("done");
  });

  it("caps warm at one and replaces a queued job of the same kind", async () => {
    const s = new Scheduler();
    const a = s.run({ lane: "warm", kind: "ask", draftId: "d", turnId: "1", run: later(1) });
    const b = s.run({ lane: "warm", kind: "ask", draftId: "d", turnId: "2", run: later(2) });
    const c = s.run({ lane: "warm", kind: "ask", draftId: "d", turnId: "3", run: later(3) });
    await expect(b).rejects.toBeInstanceOf(CancelledError);
    expect([await a, await c]).toEqual([1, 3]);
  });

  it("enforces the deadline and cancels on focus change", async () => {
    const s = new Scheduler();
    const slow = s.run({ lane: "warm", kind: "ask", draftId: "d", turnId: "x", timeoutMs: 10, run: later(1, 100) });
    await expect(slow).rejects.toMatchObject({ reason: "deadline" });
    const other = s.run({ lane: "cold", kind: "look", draftId: "d1", turnId: "y", run: later(1, 100) });
    s.focus("d2");
    await expect(other).rejects.toMatchObject({ reason: "closed" });
    expect(s.stats().running.cold).toBe(0);
  });
});
