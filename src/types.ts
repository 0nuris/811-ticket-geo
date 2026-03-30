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
}

export interface BoundingBox {
  northSouthFeet: number;
  eastWestFeet: number;
}

export interface SiteResult {
  coordinates: Coordinate[];
  intersection: Intersection;
  directionsText: string;
  markingText: string;
  areaAcres: number;
  boundingBox: BoundingBox;
}

export interface ProcessSiteOptions {
  intersectionOverride?: string;
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
}
