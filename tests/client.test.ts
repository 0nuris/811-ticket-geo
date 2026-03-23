import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketGeoClient } from "../src/client.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe("TicketGeoClient", () => {
  it("constructs with config", () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });
    expect(client).toBeInstanceOf(TicketGeoClient);
  });
});

describe("TicketGeoClient.findNearestRoadPoint", () => {
  it("delegates to Google Roads API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        snappedPoints: [
          { location: { latitude: 33.001, longitude: -97.001 }, originalIndex: 0 },
        ],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });
    const result = await client.findNearestRoadPoint([{ lat: 33.0, lng: -97.0 }]);
    expect(result).toHaveLength(1);
    expect(result[0].location).toEqual({ lat: 33.001, lng: -97.001 });
  });
});

describe("TicketGeoClient.reverseGeocode", () => {
  it("delegates to Google Geocoding API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["street_address"],
          address_components: [
            { types: ["route"], long_name: "Main St", short_name: "Main St" },
          ],
          geometry: { location: { lat: 33.0, lng: -97.0 } },
        }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });
    const result = await client.reverseGeocode(33.0, -97.0);
    expect(result).not.toBeNull();
    expect(result!.street).toBe("Main St");
  });
});

describe("TicketGeoClient.geocodeIntersection", () => {
  it("delegates to Google Geocoding API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          address_components: [],
          geometry: { location: { lat: 33.0, lng: -97.0 } },
        }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });
    const result = await client.geocodeIntersection("Main St & Oak Ave");
    expect(result).not.toBeNull();
    expect(result!.street1).toBe("Main St");
  });
});

describe("TicketGeoClient.computeRoute", () => {
  it("delegates to Google Routes API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        routes: [{
          distanceMeters: 500,
          legs: [{
            steps: [{
              navigationInstruction: { maneuver: "DEPART", instructions: "Head north" },
              localizedValues: {},
              startLocation: { latLng: { latitude: 33.0, longitude: -97.0 } },
            }],
            localizedValues: {},
          }],
        }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });
    const result = await client.computeRoute(
      { lat: 33.0, lng: -97.0 },
      { lat: 33.005, lng: -96.995 }
    );
    expect(result).not.toBeNull();
    expect(result!.distanceMeters).toBe(500);
  });
});
