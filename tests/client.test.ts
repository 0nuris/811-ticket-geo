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

describe("TicketGeoClient.locateWorkArea", () => {
  it("reverse-geocodes the polygon's centroid once", async () => {
    const client = new TicketGeoClient({ googleMapsApiKey: "test-key", geonamesUsername: "test-user" });
    const reverse = vi.spyOn(client, "reverseGeocode").mockResolvedValue({ street: "Main St", containingCounty: "Collin County", lat: 33.0005, lng: -96.9995 });
    const square = [
      { lat: 33.0, lng: -97.0 },
      { lat: 33.001, lng: -97.0 },
      { lat: 33.001, lng: -96.999 },
      { lat: 33.0, lng: -96.999 },
    ];

    const result = await client.locateWorkArea(square);

    expect(reverse).toHaveBeenCalledTimes(1);
    const [lat, lng] = reverse.mock.calls[0];
    expect(lat).toBeCloseTo(33.0005, 6);
    expect(lng).toBeCloseTo(-96.9995, 6);
    expect(result?.containingCounty).toBe("Collin County");
  });

  it("returns null for an empty polygon without a request", async () => {
    const client = new TicketGeoClient({ googleMapsApiKey: "test-key", geonamesUsername: "test-user" });
    const reverse = vi.spyOn(client, "reverseGeocode");
    expect(await client.locateWorkArea([])).toBeNull();
    expect(reverse).not.toHaveBeenCalled();
  });
});

