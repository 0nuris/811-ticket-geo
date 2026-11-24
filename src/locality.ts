import type { Intersection, ReverseGeocodeResult, WorkLocality } from "./types.js";

/**
 * The ticket's county, place and zip. A good intersection can sit across a county
 * or city line from the work, so the area around the work wins and the
 * intersection only fills what that leaves blank. See docs/decisions.md,
 * "Ticket county and place".
 */
export function ticketLocality(area: ReverseGeocodeResult | null, intersection: Intersection): WorkLocality {
  return {
    county: area?.containingCounty || area?.county || intersection.county || "",
    city: area?.containingCity || area?.city || intersection.city || "",
    state: area?.state || intersection.state || "",
    stateCode: area?.stateCode || intersection.stateCode || "",
    zip: area?.zip || intersection.zip || "",
  };
}
