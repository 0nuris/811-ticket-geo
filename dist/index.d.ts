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
     * Selects the intersection with the shortest routed distance among a
     * single candidate from each populated quadrant around the snapped point.
     *
     * Strategy: Query GeoNames for candidate intersections within radiusKm of the
     * snapped road point, then select the nearest candidate from each cardinal
     * quadrant (N/E/S/W) relative to the snap point. This ensures geographic
     * coverage — a linearly closer intersection may have a longer driving route
     * due to road topology (highway barriers, one-way streets, etc.). Each
     * selected candidate is routed to its nearest polygon vertex; the shortest
     * route wins.
     *
     * This quadrant-based heuristic intentionally limits routed candidates to
     * reduce false positives caused by rivers, dead ends, and other topology
     * quirks. A previous scout-and-requery approach could discover intersections
     * beyond radiusKm, but was less deterministic and harder to reason about.
     */
    selectShortestRouteIntersection(coordinates: Coordinate[], options?: SelectIntersectionOptions): Promise<IntersectionSelectionResult | null>;
    processSite(coordinates: Coordinate[], options?: ProcessSiteOptions): Promise<SiteResult>;
}

export { type BoundingBox, type ClientConfig, type Coordinate, type FindIntersectionOptions, type GeoMeasurement, type Intersection, type IntersectionSelectionResult, type ManualDirectionsArgs, type ProcessSiteOptions, type ReverseGeocodeResult, type RouteResult, type RouteStep, type SelectIntersectionOptions, type SiteResult, type SnappedPoint, type StreetParts, TicketGeoClient, bearingToCardinal, boundingBoxFeet, formatDirections, formatManualDirections, formatMarkingText, geoMeasure, parseStreet, polygonAreaAcres, simplifyPolygon, streetsMatch, toPolygonWkt };
