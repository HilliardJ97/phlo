// Forms in the running app: voice "make these a table", "/" Add menu, right-click Turn into.
const { chromium } = require("playwright");
(async () => {
  const out = process.argv[2];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:8765/");
  await page.waitForTimeout(700);
  const say = async (t) => { await page.evaluate((t) => window.phlo.simulateSpeech(t), t); await page.waitForTimeout(1100); };
  await say("new section competitors: Notion is ten dollars a month, cloud only");
  await page.click("#title");
  await page.keyboard.type("Where Phlo wins");
  await say("under competitors: Granola: $14, meetings only");
  await say("under competitors: Phlo: free, local-first");
  await say("make these a table");
  await say("new section decision: we decided to launch for product managers first");
  await say("new section risks: latency could break trust in the room");
  await say("under risks: the transcript could be wrong on names");
  // "/" Add menu on a new line
  const last = await page.evaluate(() => window.phlo.state().blocks.at(-1).id);
  await page.click(`[data-id="${last}"]`);
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/no");
  await page.waitForTimeout(250);
  const menuOpen = await page.evaluate(() => document.getElementById("forms-menu").classList.contains("open"));
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ask legal before recording anyone");
  await page.mouse.click(1300, 700);
  await page.waitForTimeout(1200);
  // Right-click a risk -> Turn into -> Open question
  const risk = await page.evaluate(() => window.phlo.state().blocks.find((b) => /names/.test(b.text)).id);
  await page.click(`[data-id="${risk}"]`, { button: "right" });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${out}/20-turn-into-menu.png` });
  await page.click(".form-row:has-text('Open question')");
  await page.waitForTimeout(500);
  // Edit a table cell
  await page.click(".tbl td:nth-child(2)");
  await page.keyboard.press("End");
  await page.keyboard.type(" (team)");
  await page.keyboard.press("Tab");
  await page.mouse.click(1300, 700);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/21-forms.png`, fullPage: false });
  const st = await page.evaluate(() => window.phlo.state());
  console.log("menu opened on '/':", menuOpen);
  console.log(JSON.stringify(st.blocks.map((b) => [b.kind, b.text.slice(0, 50), b.data ? b.data.rows : ""])));
  console.log("ERRORS", errors);
  await browser.close();
})();
