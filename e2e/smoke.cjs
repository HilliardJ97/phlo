const { chromium } = require("playwright");
(async () => {
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto("http://127.0.0.1:8765/");
await page.waitForTimeout(600);
await page.screenshot({ path: `${out}/01-empty.png` });
// type a paragraph
await page.click("#doc");
await page.keyboard.type("um so the problem is that interviews are hard to follow when you are managing a doc");
await page.waitForTimeout(200);
await page.screenshot({ path: `${out}/02-wet.png` });
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/03-settled.png` });
// speech
await page.evaluate(() => window.phlo.simulateSpeech("new section pricing: we charge per seat for teams"));
await page.waitForTimeout(1500);
await page.evaluate(() => window.phlo.simulateSpeech("new section risks"));
await page.waitForTimeout(1500);
await page.evaluate(() => window.phlo.simulateSpeech("under risks: latency could break trust in the room"));
await page.waitForTimeout(1500);
await page.evaluate(() => window.phlo.simulateSpeech("pricing could also be usage based for solo people"));
await page.waitForTimeout(1500);
await page.evaluate(() => window.phlo.simulateSpeech("scratch that, pricing should be usage based for everyone"));
await page.waitForTimeout(1500);
await page.mouse.click(10, 10);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/04-structured.png` });
const st = await page.evaluate(() => window.phlo.state());
console.log(JSON.stringify(st.blocks.map(b => [b.kind, b.wet, b.text, b.trail]), null, 0));
console.log("ERRORS", errors);
await browser.close();
})();
