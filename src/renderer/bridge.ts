/**
 * The renderer's only door to the host. Electron exposes `window.phloHost`
 * through a context-isolated preload; the web shell uses the loopback API.
 */
import type { CommittedTx } from "../engine/engine";
import type { Draft, PublishedPiece } from "../engine/model";
import type { SettleRequest, SettleResponse } from "../engine/settle";
import type { DraftSummary } from "../host/store";

export interface HostSettings {
  theme: "paper" | "sumi" | "system";
  model: string;
  claude: boolean;
  openai: boolean;
  secureStorage: boolean;
  ai: { provider: string; model: string | null; deadlineMs: number };
}

export class HostError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

declare global {
  interface Window {
    phloHost?: { invoke(method: string, args: unknown[]): Promise<{ ok: boolean; result?: unknown; code?: string; message?: string }>; platform: string };
    __PHLO_TOKEN__?: string;
  }
}

async function call<T>(method: string, ...args: unknown[]): Promise<T> {
  let res: { ok: boolean; result?: unknown; code?: string; message?: string };
  if (window.phloHost) {
    res = await window.phloHost.invoke(method, args);
  } else {
    const r = await fetch(`./api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-phlo-token": window.__PHLO_TOKEN__ ?? "" },
      body: JSON.stringify(args),
    });
    res = await r.json();
  }
  if (!res.ok) throw new HostError(res.code ?? "ERROR", res.message ?? res.code ?? "Host error");
  return res.result as T;
}

export const host = {
  isDesktop: () => !!window.phloHost,
  platform: () => window.phloHost?.platform ?? "web",
  listDrafts: () => call<DraftSummary[]>("listDrafts"),
  openDraft: (id?: string) => call<Draft>("openDraft", id),
  createDraft: () => call<Draft>("createDraft"),
  saveDraft: (d: Draft, journal: CommittedTx[]) => call<{ version: number }>("saveDraft", d, journal),
  deleteDraft: (id: string) => call<void>("deleteDraft", id),
  settle: (req: SettleRequest) => call<SettleResponse>("settle", req),
  stats: () => call<{ routes: { route: string; count: number; p50: number | null; p95: number | null }[]; provider: string; model: string | null }>("stats"),
  publish: (d: Draft) => call<PublishedPiece>("publish", d),
  listPublished: () => call<PublishedPiece[]>("listPublished"),
  getSettings: () => call<HostSettings>("getSettings"),
  setSettings: (p: Record<string, string>) => call<HostSettings>("setSettings", p),
  transcribe: (audioBase64: string, mime: string) => call<{ text: string }>("transcribe", audioBase64, mime),
};
