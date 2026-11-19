/**
 * Speech-to-text, behind one interface.
 *
 *  - BrowserSTT: the browser's speech service (works in Chrome; streaming interim text).
 *  - UtteranceSTT: captures audio on-device, cuts it at pauses with a simple
 *    energy VAD, and sends each utterance to the host to transcribe. This is the
 *    desktop path, where no browser speech service exists. A local Whisper
 *    model can slot in behind the same host call later.
 *
 * Both report an input level (0..1) so the voice dot breathes with your voice.
 */
import { host } from "../bridge";

export interface SttHandlers {
  onInterim(text: string): void;
  onFinal(text: string): void;
  onLevel(level: number): void;
  onError(message: string): void;
  onState?(state: "listening" | "processing"): void;
}

export interface Stt {
  readonly kind: "browser" | "utterance";
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

export class UtteranceSTT implements Stt {
  readonly kind = "utterance" as const;
  private stream: MediaStream | null = null;
  private meter: LevelMeter | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private speaking = false;
  private silentSince = 0;
  private startedAt = 0;
  private h: SttHandlers | null = null;
  private queue: Promise<void> = Promise.resolve();

  async start(h: SttHandlers) {
    this.h = h;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.meter = new LevelMeter(this.stream);
    const SPEECH = 0.018;
    const SILENCE_MS = 750;
    this.meter.start(h.onLevel, (rms) => {
      const now = performance.now();
      if (rms > SPEECH) {
        this.silentSince = 0;
        if (!this.speaking) this.begin();
      } else if (this.speaking) {
        if (!this.silentSince) this.silentSince = now;
        if (now - this.silentSince > SILENCE_MS || now - this.startedAt > 20_000) this.end();
      }
    });
  }

  private begin() {
    if (!this.stream) return;
    this.speaking = true;
    this.startedAt = performance.now();
    this.chunks = [];
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
    this.recorder = new MediaRecorder(this.stream, mime ? { mimeType: mime } : undefined);
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.onstop = () => this.send(new Blob(this.chunks, { type: this.recorder?.mimeType || "audio/webm" }));
    this.recorder.start(250);
    this.h?.onInterim("…");
  }

  private end() {
    this.speaking = false;
    this.silentSince = 0;
    if (this.recorder?.state === "recording") this.recorder.stop();
  }

  private send(blob: Blob) {
    if (blob.size < 2000) {
      this.h?.onInterim("");
      return;
    }
    // Keep utterances in spoken order even if transcription calls overlap.
    this.queue = this.queue.then(async () => {
      this.h?.onState?.("processing");
      try {
        const b64 = await blobToBase64(blob);
        const { text } = await host.transcribe(b64, blob.type);
        this.h?.onInterim("");
        if (text) this.h?.onFinal(text);
      } catch (e) {
        this.h?.onInterim("");
        const msg = e instanceof Error ? e.message : String(e);
        this.h?.onError(msg.includes("NO_TRANSCRIPTION_KEY") ? "Add a transcription key in Settings to talk." : "Couldn't transcribe that. Still listening.");
      } finally {
        this.h?.onState?.("listening");
      }
    });
  }

  stop() {
    if (this.speaking) this.end();
    this.meter?.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
