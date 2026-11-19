/**
 * Turn into: change how an idea is expressed, never what it says.
 *
 * Text forms (paragraph, bullet, numbered, question, decision, idea, callout,
 * heading) share one shape, so turning between them is just a kind change.
 * Lists and tables share "items with attributes": a list item "Notion: $10,
 * cloud only" becomes a row [Notion, $10, cloud only], and back. Every
 * conversion is a set of guarded ops; originals are parked, never deleted.
 */
import type { Op } from "./engine";
import { newId } from "./ids";
import type { Block, BlockKind, ChartData, TableData } from "./model";
import { numberize } from "./settle";

export const TEXT_FORMS: BlockKind[] = ["paragraph", "heading", "bullet", "numbered", "question", "decision", "idea", "callout"];
const LISTY: BlockKind[] = ["bullet", "numbered", "paragraph"];

export type FormGroup = "Text" | "Thinking" | "Visual" | "Media";
export type MediaAction = "upload" | "find-image" | "generate-image" | "embed";

export interface FormOption {
  id: string;
  label: string;
  hint: string;
  group: FormGroup;
  /** A form to turn into / add. */
  kind?: BlockKind;
  level?: 1 | 2;
  /** Media actions add something new (they don't convert existing words). */
  action?: MediaAction;
  /** Extra words that should find this option when typed after "/". */
  keys?: string;
}

export const FORM_OPTIONS: FormOption[] = [
  { id: "text", group: "Text", kind: "paragraph", label: "Text", hint: "Reasoning" },
  { id: "heading", group: "Text", kind: "heading", level: 1, label: "Heading", hint: "A new section", keys: "h1 section" },
  { id: "subheading", group: "Text", kind: "heading", level: 2, label: "Subheading", hint: "A part of a section", keys: "h2 sub" },
  { id: "toggle", group: "Text", kind: "heading", level: 2, label: "Toggle", hint: "Folds what's under it", keys: "collapse fold" },
  { id: "bullet", group: "Text", kind: "bullet", label: "Bullets", hint: "Parallel points", keys: "list" },
  { id: "numbered", group: "Text", kind: "numbered", label: "Numbered", hint: "Steps in order", keys: "steps ordered" },
  { id: "question", group: "Thinking", kind: "question", label: "Open question", hint: "The decision still open" },
  { id: "decision", group: "Thinking", kind: "decision", label: "Decision", hint: "What was chosen, and why" },
  { id: "idea", group: "Thinking", kind: "idea", label: "Idea", hint: "Worth keeping" },
  { id: "note", group: "Thinking", kind: "callout", label: "Note", hint: "Don't miss this", keys: "callout box" },
  { id: "table", group: "Visual", kind: "table", label: "Table", hint: "Compare side by side" },
  { id: "chart", group: "Visual", kind: "chart", label: "Chart", hint: "Real numbers: bar, line, histogram", keys: "graph bar line histogram" },
  { id: "flow", group: "Visual", kind: "flow", label: "Flow", hint: "Steps as a diagram", keys: "flowchart diagram process" },
  { id: "timeline", group: "Visual", kind: "timeline", label: "Timeline", hint: "When things happen", keys: "roadmap dates" },
  { id: "columns", group: "Visual", kind: "columns", label: "Columns", hint: "Side by side", keys: "compare cards" },
  { id: "image", group: "Media", action: "upload", label: "Image", hint: "From this Mac", keys: "picture photo upload" },
  { id: "find-image", group: "Media", action: "find-image", label: "Find a photo", hint: "Openly licensed, credited", keys: "web search picture" },
  { id: "generate-image", group: "Media", action: "generate-image", label: "Generate image", hint: "From a description", keys: "ai create draw" },
  { id: "embed", group: "Media", action: "embed", label: "Video or embed", hint: "YouTube, Loom, Figma", keys: "youtube video link" },
];

