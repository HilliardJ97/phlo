/**
 * ChatGPT through the local Codex CLI, signed in with a ChatGPT plan.
 * No API key and no per-token billing: requests count against the plan's
 * Codex usage window, so the orchestrator treats every call as budget.
 *
 * Each call runs `codex exec` locked down to pure text generation: read-only
 * sandbox, no shell, no web, no apps, no user config, ephemeral session, and a
 * JSON schema the final message must match (--output-schema).
 *
 * Next step for speed: keep one warm `codex app-server` process and one thread
 * per draft (JSON-RPC over stdio, outputSchema per turn) instead of a process
 * per call. Same interface, so nothing above this file changes.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { z } from "zod";
import { SettlePlanSchema, type SettlePlan, type SettleRequest } from "../../engine/settle";
import { ASK_SYSTEM, askUserMessage, SETTLE_SYSTEM, settleUserMessage } from "./prompts";
import type { AskRequest, ProviderCallOptions, SettleProvider } from "./provider";

const AskSchema = z.object({ question: z.string().nullable() });
const BUNDLED = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";

export function codexBinary(): string | null {
  const which = spawnSync(process.platform === "win32" ? "where" : "which", ["codex"], { encoding: "utf8" });
  const found = which.status === 0 ? which.stdout.split("\n")[0].trim() : "";
  if (found) return found;
  return existsSync(BUNDLED) ? BUNDLED : null;
}

export class CodexError extends Error {
  constructor(
    readonly code: "NOT_INSTALLED" | "SIGNED_OUT" | "USAGE_LIMIT" | "FAILED" | "TIMEOUT",
    message: string,
  ) {
    super(message);
  }
}

export class CodexProvider implements SettleProvider {
  readonly name = "chatgpt";
  private signedIn: { at: number; ok: boolean } | null = null;

  /** model: empty = the plan's default. reasoning: settle is a placement task, keep it low. */
  constructor(
    readonly model: string = "",
    private reasoning: "minimal" | "low" | "medium" = "low",
  ) {}

  available(): boolean {
    const bin = codexBinary();
    if (!bin) return false;
    // `codex login status` is slow-ish; cache it for a minute.
    if (!this.signedIn || Date.now() - this.signedIn.at > 60_000) {
      const r = spawnSync(bin, ["login", "status"], { encoding: "utf8", timeout: 8000, env: cleanEnv() });
      this.signedIn = { at: Date.now(), ok: r.status === 0 && /chatgpt/i.test(`${r.stdout}${r.stderr}`) };
    }
    return this.signedIn.ok;
  }

  settle(req: SettleRequest, opts: ProviderCallOptions): Promise<SettlePlan> {
    return this.run(`${SETTLE_SYSTEM}\n\n${settleUserMessage(req)}`, SettlePlanSchema, opts.signal);
  }

  async ask(req: AskRequest, opts: ProviderCallOptions): Promise<string | null> {
    const out = await this.run(`${ASK_SYSTEM}\n\n${askUserMessage(req.outline, req.section)}`, AskSchema, opts.signal);
    return out.question?.trim() || null;
  }

  private run<T extends z.ZodType>(prompt: string, schema: T, signal: AbortSignal): Promise<z.infer<T>> {
    const bin = codexBinary();
    if (!bin) return Promise.reject(new CodexError("NOT_INSTALLED", "Install Codex and sign in with ChatGPT."));
    const dir = mkdtempSync(path.join(tmpdir(), "phlo-codex-"));
    const schemaPath = path.join(dir, "schema.json");
    const outPath = path.join(dir, "result.json");
    const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    writeFileSync(schemaPath, JSON.stringify(jsonSchema));
    const args = [
      "exec",
      "--ignore-user-config",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "-C", dir,
      "-c", "project_doc_max_bytes=0",
      "-c", `model_reasoning_effort="${this.reasoning}"`,
      "-c", 'web_search="disabled"',
      "--disable", "shell_tool",
      "--disable", "unified_exec",
      "--disable", "apps",
      "--disable", "browser_use",
      "--disable", "computer_use",
      "--disable", "multi_agent",
      "--output-schema", schemaPath,
      "--output-last-message", outPath,
      "--color", "never",
    ];
    if (this.model) args.push("-m", this.model);
    args.push("-");

    return new Promise((resolve, reject) => {
      const child = spawn(bin, args, { env: cleanEnv(), stdio: ["pipe", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d: Buffer) => (stderr = (stderr + d.toString()).slice(-4000)));
      const onAbort = () => child.kill("SIGTERM");
      signal.addEventListener("abort", onAbort);
      const done = () => {
        signal.removeEventListener("abort", onAbort);
        rmSync(dir, { recursive: true, force: true });
      };
      child.on("error", (e) => {
        done();
        reject(new CodexError("FAILED", e.message));
      });
      child.on("close", (code) => {
        try {
          if (signal.aborted) return reject(new Error(String(signal.reason ?? "aborted")));
          if (code !== 0 || !existsSync(outPath)) {
            // Never surface raw stderr: it can contain local paths or account details.
            const e = stderr.toLowerCase();
            if (e.includes("usage limit") || e.includes("rate limit")) return reject(new CodexError("USAGE_LIMIT", "ChatGPT usage limit reached. Phlo will settle locally until it resets."));
            if (e.includes("log in") || e.includes("login") || e.includes("401") || e.includes("auth")) return reject(new CodexError("SIGNED_OUT", "Sign in to Codex with ChatGPT (codex login)."));
            return reject(new CodexError("FAILED", "ChatGPT couldn't complete that request."));
          }
          const parsed = schema.safeParse(JSON.parse(readFileSync(outPath, "utf8")));
          if (!parsed.success) return reject(new CodexError("FAILED", "ChatGPT returned a plan that didn't match the schema."));
          resolve(parsed.data);
        } catch (e) {
          reject(new CodexError("FAILED", e instanceof Error ? e.message : String(e)));
        } finally {
          done();
        }
      });
      child.stdin.end(prompt);
    });
  }
}

/** Codex must use the ChatGPT sign-in, never an API key that happens to be in the environment. */
function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (["OPENAI_API_KEY", "CODEX_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY"].includes(k) || k.startsWith("CODEX_THREAD") || k.startsWith("CODEX_INTERNAL") || k.startsWith("CLAUDECODE")) delete env[k];
  }
  return env;
}
