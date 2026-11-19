// Expression end to end: voice charts and photos, subheadings, toggles, timeline,
// columns, YouTube embed, the + handle and the grouped menu. Runs against `npm run web`.
const { chromium } = require("playwright");
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/");
  await page.waitForTimeout(700);
  const say = async (t, wait = 1100) => { await page.evaluate((t) => window.phlo.simulateSpeech(t), t); await page.waitForTimeout(wait); };
  await say("for traction, signups went up every month");
  await page.click("#title"); await page.keyboard.type("Photo books: the case");
  await say("make a bar chart of signups: Jan 120, Feb 180 and March 260");
  await say("find a photo of a wedding photo album", 6000);
  await say("for the roadmap, Q1: private beta. Q2: launch for PMs. Q3: teams");
  await say("make that a timeline");
  // "/" menu: subheading
  const last = await page.evaluate(() => window.phlo.state().blocks.filter((b) => b.tab !== "tangent").at(-1).id);
  await page.hover(`[data-id="${last}"]`);
  await page.waitForTimeout(150);
  await page.click(".add-handle");
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/60-add-menu.png` });
  await page.keyboard.type("sub");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Why now");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Print is back with people under 30, and AI makes picking photos easy");
  await page.keyboard.press("Enter");
  // Paste a YouTube link into the page
  await page.evaluate(() => navigator.clipboard.writeText("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
  await page.keyboard.press("Control+V");
  await page.waitForTimeout(800);
  await page.mouse.click(1350, 900);
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => window.phlo.state());
  console.log(st.blocks.map((b) => `${b.kind}${b.level === 2 ? "(sub)" : ""}: ${b.chart ? JSON.stringify(b.chart.series[0].values) : b.steps ? b.steps.join(" | ") : b.media ? b.media.credit : b.url ?? b.text.slice(0, 60)}`).join("\n"));
  await page.screenshot({ path: `${out}/61-expression.png`, fullPage: true });
  // Fold by voice
  await say("fold traction");
  const hidden = await page.evaluate(() => document.querySelectorAll('.blk[data-hidden="1"]').length);
  console.log("hidden after 'fold traction':", hidden);
  // Generate image without a funded key: expect a clear message
  await say("add an image of a family looking at a photo book", 12000);
  console.log("toast:", await page.evaluate(() => document.getElementById("toast").textContent));
  console.log("ERRORS", errors);
  await browser.close();
})();
