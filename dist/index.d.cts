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
/** Where a hand-entered intersection is expected to be. */
interface IntersectionSearchContext {
    /** Work area (or entrance) points; the result must lie near one of them. */
    area?: Coordinate[];
    /** Appended to the text when it names no locality. */
    city?: string;
    stateCode?: string;
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
    /** Where the drive stops: the road point nearest the destination. */
    endLocation?: Coordinate;
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
    /** selectionScore: drive + penalties + weighted off-road walk; the selection minimizes this. */
    score: number;
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
    geocodeIntersection(address: string, context?: IntersectionSearchContext): Promise<Intersection | null>;
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
    /**
     * Routes every candidate to its nearest work-area vertex (in parallel) and
     * keeps the lowest score: drive length plus routePenaltyMeters. Within 10 m of
     * each other, the linearly nearer candidate wins.
     */
    routeCandidates(coordinates: Coordinate[], candidates: Intersection[]): Promise<IntersectionSelectionResult | null>;
    /**
     * The vertex nearest the intersection can sit beside a freeway or deep in a
     * field. When the drive there is penalized or ends far off-road, route to the
     * next-nearest vertices too and keep the lowest score.
     */
    refineArrival(coordinates: Coordinate[], selected: IntersectionSelectionResult): Promise<IntersectionSelectionResult>;
    /**
     * The nearest snapped vertex on a local road other than `primaryStreet`. A
     * freeway snap finds only interchanges; this gives the search a second origin.
     */
    private localRoadOrigin;
    /**
     * The chosen route already passes crossings nearer the site; start there, and
     * repeat from each improvement (each walks further down the route).
     */
    private walkRouteJunctions;
    /** The last few junctions on `selected`'s route, confirmed by geocoding their road pair. */
    private routeJunctionCandidates;
    /** GeoNames nodes on rings past its 1 km search cap, the nearest few validated. */
    private ringCandidates;
    /**
     * Last resort where GeoNames has no data: collect the road names Google knows
     * around the site and geocode each pair as an intersection.
     */
    private roadNamePairCandidates;
    processSite(coordinates: Coordinate[], options?: ProcessSiteOptions): Promise<SiteResult>;
}

declare const MAX_INTERSECTION_DISTANCE_METERS = 8000;

export { type BoundingBox, type ClientConfig, type Coordinate, type FindIntersectionOptions, type GeoMeasurement, type Intersection, type IntersectionSearchContext, type IntersectionSelectionResult, MAX_INTERSECTION_DISTANCE_METERS, type ManualDirectionsArgs, type ProcessSiteOptions, type ReverseGeocodeResult, type RouteResult, type RouteStep, type SelectIntersectionOptions, type SiteResult, type SnappedPoint, type StreetParts, TicketGeoClient, bearingToCardinal, boundingBoxFeet, formatDirections, formatManualDirections, formatMarkingText, geoMeasure, parseStreet, polygonAreaAcres, simplifyPolygon, streetsMatch, toPolygonWkt };
