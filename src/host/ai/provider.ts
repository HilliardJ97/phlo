import type { SettlePlan, SettleRequest } from "../../engine/settle";

export interface ProviderCallOptions {
  signal: AbortSignal;
}

/**
 * A model provider proposes settle plans. It never touches the page: the
 * engine validates and applies what it returns. Swap providers freely.
 */
export interface SettleProvider {
  readonly name: string;
  readonly model: string;
  available(): boolean;
  settle(req: SettleRequest, opts: ProviderCallOptions): Promise<SettlePlan>;
}
