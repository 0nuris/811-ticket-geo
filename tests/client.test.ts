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

describe("TicketGeoClient.selectShortestRouteIntersection", () => {
  it("returns null for empty coordinates", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    const result = await client.selectShortestRouteIntersection([]);
    expect(result).toBeNull();
  });

  it("selects the candidate with the shortest routed distance to its nearest polygon coordinate", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          {
            street1: "Elm St",
            street2: "1st Ave",
            lat: "33.0",
            lng: "-97.0",
            adminName2: "",
            placeName: "",
            adminName1: "",
            adminCode1: "",
            postalcode: "",
          },
          {
            street1: "Main St",
            street2: "Oak Ave",
            lat: "33.001",
            lng: "-96.999",
            adminName2: "",
            placeName: "",
            adminName1: "",
            adminCode1: "",
            postalcode: "",
          },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.0, lng: -97.0 } } }],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.001, lng: -96.999 } } }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St",
      lat: 33.0,
      lng: -97.0,
    });

    vi.spyOn(client, "computeRoute").mockImplementation(async (origin) => {
      const distanceMeters = origin.lat === 33.001 ? 100 : 300;
      return {
        steps: [],
        distanceMeters,
      };
    });

    const result = await client.selectShortestRouteIntersection(
      [
        { lat: 33.0, lng: -97.0 },
        { lat: 33.001, lng: -97.0 },
        { lat: 33.001, lng: -96.999 },
        { lat: 33.0, lng: -96.999 },
      ],
      { snappedPoint: { lat: 33.0, lng: -97.0 }, maxCandidates: 2 }
    );

    expect(result).not.toBeNull();
    expect(result!.intersection.name).toBe("Main St & Oak Ave");
    expect(result!.nearestCoordinate).toEqual({ lat: 33.001, lng: -96.999 });
    expect(result!.route.distanceMeters).toBe(100);
  });

  it("skips reverseGeocode when preferredRoad is provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.0, lng: -97.0 } } }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    const reverseGeocode = vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Elm St",
      lat: 33.0,
      lng: -97.0,
    });

    vi.spyOn(client, "computeRoute").mockResolvedValue({
      steps: [],
      distanceMeters: 100,
    });

    await client.selectShortestRouteIntersection(
      [{ lat: 33.0, lng: -97.0 }],
      { snappedPoint: { lat: 33.0, lng: -97.0 }, preferredRoad: "Elm St" }
    );

    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it("calls reverseGeocode when preferredRoad is omitted", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.0, lng: -97.0 } } }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    const reverseGeocode = vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Elm St",
      lat: 33.0,
      lng: -97.0,
    });

    vi.spyOn(client, "computeRoute").mockResolvedValue({
      steps: [],
      distanceMeters: 100,
    });

    await client.selectShortestRouteIntersection(
      [{ lat: 33.0, lng: -97.0 }],
      { snappedPoint: { lat: 33.0, lng: -97.0 } }
    );

    expect(reverseGeocode).toHaveBeenCalledOnce();
  });

  it("routes one candidate per cardinal quadrant, deduplicating same-quadrant candidates", async () => {
    // 3 candidates: two to the north (same quadrant), one to the south.
    // Snap point is at 33.0, -97.0.
    // "Far North" at 33.01 and "Near North" at 33.005 are both due north (quadrant 0).
    // "South" at 32.999 is due south (quadrant 2).
    // Only 2 routes should be computed: nearest-north + south.
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Far North St", street2: "1st Ave", lat: "33.01", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "Near North St", street2: "2nd Ave", lat: "33.005", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "South St", street2: "3rd Ave", lat: "32.999", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
        ],
      }),
    });

    // Google validates each with its own coordinates
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.01, lng: -97.0 } } }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.005, lng: -97.0 } } }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 32.999, lng: -97.0 } } }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St",
      lat: 33.0,
      lng: -97.0,
    });

    const computeRoute = vi.spyOn(client, "computeRoute").mockResolvedValue({
      steps: [],
      distanceMeters: 100,
    });

    await client.selectShortestRouteIntersection(
      [{ lat: 33.0, lng: -97.0 }],
      { snappedPoint: { lat: 33.0, lng: -97.0 }, maxCandidates: 3 }
    );

    // 2 quadrants populated (north + south), so 2 routes
    expect(computeRoute).toHaveBeenCalledTimes(2);
  });

  it("allows an unverified candidate to win when it survives quadrant selection and has the shortest route", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "East St", street2: "Oak Ave", lat: "33.0", lng: "-96.999", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "West St", street2: "Pine Ave", lat: "33.0", lng: "-97.001", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
        ],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ZERO_RESULTS",
        results: [],
      }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.0, lng: -97.001 } } }],
      }),
    });

    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St",
      lat: 33.0,
      lng: -97.0,
    });

    const computeRoute = vi.spyOn(client, "computeRoute").mockImplementation(async (origin) => ({
      steps: [],
      distanceMeters: origin.lng === -96.999 ? 80 : 150,
    }));

    const result = await client.selectShortestRouteIntersection(
      [
        { lat: 33.0, lng: -97.0 },
        { lat: 33.0, lng: -96.999 },
        { lat: 33.001, lng: -96.999 },
        { lat: 33.001, lng: -97.0 },
      ],
      { snappedPoint: { lat: 33.0, lng: -97.0 }, maxCandidates: 2 }
    );

    expect(computeRoute).toHaveBeenCalledTimes(2);
    expect(result).not.toBeNull();
    expect(result!.intersection.name).toBe("East St & Oak Ave (unverified)");
    expect(result!.nearestCoordinate).toEqual({ lat: 33.0, lng: -96.999 });
    expect(result!.route.distanceMeters).toBe(80);
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

  it("uses a successfully geocoded manual intersection without falling back to nearest-intersection lookup", async () => {
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
    const geocodeIntersection = vi.spyOn(client, "geocodeIntersection").mockResolvedValue(intersection);
    const findNearestIntersection = vi.spyOn(client, "findNearestIntersection").mockResolvedValue(null);
    const computeRoute = vi.spyOn(client, "computeRoute").mockResolvedValue(finalRoute);

    await client.processSite(coordinates, {
      intersectionOverride: intersection.name,
    });

    expect(geocodeIntersection).toHaveBeenCalledWith(intersection.name);
    expect(findNearestIntersection).not.toHaveBeenCalled();
    expect(computeRoute).toHaveBeenCalledWith(
      intersection,
      { lat: 33.001, lng: -96.999 },
      expect.any(Number)
    );
  });

  it("throws when processSite receives empty coordinates with an intersection override", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([]);
    vi.spyOn(client, "geocodeIntersection").mockResolvedValue(intersection);

    await expect(
      client.processSite([], { intersectionOverride: intersection.name })
    ).rejects.toThrow();
  });

  it("throws when intersection override fails to geocode", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 },
    ]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St",
      lat: 33.0,
      lng: -97.0,
    });
    vi.spyOn(client, "geocodeIntersection").mockResolvedValue(null);

    await expect(
      client.processSite(coordinates, { intersectionOverride: "Fake St & Nowhere Ave" })
    ).rejects.toThrow("could not be geocoded");
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

  it("auto-selects shortest-route intersection when no override is provided", async () => {
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

    const selectShortestRouteIntersection = vi
      .spyOn(client, "selectShortestRouteIntersection")
      .mockResolvedValue({
        intersection,
        nearestCoordinate: { lat: 33.001, lng: -96.999 },
        route: finalRoute,
      });

    const result = await client.processSite(coordinates);

    expect(selectShortestRouteIntersection).toHaveBeenCalled();
    expect(result.intersection.name).toBe("Main St & Oak Ave");
    expect(result.coordinates[0]).toEqual({ lat: 33.001, lng: -96.999 });
  });

  // Far-from-road work areas (new construction / raw land) make the Roads API
  // return no snapped points. That must not be fatal: reverse-geocode the
  // centroid onto the nearest road and search the intersection from there.
  const onRoadAnchor = {
    street: "Ranch Rd 12",
    city: "Dripping Springs",
    county: "Hays",
    state: "Texas",
    stateCode: "TX",
    zip: "78620",
    lat: 30.189,
    lng: -98.087,
  };

  it("falls back to the reverse-geocoded centroid when Roads snapping returns no points", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([]);
    const reverseGeocode = vi.spyOn(client, "reverseGeocode").mockResolvedValue(onRoadAnchor);
    const select = vi
      .spyOn(client, "selectShortestRouteIntersection")
      .mockResolvedValue({
        intersection,
        nearestCoordinate: { lat: 33.001, lng: -96.999 },
        route: finalRoute,
      });

    const result = await client.processSite(coordinates);

    expect(result.intersection.name).toBe("Main St & Oak Ave");
    expect(reverseGeocode).toHaveBeenCalled();
    // intersection search must be centered on the on-road anchor, not the raw centroid
    expect(select).toHaveBeenCalledWith(
      coordinates,
      expect.objectContaining({ snappedPoint: { lat: 30.189, lng: -98.087 } })
    );
  });

  it("falls back when the Roads API throws 'no snapped points' (production path)", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockRejectedValue(
      new Error("Roads API returned no snapped points")
    );
    vi.spyOn(client, "reverseGeocode").mockResolvedValue(onRoadAnchor);
    vi.spyOn(client, "selectShortestRouteIntersection").mockResolvedValue({
      intersection,
      nearestCoordinate: { lat: 33.001, lng: -96.999 },
      route: finalRoute,
    });

    const result = await client.processSite(coordinates);
    expect(result.intersection.name).toBe("Main St & Oak Ave");
  });

  it("throws a clear error when the work area is not near any locatable road", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue(null);

    await expect(client.processSite(coordinates)).rejects.toThrow(/not near any/i);
  });

  it("asks for a manual intersection when no nearby intersection can be determined", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue(onRoadAnchor);
    vi.spyOn(client, "selectShortestRouteIntersection").mockResolvedValue(null);

    await expect(client.processSite(coordinates)).rejects.toThrow(
      /provide a nearby intersection manually/i
    );
  });

  // New subdivisions: the interior streets snap tightly but have no GeoNames
  // intersection within the (free-tier-capped) 1 km radius, while the bounding
  // roads at the polygon's edges do. The single tightest-snap search therefore
  // fails on exactly the point that can't resolve. When the primary search
  // comes back empty, retry from the bounding-box extreme vertices and keep the
  // shortest routed result.
  it("falls back to boundary-extreme vertices when the primary snapped point yields no intersection, choosing the shortest route", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    // idx4 (interior) snaps exactly onto the road → becomes the primary search
    // point. idx0..3 are the bbox extremes (min/max lat, min/max lng) and snap
    // slightly off-vertex. Each origin gets a distinct lng so the mock can route
    // by snapped point.
    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: { lat: 33.0001, lng: -96.98 }, originalIndex: 0 }, // min lat
      { location: { lat: 33.0201, lng: -96.987 }, originalIndex: 1 }, // max lat
      { location: { lat: 33.01, lng: -96.9999 }, originalIndex: 2 }, // min lng
      { location: { lat: 33.01, lng: -96.9701 }, originalIndex: 3 }, // max lng
      { location: { lat: 33.01, lng: -96.985 }, originalIndex: 4 }, // interior → primary
    ]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Interior Dr",
      city: "Celina",
      county: "Denton",
      state: "Texas",
      stateCode: "TX",
      zip: "75009",
      lat: 33.01,
      lng: -96.985,
    });

    const westResult = {
      intersection: { ...intersection, name: "West Gate & Frontage" },
      nearestCoordinate: { lat: 33.01, lng: -97.0 },
      route: { ...finalRoute, distanceMeters: 500 },
    };
    const eastResult = {
      intersection: { ...intersection, name: "East Gate & Frontage" },
      nearestCoordinate: { lat: 33.01, lng: -96.97 },
      route: { ...finalRoute, distanceMeters: 200 },
    };

    const select = vi
      .spyOn(client, "selectShortestRouteIntersection")
      .mockImplementation(async (_coords, opts) => {
        const lng = opts?.snappedPoint?.lng;
        if (lng === -96.9701) return eastResult; // idx3 corner — shortest route
        if (lng === -96.9999) return westResult; // idx2 corner — longer route
        return null; // primary (interior) and the remaining corners: nothing
      });

    const coords: Coordinate[] = [
      { lat: 33.0, lng: -96.98 },
      { lat: 33.02, lng: -96.987 },
      { lat: 33.01, lng: -97.0 },
      { lat: 33.01, lng: -96.97 },
      { lat: 33.01, lng: -96.985 },
    ];

    const result = await client.processSite(coords);

    // Primary point returned null, so the fallback must have searched more points.
    expect(select.mock.calls.length).toBeGreaterThan(1);
    // The shortest routed candidate among the boundary vertices wins.
    expect(result.intersection.name).toBe("East Gate & Frontage");
  });

  it("adds an off-road final-approach note when the boundary point is set back from the road", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 },
    ]);
    // Nearest road sits ~145 m from the arrival boundary point (33.001, -96.999).
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "W Dove Rd", city: "Westlake", county: "Tarrant",
      state: "Texas", stateCode: "TX", zip: "76262", lat: 33.0, lng: -97.0,
    });
    vi.spyOn(client, "selectShortestRouteIntersection").mockResolvedValue({
      intersection,
      nearestCoordinate: { lat: 33.001, lng: -96.999 },
      route: finalRoute,
    });

    const result = await client.processSite(coordinates);
    expect(result.directionsText).toContain("Work area is about");
    expect(result.directionsText).toContain("off W Dove Rd");
    expect(result.directionsText).toContain("enter the site (off-road)");
  });
});
