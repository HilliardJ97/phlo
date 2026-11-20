/**
 * On-device speech recognition (Moonshine, an open model made for live
 * speech), off the main thread. Downloaded once on first use, then cached by
 * the browser, so it works offline after that. Free, no key, nothing leaves
 * the computer.
 *
 * Messages in:  { type: "load" } | { type: "run", id, audio: Float32Array (16 kHz mono) }
 * Messages out: { type: "progress", pct } | { type: "ready", device } | { type: "result", id, text } | { type: "error", id?, message }
 */
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

env.allowLocalModels = false;

export const MODEL = "onnx-community/moonshine-base-ONNX";

let asr: Promise<AutomaticSpeechRecognitionPipeline> | null = null;
const files = new Map<string, { loaded: number; total: number }>();

async function webgpu(): Promise<boolean> {
  const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (!gpu) return false;
  try {
    return !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}

function load(): Promise<AutomaticSpeechRecognitionPipeline> {
  asr ??= (async () => {
    // CPU (8-bit, ~60 MB) is the verified path everywhere. WebGPU (faster on Apple
    // Silicon, ~150 MB) is opt-in until it's been tried on real Macs.
    const gpu = (self as unknown as { PHLO_WEBGPU?: boolean }).PHLO_WEBGPU === true && (await webgpu());
    const device = gpu ? "webgpu" : "wasm";
    const p = (await pipeline("automatic-speech-recognition", MODEL, {
      device,
      dtype: gpu ? { encoder_model: "fp32", decoder_model_merged: "q4" } : "q8",
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status !== "progress" || !e.file || !e.total) return;
        files.set(e.file, { loaded: e.loaded ?? 0, total: e.total });
        let loaded = 0;
        let total = 0;
        for (const f of files.values()) {
          loaded += f.loaded;
          total += f.total;
        }
        postMessage({ type: "progress", pct: Math.round((loaded / total) * 100) });
      },
    })) as AutomaticSpeechRecognitionPipeline;
    // Warm up so the first real utterance isn't slow.
    await p(new Float32Array(16000));
    postMessage({ type: "ready", device });
    return p;
  })();
  asr.catch(() => (asr = null));
  return asr;
}

self.onmessage = async (e: MessageEvent<{ type: "load" } | { type: "run"; id: number; audio: Float32Array }>) => {
  const msg = e.data;
  try {
    if (msg.type === "load") {
      await load();
      return;
    }
    const p = await load();
    const out = (await p(msg.audio)) as { text: string };
    postMessage({ type: "result", id: msg.id, text: out.text.trim() });
  } catch (err) {
    postMessage({ type: "error", id: msg.type === "run" ? msg.id : undefined, message: err instanceof Error ? err.message : String(err) });
  }
};
