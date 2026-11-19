import { describe, expect, it } from "vitest";
import { parsePairs, parseVoiceIntent } from "../src/engine/intents";

describe("voice intents", () => {
  it("images: generate vs find", () => {
    expect(parseVoiceIntent("okay add an image of a family looking at a photo book")).toEqual({ type: "generate-image", prompt: "a family looking at a photo book" });
    expect(parseVoiceIntent("find a photo of a wedding album")).toEqual({ type: "find-image", query: "a wedding album" });
  });

  it("charts from spoken numbers", () => {
    expect(parseVoiceIntent("make a bar chart of signups: Jan 120, Feb 180 and March 260")).toMatchObject({
      type: "chart",
      title: "Signups",
      chart: { type: "bar", labels: ["Jan", "Feb", "March"], series: [{ values: [120, 180, 260] }] },
    });
    expect(parseVoiceIntent("chart revenue: Q1 $10k, Q2 $14k, Q3 $22k")).toMatchObject({ chart: { type: "line", unit: "$", series: [{ values: [10000, 14000, 22000] }] } });
    expect(parsePairs("notion ten dollars, granola fourteen dollars")).toEqual([
      { label: "Notion", value: 10, unit: "$" },
      { label: "Granola", value: 14, unit: "$" },
    ]);
    expect(parseVoiceIntent("make a chart of how people feel about it")).toBeNull();
  });

  it("fold and unfold by name; ordinary speech is not an intent", () => {
    expect(parseVoiceIntent("fold pricing")).toEqual({ type: "fold", name: "pricing", fold: true });
    expect(parseVoiceIntent("unfold the risks section")).toEqual({ type: "fold", name: "risks", fold: false });
    expect(parseVoiceIntent("we should show people the price early")).toBeNull();
    expect(parseVoiceIntent("I think the image of the brand matters")).toBeNull();
  });
});
