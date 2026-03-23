interface Coordinate {
    lat: number;
    lng: number;
}
interface ClientConfig {
    googleMapsApiKey: string;
    geonamesUsername: string;
}
interface GeoMeasurement {
    distanceMeters: number;
    bearingDegrees: number;
}
interface StreetParts {
    name: string;
    type: string;
    prefix: string;
    suffix: string;
}
interface Intersection {
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
interface BoundingBox {
    northSouthFeet: number;
    eastWestFeet: number;
}
interface SiteResult {
    coordinates: Coordinate[];
    intersection: Intersection;
    directionsText: string;
    markingText: string;
    areaAcres: number;
    boundingBox: BoundingBox;
}
interface ProcessSiteOptions {
    intersectionOverride?: string;
}
interface SnappedPoint {
    location: Coordinate;
    originalIndex: number;
}
interface ReverseGeocodeResult {
    street?: string;
    city?: string;
    county?: string;
    state?: string;
    stateCode?: string;
    zip?: string;
    lat: number;
    lng: number;
}
interface RouteStep {
    navigationInstruction?: {
        maneuver?: string;
        instructions?: string;
    };
    localizedValues?: {
        distance?: {
            text: string;
        };
        duration?: {
            text: string;
        };
    };
    startLocation?: {
        latLng?: {
            latitude: number;
            longitude: number;
        };
    };
}
interface RouteResult {
    steps: RouteStep[];
    distanceMeters: number;
    localizedValues?: {
        distance?: {
            text: string;
        };
        duration?: {
            text: string;
        };
    };
}
interface FindIntersectionOptions {
    preferredRoad?: string;
    maxCandidates?: number;
    radiusKm?: number;
}

declare function geoMeasure(from: Coordinate, to: Coordinate): GeoMeasurement;
declare function bearingToCardinal(degrees: number): string;

declare function polygonAreaAcres(coordinates: Coordinate[]): number;
declare function boundingBoxFeet(coordinates: Coordinate[]): BoundingBox;

declare function toPolygonWkt(coordinates: Coordinate[]): string;

declare function simplifyPolygon(points: Coordinate[], maxPoints?: number): Coordinate[];

declare function parseStreet(streetString: string): StreetParts;

declare function formatDirections(intersection: Intersection, destination: Coordinate, route: RouteResult, coordinates: Coordinate[]): string;
declare function formatMarkingText(coordinates: Coordinate[]): string;

declare class TicketGeoClient {
    private readonly googleApiKey;
    private readonly geonamesUsername;
    constructor(config: ClientConfig);
    findNearestRoadPoint(coordinates: Coordinate[]): Promise<SnappedPoint[]>;
    reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null>;
    geocodeIntersection(address: string): Promise<Intersection | null>;
    findNearestIntersection(lat: number, lng: number, options?: FindIntersectionOptions): Promise<Intersection | null>;
    computeRoute(origin: Coordinate, destination: Coordinate, heading?: number): Promise<RouteResult | null>;
    processSite(coordinates: Coordinate[], options?: ProcessSiteOptions): Promise<SiteResult>;
}

export { type BoundingBox, type ClientConfig, type Coordinate, type FindIntersectionOptions, type GeoMeasurement, type Intersection, type ProcessSiteOptions, type ReverseGeocodeResult, type RouteResult, type RouteStep, type SiteResult, type SnappedPoint, type StreetParts, TicketGeoClient, bearingToCardinal, boundingBoxFeet, formatDirections, formatMarkingText, geoMeasure, parseStreet, polygonAreaAcres, simplifyPolygon, toPolygonWkt };
