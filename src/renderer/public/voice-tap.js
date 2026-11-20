// Audio tap for on-device speech: hands raw 16 kHz frames to the page.
// A separate file because Electron won't load worklets from blob URLs.
class Tap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("phlo-tap", Tap);
