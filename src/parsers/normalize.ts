// Expands abbreviated US/Texas road-name forms to the canonical spellings that
// Google's Geocoder matches as an `intersection`-type result. GeoNames/TIGER
// emits forms like "Co Rd 128" or "US Hwy 87" that Google often won't resolve as
// an intersection; the expanded forms ("County Road 128", "US Highway 87") do.
//
// Standard suffixes/directionals follow USPS Publication 28; the road-class
// prefixes (County Road, Farm to Market, Ranch to Market) are TIGER/Texas
// conventions not covered by the USPS suffix table.
//
// Ordered: multi-word and qualified forms first so "US Hwy" -> "US Highway"
// resolves before the bare "Hwy" -> "Highway" rule.
const REPLACEMENTS: Array<[RegExp, string]> = [
  [/\bCo\.?\s+Rd\b/gi, "County Road"],
  [/\bCnty\.?\s+Rd\b/gi, "County Road"],
  [/\bUS\s+Hwy\b/gi, "US Highway"],
  [/\b(?:State|St)\s+Hwy\b/gi, "State Highway"],
  [/\bRanch\s+Rd\b/gi, "Ranch Road"],
  [/\bFM\b/gi, "Farm to Market"],
  [/\bRM\b/gi, "Ranch to Market"],
  [/\bHwy\b/gi, "Highway"],
  // Standalone directionals (compounds first).
  [/\bNE\b/g, "Northeast"],
  [/\bNW\b/g, "Northwest"],
  [/\bSE\b/g, "Southeast"],
  [/\bSW\b/g, "Southwest"],
  [/\bN\b/g, "North"],
  [/\bS\b/g, "South"],
  [/\bE\b/g, "East"],
  [/\bW\b/g, "West"],
];

/** Expands abbreviated road-name forms to canonical spellings for geocoding. */
export function normalizeRoadName(name: string): string {
  let out = (name || "").trim().replace(/\s+/g, " ");
  for (const [pattern, replacement] of REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, " ").trim();
}
