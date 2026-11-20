/**
 * Desktop voice, end to end: the real Electron app, a fake microphone playing
 * a recorded clip, on-device speech, settling. Prints what landed on the page.
 *
 *   npm run build && NODE_PATH=$(npm root -g) xvfb-run -a node e2e/desktop-voice.cjs <clip.wav> [holdMs] [dataDir]
 */
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const { _electron } = require("playwright");

(async () => {
  const [clip, holdMs = "9000", dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "phlo-e2e-"))] = process.argv.slice(2);
  const root = path.resolve(__dirname, "..");
  const app = await _electron.launch({
    executablePath: path.join(root, "node_modules/electron/dist/electron"),
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${path.resolve(clip)}`, root],
    env: { ...process.env, PHLO_DATA_DIR: dataDir },
  });
  const win = await app.firstWindow();
  const log = [];
  win.on("console", (m) => (m.type() === "error" || m.type() === "warning") && log.push(`${m.type()}: ${m.text()}`));
  win.on("pageerror", (e) => log.push(`pageerror: ${e.message}`));
  await win.waitForTimeout(1500);
  const toasts = new Set();
  const poll = setInterval(() => win.evaluate(() => document.querySelector(".toast")?.textContent ?? "").then((t) => t && toasts.add(t)).catch(() => {}), 500);
  const t0 = Date.now();
  await win.keyboard.down(" ");
  await win.waitForTimeout(Number(holdMs));
  await win.keyboard.up(" ");
  // Wait for the final transcript and the settle.
  let text = "";
  for (let i = 0; i < 120; i++) {
    await win.waitForTimeout(1000);
    const st = await win.evaluate(() => ({ page: document.querySelector("#doc")?.innerText ?? document.body.innerText, wet: document.querySelectorAll(".wet").length }));
    if (st.page.length > 40 && !st.wet && /\w{4,}/.test(st.page)) { text = st.page; break; }
  }
  clearInterval(poll);
  console.log(`--- page after ${((Date.now() - t0) / 1000).toFixed(1)}s ---\n${text || "(nothing landed)"}`);
  console.log(`--- toasts ---\n${[...toasts].join("\n")}`);
  if (log.length) console.log(`--- console ---\n${log.slice(0, 20).join("\n")}`);
  await win.screenshot({ path: path.join(dataDir, "voice.png") });
  console.log(`screenshot: ${path.join(dataDir, "voice.png")}`);
  await app.close();
  process.exit(text ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
