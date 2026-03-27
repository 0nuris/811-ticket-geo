import { describe, it, expect, vi, beforeEach } from "vitest";
import { TicketGeoClient } from "../src/client.js";
import type { Coordinate, Intersection, RouteResult } from "../src/types.js";

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

describe("TicketGeoClient.processSite", () => {
  const coordinates: Coordinate[] = [
    { lat: 33.0, lng: -97.0 },
    { lat: 33.001, lng: -97.0 },
    { lat: 33.001, lng: -96.999 },
    { lat: 33.0, lng: -96.999 },
  ];

  const intersection: Intersection = {
    name: "Main St & Oak Ave",
    street1: "Main St",
    street2: "Oak Ave",
    lat: 33.0013,
    lng: -96.9987,
    county: "Tarrant",
    city: "Fort Worth",
    state: "Texas",
    stateCode: "TX",
    zip: "76101",
  };

  const finalRoute: RouteResult = {
    steps: [
      {
        navigationInstruction: { maneuver: "DEPART", instructions: "Head west on Oak Ave" },
        localizedValues: { distance: { text: "300 ft" }, duration: { text: "1 min" } },
        startLocation: { latLng: { latitude: 33.0013, longitude: -96.9987 } },
      },
    ],
    distanceMeters: 120,
    localizedValues: { distance: { text: "300 ft" }, duration: { text: "1 min" } },
  };

  it("routes to the boundary point nearest the intersection and rotates it to index 0", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 },
    ]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St",
      city: "Fort Worth",
      county: "Tarrant",
      state: "Texas",
      stateCode: "TX",
      zip: "76101",
      lat: 33.0,
      lng: -97.0,
    });
    vi.spyOn(client, "geocodeIntersection").mockResolvedValue(intersection);
    const computeRoute = vi.spyOn(client, "computeRoute").mockResolvedValue(finalRoute);

    const result = await client.processSite(coordinates, {
      intersectionOverride: intersection.name,
    });

    expect(computeRoute).toHaveBeenCalledWith(
      intersection,
      { lat: 33.001, lng: -96.999 },
      expect.any(Number)
    );
    expect(result.coordinates).toEqual([
      { lat: 33.001, lng: -96.999 },
      { lat: 33.0, lng: -96.999 },
      { lat: 33.0, lng: -97.0 },
      { lat: 33.001, lng: -97.0 },
    ]);
    expect(result.directionsText).toContain("to 33.001, -96.999");
    expect(result.markingText).toContain("Start: 33.001, -96.999");
  });

  it("keeps the loop instructions walking the rotated points before returning to the start", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 },
    ]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St",
      city: "Fort Worth",
      county: "Tarrant",
      state: "Texas",
      stateCode: "TX",
      zip: "76101",
      lat: 33.0,
      lng: -97.0,
    });
    vi.spyOn(client, "geocodeIntersection").mockResolvedValue(intersection);
    vi.spyOn(client, "computeRoute").mockResolvedValue(finalRoute);

    const result = await client.processSite(coordinates, {
      intersectionOverride: intersection.name,
    });

    const firstHop = result.markingText.indexOf("to 33, -96.999");
    const secondHop = result.markingText.indexOf("to 33, -97");
    const thirdHop = result.markingText.indexOf("to 33.001, -97");
    const returnHop = result.markingText.indexOf("to 33.001, -96.999");
    const returnToStart = result.markingText.indexOf("Returns to start point (33.001, -96.999)");

    expect(firstHop).toBeGreaterThan(-1);
    expect(secondHop).toBeGreaterThan(firstHop);
    expect(thirdHop).toBeGreaterThan(secondHop);
    expect(returnHop).toBeGreaterThan(thirdHop);
    expect(returnToStart).toBeGreaterThan(returnHop);
  });
});