/** The contiguous run of list-like blocks around `id` (what "these" means). */
export function listRun(blocks: Block[], id: string): Block[] {
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return [];
  const kind = blocks[i].kind;
  if (!LISTY.includes(kind)) return [blocks[i]];
  let a = i;
  let z = i;
  while (a > 0 && blocks[a - 1].kind === kind && !blocks[a - 1].wet) a--;
  while (z + 1 < blocks.length && blocks[z + 1].kind === kind && !blocks[z + 1].wet) z++;
  return blocks.slice(a, z + 1);
}

/** "Notion: $10, cloud only" → ["Notion", "$10", "cloud only"]. */
export function splitItem(text: string): string[] {
  const t = text.trim().replace(/[.;]+$/, "");
  // "Notion: $10, cloud" / "Granola – $14" / "Notion is $10 a month, cloud only" / "Granola costs $14".
  const m = /^(.{1,60}?)\s*(?::|\s[–—-]\s)\s*(.+)$/.exec(t) ?? /^([A-Z][\w.&' ]{0,30}?)\s+(?:is|are|costs?|has|have|charges?|offers?)\s+(.+)$/.exec(t);
  if (!m) return [t];
  const rest = m[2].split(/\s*[;,]\s+/).filter(Boolean);
  return [m[1], ...rest];
}

export function listToTable(items: Block[]): TableData {
  const cells = items.map((b) => splitItem(b.text));
  const width = Math.max(...cells.map((c) => c.length));
  const columns = width === 1 ? ["Item"] : width === 2 ? ["Item", "Detail"] : ["Item", ...Array.from({ length: width - 1 }, (_, k) => `Detail ${k + 1}`)];
  // Name a column when its cells make the meaning obvious; otherwise keep the neutral label.
  for (let c = 1; c < width; c++) {
    const vals = cells.map((r) => (r[c] ?? "").toLowerCase()).filter(Boolean);
    if (!vals.length) continue;
    const share = (re: RegExp) => vals.filter((v) => re.test(v)).length / vals.length;
    if (share(/\$|€|£|dollars?|\bfree\b|\/mo|per (?:month|seat|year)|pricing|\bcost/) >= 0.66) columns[c] = "Price";
    else if (share(/^\d[\d.,]*\s*%$|^\d[\d.,]*\s*(?:k|m|users?|people)?$/) >= 0.66) columns[c] = "Value";
  }
  const rows = cells.map((c) => [...c, ...Array(width - c.length).fill("")]);
  return { columns, rows };
}

export function tableToItems(data: TableData): string[] {
  return data.rows.map((r) => {
    const [head, ...rest] = r;
    const tail = rest.filter((x) => x.trim()).join(", ");
    return tail ? `${head}: ${tail}` : head;
  });
}

export function flowSummary(steps: string[]): string {
  return `Flow · ${steps.join(" → ")}`;
}

/** A short text stand-in for a table, so models and search can see it. */
export function tableSummary(data: TableData): string {
  return `Table · ${data.columns.join(" | ")} · ${data.rows.length} rows: ${data.rows.map((r) => r.join(" | ")).join("; ")}`;
}

// ---------------------------------------------------------------------------
// Numbers, charts, timelines
// ---------------------------------------------------------------------------

/** "$1,200" → 1200, "12%" → 12, "1.2k" → 1200, "two hundred" → 200. */
export function parseNumber(raw: string): number | null {
  const t = numberize(raw).trim().toLowerCase().replace(/,/g, "");
  const m = /(-?\d+(?:\.\d+)?)\s*(k|m|b|thousand|million|billion)?\b/.exec(t);
  if (!m) return null;
  const mult = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, b: 1e9, billion: 1e9 }[m[2] as "k"] ?? 1;
  return Number(m[1]) * mult;
}

export function unitOf(raw: string): string | undefined {
  if (/\$|dollars?/i.test(raw)) return "$";
  if (/%|percent/i.test(raw)) return "%";
  return undefined;
}

const TEMPORAL = /^(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+\d{2,4})?$|^q[1-4](?:\s*\d{2,4})?$|^(?:19|20)\d{2}$|^(?:week|wk|month|day|sprint|phase|h[12])\s*\d+$|^\d{4}-\d{2}(?:-\d{2})?$|^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*$/i;

export function looksTemporal(label: string): boolean {
  return TEMPORAL.test(label.trim());
}

/** Items like "Jan: 120", "Feb – 180 signups" → a chart. Lists of bare numbers → a histogram. */
export function chartFromItems(items: string[]): ChartData | null {
  // One sentence of pairs: "Jan 120, Feb 180, March 260".
  if (items.length === 1) {
    const pairs = parsePairs(items[0].replace(/[.]+$/, ""));
    if (pairs) {
      return { type: pairs.every((p) => looksTemporal(p.label)) ? "line" : "bar", labels: pairs.map((p) => p.label), series: [{ name: "Value", values: pairs.map((p) => p.value) }], unit: pairs.find((p) => p.unit)?.unit };
    }
  }
  const pairs = items.map((t) => {
    const cells = splitItem(t);
    const value = cells.length >= 2 ? parseNumber(cells.slice(1).join(" ")) : null;
    return { label: cells[0], value, unit: cells.length >= 2 ? unitOf(cells.slice(1).join(" ")) : undefined };
  });
  if (pairs.length >= 2 && pairs.every((p) => p.value !== null)) {
    const temporal = pairs.every((p) => looksTemporal(p.label));
    return { type: temporal ? "line" : "bar", labels: pairs.map((p) => p.label), series: [{ name: "Value", values: pairs.map((p) => p.value!) }], unit: pairs.find((p) => p.unit)?.unit };
  }
  const nums = items.flatMap((t) => t.split(/[,;\s]+/)).map((x) => parseNumber(x)).filter((x): x is number => x !== null);
  if (nums.length >= 5 && items.join(" ").replace(/[\d.,;%$\s-]|k\b/gi, "").length < 4) {
    return { type: "histogram", labels: [], series: [{ name: "Values", values: nums }] };
  }
  return null;
}

/** "jan 120, feb 180 and march 260" → [{Jan,120},…] when every part has a label and a number. */
export function parsePairs(text: string): { label: string; value: number; unit?: string }[] | null {
  const parts = text
    .split(/\s*(?:,|;|\band\b)\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const out: { label: string; value: number; unit?: string }[] = [];
  for (const p0 of parts) {
    // "notion ten dollars" → "notion 10 dollars": spoken numbers become digits first.
    const p = numberize(p0).trim();
    const m = /^(.+?)\s*(?::|\bat\b|\bwas\b|\bis\b|\bwith\b|=)?\s*(\$?\s*-?\d[\d.,]*\s*(?:k|m|%|percent|dollars?)?)\s*$/i.exec(p);
    if (!m) return null;
    const value = parseNumber(m[2]);
    if (value === null) return null;
    const label = p0.trim().slice(0, m[1].length).replace(/^(?:in|for|on)\s+/i, "").trim();
    out.push({ label: (label || m[1]).replace(/^\w/, (c) => c.toUpperCase()), value, unit: unitOf(m[2]) });
  }
  return out;
}

export function chartFromTable(data: TableData): ChartData | null {
  const numericCols = data.columns.map((_, c) => c).filter((c) => c > 0 && data.rows.length >= 2 && data.rows.every((r) => parseNumber(r[c] ?? "") !== null));
  if (!numericCols.length) return null;
  const labels = data.rows.map((r) => r[0]);
  return {
    type: labels.every(looksTemporal) ? "line" : "bar",
    labels,
    series: numericCols.map((c) => ({ name: data.columns[c], values: data.rows.map((r) => parseNumber(r[c])!) })),
    unit: unitOf(data.rows.map((r) => numericCols.map((c) => r[c]).join(" ")).join(" ")),
  };
}

export function chartSummary(c: ChartData): string {
  const head = `${c.type[0].toUpperCase()}${c.type.slice(1)} chart`;
  if (c.type === "histogram") return `${head} · ${c.series[0].values.length} values`;
  return `${head} · ${c.series.map((s) => `${s.name}: ${c.labels.map((l, i) => `${l} ${s.values[i]}`).join(", ")}`).join("; ")}${c.unit ? ` (${c.unit})` : ""}`;
}

export function timelineFromItems(items: string[]): { when: string[]; steps: string[] } {
  const when: string[] = [];
  const steps: string[] = [];
  for (const t of items) {
    const cells = splitItem(t);
    if (cells.length >= 2 && cells[0].length <= 24) {
      when.push(cells[0]);
      steps.push(cells.slice(1).join(", "));
    } else {
      when.push("");
      steps.push(t.trim().replace(/[.;]+$/, ""));
    }
  }
  return { when, steps };
}

/**
 * Ops that turn block `id` into `kind`. For a table, the whole list run around
 * `id` becomes one table (originals parked). For a table → text form, rows
 * become items of that form.
 */
export function turnIntoOps(blocks: Block[], id: string, kind: BlockKind, level?: 1 | 2): { ops: Op[]; focus: string | null; label: string } {
  const b = blocks.find((x) => x.id === id);
  if (!b) return { ops: [], focus: null, label: "" };
  if (kind === "heading" && b.kind === "heading") {
    const lv = level ?? 1;
    if ((b.level ?? 1) === lv) return { ops: [], focus: null, label: "" };
    return { ops: [{ t: "update", id, expectRev: b.rev, patch: { level: lv } }], focus: id, label: "" };
  }
  if (b.kind === kind) return { ops: [], focus: null, label: "" };

  const items = (): { run: Block[]; texts: string[] } => {
    if (b.kind === "table" && b.data) return { run: [b], texts: tableToItems(b.data) };
    if ((b.kind === "flow" || b.kind === "columns" || b.kind === "timeline") && b.steps) {
      return { run: [b], texts: b.steps.map((st, i) => (b.when?.[i] ? `${b.when[i]}: ${st}` : st)) };
    }
    if (b.kind === "chart" && b.chart) {
      return { run: [b], texts: b.chart.type === "histogram" ? [b.chart.series[0].values.join(", ")] : b.chart.labels.map((l, i) => `${l}: ${b.chart!.series.map((s2) => `${s2.values[i]}${b.chart!.unit === "%" ? "%" : ""}`).join(", ")}`) };
    }
    const run = listRun(blocks, id).filter((x) => x.text.trim());
    if (run.length > 1) return { run, texts: run.map((x) => x.text.trim().replace(/[.;]+$/, "")) };
    return { run: [b], texts: b.text.split(/(?<=[.;])\s+|\s*(?:→|->|, then | then )\s*/i).map((x) => x.trim().replace(/[.;]+$/, "")).filter(Boolean) };
  };
  const replaceWith = (block: Block, run: Block[], label: string) => {
    const prev = blocks[blocks.findIndex((x) => x.id === run[0].id) - 1];
    const ops: Op[] = [{ t: "insert", block, after: prev?.id ?? null }];
    for (const r of run) ops.push({ t: "park", id: r.id, expectRev: r.rev });
    return { ops, focus: block.id, label };
  };

  if (kind === "chart") {
    const { run, texts } = items();
    const chart = b.kind === "table" && b.data ? chartFromTable(b.data) : chartFromItems(texts);
    if (!chart) return { ops: [], focus: null, label: "A chart needs real numbers: try “Jan: 120, Feb: 180” or a table with a number column." };
    return replaceWith({ id: newId("b"), kind: "chart", text: chartSummary(chart), chart, wet: false, rev: 0, origin: b.origin }, run, `Made a ${chart.type} chart`);
  }
  if (kind === "timeline") {
    const { run, texts } = items();
    const { when, steps } = timelineFromItems(texts.length ? texts : [""]);
    return replaceWith({ id: newId("b"), kind: "timeline", text: `Timeline · ${steps.map((st, i) => `${when[i] ? `${when[i]}: ` : ""}${st}`).join(" · ")}`, steps, when, wet: false, rev: 0, origin: b.origin }, run, `Made a timeline of ${steps.length}`);
  }
  if (kind === "columns") {
    const { run, texts } = items();
    const steps = texts.length >= 2 ? texts.slice(0, 4) : [texts[0] ?? "", ""];
    return replaceWith({ id: newId("b"), kind: "columns", text: `Columns · ${steps.join(" | ")}`, steps, wet: false, rev: 0, origin: b.origin }, run, `Made ${steps.length} columns`);
  }
  if (b.kind === "chart" || b.kind === "timeline" || b.kind === "columns") {
    const { texts } = items();
    const k: BlockKind = kind === "table" ? "table" : kind === "heading" || kind === "image" || kind === "embed" ? "bullet" : kind;
    if (k === "table") {
      const data = listToTable(texts.map((t) => ({ id: "", kind: "bullet", text: t, wet: false, rev: 0, origin: b.origin })));
      if (b.kind === "chart" && b.chart && b.chart.type !== "histogram") {
        data.columns = ["Item", ...b.chart.series.map((s2) => s2.name)];
      }
      return replaceWith({ id: newId("b"), kind: "table", text: tableSummary(data), data, wet: false, rev: 0, origin: b.origin }, [b], "Made a table");
    }
    if (k === "flow") {
      const steps = texts;
      return replaceWith({ id: newId("b"), kind: "flow", text: flowSummary(steps), steps, wet: false, rev: 0, origin: b.origin }, [b], `Made a flow of ${steps.length} steps`);
    }
    const ops: Op[] = [];
    let after = id;
    for (const text of texts) {
      const nid = newId("b");
      ops.push({ t: "insert", block: { id: nid, kind: k, text, wet: false, rev: 0, origin: b.origin, depth: k === "bullet" ? 0 : undefined }, after });
      after = nid;
    }
    ops.push({ t: "park", id, expectRev: b.rev });
    return { ops, focus: after, label: `Made ${texts.length} ${k === "numbered" ? "steps" : "lines"}` };
  }

  if (kind === "table" && b.kind !== "table") {
    const run = listRun(blocks, id).filter((x) => x.text.trim());
    if (!run.length) {
      const data: TableData = { columns: ["Item", "Detail"], rows: [["", ""], ["", ""]] };
      return {
        ops: [{ t: "update", id, expectRev: b.rev, patch: { kind: "table", data, text: tableSummary(data), wet: false } }],
        focus: id,
        label: "Made a table",
      };
    }
    const data = listToTable(run);
    const tid = newId("b");
    const prev = blocks[blocks.findIndex((x) => x.id === run[0].id) - 1];
    const ops: Op[] = [{ t: "insert", block: { id: tid, kind: "table", text: tableSummary(data), data, wet: false, rev: 0, origin: run[0].origin }, after: prev?.id ?? null }];
    for (const r of run) ops.push({ t: "park", id: r.id, expectRev: r.rev });
    return { ops, focus: tid, label: `Made a table from ${run.length} ${run.length === 1 ? "line" : "lines"}` };
  }

  if (kind === "table" && b.kind === "flow" && b.steps) {
    const data = listToTable(b.steps.map((t) => ({ id: "", kind: "bullet", text: t, wet: false, rev: 0, origin: b.origin })));
    return replaceWith({ id: newId("b"), kind: "table", text: tableSummary(data), data, wet: false, rev: 0, origin: b.origin }, [b], "Made a table");
  }
  if (kind === "flow" && b.kind !== "flow") {
    // A table's first column, a list run, or one paragraph's sentences become steps.
    const run = b.kind === "table" && b.data ? [] : listRun(blocks, id).filter((x) => x.text.trim());
    let steps =
      b.kind === "table" && b.data
        ? b.data.rows.map((r) => r.filter((c) => c.trim()).join(": ")).filter(Boolean)
        : run.length > 1
          ? run.map((x) => x.text.trim().replace(/[.;]+$/, ""))
          : b.text.split(/(?<=[.;])\s+|\s*(?:→|->|, then | then )\s*/i).map((x) => x.trim().replace(/[.;]+$/, "")).filter(Boolean);
    if (!steps.length) steps = ["", ""];
    const fid = newId("b");
    const first = run.length > 1 ? run[0] : b;
    const prev = blocks[blocks.findIndex((x) => x.id === first.id) - 1];
    const ops: Op[] = [{ t: "insert", block: { id: fid, kind: "flow", text: flowSummary(steps), steps, wet: false, rev: 0, origin: b.origin }, after: prev?.id ?? null }];
    for (const r of run.length > 1 ? run : [b]) ops.push({ t: "park", id: r.id, expectRev: r.rev });
    return { ops, focus: fid, label: `Made a flow of ${steps.length} steps` };
  }

  if (b.kind === "flow" && b.steps) {
    const ops: Op[] = [];
    let after = id;
    const k = kind === "table" ? "bullet" : kind === "heading" ? "numbered" : kind;
    for (const text of b.steps) {
      const nid = newId("b");
      ops.push({ t: "insert", block: { id: nid, kind: k, text, wet: false, rev: 0, origin: b.origin, depth: k === "bullet" ? 0 : undefined }, after });
      after = nid;
    }
    ops.push({ t: "park", id, expectRev: b.rev });
    return { ops, focus: after, label: `Made ${b.steps.length} steps from the flow` };
  }

  if (b.kind === "table" && b.data) {
    const items = tableToItems(b.data);
    const ops: Op[] = [];
    let after = id;
    for (const text of items) {
      const nid = newId("b");
      ops.push({ t: "insert", block: { id: nid, kind: kind === "heading" ? "bullet" : kind, text, wet: false, rev: 0, origin: b.origin, depth: kind === "bullet" ? 0 : undefined }, after });
      after = nid;
    }
    ops.push({ t: "park", id, expectRev: b.rev });
    return { ops, focus: after, label: `Made ${items.length} ${kind === "numbered" ? "steps" : "items"} from the table` };
  }

  if (kind === "image" || kind === "embed") return { ops: [], focus: null, label: "" };
  return {
    ops: [{ t: "update", id, expectRev: b.rev, patch: { kind, wet: false, depth: kind === "bullet" ? (b.depth ?? 0) : undefined, level: kind === "heading" ? (level ?? 1) : undefined } }],
    focus: id,
    label: "",
  };
}

export interface FormSuggestion {
  /** First block of the run; also the dismissal key. */
  id: string;
  /** Every block the suggestion would change. */
  ids: string[];
  kind: "flow" | "table";
  text: string;
  action: string;
}

/**
 * Partner notices when words already have a shape: 3+ ordered steps read like a
 * flow; 3+ list items that each carry attributes ("Notion: $10, cloud") read like
 * a table. Pure and deterministic: no model call, no surprise.
 */
export function suggestForm(blocks: Block[], dismissed: Set<string>): FormSuggestion | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.wet || dismissed.has(b.id) || (b.kind !== "numbered" && b.kind !== "bullet" && b.kind !== "paragraph")) continue;
    if (i > 0 && blocks[i - 1].kind === b.kind && !blocks[i - 1].wet) continue; // only at the start of a run
    const run = listRun(blocks, b.id).filter((x) => !x.wet && x.text.trim());
    if (run.length < 3) continue;
    if (b.kind === "numbered") {
      return { id: b.id, ids: run.map((x) => x.id), kind: "flow", text: `These ${run.length} steps read like a flow.`, action: "Make a flow" };
    }
    const shaped = run.filter((x) => splitItem(x.text).length >= 2).length;
    // Plain lines must all carry the "Name: detail" shape; bullets need two thirds.
    const enough = b.kind === "paragraph" ? shaped === run.length && run.every((x) => x.text.length < 140) : shaped >= Math.max(2, Math.ceil(run.length * 0.66));
    if (enough) {
      return { id: b.id, ids: run.map((x) => x.id), kind: "table", text: `These ${run.length} items compare well side by side.`, action: "Make a table" };
    }
  }
  return null;
}
