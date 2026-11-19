/**
 * Settle goldens: realistic sessions, scripted turn by turn, with the outcome
 * each turn must produce. Grading is deterministic (no LLM judge): placement,
 * kind, kept words, no invented words, instructions never transcribed.
 *
 * Scripts mirror Phlo's real jobs: a product sense interview in Scribe, a
 * multi-session business idea in Partner, evidence changing a recommendation,
 * a meeting run from an agenda, and messy typing. Speech includes fillers,
 * restarts, mixed instructions + content, and mind changes, the way people talk.
 *
 * `gap: true` marks a check for behavior the engine doesn't support yet, so the
 * report shows it as a known gap instead of hiding it.
 */
import type { BlockKind, Role } from "../src/engine/model";

export type Check =
  /** Some block settled from this turn sits under this heading and contains these words. */
  | { lands: string; contains: string[]; kind?: BlockKind; gap?: boolean }
  /** Kept in the margin as a tangent (never in the active section). */
  | { tangent: string[]; gap?: boolean }
  /** On the Next list. */
  | { next: string[]; gap?: boolean }
  /** An existing block was revised; old wording kept in the trail. */
  | { revised: string[]; trail: string[]; gap?: boolean }
  /** A heading with this text exists (case-insensitive). */
  | { heading: string; gap?: boolean }
  /** Exactly this many headings on the page. */
  | { headings: number; gap?: boolean }
  /** These phrases must not appear anywhere on the page (instructions, fillers). */
  | { absent: string[]; gap?: boolean }
  /** These headings appear in this order. */
  | { order: string[]; gap?: boolean }
  /** The draft got a title containing one of these words. */
  | { title: string[]; gap?: boolean };

export interface Turn {
  say?: string;
  /** Typed text, placed at the end of the named section (or end of page). */
  type?: string;
  under?: string;
  expect: Check[];
}

export interface Scenario {
  id: string;
  name: string;
  role: Role;
  /** Starting page: headings start with "# ". */
  page: string[];
  turns: Turn[];
}

