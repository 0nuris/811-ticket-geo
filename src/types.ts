export interface Coordinate {
  lat: number;
  lng: number;
}

export interface ClientConfig {
  googleMapsApiKey: string;
  geonamesUsername: string;
}

export interface GeoMeasurement {
  distanceMeters: number;
  bearingDegrees: number;
}

export interface StreetParts {
  name: string;
  type: string;
  prefix: string;
  suffix: string;
}

export interface Intersection {
  /** Display name for the ticket; never carries a verification marker. */
  name: string;
  street1: string;
  street2: string;
  lat: number;
  lng: number;
  county: string;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
  /** False when Google could not confirm the GeoNames crossing; for the UI, not the ticket. */
  verified?: boolean;
}

export interface BoundingBox {
  northSouthFeet: number;
  eastWestFeet: number;
}

/** Where the work is, for the ticket's county, place and zip fields. */
export interface WorkLocality {
  county: string;
  city: string;
  state: string;
  stateCode: string;
  zip: string;
}

export interface SiteResult {
  coordinates: Coordinate[];
  intersection: Intersection;
  /** The work area's own county and city; the intersection's can differ near a line. */
  workLocality: WorkLocality;
  /** Drive length of the chosen route, intersection to arrival vertex. */
  routeMeters: number;
  directionsText: string;
  markingText: string;
  areaAcres: number;
  boundingBox: BoundingBox;
}

export interface ProcessSiteOptions {
  intersectionOverride?: string;
}

/** Where a hand-entered intersection is expected to be. */
export interface IntersectionSearchContext {
  /** Work area (or entrance) points; the result must lie near one of them. */
  area?: Coordinate[];
  /** Appended to the text when it names no locality. */
  city?: string;
  stateCode?: string;
}

export interface SnappedPoint {
  location: Coordinate;
  originalIndex: number;
}

export interface ReverseGeocodeResult {
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  stateCode?: string;
  zip?: string;
  /** County and locality whose boundaries contain the queried point. */
  containingCounty?: string;
  containingCity?: string;
  lat: number;
  lng: number;
}

export interface RouteStep {
  navigationInstruction?: {
    maneuver?: string;
    instructions?: string;
  };
  localizedValues?: {
    distance?: { text: string };
    duration?: { text: string };
  };
  startLocation?: {
    latLng?: { latitude: number; longitude: number };
  };
}

export interface RouteResult {
  steps: RouteStep[];
  distanceMeters: number;
  /** Where the drive stops: the road point nearest the destination. */
  endLocation?: Coordinate;
  localizedValues?: {
    distance?: { text: string };
    duration?: { text: string };
  };
}

export interface FindIntersectionOptions {
  preferredRoad?: string;
  maxCandidates?: number;
  radiusKm?: number;
}

export interface SelectIntersectionOptions extends FindIntersectionOptions {
  snappedPoint?: Coordinate;
}

export interface IntersectionSelectionResult {
  intersection: Intersection;
  nearestCoordinate: Coordinate;
  route: RouteResult;
  /** selectionScore: drive + penalties + weighted off-road walk; the selection minimizes this. */
  score: number;
}
