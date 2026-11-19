/**
 * Any OpenAI-compatible endpoint: open models on your Mac (Ollama, LM Studio,
 * llama.cpp server, MLX servers) or hosted (OpenRouter, Groq, Together, vLLM).
 *
 * Structured output via response_format json_schema; the result is validated
 * again with zod either way, because small open models don't always honor it.
 * One repair attempt on invalid JSON, then the orchestrator falls back locally.
 *
 * mode "route": the model only decides where words go (ids, kinds, flags) and
 * leaves text empty; Phlo cleans the words deterministically. Output drops from
 * ~300 tokens to ~30, which is what makes a small local model fast enough.
 * mode "full": the model also rewrites (cleaning, splits, revisions).
 */
import { z } from "zod";
import { SettlePlanSchema, type SettlePlan, type SettleRequest } from "../../engine/settle";
import { ASK_SYSTEM, askUserMessage, ROUTE_ONLY, SETTLE_SYSTEM, settleUserMessage } from "./prompts";
import type { AskRequest, ProviderCallOptions, SettleProvider } from "./provider";

const AskSchema = z.object({ question: z.string().nullable() });

export interface CompatConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  mode?: "route" | "full";
}

export class CompatProvider implements SettleProvider {
  readonly name: string;
  readonly model: string;

  constructor(private cfg: CompatConfig) {
    this.model = cfg.model;
    const host = safeHost(cfg.baseUrl);
    this.name = host === "127.0.0.1" || host === "localhost" ? "local-model" : host;
  }

  available(): boolean {
    return !!this.cfg.baseUrl && !!this.cfg.model;
  }

  settle(req: SettleRequest, opts: ProviderCallOptions): Promise<SettlePlan> {
    const system = this.cfg.mode === "route" ? `${SETTLE_SYSTEM}\n\n${ROUTE_ONLY}` : SETTLE_SYSTEM;
    return this.call(system, settleUserMessage(req), SettlePlanSchema, "settle_plan", opts.signal);
  }

  async ask(req: AskRequest, opts: ProviderCallOptions): Promise<string | null> {
    const out = await this.call(ASK_SYSTEM, askUserMessage(req.outline, req.section), AskSchema, "question", opts.signal);
    return out.question?.trim() || null;
  }

  private async call<T extends z.ZodType>(system: string, user: string, schema: T, name: string, signal: AbortSignal): Promise<z.infer<T>> {
    const { $schema: _drop, ...jsonSchema } = z.toJSONSchema(schema) as Record<string, unknown>;
    const messages: { role: string; content: string }[] = [
      { role: "system", content: system },
      { role: "user", content: user },
    ];
    for (let attempt = 0; attempt < 2; attempt++) {
      const res = await fetch(`${this.cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        signal,
        headers: { "content-type": "application/json", ...(this.cfg.apiKey ? { authorization: `Bearer ${this.cfg.apiKey}` } : {}) },
        body: JSON.stringify({
          model: this.cfg.model,
          messages,
          temperature: 0,
          max_tokens: this.cfg.mode === "route" ? 800 : 3000,
          response_format: { type: "json_schema", json_schema: { name, strict: true, schema: jsonSchema } },
        }),
      });
      if (res.status === 429) throw Object.assign(new Error("Model rate limit reached"), { code: "USAGE_LIMIT" });
      if (!res.ok) throw new Error(`Model endpoint returned ${res.status}`);
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = stripThinking(json.choices?.[0]?.message?.content ?? "");
      try {
        const parsed = schema.safeParse(JSON.parse(raw));
        if (parsed.success) return parsed.data;
        messages.push({ role: "assistant", content: raw }, { role: "user", content: `That didn't match the schema: ${parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}. Return only corrected JSON.` });
      } catch {
        messages.push({ role: "assistant", content: raw }, { role: "user", content: "That wasn't valid JSON. Return only the JSON object." });
      }
    }
    throw new Error("Model returned no valid plan");
  }
}

/** Some open reasoning models wrap output in <think>…</think> or code fences. */
function stripThinking(s: string): string {
  return s
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

function safeHost(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return "custom";
  }
}