export const SCENARIOS: Scenario[] = [
  // ---------------------------------------------------------------------------
  {
    id: "interview-scribe",
    name: "Product sense interview, someone watching (Scribe)",
    role: "scribe",
    page: [],
    turns: [
      {
        say: "okay so the prompt is design a product that helps families make photo books. let me start by clarifying the goal. I think the goal is more families actually finish a printed book, not just upload photos",
        expect: [
          { lands: "goal", contains: ["finish", "printed book"] },
          { absent: ["okay so", "let me start by"] },
        ],
      },
      {
        say: "um the users I'd focus on are parents of young kids. they have thousands of photos and no time",
        expect: [{ lands: "user", contains: ["parents of young kids"] }],
      },
      {
        say: "pain points. picking forty photos out of four thousand is the wall. and the layouts look generic so the book doesn't feel worth the money",
        expect: [
          { lands: "pain", contains: ["forty photos", "four thousand"] },
          { lands: "pain", contains: ["generic"] },
        ],
      },
      {
        say: "no wait, scratch that, not forty, it's more like sixty photos out of four thousand",
        expect: [{ revised: ["sixty"], trail: ["forty"] }, { absent: ["scratch that", "no wait"] }],
      },
      {
        say: "for solutions, one, auto pick the best moments. two, a designer layout that looks like a real book",
        expect: [
          { lands: "solution", contains: ["auto", "best moments"] },
          { lands: "solution", contains: ["designer layout"] },
        ],
      },
      {
        say: "the metric I'd use is the percent of started books that get printed within two weeks",
        expect: [{ lands: "metric", contains: ["printed", "two weeks"] }, { order: ["goal", "user", "pain", "solution", "metric"] }],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    id: "explore-partner",
    name: "Business idea across a session (Partner)",
    role: "partner",
    page: ["# Mission", "Make it easier to turn meaningful moments into books people want to keep.", "# First product", "# Who it's for"],
    turns: [
      {
        say: "so the first product is a premium photo book built around one occasion, like a wedding or a first year",
        expect: [{ lands: "first product", contains: ["premium", "one occasion"] }],
      },
      {
        say: "I'm thinking we price it somewhere around a hundred fifty to two hundred dollars",
        expect: [{ lands: "first product", contains: ["two hundred"] }],
      },
      {
        say: "actually make that two hundred, the premium positioning needs it",
        expect: [{ revised: ["two hundred"], trail: ["hundred fifty"] }],
      },
      {
        say: "it's for couples marking a year, a wedding, a first kid. and honestly people who gave a google photo book and felt it was too basic to display",
        expect: [
          { lands: "who", contains: ["couples"] },
          { lands: "who", contains: ["too basic"] },
        ],
      },
      {
        say: "oh also, side thought, could this be a subscription, one book a year",
        expect: [{ tangent: ["subscription"] }],
      },
      {
        say: "I need to talk to five couples about the price before we decide",
        expect: [{ next: ["five couples"] }],
      },
      {
        say: "we haven't talked about how people find us. probably instagram and wedding planners",
        expect: [{ lands: "*new*", contains: ["instagram", "wedding planners"] }],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    id: "evidence",
    name: "Evidence changes the recommendation",
    role: "partner",
    page: [
      "# Evidence",
      "Study A (n=40): voice-first users finished interviews 20% faster.",
      "# Recommendation",
      "Ship voice-first (Study A).",
      "# Open questions",
    ],
    turns: [
      {
        type: "Study B (n=400): typing-first users made 3x fewer wrong edits than voice-first users.",
        under: "Evidence",
        expect: [{ lands: "evidence", contains: ["Study B", "n=400", "3x"] }],
      },
      {
        say: "okay the second study changes it. it's ten times the sample. recommend typing first and cite study B",
        expect: [{ revised: ["typing", "Study B"], trail: ["voice-first"] }],
      },
      {
        say: "the open question is whether voice gets better once the transcription improves",
        expect: [{ lands: "open questions", contains: ["transcription"] }],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    id: "meeting",
    name: "Team offsite from an agenda (Partner)",
    role: "partner",
    page: ["# Q1 goals", "# Hiring", "# Budget", "# Decisions"],
    turns: [
      {
        say: "for hiring we agreed to open two engineering roles in January",
        expect: [{ lands: "hiring", contains: ["two engineering roles", "January"] }],
      },
      {
        say: "budget is flat versus last year, travel gets cut by a third",
        expect: [{ lands: "budget", contains: ["flat"] }, { lands: "budget", contains: ["third"] }],
      },
      {
        say: "the main Q1 goal is shipping the mobile app by end of March",
        expect: [{ lands: "q1 goals", contains: ["mobile app", "March"] }],
      },
      {
        say: "Priya will send the job descriptions by Friday",
        expect: [{ next: ["Priya", "job descriptions"] }],
      },
      {
        say: "new section risks: the mobile app depends on the API rewrite finishing first",
        expect: [{ heading: "risks" }, { lands: "risks", contains: ["API rewrite"] }, { absent: ["new section"] }],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    id: "typing",
    name: "Messy typing settles like speech",
    role: "partner",
    page: ["# Pricing", "Per seat for teams.", "# Risks"],
    turns: [
      {
        type: "solo users might not pay at all if teams already pay per seat",
        expect: [{ lands: "pricing", contains: ["solo users"] }],
      },
      {
        type: "biggest risk is latency, if the page lags people stop trusting it",
        expect: [{ lands: "risks", contains: ["latency"] }],
      },
    ],
  },

  // ---------------------------------------------------------------------------
  {
    id: "directions",
    name: "Directions to the editor are never content",
    role: "partner",
    page: ["# Business context", "Photo books are a $3B market.", "# Other trends", "Print is coming back with Gen Z."],
    turns: [
      {
        say: "rename business context to market",
        expect: [{ heading: "market", gap: true }, { absent: ["rename business context"] }],
      },
      {
        say: "move other trends under market, it should all be one section",
        expect: [{ headings: 1, gap: true }, { absent: ["move other trends"] }],
      },
    ],
  },
];
