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
  RouteStep,
  RouteResult,
  FindIntersectionOptions,
  SelectIntersectionOptions,
  IntersectionSelectionResult,
} from "./types.js";

export { geoMeasure, bearingToCardinal } from "./geo/measure.js";
export { polygonAreaAcres, boundingBoxFeet } from "./geo/area.js";
export { toPolygonWkt } from "./geo/wkt.js";
export { simplifyPolygon } from "./geo/simplify.js";
export { parseStreet, streetsMatch } from "./parsers/street.js";
export { formatDirections, formatMarkingText, formatManualDirections } from "./directions/format.js";
export type { ManualDirectionsArgs } from "./directions/format.js";
export { TicketGeoClient } from "./client.js";
