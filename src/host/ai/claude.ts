import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { SettlePlanSchema, type SettlePlan, type SettleRequest } from "../../engine/settle";
import { z } from "zod";
import { ASK_SYSTEM, askUserMessage, SETTLE_SYSTEM, settleUserMessage } from "./prompts";
import type { AskRequest, ProviderCallOptions, SettleProvider } from "./provider";

const AskSchema = z.object({ question: z.string().nullable() });

export const DEFAULT_MODEL = "claude-opus-5-5";

export class ClaudeProvider implements SettleProvider {
  readonly name = "claude";
  private client: Anthropic | null = null;

  constructor(
    private getKey: () => string | undefined,
    readonly model: string = DEFAULT_MODEL,
  ) {}

  available(): boolean {
    return !!this.getKey();
  }

  private api(): Anthropic {
    const key = this.getKey();
    if (!key) throw new Error("No Claude key configured");
    // Recreate if the key changed. One retry: the orchestrator owns deadlines and fallback.
    if (!this.client || this.client.apiKey !== key) {
      this.client = new Anthropic({ apiKey: key, maxRetries: 1, timeout: 20_000 });
    }
    return this.client;
  }

  async settle(req: SettleRequest, opts: ProviderCallOptions): Promise<SettlePlan> {
    const res = await this.api().beta.messages.parse(
      {
        model: this.model,
        // If a safety classifier declines, the server retries on a fallback model.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 8000,
        // Placement is a judgment task, not deep reasoning: low effort keeps it fast.
        output_config: { effort: "low", format: betaZodOutputFormat(SettlePlanSchema) },
        system: [{ type: "text", text: SETTLE_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: settleUserMessage(req) }],
      },
      { signal: opts.signal },
    );
    if (res.stop_reason === "refusal") throw new Error("Model declined this request");
    if (res.stop_reason === "max_tokens") throw new Error("Plan was cut off");
    if (!res.parsed_output) throw new Error("Model returned no plan");
    return res.parsed_output;
  }

  async ask(req: AskRequest, opts: ProviderCallOptions): Promise<string | null> {
    const res = await this.api().beta.messages.parse(
      {
        model: this.model,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        max_tokens: 2000,
        output_config: { effort: "low", format: betaZodOutputFormat(AskSchema) },
        system: [{ type: "text", text: ASK_SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: askUserMessage(req.outline, req.section) }],
      },
      { signal: opts.signal },
    );
    if (res.stop_reason !== "end_turn" || !res.parsed_output) return null;
    const q = res.parsed_output.question?.trim();
    return q ? q : null;
  }
}
