import { describe, it, expect } from "vitest";
import { parseStreet } from "../../src/parsers/street.js";

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
});
