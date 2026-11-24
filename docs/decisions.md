# Decisions

Facts about the services this package calls, and the code shaped by them.

## Hand-entered intersections

`geocodeIntersection` (`src/api/google.ts`) takes text a person typed: the intersection
override in `processSite`, and the restricted-access intersection the API validates.

**What Google does with it.** Measured 2026-11-24 against the Geocoding API:

| Query | Top result |
| --- | --- |
| `Main & Johnson` | transit stops in Visalia, CA and Lynnwood-Pricedale, PA (`partial_match`) |
| same, `components=administrative_area:TX` | Johnson County, TX centroid |
| same, plus `bounds` around the Keller site | `N Main St` route, Joshua, TX, about 50 km away |
| `Main & Johnson, Keller, TX` | `N Main St` route midpoint, about 1.2 km away (`partial_match`) |
| `Main & Johnson Rd, Keller, TX` | `N Main St & Johnson Rd` intersection, exact |

So bare cross-street text resolves to whatever matches best nationwide, and only a result of
type `intersection` puts the point at the crossing. Ticket 5390P (2026-11-20) was drafted from
the Lynnwood-Pricedale stop: county, city and zip all Pennsylvania, directions about 1,100 miles.

**What the code does.**

- Appends the work area's city and state when the text names no locality, filters to the
  state, and biases `bounds` to the work area.
- Accepts only an `intersection` result within `MAX_INTERSECTION_DISTANCE_METERS` (8 km) of a
  work-area point. Anything else returns null, which callers report as "couldn't be found".
- Names the intersection from Google's `formatted_address` (`N Main St & Johnson Rd`), so the
  ticket's name and the route's start come from the same result.

A person who typed street names without types (`Main & Johnson`) now gets the not-found
error and should add the types. That is deliberate: every non-intersection result measured
was in the wrong place.
