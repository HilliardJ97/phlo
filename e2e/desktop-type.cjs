/** Desktop typing, end to end: type two thoughts, settle, open the sidebar. Prints the page and memory. */
const path = require("node:path"), os = require("node:os"), fs = require("node:fs");
const { _electron } = require("playwright");
(async () => {
  const root = path.resolve(__dirname, "..");
  const dataDir = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), "phlo-e2e-"));
  const app = await _electron.launch({ executablePath: path.join(root, "node_modules/electron/dist/electron"), args: ["--no-sandbox", root], env: { ...process.env, PHLO_DATA_DIR: dataDir } });
  const win = await app.firstWindow();
  const errs = [];
  win.on("pageerror", (e) => errs.push(e.message));
  await win.waitForTimeout(1500);
  await win.click("#doc");
  for (const line of ["Pricing", "We charge forty dollars a month for the starter plan.", "Keep it to three pillars."]) {
    await win.keyboard.type(line, { delay: 5 });
    await win.keyboard.press("Enter");
    await win.keyboard.press("Enter");
    await win.waitForTimeout(1500);
  }
  await win.keyboard.press("Meta+Enter");
  await win.waitForTimeout(2500);
  await win.keyboard.press("Control+Backslash");
  await win.waitForTimeout(500);
  const out = await win.evaluate(() => ({ page: document.querySelector("#doc").innerText, memory: document.querySelector("#mem-list")?.innerText, wet: document.querySelectorAll(".wet").length }));
  console.log(JSON.stringify(out, null, 2));
  if (errs.length) console.log("errors:", errs);
  await win.screenshot({ path: path.join(dataDir, "type.png") });
  await app.close();
  process.exit(errs.length ? 1 : 0);
})();
