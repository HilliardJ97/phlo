/**
 * Speech-to-text, behind one interface.
 *
 *  - BrowserSTT: the browser's speech service (works in Chrome; streaming interim text).
 *  - LocalSTT: on-device recognition (Moonshine in a worker). The desktop
 *    path, where no browser speech service exists. Free, no key.
 *
 * Both report an input level (0..1) so the voice dot breathes with your voice.
 */

export interface SttHandlers {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onLevel(level: number): void;
  onError(message: string): void;
  onState?(state: "listening" | "processing"): void;
  /** Non-fatal status ("Getting voice ready · 40%"). Empty string clears it. */
  onNotice?(message: string): void;
}

export interface Stt {
  readonly kind: "browser" | "utterance";
  /** True when stop() still delivers a final for what you just said. */
  readonly flushesOnStop?: boolean;
  start(h: SttHandlers): Promise<void>;
  stop(): void;
}

class LevelMeter {
  private ctx: AudioContext | null = null;
  private raf = 0;
  analyser: AnalyserNode | null = null;
  constructor(private stream: MediaStream) {}
  start(onLevel: (l: number) => void, onFrame?: (rms: number) => void) {
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    src.connect(this.analyser);
    const buf = new Float32Array(this.analyser.fftSize);
    let smooth = 0;
    const tick = () => {
      this.analyser!.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      smooth = smooth * 0.7 + Math.min(1, rms * 8) * 0.3;
      onLevel(smooth);
      onFrame?.(rms);
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  stop() {
    cancelAnimationFrame(this.raf);
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }
}

type SR = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
};

export function browserSttAvailable(): boolean {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class BrowserSTT implements Stt {
  readonly kind = "browser" as const;
  private rec: SR | null = null;
  private active = false;
  private meter: LevelMeter | null = null;
  private stream: MediaStream | null = null;

  async start(h: SttHandlers) {
    const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) throw new Error("Speech recognition is not available here.");
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.meter = new LevelMeter(this.stream);
    this.meter.start(h.onLevel);
    this.active = true;
    let failures = 0;
    const boot = () => {
      const rec = new Ctor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = navigator.language || "en-US";
      rec.onresult = (e) => {
        failures = 0;
        let interim = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) h.onFinal(r[0].transcript.trim());
          else interim += r[0].transcript;
        }
        h.onInterim(interim.trim());
      };
      rec.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        failures++;
        if (e.error === "not-allowed") {
          this.active = false;
          h.onError("Microphone access was blocked.");
        } else if (failures > 3) {
          this.active = false;
          h.onError(e.error === "network" ? "Speech service unreachable. Add a transcription key in Settings." : `Speech stopped (${e.error}).`);
        }
      };
      // The service ends sessions on its own; reconnect while we're still talking.
      rec.onend = () => {
        if (this.active) setTimeout(() => this.active && boot(), failures ? 400 * failures : 0);
      };
      rec.start();
      this.rec = rec;
    };
    boot();
  }

  stop() {
    this.active = false;
    try {
      this.rec?.stop();
    } catch {
      /* already stopped */
    }
    this.meter?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}

/** One worker for the app's lifetime; the model loads once. */
class Asr {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
  private ready: Promise<void> | null = null;
  onProgress: ((pct: number) => void) | null = null;

  private boot(): Worker {
    if (this.worker) return this.worker;
    const w = new Worker(new URL("./asr.worker.ts", import.meta.url), { type: "module" });
    w.onmessage = (e: MessageEvent<{ type: string; id?: number; text?: string; pct?: number; message?: string }>) => {
      const m = e.data;
      if (m.type === "progress") this.onProgress?.(m.pct ?? 0);
      else if (m.type === "result" && m.id !== undefined) {
        this.pending.get(m.id)?.resolve(m.text ?? "");
        this.pending.delete(m.id);
      } else if (m.type === "error") {
        const err = new Error(m.message ?? "Speech model failed");
        if (m.id !== undefined) {
          this.pending.get(m.id)?.reject(err);
          this.pending.delete(m.id);
        } else this.failReady?.(err);
      } else if (m.type === "ready") this.okReady?.();
    };
    this.worker = w;
    return w;
  }

  private okReady: (() => void) | null = null;
  private failReady: ((e: Error) => void) | null = null;

  load(): Promise<void> {
    if (!this.ready) {
      this.ready = new Promise<void>((res, rej) => {
        this.okReady = res;
        this.failReady = (e) => {
          this.ready = null;
          rej(e);
        };
      });
      this.boot().postMessage({ type: "load" });
    }
    return this.ready;
  }

