import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findNearestRoadPoint,
  reverseGeocode,
  geocodeIntersection,
  computeRoute,
} from "../../src/api/google.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("findNearestRoadPoint", () => {
  it("returns snapped points with normalized coordinates", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snappedPoints: [
          { location: { latitude: 33.001, longitude: -97.001 }, originalIndex: 0 },
        ],
      }),
    });

    const result = await findNearestRoadPoint("test-key", [
      { lat: 33.0, lng: -97.0 },
    ]);
    expect(result).toEqual([
      { location: { lat: 33.001, lng: -97.001 }, originalIndex: 0 },
    ]);
  });

  it("returns null when no snapped points", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: "no points" }),
    });

    const result = await findNearestRoadPoint("test-key", [
      { lat: 33.0, lng: -97.0 },
    ]);
    expect(result).toBeNull();
  });
});

describe("reverseGeocode", () => {
  it("parses address components from route result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["street_address"],
          address_components: [
            { types: ["route"], long_name: "Main St", short_name: "Main St" },
            { types: ["locality"], long_name: "Dallas", short_name: "Dallas" },
            { types: ["administrative_area_level_2"], long_name: "Dallas County", short_name: "Dallas County" },
            { types: ["administrative_area_level_1"], long_name: "Texas", short_name: "TX" },
            { types: ["postal_code"], long_name: "75201", short_name: "75201" },
          ],
          geometry: { location: { lat: 32.78, lng: -96.80 } },
        }],
      }),
    });

    const result = await reverseGeocode("test-key", 32.78, -96.80);
    expect(result).toEqual({
      street: "Main St",
      city: "Dallas",
      county: "Dallas County",
      state: "Texas",
      stateCode: "TX",
      zip: "75201",
      lat: 32.78,
      lng: -96.80,
    });
  });

  it("returns null when no route/street_address result", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "OK", results: [] }),
    });

    const result = await reverseGeocode("test-key", 32.78, -96.80);
    expect(result).toBeNull();
  });
});

describe("geocodeIntersection", () => {
  it("parses intersection from address string with &", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          address_components: [
            { types: ["locality"], long_name: "Dallas", short_name: "Dallas" },
            { types: ["administrative_area_level_2"], long_name: "Dallas County", short_name: "Dallas County" },
            { types: ["administrative_area_level_1"], long_name: "Texas", short_name: "TX" },
            { types: ["postal_code"], long_name: "75201", short_name: "75201" },
          ],
          geometry: { location: { lat: 32.78, lng: -96.80 } },
        }],
      }),
    });

    const result = await geocodeIntersection("test-key", "Main St & Oak Ave, Dallas, TX");
    expect(result).toEqual({
      name: "Main St & Oak Ave",
      street1: "Main St",
      street2: "Oak Ave",
      lat: 32.78,
      lng: -96.80,
      city: "Dallas",
      county: "Dallas County",
      state: "Texas",
      stateCode: "TX",
      zip: "75201",
    });
  });

  it("returns null when geocode fails", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: "ZERO_RESULTS", results: [] }),
    });

    const result = await geocodeIntersection("test-key", "Nonexistent & Nowhere");
    expect(result).toBeNull();
  });
});

describe("computeRoute", () => {
  it("returns route result preferring no-uturn routes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [
          {
            distanceMeters: 500,
            legs: [{
              steps: [
                {
                  navigationInstruction: { maneuver: "DEPART", instructions: "Make a u-turn" },
                  localizedValues: { distance: { text: "0.3 mi" } },
                  startLocation: { latLng: { latitude: 33.0, longitude: -97.0 } },
                },
              ],
              localizedValues: { distance: { text: "0.3 mi" }, duration: { text: "1 min" } },
            }],
          },
          {
            distanceMeters: 600,
            legs: [{
              steps: [
                {
                  navigationInstruction: { maneuver: "DEPART", instructions: "Head north" },
                  localizedValues: { distance: { text: "0.4 mi" } },
                  startLocation: { latLng: { latitude: 33.0, longitude: -97.0 } },
                },
              ],
              localizedValues: { distance: { text: "0.4 mi" }, duration: { text: "2 min" } },
            }],
          },
        ],
      }),
    });

    const result = await computeRoute("test-key",
      { lat: 33.0, lng: -97.0 },
      { lat: 33.005, lng: -96.995 }
    );
    expect(result).not.toBeNull();
    // Should pick the non-uturn route (second one, distanceMeters 600)
    expect(result!.distanceMeters).toBe(600);
    expect(result!.steps[0].navigationInstruction?.instructions).toBe("Head north");
  });

  it("returns null when no routes", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ routes: [] }),
    });

    const result = await computeRoute("test-key",
      { lat: 33.0, lng: -97.0 },
      { lat: 33.005, lng: -96.995 }
    );
    expect(result).toBeNull();
  });
});
