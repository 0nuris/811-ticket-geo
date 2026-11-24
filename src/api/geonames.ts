import type { FindIntersectionOptions, Intersection } from "../types.js";
import { googleValidates } from "./google.js";
import { streetsMatch } from "../parsers/street.js";
import { geoMeasure } from "../geo/measure.js";

const GEONAMES_INTERSECTION_URL = "https://secure.geonames.org/findNearestIntersectionJSON";

// A validated location farther than this from the GeoNames node is treated as a
// mismatch (e.g. from an over-eager name normalization) and left unverified,
// rather than relocating the intersection to the wrong place.
const MAX_VALIDATION_DISTANCE_METERS = 750;

export interface GeoNamesCandidate {
  street1: string;
  street2: string;
  lat: string;
  lng: string;
  adminName2: string;
  placeName: string;
  adminName1: string;
  adminCode1: string;
  postalcode: string;
}

interface GoogleInfo {
  lat?: number;
  lng?: number;
  county?: string;
  city?: string;
  state?: string;
  stateCode?: string;
  zip?: string;
  intersectionName?: string;
  intersectionStreet1?: string;
  intersectionStreet2?: string;
}

function buildResult(ix: GeoNamesCandidate, googleInfo?: GoogleInfo | null): Intersection {
  const name = `${ix.street1} & ${ix.street2}`;
  const ixLat = parseFloat(ix.lat);
  const ixLng = parseFloat(ix.lng);

  // Reject a validated location that sits far from the GeoNames node so a
  // mis-normalized name can't silently relocate the intersection.
  if (
    googleInfo &&
    googleInfo.lat !== undefined &&
    googleInfo.lng !== undefined &&
    geoMeasure({ lat: ixLat, lng: ixLng }, { lat: googleInfo.lat, lng: googleInfo.lng })
      .distanceMeters > MAX_VALIDATION_DISTANCE_METERS
  ) {
    googleInfo = null;
  }

  if (googleInfo) {
    // Prefer Google's canonical cross-street names (they carry directionals like
    // "W Dove Rd" that the GeoNames/TIGER names often drop); fall back to GeoNames.
    //
    // The name and the location must come from the SAME source. Google's cross
    // streets are only readable from formatted_address, so when that parse fails
    // the old per-field fallbacks reported the GeoNames pair at Google's point --
    // up to MAX_VALIDATION_DISTANCE_METERS away, which is a road over in a
    // subdivision. The ticket then named one intersection while the driving
    // directions started at another. Keep the GeoNames node in that case.
    const hasGoogleIdentity = Boolean(
      googleInfo.intersectionName &&
        googleInfo.intersectionStreet1 &&
        googleInfo.intersectionStreet2 &&
        googleInfo.lat !== undefined &&
        googleInfo.lng !== undefined
    );

    return {
      name: hasGoogleIdentity ? googleInfo.intersectionName! : name,
      street1: hasGoogleIdentity ? googleInfo.intersectionStreet1! : ix.street1,
      street2: hasGoogleIdentity ? googleInfo.intersectionStreet2! : ix.street2,
      lat: hasGoogleIdentity ? googleInfo.lat! : ixLat,
      lng: hasGoogleIdentity ? googleInfo.lng! : ixLng,
      county: googleInfo.county ?? ix.adminName2,
      city: googleInfo.city ?? ix.placeName,
      state: googleInfo.state ?? ix.adminName1,
      stateCode: googleInfo.stateCode ?? ix.adminCode1,
      zip: googleInfo.zip ?? ix.postalcode,
      verified: true,
    };
  }

  return {
    name,
    street1: ix.street1,
    street2: ix.street2,
    lat: ixLat,
    lng: ixLng,
    county: ix.adminName2,
    city: ix.placeName,
    state: ix.adminName1,
    stateCode: ix.adminCode1,
    zip: ix.postalcode,
    verified: false,
  };
}

function sortByPreferredRoad<T>(
  items: T[],
  getStreets: (item: T) => { street1: string; street2: string },
  preferredRoad?: string
): T[] {
  if (!preferredRoad) return items;

  const matching = items.filter((item) => {
    const { street1, street2 } = getStreets(item);
    return streetsMatch(street1, preferredRoad) || streetsMatch(street2, preferredRoad);
  });
  const nonMatching = items.filter((item) => {
    const { street1, street2 } = getStreets(item);
    return !streetsMatch(street1, preferredRoad) && !streetsMatch(street2, preferredRoad);
  });
  return [...matching, ...nonMatching];
}

/** Raw GeoNames intersection nodes near a point (free tier: radius at most 1 km). */
export async function fetchIntersectionNodes(
  geonamesUsername: string,
  point: { lat: number; lng: number },
  options: { maxRows: number; radiusKm: number }
): Promise<GeoNamesCandidate[]> {
  const url = new URL(GEONAMES_INTERSECTION_URL);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lng", String(point.lng));
  url.searchParams.set("maxRows", String(options.maxRows));
  url.searchParams.set("radius", String(options.radiusKm));
  url.searchParams.set("username", geonamesUsername);

  let data: { intersection?: GeoNamesCandidate | GeoNamesCandidate[] };
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return [];
    data = (await resp.json()) as { intersection?: GeoNamesCandidate | GeoNamesCandidate[] };
  } catch {
    return [];
  }

  const raw = data.intersection;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

/** Confirms each node with Google (in parallel) and names it from the best source. */
export async function validateIntersectionNodes(
  googleApiKey: string,
  nodes: GeoNamesCandidate[]
): Promise<Intersection[]> {
  return Promise.all(
    nodes.map(async (ix) =>
      buildResult(
        ix,
        await googleValidates(googleApiKey, ix.street1, ix.street2, {
          city: ix.placeName,
          stateCode: ix.adminCode1,
        })
      )
    )
  );
}

export async function findIntersectionCandidates(
  googleApiKey: string,
  geonamesUsername: string,
  lat: number,
  lng: number,
  options?: FindIntersectionOptions
): Promise<Intersection[]> {
  const { preferredRoad, maxCandidates = 3, radiusKm = 1.0 } = options ?? {};
  const nodes = await fetchIntersectionNodes(geonamesUsername, { lat, lng }, { maxRows: maxCandidates, radiusKm });
  const results = await validateIntersectionNodes(googleApiKey, nodes);
  return sortByPreferredRoad(results, (ix) => ix, preferredRoad);
}

export async function findNearestIntersection(
  googleApiKey: string,
  geonamesUsername: string,
  lat: number,
  lng: number,
  options?: FindIntersectionOptions
): Promise<Intersection | null> {
  const candidates = await findIntersectionCandidates(
    googleApiKey,
    geonamesUsername,
    lat,
    lng,
    options
  );
  return candidates[0] ?? null;
}
