// Types
export type {
  Coordinate,
  ClientConfig,
  GeoMeasurement,
  StreetParts,
  Intersection,
  BoundingBox,
  SiteResult,
  ProcessSiteOptions,
  SnappedPoint,
  ReverseGeocodeResult,
  WorkLocality,
  RouteStep,
  RouteResult,
  FindIntersectionOptions,
  SelectIntersectionOptions,
  IntersectionSelectionResult,
  IntersectionSearchContext,
} from "./types.js";

export { geoMeasure, bearingToCardinal } from "./geo/measure.js";
export { polygonAreaAcres, boundingBoxFeet } from "./geo/area.js";
export { toPolygonWkt } from "./geo/wkt.js";
export { simplifyPolygon } from "./geo/simplify.js";
export { parseStreet, streetsMatch } from "./parsers/street.js";
export { formatDirections, formatMarkingText, formatManualDirections } from "./directions/format.js";
export type { ManualDirectionsArgs } from "./directions/format.js";
export { TicketGeoClient } from "./client.js";
export { MAX_INTERSECTION_DISTANCE_METERS } from "./api/google.js";
export { isLimitedAccessRoad } from "./selection.js";
export { ticketLocality } from "./locality.js";
export { parseWktRings, placeForWorkArea } from "./places.js";
export type { NamedArea, PlaceMatch } from "./places.js";
