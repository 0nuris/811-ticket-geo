import type { FindIntersectionOptions, Intersection } from "../types.js";
import { googleValidates } from "./google.js";

const GEONAMES_INTERSECTION_URL = "https://secure.geonames.org/findNearestIntersectionJSON";

interface GeoNamesCandidate {
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
}

function buildResult(ix: GeoNamesCandidate, googleInfo?: GoogleInfo | null): Intersection {
  const name = `${ix.street1} & ${ix.street2}`;
  const ixLat = parseFloat(ix.lat);
  const ixLng = parseFloat(ix.lng);

  if (googleInfo) {
    return {
      name,
      street1: ix.street1,
      street2: ix.street2,
      lat: googleInfo.lat ?? ixLat,
      lng: googleInfo.lng ?? ixLng,
      county: googleInfo.county ?? ix.adminName2,
      city: googleInfo.city ?? ix.placeName,
      state: googleInfo.state ?? ix.adminName1,
      stateCode: googleInfo.stateCode ?? ix.adminCode1,
      zip: googleInfo.zip ?? ix.postalcode,
    };
  }

  return {
    name: `${name} (unverified)`,
    street1: ix.street1,
    street2: ix.street2,
    lat: ixLat,
    lng: ixLng,
    county: ix.adminName2,
    city: ix.placeName,
    state: ix.adminName1,
    stateCode: ix.adminCode1,
    zip: ix.postalcode,
  };
}

export async function findNearestIntersection(
  googleApiKey: string,
  geonamesUsername: string,
  lat: number,
  lng: number,
  options?: FindIntersectionOptions
): Promise<Intersection | null> {
  const { preferredRoad, maxCandidates = 3, radiusKm = 1.0 } = options ?? {};

  const url = new URL(GEONAMES_INTERSECTION_URL);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lng", String(lng));
  url.searchParams.set("maxRows", String(maxCandidates));
  url.searchParams.set("radius", String(radiusKm));
  url.searchParams.set("username", geonamesUsername);

  let data: { intersection?: GeoNamesCandidate | GeoNamesCandidate[] };
  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) return null;
    data = (await resp.json()) as { intersection?: GeoNamesCandidate | GeoNamesCandidate[] };
  } catch {
    return null;
  }

  const raw = data.intersection;
  if (!raw) return null;

  const candidates: GeoNamesCandidate[] = Array.isArray(raw) ? raw : [raw];

  // Validate all candidates with Google
  const verified: Array<{ ix: GeoNamesCandidate; googleInfo: GoogleInfo }> = [];
  for (const ix of candidates) {
    const googleInfo = await googleValidates(googleApiKey, ix.street1, ix.street2);
    if (googleInfo) {
      verified.push({ ix, googleInfo });
    }
  }

  // First pass: verified candidate that includes the preferred road
  if (preferredRoad && verified.length > 0) {
    for (const { ix, googleInfo } of verified) {
      if (ix.street1 === preferredRoad || ix.street2 === preferredRoad) {
        return buildResult(ix, googleInfo);
      }
    }
  }

  // Second pass: any verified candidate
  if (verified.length > 0) {
    return buildResult(verified[0].ix, verified[0].googleInfo);
  }

  // Fallback: nearest unverified
  return buildResult(candidates[0]);
}