  transcribe(audio: Float32Array): Promise<string> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.boot().postMessage({ type: "run", id, audio }, [audio.buffer]);
    });
  }
}

export const asr = new Asr();

const RATE = 16000;
const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("phlo-tap", Tap);`;

/**
 * Desktop path: on-device recognition. Captures 16 kHz audio, cuts utterances
 * at pauses (energy VAD with pre-roll so first syllables aren't clipped),
 * previews words while you talk, and transcribes the whole utterance when you
 * pause or let go.
 */
export class LocalSTT implements Stt {
  readonly kind = "utterance" as const;
  readonly flushesOnStop = true;
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private h: SttHandlers | null = null;
  private pre: Float32Array[] = [];
  private cur: Float32Array[] = [];
  private speaking = false;
  private silentMs = 0;
  private spokenMs = 0;
  private sinceInterim = 0;
  private interimBusy = false;
  private queue: Promise<void> = Promise.resolve();
  private level = 0;
  private gen = 0;

  async start(h: SttHandlers) {
    this.h = h;
    const gen = ++this.gen;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    // Load (or confirm) the model in parallel with the mic: capture starts now, words appear once it's ready.
    asr.onProgress = (pct) => h.onNotice?.(`Getting voice ready (one time) · ${pct}%`);
    asr.load().then(
      () => h.onNotice?.(""),
      () => h.onError("Couldn't load on-device speech. Check your connection for the one-time download."),
    );
    this.ctx = new AudioContext({ sampleRate: RATE });
    await this.ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
    if (gen !== this.gen) return;
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "phlo-tap");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.frame(e.data);
    src.connect(this.node);
  }

  private frame(buf: Float32Array) {
    let sum = 0;
    for (const v of buf) sum += v * v;
    const rms = Math.sqrt(sum / buf.length);
    this.level = this.level * 0.85 + Math.min(1, rms * 8) * 0.15;
    this.h?.onLevel(this.level);
    const ms = (buf.length / RATE) * 1000;
    const SPEECH = 0.012;
    if (!this.speaking) {
      this.pre.push(buf);
      // Keep ~300 ms of pre-roll.
      while (this.pre.length * ms > 300) this.pre.shift();
      if (rms > SPEECH) {
        this.speaking = true;
        this.cur = [...this.pre];
        this.pre = [];
        this.silentMs = 0;
        this.spokenMs = 0;
        this.sinceInterim = 0;
      }
      return;
    }
    this.cur.push(buf);
    this.spokenMs += ms;
    this.sinceInterim += ms;
    this.silentMs = rms > SPEECH ? 0 : this.silentMs + ms;
    if (this.silentMs > 700 || this.spokenMs > 25_000) this.cut();
    else if (this.sinceInterim > 900) this.preview();
  }

  private audio(): Float32Array {
    const n = this.cur.reduce((k, b) => k + b.length, 0);
    const out = new Float32Array(n);
    let o = 0;
    for (const b of this.cur) {
      out.set(b, o);
      o += b.length;
    }
    return out;
  }

  /** Words while you're still talking (wet preview); replaced by the final pass. */
  private preview() {
    this.sinceInterim = 0;
    if (this.interimBusy) return;
    this.interimBusy = true;
    const gen = this.gen;
    asr
      .transcribe(this.audio())
      .then((t) => {
        if (gen === this.gen && this.speaking && t) this.h?.onInterim(t);
      })
      .catch(() => undefined)
      .finally(() => (this.interimBusy = false));
  }

  private cut() {
    const audio = this.audio();
    this.speaking = false;
    this.cur = [];
    this.pre = [];
    if (audio.length < RATE * 0.3) return;
    const h = this.h;
    // Finals keep spoken order even when calls overlap.
    this.queue = this.queue.then(async () => {
      h?.onState?.("processing");
      try {
        const text = await asr.transcribe(audio);
        h?.onInterim("");
        if (text && !/^[\s.…]*$/.test(text)) h?.onFinal(text);
      } catch {
        h?.onInterim("");
        h?.onNotice?.("Couldn't make out that last bit. Still listening.");
      } finally {
        h?.onState?.("listening");
      }
    });
  }

  stop() {
    this.gen++;
    if (this.speaking) this.cut();
    this.node?.disconnect();
    this.ctx?.close().catch(() => undefined);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.node = null;
    this.ctx = null;
    this.stream = null;
  }
}
