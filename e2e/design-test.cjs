// The handoff's design test: speak, change an idea into a flowchart, paste evidence,
// correct a mistake, without losing your place. Runs against `npm run web`.
const { chromium } = require("playwright");
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/");
  await page.waitForTimeout(700);
  const say = async (t) => { await page.evaluate((t) => window.phlo.simulateSpeech(t), t); await page.waitForTimeout(1100); };
  const t0 = Date.now();
  await say("okay so the problem. families take thousands of photos but almost never finish a book");
  await page.click("#title"); await page.keyboard.type("Photo books worth keeping");
  await say("for how it works, one, you upload your photos. two, Phlo picks the best sixty. three, you order the book");
  await say("make that a flowchart");
  // Paste evidence as typed text under the problem, mid-session
  const problem = await page.evaluate(() => window.phlo.state().blocks.find((b) => /never finish/.test(b.text)).id);
  await page.click(`[data-id="${problem}"]`);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.evaluate(() => navigator.clipboard.writeText("Evidence: in our survey of 212 parents, 71% had started a photo book and never ordered it."));
  await page.keyboard.press("Control+V");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  // Correct a mistake by voice
  await say("no wait, not sixty, it's more like forty");
  await page.mouse.click(1300, 700);
  await page.waitForTimeout(800);
  const st = await page.evaluate(() => window.phlo.state());
  const flow = st.blocks.find((b) => b.kind === "flow");
  const evidence = st.blocks.find((b) => /212 parents/.test(b.text));
  const lines = st.blocks.map((b) => `${b.kind}${b.wet ? "*" : ""}: ${b.steps ? b.steps.join(" → ") : b.text}`);
  console.log(lines.join("\n"));
  console.log("\nflow:", !!flow, "| correction applied to the flow:", flow?.steps?.some((s) => /forty|40/i.test(s)), "| evidence kept:", !!evidence, "| took", ((Date.now() - t0) / 1000).toFixed(1) + "s");
  await page.screenshot({ path: `${out}/40-design-test.png` });
  console.log("ERRORS", errors);
  await browser.close();
})();
