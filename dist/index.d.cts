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
interface SelectIntersectionOptions extends FindIntersectionOptions {
    snappedPoint?: Coordinate;
}
interface IntersectionSelectionResult {
    intersection: Intersection;
    nearestCoordinate: Coordinate;
    route: RouteResult;
}

declare function geoMeasure(from: Coordinate, to: Coordinate): GeoMeasurement;
declare function bearingToCardinal(degrees: number): string;

declare function polygonAreaAcres(coordinates: Coordinate[]): number;
declare function boundingBoxFeet(coordinates: Coordinate[]): BoundingBox;

declare function toPolygonWkt(coordinates: Coordinate[]): string;

declare function simplifyPolygon(points: Coordinate[], maxPoints?: number): Coordinate[];

declare function parseStreet(streetString: string): StreetParts;
declare function streetsMatch(a: string, b: string): boolean;

interface FinalApproach {
    distanceFeet: number;
    cardinal: string;
    roadName?: string;
}
declare function formatDirections(intersection: Intersection, destination: Coordinate, route: RouteResult, coordinates: Coordinate[], finalApproach?: FinalApproach): string;
interface ManualDirectionsArgs {
    /** Validated entrance intersection (the route origin). */
    intersection: Intersection;
    /** Auto-computed route from the intersection to the entrance/gate. */
    autoLeg: RouteResult;
    /** The entrance/gate coordinate the auto leg ends at. */
    entrance: Coordinate;
    /**
     * Ordered, hand-mapped waypoints from the entrance/gate to the work area.
     * The last waypoint is the chosen polygon vertex (authoritative destination).
     */
    waypoints: Coordinate[];
    /** Full work-area polygon, used for the area/bounding-box trailer. */
    polygon: Coordinate[];
}
/**
 * Assembles the combined manual directions for a restricted-access site:
 * the auto intersection->gate leg (numbered, Google turn-by-turn) followed by
 * the hand-mapped gate->polygon leg (per-step cardinal + distance, in the
 * formatMarkingText style). Pure: identical inputs always yield identical text,
 * so a dry-run preview matches the submitted ticket byte-for-byte.
 */
declare function formatManualDirections({ intersection, autoLeg, entrance, waypoints, polygon, }: ManualDirectionsArgs): string;
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
    /**
     * Selects the intersection with the shortest routed distance to the work area.
     *
     * Strategy: Query GeoNames for candidate intersections within radiusKm of the
     * snapped road point, route each one to its nearest polygon vertex, and keep
     * the shortest drive. Routing is what decides — a linearly closer intersection
     * routinely has a longer drive (dead ends, divided roads, one-ways), which is
     * exactly the case a straight-line ranking gets wrong.
     *
     * Candidate count is bounded by maxCandidates (the API-cost knob), so every
     * candidate is routed. An earlier version additionally kept only the linearly
     * nearest candidate per compass quadrant; candidates cluster on the road-network
     * side of a site, so the two best routinely shared a quadrant and the better one
     * was discarded before it was ever routed. See the ticket-2673195855 case in
     * tests/client.test.ts.
     */
    selectShortestRouteIntersection(coordinates: Coordinate[], options?: SelectIntersectionOptions): Promise<IntersectionSelectionResult | null>;
    processSite(coordinates: Coordinate[], options?: ProcessSiteOptions): Promise<SiteResult>;
}

export { type BoundingBox, type ClientConfig, type Coordinate, type FindIntersectionOptions, type GeoMeasurement, type Intersection, type IntersectionSelectionResult, type ManualDirectionsArgs, type ProcessSiteOptions, type ReverseGeocodeResult, type RouteResult, type RouteStep, type SelectIntersectionOptions, type SiteResult, type SnappedPoint, type StreetParts, TicketGeoClient, bearingToCardinal, boundingBoxFeet, formatDirections, formatManualDirections, formatMarkingText, geoMeasure, parseStreet, polygonAreaAcres, simplifyPolygon, streetsMatch, toPolygonWkt };
