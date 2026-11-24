import { describe, it, expect } from "vitest";
import { ticketLocality } from "../src/locality.js";
import type { Intersection, ReverseGeocodeResult } from "../src/types.js";

const intersection: Intersection = {
  name: "Lookout Dr & Telecom Pkwy",
  street1: "Lookout Dr",
  street2: "Telecom Pkwy",
  lat: 32.99,
  lng: -96.69,
  county: "Dallas County",
  city: "Garland",
  state: "Texas",
  stateCode: "TX",
  zip: "75044",
};

describe("ticketLocality", () => {
  it("takes the work area's county and city over an intersection across the line (ticket 2681951615)", () => {
    const area: ReverseGeocodeResult = {
      street: "Telecom Pkwy",
      city: "Richardson",
      county: "Collin County",
      containingCounty: "Collin County",
      containingCity: "Richardson",
      state: "Texas",
      stateCode: "TX",
      zip: "75082",
      lat: 32.995,
      lng: -96.69,
    };
    expect(ticketLocality(area, intersection)).toEqual({
      county: "Collin County",
      city: "Richardson",
      state: "Texas",
      stateCode: "TX",
      zip: "75082",
    });
  });

  it("prefers the containing county to the matched road's (ticket 2681624558)", () => {
    const area: ReverseGeocodeResult = { street: "Newton Dr", county: "Denton County", containingCounty: "Collin County", lat: 33.1, lng: -96.83 };
    expect(ticketLocality(area, intersection).county).toBe("Collin County");
  });

  it("uses the road's city when no locality contains the point", () => {
    const area: ReverseGeocodeResult = { street: "Co Rd 904", city: "Joshua", county: "Johnson County", lat: 32.4, lng: -97.4 };
    expect(ticketLocality(area, intersection)).toMatchObject({ county: "Johnson County", city: "Joshua" });
  });

  it("falls back to the intersection for what the work area leaves blank", () => {
    expect(ticketLocality(null, intersection)).toEqual({
      county: "Dallas County",
      city: "Garland",
      state: "Texas",
      stateCode: "TX",
      zip: "75044",
    });
    expect(ticketLocality({ street: "Main St", lat: 0, lng: 0 }, intersection).city).toBe("Garland");
  });
});
