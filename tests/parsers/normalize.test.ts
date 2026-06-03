import { describe, it, expect } from "vitest";
import { normalizeRoadName } from "../../src/parsers/normalize.js";

describe("normalizeRoadName", () => {
  it("expands TIGER / Texas road-class abbreviations", () => {
    expect(normalizeRoadName("Co Rd 128")).toBe("County Road 128");
    expect(normalizeRoadName("Cnty Rd 5")).toBe("County Road 5");
    expect(normalizeRoadName("US Hwy 87")).toBe("US Highway 87");
    expect(normalizeRoadName("St Hwy 16")).toBe("State Highway 16");
    expect(normalizeRoadName("State Hwy 16")).toBe("State Highway 16");
    expect(normalizeRoadName("FM 2335")).toBe("Farm to Market 2335");
    expect(normalizeRoadName("RM 620")).toBe("Ranch to Market 620");
  });

  it("expands a bare Hwy suffix", () => {
    expect(normalizeRoadName("Bee Caves Hwy")).toBe("Bee Caves Highway");
  });

  it("expands standalone directionals only", () => {
    expect(normalizeRoadName("N Main")).toBe("North Main");
    expect(normalizeRoadName("E 6th")).toBe("East 6th");
    // not inside a word
    expect(normalizeRoadName("East Street")).toBe("East Street");
  });

  it("is case-insensitive and collapses spacing", () => {
    expect(normalizeRoadName("co rd 5")).toBe("County Road 5");
    expect(normalizeRoadName("US  Hwy  290")).toBe("US Highway 290");
  });

  it("leaves already-canonical / unrelated names unchanged", () => {
    expect(normalizeRoadName("Main Street")).toBe("Main Street");
    expect(normalizeRoadName("County Road 128")).toBe("County Road 128");
    expect(normalizeRoadName("Oak Avenue")).toBe("Oak Avenue");
  });

  it("handles empty / nullish input safely", () => {
    expect(normalizeRoadName("")).toBe("");
    expect(normalizeRoadName(undefined as unknown as string)).toBe("");
  });
});
