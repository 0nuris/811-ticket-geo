import { describe, it, expect } from "vitest";
import { parseStreet, streetsMatch } from "../../src/parsers/street.js";

describe("parseStreet", () => {
  it("parses simple street with type", () => {
    expect(parseStreet("Peterson Ct")).toEqual({
      name: "Peterson", type: "Ct", prefix: "", suffix: "",
    });
  });

  it("parses directional prefix", () => {
    expect(parseStreet("N Main St")).toEqual({
      name: "Main", type: "St", prefix: "N", suffix: "",
    });
  });

  it("parses directional suffix", () => {
    expect(parseStreet("Oak Hill Blvd S")).toEqual({
      name: "Oak Hill", type: "Blvd", prefix: "", suffix: "S",
    });
  });

  it("parses street with no type suffix", () => {
    expect(parseStreet("FM 407")).toEqual({
      name: "FM 407", type: "", prefix: "", suffix: "",
    });
  });

  it("parses street type without prefix", () => {
    expect(parseStreet("Eagle Pkwy")).toEqual({
      name: "Eagle", type: "Pkwy", prefix: "", suffix: "",
    });
  });

  it("handles empty string", () => {
    expect(parseStreet("")).toEqual({
      name: "", type: "", prefix: "", suffix: "",
    });
  });

  it("handles case-insensitive directionals", () => {
    expect(parseStreet("n main st")).toEqual({
      name: "main", type: "St", prefix: "N", suffix: "",
    });
  });

  it("parses suffix directional after type", () => {
    expect(parseStreet("Commerce St NW")).toEqual({
      name: "Commerce", type: "St", prefix: "", suffix: "NW",
    });
  });

  it("parses full-form street type to canonical abbreviation", () => {
    expect(parseStreet("Park Avenue")).toEqual({
      name: "Park", type: "Ave", prefix: "", suffix: "",
    });
  });

  it("parses full-form with prefix and suffix", () => {
    expect(parseStreet("N Main Street NW")).toEqual({
      name: "Main", type: "St", prefix: "N", suffix: "NW",
    });
  });
});

describe("streetsMatch", () => {
  it("matches same street with abbreviation vs full form", () => {
    expect(streetsMatch("Park Avenue", "Park Ave")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(streetsMatch("park ave", "Park Ave")).toBe(true);
  });

  it("matches prefix with abbreviation difference", () => {
    expect(streetsMatch("N Main St", "N Main Street")).toBe(true);
  });

  it("rejects different street names", () => {
    expect(streetsMatch("Main St", "Oak St")).toBe(false);
  });

  it("rejects different street types", () => {
    expect(streetsMatch("Main St", "Main Ave")).toBe(false);
  });

  it("rejects different suffixes", () => {
    expect(streetsMatch("Main St NW", "Main St SE")).toBe(false);
  });

  it("matches streets with no type", () => {
    expect(streetsMatch("FM 407", "FM 407")).toBe(true);
  });

  it("matches when one side has a type and the other does not", () => {
    expect(streetsMatch("Park", "Park Ave")).toBe(true);
  });
});
