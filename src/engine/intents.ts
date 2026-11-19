/**
 * Voice intents that create things (images, charts) or act on the page (fold),
 * recognized deterministically before settling. Instant, exact, and never
 * written onto the page as words.
 */
import { looksTemporal, parsePairs } from "./forms";
import type { ChartData } from "./model";

export { parsePairs };

export type VoiceIntent =
  | { type: "generate-image"; prompt: string }
  | { type: "find-image"; query: string }
  | { type: "chart"; title: string | null; chart: ChartData }
  | { type: "fold"; name: string; fold: boolean };

const LEAD = /^(?:ok(?:ay)?,?\s+|so,?\s+|um,?\s+|can you\s+|could you\s+|please\s+|let's\s+)*/i;

const GENERATE = /^(?:add|generate|create|make|draw|give me|put in)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|illustration|visual|drawing|photo)\s+(?:of|showing|with)\s+(.{3,})$/i;
const FIND = /^(?:find|get|grab|search for|look up|pull in)\s+(?:me\s+)?(?:an?\s+)?(?:photo|picture|image|pic)s?\s+(?:of|showing|with)\s+(.{3,})$/i;
const CHART =
  /^(?:make|add|create|show|draw|plot|chart)\s+(?:me\s+)?(?:an?\s+)?(bar|line|column)?\s*(?:chart|graph|plot)?\s*(?:of|for|showing)?\s*([a-z][\w\s'-]{0,40}?)?\s*[:,—-]\s*(.+)$/i;
const FOLD = /^(fold|collapse|hide|unfold|expand|open|show)\s+(?:the\s+)?(.+?)(?:\s+section)?[.!]?$/i;

export function parseVoiceIntent(raw: string): VoiceIntent | null {
  const text = raw.trim().replace(LEAD, "").replace(/[.!]+$/, "");
  let m = GENERATE.exec(text);
  if (m) return { type: "generate-image", prompt: m[1].trim() };
  m = FIND.exec(text);
  if (m) return { type: "find-image", query: m[1].trim() };
  m = CHART.exec(text);
  if (m && /chart|graph|plot/i.test(text)) {
    const pairs = parsePairs(m[3]);
    if (pairs) {
      const type = m[1]?.toLowerCase() === "line" || (!m[1] && pairs.every((p) => looksTemporal(p.label))) ? "line" : "bar";
      const title = m[2]?.trim() ? m[2].trim().replace(/^\w/, (c) => c.toUpperCase()) : null;
      return {
        type: "chart",
        title,
        chart: { type, labels: pairs.map((p) => p.label), series: [{ name: title ?? "Value", values: pairs.map((p) => p.value) }], unit: pairs.find((p) => p.unit)?.unit },
      };
    }
  }
  m = FOLD.exec(text);
  if (m && m[2].split(/\s+/).length <= 5) return { type: "fold", name: m[2], fold: /^(?:fold|collapse|hide)$/i.test(m[1]) };
  return null;
}
