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

## Texas road-name spellings

`normalizeRoadName` (`src/parsers/normalize.ts`) expands abbreviations before geocoding. Both
lookups try two spellings and keep the first intersection: `googleValidates` (GeoNames names)
tries expanded then as given; `geocodeIntersection` (typed text) tries as typed then expanded.

Measured 2026-11-24 against the Geocoding API, Texas filter on:

| Query | Result |
| --- | --- |
| `N Country Ln & Farm to Market 1141, Rockwall, TX` | `S Market St`, Dallas (route) |
| `N Country Ln & Farm to Market Road 1141, Rockwall, TX` | `N Country Ln & FM1141` intersection |
| `FM 488 & FM 1124, Fairfield, TX` | `FM 488` route only |
| `Farm to Market Road 488 & Farm to Market Road 1124, Fairfield, TX` | intersection |
| `JC Maples RD & FM 121, Gunter, TX` | intersection |
| `JC Maples RD & Farm to Market Road 121, Gunter, TX` | `Jc Maples Rd` route only |
| `Airport Rd & CR-309, Kaufman, TX` | route only |
| `Airport Rd & County Road 309, Kaufman, TX` | intersection |

So `FM`/`RM` expand to "... to Market Road", `CR` before a number expands to "County Road", and
no single spelling resolves every road, which is why the lookups try both. On 60 real RPMx work
areas this took the typed-intersection acceptance from 44 to 49 and cut `(unverified)` automatic
names from 19 to 15, with no automatic name made worse.
