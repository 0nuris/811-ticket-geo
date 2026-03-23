import { describe, it, expect, vi, beforeEach } from "vitest";
import { findNearestIntersection } from "../../src/api/geonames.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("findNearestIntersection", () => {
  it("returns verified intersection with Google data", async () => {
    // First call: GeoNames
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: {
          street1: "Main St",
          street2: "Oak Ave",
          lat: "33.0",
          lng: "-97.0",
          adminName2: "Tarrant",
          placeName: "Fort Worth",
          adminName1: "Texas",
          adminCode1: "TX",
          postalcode: "76101",
        },
      }),
    });

    // Second call: Google validates (geocode request)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["intersection"],
          address_components: [
            { types: ["locality"], long_name: "Fort Worth", short_name: "Fort Worth" },
            { types: ["administrative_area_level_2"], long_name: "Tarrant County", short_name: "Tarrant County" },
            { types: ["administrative_area_level_1"], long_name: "Texas", short_name: "TX" },
          ],
          geometry: { location: { lat: 33.001, lng: -97.001 } },
        }],
      }),
    });

    const result = await findNearestIntersection("google-key", "geouser", 33.0, -97.0);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Main St & Oak Ave");
    expect(result!.street1).toBe("Main St");
    expect(result!.street2).toBe("Oak Ave");
  });

  it("returns null when GeoNames returns no intersection", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: {} }),
    });

    const result = await findNearestIntersection("google-key", "geouser", 33.0, -97.0);
    expect(result).toBeNull();
  });

  it("prefers intersection matching preferred road", async () => {
    // GeoNames returns two candidates
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "Main St", street2: "Oak Ave", lat: "33.001", lng: "-97.001", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
        ],
      }),
    });

    // Google validates first candidate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.0, lng: -97.0 } } }],
      }),
    });

    // Google validates second candidate
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.001, lng: -97.001 } } }],
      }),
    });

    const result = await findNearestIntersection("google-key", "geouser", 33.0, -97.0, {
      preferredRoad: "Main St",
    });
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Main St & Oak Ave");
  });
});
