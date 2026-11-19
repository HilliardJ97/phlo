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
import type { Block, BlockKind, TableData } from "./model";

export const TEXT_FORMS: BlockKind[] = ["paragraph", "heading", "bullet", "numbered", "question", "decision", "idea", "callout"];
const LISTY: BlockKind[] = ["bullet", "numbered", "paragraph"];

export interface FormOption {
  kind: BlockKind;
  label: string;
  hint: string;
}

export const FORM_OPTIONS: FormOption[] = [
  { kind: "paragraph", label: "Text", hint: "Reasoning" },
  { kind: "heading", label: "Heading", hint: "A new section" },
  { kind: "bullet", label: "Bullets", hint: "Parallel points" },
  { kind: "numbered", label: "Numbered", hint: "Steps in order" },
  { kind: "question", label: "Open question", hint: "The decision still open" },
  { kind: "decision", label: "Decision", hint: "What was chosen, and why" },
  { kind: "idea", label: "Idea", hint: "Worth keeping" },
  { kind: "callout", label: "Note", hint: "Don't miss this" },
  { kind: "table", label: "Table", hint: "Compare items side by side" },
  { kind: "flow", label: "Flow", hint: "Steps as a diagram" },
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

/**
 * Ops that turn block `id` into `kind`. For a table, the whole list run around
 * `id` becomes one table (originals parked). For a table → text form, rows
 * become items of that form.
 */
export function turnIntoOps(blocks: Block[], id: string, kind: BlockKind): { ops: Op[]; focus: string | null; label: string } {
  const b = blocks.find((x) => x.id === id);
  if (!b || b.kind === kind) return { ops: [], focus: null, label: "" };

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

  return {
    ops: [{ t: "update", id, expectRev: b.rev, patch: { kind, wet: false, depth: kind === "bullet" ? (b.depth ?? 0) : undefined } }],
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
    if (b.wet || dismissed.has(b.id) || (b.kind !== "numbered" && b.kind !== "bullet")) continue;
    if (i > 0 && blocks[i - 1].kind === b.kind && !blocks[i - 1].wet) continue; // only at the start of a run
    const run = listRun(blocks, b.id).filter((x) => !x.wet && x.text.trim());
    if (run.length < 3) continue;
    if (b.kind === "numbered") {
      return { id: b.id, ids: run.map((x) => x.id), kind: "flow", text: `These ${run.length} steps read like a flow.`, action: "Make a flow" };
    }
    const shaped = run.filter((x) => splitItem(x.text).length >= 2).length;
    if (shaped >= Math.max(2, Math.ceil(run.length * 0.66))) {
      return { id: b.id, ids: run.map((x) => x.id), kind: "table", text: `These ${run.length} items compare well side by side.`, action: "Make a table" };
    }
  }
  return null;
}