describe("TicketGeoClient.geocodeIntersection", () => {
  it("delegates to Google Geocoding API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["intersection"],
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

  it("does not reverse-geocode for a preferred road the caller did not give", async () => {
    // Every candidate is routed and scored, so the preferred road only orders ties.
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

    const result = await client.selectShortestRouteIntersection(
      [{ lat: 33.0, lng: -97.0 }],
      { snappedPoint: { lat: 33.0, lng: -97.0 } }
    );

    expect(reverseGeocode).not.toHaveBeenCalled();
    expect(result!.intersection.name).toBe("Elm St & 1st Ave");
  });

  it("routes every candidate, including two in the same direction", async () => {
    // 3 candidates: two to the north, one to the south, off a snap point at
    // 33.0, -97.0. All three are routed -- an earlier version kept only the
    // linearly nearest of the two northern candidates and never routed the
    // other, which is how ticket 2673195855 named the wrong intersection.
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

    expect(computeRoute).toHaveBeenCalledTimes(3);
  });

  it("routes a same-quadrant candidate that is linearly farther but a much shorter drive (ticket 2673195855)", async () => {
    // Real geometry from Texas 811 ticket 2673195855. Both intersections sit in
    // quadrant 1 off the snapped point (bearings 49 and 66 degrees):
    //   Hunter Valley Cir & Beth Rd -- 121 m linear, 893 m drive
    //   Avondale Farms Dr & Beth Rd -- 210 m linear, 215 m drive  <- correct
    // The work area fronts Avondale Farms Dr; picking Hunter Valley Cir named an
    // intersection one road over from where the directions actually turn in.
    const polygon = [
      { lat: 32.964932624460815, lng: -97.41036305134332 },
      { lat: 32.96388844037916, lng: -97.40859279339818 },
      { lat: 32.962565189375034, lng: -97.409933897898 },
      { lat: 32.96362739243081, lng: -97.4117685288649 },
      { lat: 32.96414048594272, lng: -97.41135010425953 },
      { lat: 32.96467157959702, lng: -97.41142520611223 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Beth Rd", street2: "Hunter Valley Cir", lat: "32.965472", lng: "-97.409232", adminName2: "Tarrant", placeName: "Fort Worth", adminName1: "Texas", adminCode1: "TX", postalcode: "76052" },
          { street1: "Avondale Farms Dr", street2: "Beth Rd", lat: "32.965389", lng: "-97.407136", adminName2: "Tarrant", placeName: "Fort Worth", adminName1: "Texas", adminCode1: "TX", postalcode: "76052" },
        ],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["intersection"],
          formatted_address: "Hunter Valley Cir & Beth Rd, Fort Worth, TX 76052, USA",
          address_components: [],
          geometry: { location: { lat: 32.965472, lng: -97.409232 } },
        }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["intersection"],
          formatted_address: "Avondale Farms Dr & Beth Rd, Fort Worth, TX 76052, USA",
          address_components: [],
          geometry: { location: { lat: 32.9653675, lng: -97.4071971 } },
        }],
      }),
    });

    const client = new TicketGeoClient({ googleMapsApiKey: "test-key", geonamesUsername: "test-user" });
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({ street: "Beth Rd", lat: 32.96363, lng: -97.41177 });
    vi.spyOn(client, "computeRoute").mockImplementation(async (origin) => ({
      steps: [],
      distanceMeters: origin.lng < -97.408 ? 893 : 215,
    }));

    const result = await client.selectShortestRouteIntersection(polygon, {
      snappedPoint: { lat: 32.96363045404449, lng: -97.41176532426978 },
      preferredRoad: "Beth Rd",
    });

    expect(result!.intersection.street1).toBe("Avondale Farms Dr");
    expect(result!.route.distanceMeters).toBe(215);
  });

  it("allows an unverified candidate to win when it has the shortest route", async () => {
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
    expect(result!.intersection.name).toBe("East St & Oak Ave");
    expect(result!.intersection.verified).toBe(false);
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

    expect(geocodeIntersection).toHaveBeenCalledWith(intersection.name, {
      area: coordinates,
      city: "Fort Worth",
      stateCode: "TX",
    });
    expect(findNearestIntersection).not.toHaveBeenCalled();
    expect(computeRoute).toHaveBeenCalledWith(
      intersection,
      { lat: 33.001, lng: -96.999 },
      expect.any(Number)
    );
  });

  it("gives the ticket the work area's county while the directions start from the intersection's city", async () => {
    const client = new TicketGeoClient({
      googleMapsApiKey: "test-key",
      geonamesUsername: "test-user",
    });

    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 },
    ]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Telecom Pkwy",
      city: "Richardson",
      county: "Collin County",
      containingCounty: "Collin County",
      containingCity: "Richardson",
      state: "Texas",
      stateCode: "TX",
      zip: "75082",
      lat: 33.0,
      lng: -97.0,
    });
    const acrossTheLine = { ...intersection, county: "Dallas County", city: "Garland" };
    vi.spyOn(client, "geocodeIntersection").mockResolvedValue(acrossTheLine);
    vi.spyOn(client, "computeRoute").mockResolvedValue(finalRoute);

    const result = await client.processSite(coordinates, { intersectionOverride: acrossTheLine.name });

    expect(result.workLocality).toMatchObject({ county: "Collin County", city: "Richardson", zip: "75082" });
    expect(result.intersection.county).toBe("Dallas County");
    expect(result.directionsText).toContain("Main St & Oak Ave, Garland, TX");
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
      score: 500,
    };
    const eastResult = {
      intersection: { ...intersection, name: "East Gate & Frontage" },
      nearestCoordinate: { lat: 33.01, lng: -96.97 },
      route: { ...finalRoute, distanceMeters: 200 },
      score: 200,
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

describe("TicketGeoClient intersection choice (measured on 60 RPMx sites)", () => {
  const square: Coordinate[] = [
    { lat: 33.0, lng: -97.0 },
    { lat: 33.001, lng: -97.0 },
    { lat: 33.001, lng: -96.999 },
    { lat: 33.0, lng: -96.999 },
  ];
  const base: Intersection = {
    name: "Main St & Oak Ave", street1: "Main St", street2: "Oak Ave", lat: 33.0015, lng: -97.0005,
    county: "Tarrant", city: "Fort Worth", state: "Texas", stateCode: "TX", zip: "76101",
  };
  const road = (street: string, lat = 33.0, lng = -97.0) => ({
    street, city: "Fort Worth", county: "Tarrant", state: "Texas", stateCode: "TX", zip: "76101", lat, lng,
  });
  function route(distanceMeters: number, maneuvers: string[] = ["DEPART"], endLocation?: Coordinate): RouteResult {
    return {
      distanceMeters,
      steps: maneuvers.map((m) => ({
        navigationInstruction: { maneuver: m, instructions: m === "DEPART" ? "Head south on Main St" : "Take the ramp" },
        localizedValues: { distance: { text: "0.1 mi" } },
        startLocation: { latLng: { latitude: 33.0015, longitude: -97.0005 } },
      })),
      ...(endLocation ? { endLocation } : {}),
    };
  }
  const newClient = () => new TicketGeoClient({ googleMapsApiKey: "k", geonamesUsername: "u" });

  it("prefers a clean drive over a shorter one with a ramp", async () => {
    const client = newClient();
    const ramp = { ...base, name: "Eldorado Pkwy & Dallas Pkwy", street1: "Eldorado Pkwy", street2: "Dallas Pkwy" };
    const clean = { ...base, name: "Newton Dr & Woodsboro Way", lat: 33.0012 };
    vi.spyOn(client, "computeRoute").mockImplementation(async (from) =>
      from === ramp ? route(300, ["DEPART", "RAMP_LEFT"]) : route(600)
    );
    const result = await client.routeCandidates(square, [ramp, clean]);
    expect(result!.intersection.name).toBe("Newton Dr & Woodsboro Way");
    expect(result!.score).toBe(600);
  });

  it("routes to another vertex when the nearest one ends far off-road", async () => {
    const client = newClient();
    const far = { lat: 33.0037, lng: -97.0 }; // ~300 m from the nearest vertex
    vi.spyOn(client, "computeRoute").mockImplementation(async (_from, to) =>
      to.lat === 33.001 && to.lng === -97.0 ? route(120, ["DEPART"], far) : route(500, ["DEPART"], to)
    );
    const result = await client.routeCandidates(square, [base]);
    expect(result!.nearestCoordinate).not.toEqual({ lat: 33.001, lng: -97.0 });
    expect(result!.score).toBe(500);
  });

  it("measures the off-road walk from where the drive stops, not the reverse-geocode point", async () => {
    // Ticket 2681952067 (Hardeman): the vertex is 49 m from the road, but the
    // reverse-geocode result sat mid-road ~840 m away and printed 2,763 ft.
    const client = newClient();
    const vertex = { lat: 33.001, lng: -96.999 };
    const driveEnd = { lat: 33.00056, lng: -96.999 }; // ~49 m south of the vertex
    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([{ location: driveEnd, originalIndex: 2 }]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue(road("4 Corners Rd", 32.9935, -96.999));
    vi.spyOn(client, "selectShortestRouteIntersection").mockResolvedValue({
      intersection: base, nearestCoordinate: vertex, route: route(760, ["DEPART"], driveEnd), score: 860,
    });
    vi.spyOn(client, "computeRoute").mockResolvedValue(null);
    const result = await client.processSite(square);
    expect(result.directionsText).toMatch(/Work area is about 16\d ft north off 4 Corners Rd/);
  });

  it("searches again from a local road when the freeway snap finds only interchanges", async () => {
    // Ticket 2681951640 (Parker): the I-20 snap found only "I-20 & I-30" (a 9-mile
    // loop); a vertex 5 m from Domingo Drive leads to the local crossing.
    const client = newClient();
    const freewaySnap = { lat: 33.0, lng: -97.0 };
    const localSnap = { lat: 33.00104, lng: -97.0 };
    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([
      { location: freewaySnap, originalIndex: 0 },
      { location: localSnap, originalIndex: 1 },
    ]);
    vi.spyOn(client, "reverseGeocode").mockImplementation(async (lat) =>
      lat === localSnap.lat ? road("Domingo Drive", lat) : road("West Freeway", lat)
    );
    const interchange = { ...base, name: "I-20 & I-30", street1: "I-20", street2: "I-30" };
    const localIx = { ...base, name: "Theodora Ln & Rozana St", street1: "Theodora Ln", street2: "Rozana St" };
    const select = vi.spyOn(client, "selectShortestRouteIntersection").mockImplementation(async (_c, opts) =>
      opts?.snappedPoint === localSnap
        ? { intersection: localIx, nearestCoordinate: square[1], route: route(56), score: 56 }
        : { intersection: interchange, nearestCoordinate: square[0], route: route(14876, ["DEPART", "RAMP_RIGHT"]), score: 17876 }
    );
    vi.spyOn(client, "computeRoute").mockResolvedValue(null);
    const result = await client.processSite(square);
    expect(result.intersection.name).toBe("Theodora Ln & Rozana St");
    expect(select).toHaveBeenCalledWith(square, { snappedPoint: localSnap, preferredRoad: "Domingo Drive" });
  });

  it("tries GeoNames rings, then pairs of nearby road names, when nothing is found within 1 km", async () => {
    // Tickets 2682326273 (Tarrant) and 2681951782 (Wilbarger) found nothing in production.
    const client = newClient();
    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([{ location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 }]);
    vi.spyOn(client, "reverseGeocode").mockResolvedValue(road("Aledo Road"));
    vi.spyOn(client, "selectShortestRouteIntersection").mockResolvedValue(null);
    const order: string[] = [];
    const paired = { ...base, name: "Aledo Rd & Aledo Connector Rd" };
    vi.spyOn(client as never, "ringCandidates").mockImplementation((async () => { order.push("ring"); return []; }) as never);
    vi.spyOn(client as never, "roadNamePairCandidates").mockImplementation((async () => { order.push("pairs"); return [paired]; }) as never);
    vi.spyOn(client, "computeRoute").mockResolvedValue(route(91));
    const result = await client.processSite(square);
    expect(order).toEqual(["ring", "pairs"]);
    expect(result.intersection.name).toBe("Aledo Rd & Aledo Connector Rd");
  });
});

describe("TicketGeoClient off-road road name", () => {
  it("looks up the road at the drive end only when an off-road line is printed", async () => {
    const client = new TicketGeoClient({ googleMapsApiKey: "k", geonamesUsername: "u" });
    const square: Coordinate[] = [
      { lat: 33.0, lng: -97.0 }, { lat: 33.001, lng: -97.0 }, { lat: 33.001, lng: -96.999 }, { lat: 33.0, lng: -96.999 },
    ];
    const ix: Intersection = {
      name: "Main St & Oak Ave", street1: "Main St", street2: "Oak Ave", lat: 33.0005, lng: -97.0005,
      county: "Tarrant", city: "Fort Worth", state: "Texas", stateCode: "TX", zip: "76101",
    };
    vi.spyOn(client, "findNearestRoadPoint").mockResolvedValue([{ location: { lat: 33.0, lng: -97.0 }, originalIndex: 0 }]);
    const reverse = vi.spyOn(client, "reverseGeocode").mockResolvedValue({
      street: "Main St", city: "Fort Worth", county: "Tarrant", state: "Texas", stateCode: "TX", zip: "76101", lat: 33.0, lng: -97.0,
    });
    vi.spyOn(client, "selectShortestRouteIntersection").mockResolvedValue({
      intersection: ix, nearestCoordinate: square[0], score: 60,
      route: { distanceMeters: 60, steps: [], endLocation: { lat: 33.00005, lng: -97.0 } }, // ~6 m from the vertex
    });
    const result = await client.processSite(square);
    expect(result.directionsText).toContain("Arrive at the work area");
    expect(reverse).toHaveBeenCalledTimes(1); // the snap's road and locality only
  });
});
