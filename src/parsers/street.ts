import type { StreetParts } from "../types.js";

const DIRECTIONALS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);

const STREET_TYPES = new Set([
  "Ave", "Blvd", "Cir", "Ct", "Dr", "Expy", "Fwy", "Hwy", "Ln",
  "Loop", "Pass", "Path", "Pkwy", "Pl", "Rd", "Run", "Sq", "St",
  "Ter", "Trl", "Walk", "Way",
]);

const STREET_TYPE_LOOKUP = new Map<string, string>();
for (const t of STREET_TYPES) STREET_TYPE_LOOKUP.set(t.toLowerCase(), t);

const DIRECTIONAL_LOOKUP = new Map<string, string>();
for (const d of DIRECTIONALS) DIRECTIONAL_LOOKUP.set(d.toLowerCase(), d);

export function parseStreet(streetString: string): StreetParts {
  let tokens = streetString.trim().split(/\s+/);
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "")) {
    return { name: streetString.trim(), type: "", prefix: "", suffix: "" };
  }

  let prefix = "";
  let suffix = "";
  let streetType = "";

  if (tokens.length > 1 && DIRECTIONAL_LOOKUP.has(tokens[0].toLowerCase())) {
    prefix = DIRECTIONAL_LOOKUP.get(tokens[0].toLowerCase())!;
    tokens = tokens.slice(1);
  }

  if (tokens.length > 0 && STREET_TYPE_LOOKUP.has(tokens[tokens.length - 1].toLowerCase())) {
    streetType = STREET_TYPE_LOOKUP.get(tokens[tokens.length - 1].toLowerCase())!;
    tokens = tokens.slice(0, -1);

    if (tokens.length > 0 && DIRECTIONAL_LOOKUP.has(tokens[tokens.length - 1].toLowerCase())) {
      suffix = DIRECTIONAL_LOOKUP.get(tokens[tokens.length - 1].toLowerCase())!;
      tokens = tokens.slice(0, -1);
    }
  } else if (
    tokens.length >= 2 &&
    DIRECTIONAL_LOOKUP.has(tokens[tokens.length - 1].toLowerCase())
  ) {
    if (STREET_TYPE_LOOKUP.has(tokens[tokens.length - 2].toLowerCase())) {
      suffix = DIRECTIONAL_LOOKUP.get(tokens[tokens.length - 1].toLowerCase())!;
      streetType = STREET_TYPE_LOOKUP.get(tokens[tokens.length - 2].toLowerCase())!;
      tokens = tokens.slice(0, -2);
    }
  }

  const name = tokens.length > 0 ? tokens.join(" ") : streetString.trim();
  return { name, type: streetType, prefix, suffix };
}
