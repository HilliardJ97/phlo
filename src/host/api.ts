/**
 * HostApi: everything the renderer can ask the host for. The same object
 * backs Electron IPC (desktop) and the loopback HTTP server (web/dev), so
 * both shells behave identically and are tested the same way.
 *
 * Keys never leave the host: the renderer only learns whether one is set.
 */
import type { CommittedTx } from "../engine/engine";
import { newId } from "../engine/ids";
import { COVER_PAIRINGS, emptyDraft, type Draft, type PublishedPiece } from "../engine/model";
import type { SettleRequest, SettleResponse } from "../engine/settle";
import { ClaudeProvider, DEFAULT_MODEL } from "./ai/claude";
import { CodexWarmProvider } from "./ai/codexWarm";
import { CompatProvider } from "./ai/compat";
import type { SettleProvider } from "./ai/provider";
import { Orchestrator, SupersededError } from "./ai/orchestrator";
import { CancelledError, Scheduler } from "./scheduler";
import { Store } from "./store";

export interface Cipher {
  /** True when secrets are encrypted at rest by the OS keychain. */
  readonly secure: boolean;
  encrypt(plain: string): string;
  decrypt(enc: string): string;
}

/** Fallback for web/dev mode: secrets are held in memory only, never written. */
export const memoryCipher: Cipher = {
  secure: false,
  encrypt: () => "",
  decrypt: () => "",
};

export type ProviderChoice = "chatgpt" | "claude" | "compat" | "local";

interface Settings {
  provider: ProviderChoice;
  /** ChatGPT model id for Codex; empty = the plan's default. */
  chatgptModel: string;
  /** Any OpenAI-compatible endpoint: Ollama, LM Studio, OpenRouter… */
  compatBaseUrl: string;
  compatModel: string;
  compatMode: "route" | "full";
  compatKeyEnc?: string;
  theme: "paper" | "sumi" | "system";
  model: string;
  claudeKeyEnc?: string;
  openaiKeyEnc?: string;
  lastDraftId?: string;
}

const DEFAULT_SETTINGS: Settings = {
  provider: "chatgpt",
  chatgptModel: "",
  compatBaseUrl: "http://127.0.0.1:11434/v1",
  compatModel: "",
  compatMode: "route",
  theme: "system",
  model: DEFAULT_MODEL,
};

export class HostApi {
  readonly store: Store;
  readonly orchestrator: Orchestrator;
  readonly scheduler = new Scheduler();
  private settings: Settings = DEFAULT_SETTINGS;
  private memKeys: { claude?: string; openai?: string; compat?: string } = {};
  private warm: CodexWarmProvider | null = null;

  /** Stop background model processes (the warm Codex app-server). */
  dispose() {
    this.warm?.dispose();
  }

  constructor(
    dataDir: string,
    private cipher: Cipher = memoryCipher,
    private env: NodeJS.ProcessEnv = process.env,
  ) {
    this.store = new Store(dataDir);
    this.orchestrator = new Orchestrator(null);
  }

  async init() {
    await this.store.init();
    this.settings = await this.store.readSettings(DEFAULT_SETTINGS);
    this.applyProvider();
    return this;
  }

  /** ChatGPT (via Codex, on your plan) by default; Claude with a key; local rules always as the floor. */
  private applyProvider() {
    const s = this.settings;
    let p: SettleProvider | null = null;
    this.warm?.dispose();
    this.warm = null;
    if (s.provider === "chatgpt") {
      p = this.warm = new CodexWarmProvider(s.chatgptModel || "", "low");
      // Pre-warm off the startup path: the first settle shouldn't pay for process start + handshake.
      setTimeout(() => this.warm?.warmup(), 50);
    }
    else if (s.provider === "claude") p = new ClaudeProvider(() => this.claudeKey(), s.model || DEFAULT_MODEL);
    else if (s.provider === "compat") p = new CompatProvider({ baseUrl: s.compatBaseUrl, model: s.compatModel, apiKey: this.compatKey(), mode: s.compatMode });
    // A process per Codex call is slower than an API: give it more room before falling back.
    // Backup cloud model: any configured OpenAI-compatible model (OpenRouter by default) behind the primary.
    const chain = p ? [p] : [];
    if (s.provider !== "compat" && s.provider !== "local" && s.compatModel && s.compatBaseUrl) {
      chain.push(new CompatProvider({ baseUrl: s.compatBaseUrl, model: s.compatModel, apiKey: this.compatKey(), mode: s.compatMode }));
    }
    this.orchestrator.setProviders(chain, s.provider === "chatgpt" || s.provider === "compat" ? 15_000 : 9000);
  }

