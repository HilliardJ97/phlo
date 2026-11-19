/**
 * ChatGPT through ONE warm `codex app-server` process (JSON-RPC over stdio),
 * instead of a new `codex exec` process per settle.
 *
 * Why: process start + auth + config load is paid once, not per settle. Each
 * request runs on a fresh ephemeral thread (no history growth: the settle
 * request already carries the whole outline), with Phlo's prompt as the base
 * instructions (no coding-agent prompt), read-only sandbox, approvals off,
 * tools disabled, and the plan schema as the turn's outputSchema.
 *
 * Protocol verified against `codex app-server generate-json-schema` (CLI 0.170):
 * initialize → initialized → thread/start → turn/start → item/completed
 * (agentMessage) … turn/completed. Server-initiated requests are declined.
 *
 * Falls back to the per-call CodexProvider if the app-server can't start.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { createInterface } from "node:readline";
import { z } from "zod";
import { SettlePlanSchema, type SettlePlan, type SettleRequest } from "../../engine/settle";
import { CodexError, CodexProvider, codexBinary } from "./codex";
import { ASK_SYSTEM, askUserMessage, SETTLE_SYSTEM, settleUserMessage } from "./prompts";
import type { AskRequest, ProviderCallOptions, SettleProvider } from "./provider";

const AskSchema = z.object({ question: z.string().nullable() });

interface Pending {
  resolve(v: unknown): void;
  reject(e: Error): void;
}
interface TurnWaiter {
  text: string;
  resolve(text: string): void;
  reject(e: Error): void;
}

export class CodexWarmProvider implements SettleProvider {
  readonly name = "chatgpt";
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready: Promise<void> | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private turns = new Map<string, TurnWaiter>(); // threadId -> waiter
  private cwd = mkdtempSync(path.join(tmpdir(), "phlo-codex-"));
  private fallback: CodexProvider;
  private broken = false;

  constructor(
    readonly model: string = "",
    private effort: "minimal" | "low" | "medium" = "low",
  ) {
    this.fallback = new CodexProvider(model, effort);
  }

  available(): boolean {
    return this.fallback.available();
  }

  settle(req: SettleRequest, opts: ProviderCallOptions): Promise<SettlePlan> {
    if (this.broken) return this.fallback.settle(req, opts);
    return this.run(SETTLE_SYSTEM, settleUserMessage(req), SettlePlanSchema, opts.signal);
  }

  async ask(req: AskRequest, opts: ProviderCallOptions): Promise<string | null> {
    if (this.broken) return this.fallback.ask(req, opts);
    const out = await this.run(ASK_SYSTEM, askUserMessage(req.outline, req.section), AskSchema, opts.signal);
    return out.question?.trim() || null;
  }

  /** Start the app-server and handshake now, so the first settle doesn't pay for it. */
  warmup(): void {
    if (!this.broken && this.available()) void this.start().catch(() => undefined);
  }

  dispose() {
    this.proc?.kill();
    this.proc = null;
    this.ready = null;
  }

  // ------------------------------------------------------------------ protocol

  private start(): Promise<void> {
    if (this.ready) return this.ready;
    const bin = codexBinary();
    if (!bin) return Promise.reject(new CodexError("NOT_INSTALLED", "Install Codex and sign in with ChatGPT."));
    const flags = ["shell_tool", "unified_exec", "apps", "browser_use", "computer_use", "multi_agent"].flatMap((f) => ["-c", `features.${f}=false`]);
    const proc = spawn(bin, ["app-server", "-c", "project_doc_max_bytes=0", "-c", 'web_search="disabled"', ...flags], {
      env: cleanEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    proc.stderr.on("data", () => undefined); // never surface raw stderr (paths, account details)
    proc.on("exit", () => {
      for (const p of this.pending.values()) p.reject(new CodexError("FAILED", "ChatGPT connection closed."));
      for (const t of this.turns.values()) t.reject(new CodexError("FAILED", "ChatGPT connection closed."));
      this.pending.clear();
      this.turns.clear();
      this.proc = null;
      this.ready = null;
    });
    createInterface({ input: proc.stdout }).on("line", (line) => this.onLine(line));
    this.ready = (async () => {
      await this.request("initialize", { clientInfo: { name: "phlo", title: "Phlo", version: "0.1.0" } });
      this.send({ method: "initialized" });
    })().catch((e) => {
      this.broken = true; // app-server unusable here: use per-call exec from now on
      this.dispose();
      throw e;
    });
    return this.ready;
  }

  private send(msg: Record<string, unknown>) {
    this.proc?.stdin.write(`${JSON.stringify(msg)}\n`);
  }

  private request(method: string, params: unknown, timeoutMs = 15_000): Promise<unknown> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        this.pending.delete(id);
        reject(new CodexError("TIMEOUT", `${method} timed out`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => (clearTimeout(t), resolve(v)),
        reject: (e) => (clearTimeout(t), reject(e)),
      });
      this.send({ id, method, params });
    });
  }

  private onLine(line: string) {
    if (process.env.PHLO_CODEX_DEBUG) console.error("[codex]", line.slice(0, 400));
    let msg: { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(line);
    } catch {
      return;
    }
    // Response to one of our requests
    if (msg.id !== undefined && !msg.method) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(classify(msg.error.message ?? "request failed"));
      else p.resolve(msg.result);
      return;
    }
    // Server-initiated request (approvals etc.): Phlo never grants anything.
    if (msg.id !== undefined && msg.method) {
      this.send({ id: msg.id, result: { decision: "decline" } });
      return;
    }
    const params = msg.params ?? {};
    const threadId = params.threadId as string | undefined;
    const waiter = threadId ? this.turns.get(threadId) : undefined;
    if (!waiter) return;
    if (msg.method === "item/completed") {
      const item = params.item as { type?: string; text?: string } | undefined;
      if (item?.type === "agentMessage" && typeof item.text === "string") waiter.text = item.text;
    } else if (msg.method === "turn/completed") {
      const turn = params.turn as { status?: string; error?: { message?: string } } | undefined;
      this.turns.delete(threadId!);
      if (turn?.status === "completed" && waiter.text) waiter.resolve(waiter.text);
      else waiter.reject(classify(turn?.error?.message ?? `turn ${turn?.status ?? "failed"}`));
    } else if (msg.method === "error") {
      const err = (params as { error?: { message?: string; additionalDetails?: string; codexErrorInfo?: Record<string, { httpStatusCode?: number }> } }).error;
      const status = Object.values(err?.codexErrorInfo ?? {})[0]?.httpStatusCode;
      // Codex retries transient errors itself; only stop for ones a retry can't fix.
      if (params.willRetry && status !== 401 && status !== 403 && status !== 429) return;
      this.turns.delete(threadId!);
      void this.request("turn/interrupt", { threadId }).catch(() => undefined);
      waiter.reject(classify(`${status ?? ""} ${err?.message ?? ""} ${err?.additionalDetails ?? ""}`));
    }
  }

  private async run<T extends z.ZodType>(system: string, user: string, schema: T, signal: AbortSignal): Promise<z.infer<T>> {
    await this.start();
    const { $schema: _drop, ...outputSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    const started = (await this.request("thread/start", {
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      cwd: this.cwd,
      baseInstructions: system,
      ...(this.model ? { model: this.model } : {}),
    })) as { thread?: { id?: string } };
    const threadId = started.thread?.id;
    if (!threadId) throw new CodexError("FAILED", "ChatGPT didn't start a thread.");

    const text = await new Promise<string>((resolve, reject) => {
      this.turns.set(threadId, { text: "", resolve, reject });
      const onAbort = () => {
        this.turns.delete(threadId);
        void this.request("turn/interrupt", { threadId }).catch(() => undefined);
        reject(new Error(String(signal.reason ?? "aborted")));
      };
      signal.addEventListener("abort", onAbort, { once: true });
      this.request("turn/start", { threadId, input: [{ type: "text", text: user }], outputSchema, effort: this.effort }, 60_000).catch((e) => {
        this.turns.delete(threadId);
        reject(e);
      });
    });
    const parsed = schema.safeParse(JSON.parse(text));
    if (!parsed.success) throw new CodexError("FAILED", "ChatGPT returned a plan that didn't match the schema.");
    return parsed.data;
  }
}

function classify(message: string): CodexError {
  const m = message.toLowerCase();
  if (/\b429\b/.test(m)) return new CodexError("USAGE_LIMIT", "ChatGPT usage limit reached. Phlo will settle locally until it resets.");
  if (m.includes("usage limit") || m.includes("rate limit")) return new CodexError("USAGE_LIMIT", "ChatGPT usage limit reached. Phlo will settle locally until it resets.");
  if (m.includes("401") || m.includes("unauthorized") || m.includes("log in") || m.includes("login") || m.includes("auth")) return new CodexError("SIGNED_OUT", "Sign in to Codex with ChatGPT (codex login).");
  return new CodexError("FAILED", "ChatGPT couldn't complete that request.");
}

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"].includes(k) || k.startsWith("CODEX_THREAD") || k.startsWith("CODEX_INTERNAL") || k.startsWith("CLAUDECODE")) delete env[k];
  }
  return env;
}
