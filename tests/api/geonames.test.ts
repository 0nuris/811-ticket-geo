import { describe, it, expect, vi, beforeEach } from "vitest";
import { findIntersectionCandidates, findNearestIntersection } from "../../src/api/geonames.js";

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

describe("findIntersectionCandidates", () => {
  it("returns mixed verified and unverified candidates instead of dropping unverified ones", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "River Rd", street2: "Oak Ave", lat: "33.001", lng: "-97.001", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
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
        status: "ZERO_RESULTS",
        results: [],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 33.0, -97.0, {
      maxCandidates: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Elm St & 1st Ave");
    expect(result[1].name).toBe("River Rd & Oak Ave (unverified)");
  });

  it("returns candidates sorted with preferred road first when verified", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "Main St", street2: "Oak Ave", lat: "33.001", lng: "-97.001", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
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
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.001, lng: -97.001 } } }],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 33.0, -97.0, {
      preferredRoad: "Main St",
      maxCandidates: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Main St & Oak Ave");
    expect(result[1].name).toBe("Elm St & 1st Ave");
  });

  it("sorts an unverified preferred-road candidate ahead of verified non-matches", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "Park Avenue", street2: "Oak Ave", lat: "33.001", lng: "-97.001", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
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
        status: "ZERO_RESULTS",
        results: [],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 33.0, -97.0, {
      preferredRoad: "Park Ave",
      maxCandidates: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Park Avenue & Oak Ave (unverified)");
    expect(result[1].name).toBe("Elm St & 1st Ave");
  });

  it("matches preferred road across abbreviation differences", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [
          { street1: "Elm St", street2: "1st Ave", lat: "33.0", lng: "-97.0", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
          { street1: "Park Avenue", street2: "Oak Ave", lat: "33.001", lng: "-97.001", adminName2: "", placeName: "", adminName1: "", adminCode1: "", postalcode: "" },
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
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 33.001, lng: -97.001 } } }],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 33.0, -97.0, {
      preferredRoad: "Park Ave",
      maxCandidates: 2,
    });

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Park Avenue & Oak Ave");
    expect(result[1].name).toBe("Elm St & 1st Ave");
  });

  it("validates with normalized road names + city/state context", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [{
          street1: "US Hwy 87", street2: "Co Rd 128", lat: "31.198", lng: "-99.495",
          adminName2: "McCulloch", placeName: "Brady", adminName1: "Texas", adminCode1: "TX", postalcode: "76825",
        }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 31.198, lng: -99.495 } } }],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 31.198, -99.495, { maxCandidates: 1 });

    // The validation (2nd) call must use the normalized names + locality context.
    const validateUrl = decodeURIComponent(String(mockFetch.mock.calls[1][0]).replace(/\+/g, " "));
    expect(validateUrl.includes("US Highway 87")).toBe(true);
    expect(validateUrl.includes("County Road 128")).toBe(true);
    expect(validateUrl.includes("Brady")).toBe(true);
    expect(validateUrl.includes("TX")).toBe(true);

    // Validated location is close to the GeoNames node, so it is accepted (no "(unverified)").
    expect(result[0].name).toBe("US Hwy 87 & Co Rd 128");
  });

  it("uses Google's canonical cross-street names (with directionals) when validated", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [{
          street1: "Dove Rd", street2: "N Pearson Ln", lat: "32.9823", lng: "-97.2006",
          adminName2: "Tarrant", placeName: "Westlake", adminName1: "Texas", adminCode1: "TX", postalcode: "76262",
        }],
      }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{
          types: ["intersection"],
          formatted_address: "W Dove Rd & N Pearson Ln, Westlake, TX 76262, USA",
          address_components: [],
          geometry: { location: { lat: 32.9823, lng: -97.2006 } },
        }],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 32.9823, -97.2006, { maxCandidates: 1 });

    expect(result[0].name).toBe("W Dove Rd & N Pearson Ln");
    expect(result[0].street1).toBe("W Dove Rd");
    expect(result[0].street2).toBe("N Pearson Ln");
  });

  it("leaves a far-off validated location unverified (distance safeguard)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        intersection: [{
          street1: "Co Rd 128", street2: "US Hwy 87", lat: "31.198", lng: "-99.495",
          adminName2: "McCulloch", placeName: "Brady", adminName1: "Texas", adminCode1: "TX", postalcode: "76825",
        }],
      }),
    });
    // Google returns an intersection type, but far away (wrong place).
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [{ types: ["intersection"], address_components: [], geometry: { location: { lat: 32.0, lng: -99.0 } } }],
      }),
    });

    const result = await findIntersectionCandidates("google-key", "geouser", 31.198, -99.495, { maxCandidates: 1 });

    expect(result[0].name).toBe("Co Rd 128 & US Hwy 87 (unverified)");
    expect(result[0].lat).toBeCloseTo(31.198, 3);
    expect(result[0].lng).toBeCloseTo(-99.495, 3);
  });
});
