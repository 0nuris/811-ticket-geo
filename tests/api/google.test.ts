import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  findNearestRoadPoint,
  reverseGeocode,
  geocodeIntersection,
  computeRoute,
  buildIntersectionQueries,
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
          types: ["intersection"],
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
      verified: true,
    });
  });

  // Ticket 5390P (rejected draft, 2026-11-20): work area in Keller, TX; the user
  // typed "Main & Johnson" and the ticket was drafted from Lynnwood-Pricedale, PA.
  const keller5390P = [
    { lat: 32.943752726620374, lng: -97.25124478340149 },
    { lat: 32.94182591572986, lng: -97.25118041038515 },
    { lat: 32.94178089628186, lng: -97.25278973579408 },
    { lat: 32.943806748750504, lng: -97.25380897521974 },
  ];
  const kellerContext = { area: keller5390P, city: "Keller", stateCode: "TX" };

  function geocodeResponse(results: Array<Record<string, unknown>>) {
    return { ok: true, json: async () => ({ status: "OK", results }) };
  }

  function requestedParams(): URLSearchParams {
    return new URL(mockFetch.mock.calls[0][0] as string).searchParams;
  }

  it("rejects the partial-match transit stops Google returns for bare cross-street text", async () => {
    mockFetch.mockResolvedValueOnce(geocodeResponse([
      {
        formatted_address: "Main / Johnson, Visalia, CA 93291, USA",
        types: ["establishment", "point_of_interest", "transit_station"],
        partial_match: true,
        address_components: [],
        geometry: { location: { lat: 36.3300267, lng: -119.2994027 } },
      },
      {
        formatted_address: "Main @ Johnson, Lynnwood-Pricedale, PA 15012, USA",
        types: ["establishment", "point_of_interest", "transit_station"],
        partial_match: true,
        address_components: [
          { types: ["locality"], long_name: "Lynnwood-Pricedale", short_name: "Lynnwood-Pricedale" },
          { types: ["administrative_area_level_2"], long_name: "Westmoreland County", short_name: "Westmoreland County" },
        ],
        geometry: { location: { lat: 40.137286, lng: -79.85638 } },
      },
    ]));

    expect(await geocodeIntersection("test-key", "Main & Johnson")).toBeNull();
  });

  it("scopes the query to the work area's locality, state, and surroundings", async () => {
    mockFetch.mockResolvedValueOnce(geocodeResponse([]));

    await geocodeIntersection("test-key", "Main & Johnson", kellerContext);

    const params = requestedParams();
    expect(params.get("address")).toBe("Main & Johnson, Keller, TX");
    expect(params.get("components")).toBe("country:US|administrative_area:TX");
    const [sw, ne] = params.get("bounds")!.split("|").map((p) => p.split(",").map(Number));
    expect(sw[0]).toBeLessThan(32.9417);
    expect(sw[1]).toBeLessThan(-97.2538);
    expect(ne[0]).toBeGreaterThan(32.9438);
    expect(ne[1]).toBeGreaterThan(-97.2512);
  });

  it("rejects a road-level partial match near the site because it is not an intersection", async () => {
    mockFetch.mockResolvedValueOnce(geocodeResponse([{
      formatted_address: "N Main St, Keller, TX, USA",
      types: ["route"],
      partial_match: true,
      address_components: [],
      geometry: { location: { lat: 32.9529711, lng: -97.2543608 } },
    }]));

    expect(await geocodeIntersection("test-key", "Main & Johnson", kellerContext)).toBeNull();
  });

  it("skips an intersection farther than 8 km from the work area and takes the nearby one", async () => {
    mockFetch.mockResolvedValueOnce(geocodeResponse([
      {
        formatted_address: "N Main St & Johnson Ave, Cleburne, TX 76031, USA",
        types: ["intersection"],
        address_components: [],
        geometry: { location: { lat: 32.3917976, lng: -97.3894157 } },
      },
      {
        formatted_address: "N Main St & Johnson Rd, Keller, TX 76248, USA",
        types: ["intersection"],
        address_components: [
          { types: ["locality"], long_name: "Keller", short_name: "Keller" },
          { types: ["administrative_area_level_2"], long_name: "Tarrant County", short_name: "Tarrant County" },
          { types: ["administrative_area_level_1"], long_name: "Texas", short_name: "TX" },
          { types: ["postal_code"], long_name: "76248", short_name: "76248" },
        ],
        geometry: { location: { lat: 32.9417163, lng: -97.2538407 } },
      },
    ]));

    const result = await geocodeIntersection("test-key", "Main & Johnson Rd", kellerContext);

    expect(result).toEqual({
      name: "N Main St & Johnson Rd",
      street1: "N Main St",
      street2: "Johnson Rd",
      lat: 32.9417163,
      lng: -97.2538407,
      city: "Keller",
      county: "Tarrant County",
      state: "Texas",
      stateCode: "TX",
      zip: "76248",
      verified: true,
    });
  });

  it("returns null when the only intersection is beyond 8 km of the work area", async () => {
    mockFetch.mockResolvedValueOnce(geocodeResponse([{
      formatted_address: "N Main St & Johnson Ave, Cleburne, TX 76031, USA",
      types: ["intersection"],
      address_components: [],
      geometry: { location: { lat: 32.3917976, lng: -97.3894157 } },
    }]));

    expect(await geocodeIntersection("test-key", "Main St & Johnson Ave", kellerContext)).toBeNull();
  });

  it("keeps a locality the user typed instead of the work area's city", () => {
    const [typed] = buildIntersectionQueries("Main St & Johnson Rd, Fort Worth", kellerContext);
    expect(typed.address).toBe("Main St & Johnson Rd, Fort Worth");
  });

  it("queries the text as typed, then with road names expanded", () => {
    const queries = buildIntersectionQueries("FM 1171 and  Co Rd 128");
    expect(queries.map((q) => q.address)).toEqual([
      "FM 1171 & Co Rd 128",
      "Farm to Market Road 1171 & County Road 128",
      "FM 1171 & County Road 128",
    ]);
    expect(queries[1].components).toBe("country:US");
    expect(queries[1].bounds).toBeUndefined();
  });

  it("sends one query when expansion changes nothing", () => {
    expect(buildIntersectionQueries("Main St & Johnson Rd", kellerContext)).toHaveLength(1);
  });

  // Measured 2026-11-24: "FM 488 & FM 1124" resolves only expanded, "FM 121" only as typed.
  it("falls back to the expanded spelling when the typed one finds no intersection", async () => {
    mockFetch
      .mockResolvedValueOnce(geocodeResponse([{
        formatted_address: "FM 488, Texas 75840, USA", types: ["route"], partial_match: true,
        address_components: [], geometry: { location: { lat: 31.88, lng: -96.12 } },
      }]))
      .mockResolvedValueOnce(geocodeResponse([{
        formatted_address: "FM1124 & FM488, Texas 75840, USA", types: ["intersection"],
        address_components: [], geometry: { location: { lat: 31.8812, lng: -96.1214 } },
      }]));

    const result = await geocodeIntersection("test-key", "FM 488 & FM 1124", {
      area: [{ lat: 31.8815, lng: -96.1214 }], city: "Fairfield", stateCode: "TX",
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(new URL(mockFetch.mock.calls[1][0] as string).searchParams.get("address"))
      .toBe("Farm to Market Road 488 & Farm to Market Road 1124, Fairfield, TX");
    expect(result?.name).toBe("FM1124 & FM488");
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

describe("computeRoute zero-length routes", () => {
  it("reads a missing distanceMeters as 0, the way Google omits zero values", async () => {
    // Ticket 2681489209: the intersection sat beside the vertex and the route came back with no distanceMeters.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ routes: [{ legs: [{ steps: [], endLocation: { latLng: { latitude: 32.7727, longitude: -96.8053 } } }] }] }),
    });
    const result = await computeRoute("test-key", { lat: 32.7727, lng: -96.8053 }, { lat: 32.7726, lng: -96.8050 });
    expect(result!.distanceMeters).toBe(0);
  });
});
