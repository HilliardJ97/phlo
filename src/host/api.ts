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
import { CodexProvider } from "./ai/codex";
import type { SettleProvider } from "./ai/provider";
import { Orchestrator } from "./ai/orchestrator";
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

export type ProviderChoice = "chatgpt" | "claude" | "local";

interface Settings {
  provider: ProviderChoice;
  /** ChatGPT model id for Codex; empty = the plan's default. */
  chatgptModel: string;
  theme: "paper" | "sumi" | "system";
  model: string;
  claudeKeyEnc?: string;
  openaiKeyEnc?: string;
  lastDraftId?: string;
}

const DEFAULT_SETTINGS: Settings = { provider: "chatgpt", chatgptModel: "", theme: "system", model: DEFAULT_MODEL };

export class HostApi {
  readonly store: Store;
  readonly orchestrator: Orchestrator;
  private settings: Settings = DEFAULT_SETTINGS;
  private memKeys: { claude?: string; openai?: string } = {};

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
    if (s.provider === "chatgpt") p = new CodexProvider(s.chatgptModel || "", "low");
    else if (s.provider === "claude") p = new ClaudeProvider(() => this.claudeKey(), s.model || DEFAULT_MODEL);
    // A process per Codex call is slower than an API: give it more room before falling back.
    this.orchestrator.setProvider(p, s.provider === "chatgpt" ? 20_000 : 9000);
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

  settle(req: SettleRequest): Promise<SettleResponse> {
    return this.orchestrator.settle(req);
  }

  ask(req: { draftId: string; outline: string; section: string | null }) {
    return this.orchestrator.ask(req);
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
      openai: !!this.openaiKey(),
      secureStorage: this.cipher.secure,
      ai: this.orchestrator.status(),
    };
  }

  async setSettings(patch: { theme?: Settings["theme"]; claudeKey?: string; openaiKey?: string; model?: string; provider?: ProviderChoice; chatgptModel?: string }) {
    const next = { ...this.settings };
    if (patch.theme) next.theme = patch.theme;
    if (patch.model) next.model = patch.model;
    if (patch.provider && ["chatgpt", "claude", "local"].includes(patch.provider)) next.provider = patch.provider;
    if (patch.chatgptModel !== undefined && /^[a-z0-9.\-]{0,64}$/i.test(patch.chatgptModel)) next.chatgptModel = patch.chatgptModel;
    for (const [field, enc, mem] of [
      ["claudeKey", "claudeKeyEnc", "claude"],
      ["openaiKey", "openaiKeyEnc", "openai"],
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
  "stats",
  "publish",
  "listPublished",
  "getSettings",
  "setSettings",
  "transcribe",
] as const;

export type HostMethod = (typeof HOST_METHODS)[number];
