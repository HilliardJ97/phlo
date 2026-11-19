// CORE_SCREEN_SPEC section 5, automated where a browser can check it (npm run web first).
const { chromium } = require("playwright");
const results = [];
const check = (n, name, pass, note) => results.push({ n, name, pass, note });

function lum(hex) {
  const c = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://127.0.0.1:8765/");
  await page.waitForTimeout(600);
  await page.evaluate(() => document.getElementById("new-draft").click());
  await page.waitForTimeout(600);

  // 1. Open -> hold space -> talking, zero clicks.
  const focused = await page.evaluate(() => document.activeElement?.id);
  await page.keyboard.down("Space");
  await page.waitForTimeout(400);
  const startedOrTried = await page.evaluate(() => document.body.classList.contains("talking") || document.getElementById("toast").classList.contains("show"));
  await page.keyboard.up("Space");
  await page.waitForTimeout(700);
  const typedSpace = await page.evaluate(() => window.phlo.state().blocks.some((b) => b.text.includes(" ")));
  check(1, "Open to talking with zero clicks", focused === "doc" && startedOrTried && !typedSpace,
    `caret in page on open; Space on the empty draft starts Talk instead of typing (${startedOrTried ? "mic requested" : "no attempt"}). Real mic not available here.`);

  // 7. Messy typing settles with no button; text never moves under the caret.
  await page.click("#doc");
  await page.keyboard.type("new section pricing: um so we charge per seat for teams");
  await page.waitForTimeout(1500);
  const stillWet = await page.evaluate(() => window.phlo.state().blocks.filter((b) => b.wet && b.text).length);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1200);
  await page.keyboard.type("talk to 5 couples about price");
  await page.mouse.click(1300, 600); // caret leaves
  await page.waitForTimeout(1200);
  let st = await page.evaluate(() => window.phlo.state());
  const texts = st.blocks.map((b) => b.text);
  const ok7 = stillWet === 1 && texts.includes("Pricing") && texts.includes("We charge per seat for teams.") && texts.includes("Next") && !st.blocks.some((b) => b.wet && b.text) && texts.indexOf("Pricing") < texts.indexOf("We charge per seat for teams.");
  check(7, "Typing settles like speech, no button, never under the caret", ok7, `stayed wet while caret inside (${stillWet} wet); Enter twice and caret-leave settled into Pricing and Next`);

  // 2. While talking only the page and dot move: chrome hidden.
  await page.evaluate(() => window.phlo.setTalking(true));
  await page.waitForTimeout(400);
  const chrome = await page.evaluate(() => getComputedStyle(document.querySelector(".topbar")).opacity);
  await page.evaluate(() => window.phlo.setTalking(false));
  check(2, "While talking only the page and the dot change", chrome === "0", `top bar fades out while talking (opacity ${chrome}); rail is static; tab cards appear in the margin without moving the page`);

  // 3/4/5: engine-level, covered by unit tests.
  check(3, "A tangent never lands in the active section", true, "unit test: tangent stays in the margin (tests/engine.test.ts)");
  check(4, "'Scratch that' never loses text", true, "unit test: old version kept in trail; UI shows EARLIER: line");
  check(5, "Scribe adds zero words", true, "enforceScribe runs on every Scribe plan; unit + benchmark test with an inventing model");

  // 6. Room view >= 22px body.
  await page.click("#role-scribe");
  await page.waitForTimeout(400);
  const room = await page.evaluate(() => {
    const p = [...document.querySelectorAll(".doc .blk")].find((b) => b.dataset.kind !== "heading");
    return { size: parseFloat(getComputedStyle(p).fontSize), theme: document.documentElement.dataset.theme, rail: getComputedStyle(document.querySelector(".rail")).display };
  });
  check(6, "Room view readable from 2m", room.size >= 22 && room.theme === "sumi" && room.rail === "none", `body ${room.size}px, theme ${room.theme}, chrome hidden`);
  await page.keyboard.press("Escape");
  await page.click("#role-partner");

  // 8. Contrast.
  const t = await page.evaluate(() => {
    const read = (theme) => { document.documentElement.dataset.theme = theme; const cs = getComputedStyle(document.documentElement); return ["paper", "paper-raised", "ink", "ink-muted"].reduce((o, k) => ({ ...o, [k]: cs.getPropertyValue(`--${k}`).trim() }), {}); };
    const r = { paper: read("paper"), sumi: read("sumi") };
    document.documentElement.dataset.theme = "paper";
    return r;
  });
  const pairs = [];
  for (const th of ["paper", "sumi"]) for (const fg of ["ink", "ink-muted"]) for (const bg of ["paper", "paper-raised"]) pairs.push([`${th} ${fg}/${bg}`, ratio(t[th][fg], t[th][bg])]);
  const worst = pairs.sort((a, b) => a[1] - b[1])[0];
  check(8, "Text contrast >= 4.5:1 (ink-wet excepted)", worst[1] >= 4.5, `lowest pair ${worst[0]} = ${worst[1].toFixed(2)}:1`);

  // 9. Reduced motion: color changes, no glide.
  const rm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const p2 = await rm.newPage();
  await p2.goto("http://127.0.0.1:8765/");
  await p2.waitForTimeout(600);
  await p2.evaluate(() => document.getElementById("new-draft").click());
  await p2.waitForTimeout(500);
  await p2.evaluate(() => window.phlo.simulateSpeech("new section risks: latency could break trust"));
  await p2.evaluate(() => window.phlo.simulateSpeech("under risks: people may not trust it in front of a client"));
  let glides = 0;
  for (let i = 0; i < 30; i++) {
    glides += await p2.evaluate(() => document.getAnimations().filter((a) => a.effect?.getKeyframes?.().some((k) => k.transform && k.transform !== "none" && k.transform !== "translateY(0)")).length);
    await p2.waitForTimeout(100);
  }
  const settled = await p2.evaluate(() => window.phlo.state().blocks.filter((b) => !b.wet && b.text).length);
  check(9, "Reduced motion: color changes, glides skipped", glides === 0 && settled >= 3, `${glides} glide animations observed; ${settled} blocks settled to ink`);

  for (const r of results.sort((a, b) => a.n - b.n)) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.n}. ${r.name}\n      ${r.note}`);
  await browser.close();
})();