  private compatKey(): string | undefined {
    if (this.memKeys.compat) return this.memKeys.compat;
    if (this.settings.compatKeyEnc && this.cipher.secure) {
      try {
        return this.cipher.decrypt(this.settings.compatKeyEnc);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  private claudeKey(): string | undefined {
    if (this.memKeys.claude) return this.memKeys.claude;
    if (this.settings.claudeKeyEnc && this.cipher.secure) {
      try {
        return this.cipher.decrypt(this.settings.claudeKeyEnc);
      } catch {
        return undefined;
      }
    }
    return this.env.ANTHROPIC_API_KEY || undefined;
  }

  private openaiKey(): string | undefined {
    if (this.memKeys.openai) return this.memKeys.openai;
    if (this.settings.openaiKeyEnc && this.cipher.secure) {
      try {
        return this.cipher.decrypt(this.settings.openaiKeyEnc);
      } catch {
        return undefined;
      }
    }
    return this.env.OPENAI_API_KEY || undefined;
  }

  // ---- drafts --------------------------------------------------------------

  listDrafts() {
    return this.store.listDrafts();
  }

  async openDraft(id?: string): Promise<Draft> {
    const d = await this.openDraftInner(id);
    this.scheduler.focus(d.id);
    return d;
  }

  private async openDraftInner(id?: string): Promise<Draft> {
    const want = id ?? this.settings.lastDraftId;
    if (want) {
      const d = await this.store.loadDraft(want).catch(() => null);
      if (d) {
        await this.remember(d.id);
        return d;
      }
    }
    const list = await this.store.listDrafts();
    if (!id && list[0]) {
      const d = await this.store.loadDraft(list[0].id);
      if (d) return d;
    }
    return this.createDraft();
  }

  async createDraft(): Promise<Draft> {
    const d = emptyDraft(newId("d"));
    await this.store.saveDraft(d);
    await this.remember(d.id);
    return d;
  }

  async saveDraft(draft: Draft, journal: CommittedTx[] = []) {
    return this.store.saveDraft(draft, journal);
  }

  async deleteDraft(id: string) {
    await this.store.deleteDraft(id);
  }

  private async remember(id: string) {
    if (this.settings.lastDraftId === id) return;
    this.settings = { ...this.settings, lastDraftId: id };
    await this.store.writeSettings(this.settings);
  }

  // ---- settle ----------------------------------------------------------------

  async settle(req: SettleRequest): Promise<SettleResponse> {
    try {
      return await this.scheduler.run({
        lane: "hot",
        kind: "settle",
        draftId: req.draftId,
        turnId: req.requestId,
        // The orchestrator owns the settle deadline and its local fallback; this is only a backstop.
        timeoutMs: this.orchestrator.status().deadlineMs + 2000,
        run: () => this.orchestrator.settle(req),
      });
    } catch (e) {
      if (e instanceof CancelledError && e.reason !== "deadline") throw new SupersededError();
      throw e;
    }
  }

  async ask(req: { draftId: string; outline: string; section: string | null; turnId?: string }) {
    try {
      return await this.scheduler.run({
        lane: "warm",
        kind: "ask",
        draftId: req.draftId,
        turnId: req.turnId ?? `ask:${req.draftId}:${Date.now()}`,
        run: () => this.orchestrator.ask(req),
      });
    } catch {
      return { question: null };
    }
  }

  /** The renderer says when you start and stop talking; cold work waits meanwhile. */
  setTalking(on: boolean) {
    this.scheduler.setTalking(Boolean(on));
  }

  stats() {
    return this.orchestrator.stats();
  }

  // ---- publish -----------------------------------------------------------------

  async publish(draft: Draft): Promise<PublishedPiece> {
    const existing = await this.store.listPublished();
    const piece: PublishedPiece = {
      id: newId("p"),
      draftId: draft.id,
      title: draft.title || "Untitled",
      format: "doc",
      palette: COVER_PAIRINGS[existing.length % COVER_PAIRINGS.length],
      blocks: draft.blocks.filter((b) => !b.wet && b.text.trim() && b.tab !== "tangent"),
      publishedAt: Date.now(),
    };
    await this.store.addPublished(piece);
    return piece;
  }

  listPublished() {
    return this.store.listPublished();
  }

  // ---- settings ------------------------------------------------------------------

  getSettings() {
    return {
      theme: this.settings.theme,
      model: this.settings.model,
      claude: !!this.claudeKey(),
      provider: this.settings.provider,
      chatgptModel: this.settings.chatgptModel,
      compatBaseUrl: this.settings.compatBaseUrl,
      compatModel: this.settings.compatModel,
      compatMode: this.settings.compatMode,
      openai: !!this.openaiKey(),
      secureStorage: this.cipher.secure,
      ai: this.orchestrator.status(),
    };
  }

  async setSettings(patch: { theme?: Settings["theme"]; claudeKey?: string; openaiKey?: string; model?: string; provider?: ProviderChoice; chatgptModel?: string; compatBaseUrl?: string; compatModel?: string; compatMode?: "route" | "full"; compatKey?: string }) {
    const next = { ...this.settings };
    if (patch.theme) next.theme = patch.theme;
    if (patch.model) next.model = patch.model;
    if (patch.provider && ["chatgpt", "claude", "compat", "local"].includes(patch.provider)) next.provider = patch.provider;
    if (patch.compatBaseUrl !== undefined && /^https?:\/\/[^\s]{1,200}$/.test(patch.compatBaseUrl)) next.compatBaseUrl = patch.compatBaseUrl;
    if (patch.compatModel !== undefined && /^[\w.:/@-]{0,128}$/.test(patch.compatModel)) next.compatModel = patch.compatModel;
    if (patch.compatMode === "route" || patch.compatMode === "full") next.compatMode = patch.compatMode;
    if (patch.chatgptModel !== undefined && /^[a-z0-9.\-]{0,64}$/i.test(patch.chatgptModel)) next.chatgptModel = patch.chatgptModel;
    for (const [field, enc, mem] of [
      ["claudeKey", "claudeKeyEnc", "claude"],
      ["openaiKey", "openaiKeyEnc", "openai"],
      ["compatKey", "compatKeyEnc", "compat"],
    ] as const) {
      const v = patch[field];
      if (v === undefined) continue;
      const key = v.trim();
      if (this.cipher.secure) {
        next[enc] = key ? this.cipher.encrypt(key) : undefined;
        this.memKeys[mem] = undefined;
      } else {
        this.memKeys[mem] = key || undefined;
      }
    }
    this.settings = next;
    await this.store.writeSettings(next);
    this.applyProvider();
    return this.getSettings();
  }

  // ---- images ------------------------------------------------------------------

  /** Openly licensed photos from Openverse (no key). Every result carries its credit. */
  async findImages(query: string): Promise<{ url: string; thumb: string; title: string; credit: string; creditUrl: string }[]> {
    const q = String(query).slice(0, 120).trim();
    if (!q) return [];
    const res = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=12&mature=false`, {
      headers: { "user-agent": "Phlo/0.1 (+local app)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`Photo search is unavailable right now (${res.status}).`);
    const json = (await res.json()) as { results?: { url: string; thumbnail?: string; title?: string; creator?: string; license?: string; license_version?: string; foreign_landing_url?: string }[] };
    return (json.results ?? [])
      .filter((r) => /^https:\/\//.test(r.url))
      .map((r) => ({
        url: r.url,
        thumb: r.thumbnail || r.url,
        title: (r.title || q).slice(0, 120),
        credit: `${r.creator ? `${r.creator} · ` : ""}CC ${String(r.license ?? "").toUpperCase()} ${r.license_version ?? ""} · Openverse`.replace(/\s+/g, " ").trim(),
        creditUrl: r.foreign_landing_url || r.url,
      }));
  }

  /** Generate one image through OpenRouter (the backup cloud model's key). */
  async generateImage(prompt: string): Promise<{ dataUrl: string }> {
    const p = String(prompt).slice(0, 2000).trim();
    if (!p) throw new Error("Describe the image first.");
    const s = this.settings;
    const base = /openrouter\.ai/.test(s.compatBaseUrl) ? s.compatBaseUrl.replace(/\/+$/, "") : "https://openrouter.ai/api/v1";
    const key = (/openrouter\.ai/.test(s.compatBaseUrl) ? this.compatKey() : undefined) ?? this.env.OPENROUTER_API_KEY ?? "proxy-injected";
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: this.env.PHLO_IMAGE_MODEL || "google/gemini-3.1-flash-image",
        modalities: ["image", "text"],
        messages: [{ role: "user", content: `Create one image for a working document. Clean, modern, no text unless asked. ${p}` }],
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error("Image generation needs an OpenRouter key: Your AI → Backup cloud model.");
    if (res.status === 402) throw new Error("Your OpenRouter credit has run out. Add credit, then try again.");
    if (!res.ok) throw new Error(`Image generation failed (${res.status}).`);
    const json = (await res.json()) as { choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[] };
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url || !/^data:image\//.test(url)) throw new Error("The model didn't return an image. Try a different description.");
    return { dataUrl: url };
  }

  // ---- speech ------------------------------------------------------------------

  /**
   * Transcribe one utterance (audio captured in the renderer between pauses).
   * Desktop shells have no browser speech service, so this is the desktop path.
   */
  async transcribe(audioBase64: string, mime: string): Promise<{ text: string }> {
    const key = this.openaiKey();
    if (!key) throw new Error("NO_TRANSCRIPTION_KEY");
    const bytes = Buffer.from(audioBase64, "base64");
    if (bytes.length > 25 * 1024 * 1024) throw new Error("Audio too large");
    const form = new FormData();
    const ext = mime.includes("ogg") ? "ogg" : mime.includes("mp4") ? "mp4" : "webm";
    form.append("file", new Blob([bytes], { type: mime }), `utterance.${ext}`);
    form.append("model", "gpt-4o-mini-transcribe");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Transcription failed (${res.status})`);
    const json = (await res.json()) as { text?: string };
    return { text: (json.text ?? "").trim() };
  }
}

/** Methods the renderer may call. Anything else is rejected at the boundary. */
export const HOST_METHODS = [
  "listDrafts",
  "openDraft",
  "createDraft",
  "saveDraft",
  "deleteDraft",
  "settle",
  "ask",
  "setTalking",
  "stats",
  "publish",
  "listPublished",
  "getSettings",
  "setSettings",
  "transcribe",
  "findImages",
  "generateImage",
] as const;

export type HostMethod = (typeof HOST_METHODS)[number];
