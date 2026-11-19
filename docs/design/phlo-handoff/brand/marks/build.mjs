// Builds the proposed Phlo marks: 20 content icons drawn only from the symbol
// family's four parts (round, square, tail, gap). Ink on paper, 24-unit grid.
// Run: node docs/design/phlo-handoff/brand/marks/build.mjs
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const S = 2; // stroke for open shapes

// arc path on a circle (cx, cy, r) from angle a0 to a1 in degrees, clockwise
const arc = (cx, cy, r, a0, a1) => {
  const p = (a) => [cx + r * Math.cos((a * Math.PI) / 180), cy + r * Math.sin((a * Math.PI) / 180)];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  const large = (a1 - a0 + 360) % 360 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
};
const ring = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="currentColor" stroke-width="${S}"/>`;
const dot = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor"/>`;
const box = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="currentColor"/>`;
const frame = (x, y, w, h) => `<rect x="${x + S / 2}" y="${y + S / 2}" width="${w - S}" height="${h - S}" fill="none" stroke="currentColor" stroke-width="${S}"/>`;
const path = (d, fill = true) => fill ? `<path d="${d}" fill="currentColor"/>` : `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${S}"/>`;

export const MARKS = [
  // Thinking marks: the callouts
  ["idea", "Idea", "A raw thought: round, solid", dot(12, 12, 7)],
  ["question", "Question", "A round left open, with a gap before the point", path(arc(12, 9, 5.5, 180, 90), false) + dot(12, 20, 1.8)],
  ["decision", "Decision", "Solid square: settled onto the page", box(5, 5, 14, 14)],
  ["note", "Note", "An empty page", frame(5, 5, 14, 14)],
  ["key", "Key point", "The thought at the center of the page", frame(4, 4, 16, 16) + dot(12, 12, 4)],
  ["risk", "Risk", "A square on its corner", `<g transform="rotate(45 12 12)">${frame(6, 6, 12, 12)}</g>` + dot(12, 12, 2)],
  ["quote", "Said", "The split bubble: someone's words", path("M8 4 A6 6 0 0 0 8 16 Z") + box(10, 4, 8, 12) + path("M18 16 L18 21 L13 16 Z")],
  ["action", "Action", "A tail: moving on", box(4, 10, 8, 4) + path("M13 6 L20 12 L13 18 Z")],
  // Content marks: what a section is about
  ["goal", "Goal", "Round within round", ring(12, 12, 8) + dot(12, 12, 3.5)],
  ["metric", "Metric", "Squares rising", box(4, 13, 4, 7) + box(10, 9, 4, 11) + box(16, 4, 4, 16)],
  ["person", "Person", "A round head, round shoulders", dot(12, 8, 4) + path("M4 21 A8 7 0 0 1 20 21 Z")],
  ["time", "Time", "A quarter of the round filled", ring(12, 12, 8) + path("M12 12 L12 4 A8 8 0 0 1 20 12 Z")],
  ["pillars", "Pillars", "Three squares under one", box(4, 4, 16, 3) + box(5, 9, 3, 11) + box(10.5, 9, 3, 11) + box(16, 9, 3, 11)],
  ["compare", "Compare", "One open, one settled", frame(3, 6, 8, 12) + box(13, 6, 8, 12)],
  // Shape marks: how things move
  ["flow", "Flow", "Round, gap, square: voice becomes page", dot(7, 12, 4) + path("M12 9 L15 12 L12 15 Z") + box(16, 8, 6, 8)],
  ["cycle", "Cycle", "A round that comes back", path(arc(12, 12, 7, 20, 300), false) + path("M15.2 3.6 L21 6.8 L15.6 10.4 Z")],
  ["connect", "Connect", "Two rounds across a gap", dot(6, 12, 3.5) + box(9.5, 11, 5, 2) + dot(18, 12, 3.5)],
  ["prototype", "Prototype", "A page with a bar: a screen", frame(4, 4, 16, 16) + box(4, 4, 16, 5)],
  // Errand marks: Phlo working for you
  ["look", "Look into", "A round lens with a square handle", ring(10, 10, 6) + `<g transform="rotate(45 17.5 17.5)">${box(14.5, 16.5, 7, 2.6)}</g>`],
  ["later", "Later", "A half round setting on the line", path("M5 16 A7 7 0 0 1 19 16 Z") + box(3, 18, 18, 2)],
];

const symbols = MARKS.map(([id, , , body]) => `  <symbol id="mark-${id}" viewBox="0 0 24 24">${body}</symbol>`).join("\n");
writeFileSync(join(here, "marks.svg"), `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n${symbols}\n</svg>\n`);

const cell = ([id, name, meaning, body]) => `
  <figure><div class="big"><svg viewBox="0 0 24 24">${body}</svg></div>
  <div class="sizes"><svg viewBox="0 0 24 24" width="16">${body}</svg><svg viewBox="0 0 24 24" width="24">${body}</svg></div>
  <figcaption><b>${name}</b><span>${meaning}</span></figcaption></figure>`;
writeFileSync(join(here, "preview.html"), `<!doctype html><meta charset="utf-8"><title>Phlo marks</title>
<style>
  :root{--paper:#f7f7f4;--ink:#16171a;--muted:#66665f;--hair:#e4e4df}
  body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.4 Geist,ui-sans-serif,system-ui;padding:40px}
  h1{font-weight:400;font-size:32px;margin:0 0 4px} p{color:var(--muted);margin:0 0 28px}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--hair);border:1px solid var(--hair)}
  figure{margin:0;background:var(--paper);padding:18px;display:grid;grid-template-columns:56px 1fr;gap:6px 12px;align-items:center}
  .big svg{width:56px;height:56px;color:var(--ink)} .sizes{display:flex;gap:10px;align-items:center;color:var(--ink)}
  figcaption{grid-column:1/-1;display:flex;flex-direction:column} figcaption b{font-weight:500} figcaption span{color:var(--muted);font-size:12px}
  .dark{background:#111214;--paper:#111214;--ink:#f2f1ec;--muted:#9a9a92;--hair:#26272b;color:var(--ink);padding:40px;margin:40px -40px -40px}
</style>
<h1>Marks</h1><p>Twenty marks from four parts: round, square, tail, gap. Ink only.</p>
<div class="grid">${MARKS.map(cell).join("")}</div>
<div class="dark"><div class="grid">${MARKS.map(cell).join("")}</div></div>`);
console.log(`${MARKS.length} marks written`);
