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

## Choosing the intersection

`processSite` (`src/client.ts`) and `src/selection.ts`. Measured 2026-11-24 on 60 real RPMx work
areas (one per site from 830 Texas 811 tickets, 2026-10-25 to 2026-11-24, 17 counties).

**What the data sources do.**

- GeoNames' free tier refuses a radius over 1 km ("the radius is too big for the free service,
  max=1"). Its TIGER and OSM intersection endpoints both lack many subdivision crossings: Sandlin
  Dr & Domingo Dr (Parker), Saratoga Dr & Basketflower Dr (Ellis) and S New Rd & Creekview Dr
  (McLennan) are not nodes; rural Wilbarger has none within 1.5 km.
- A Roads API snap onto a freeway makes GeoNames return only interchange nodes. At Parker the only
  candidate was `I-20 & I-30`, a 9-mile loop on interstates.
- A reverse-geocode result's `geometry.location` is the matched feature's point, often mid-road.
  Measuring the off-road walk to it turned a 49 m walk into 2,763 ft (Hardeman, 495 acres).
- Google Routes' `avoidTolls` and `avoidHighways` are preferences: a site reachable only by
  highway still gets a route.
- A Routes step "Head west on Aledo Rd toward Aledo Connector Rd" names the next crossing ahead.

**What the code does.**

- Routes up to 8 GeoNames candidates (was 3) and scores each: drive meters, plus 500 per ramp or
  merge, 1,000 for a toll road, 300 per U-turn, 1,500 for starting at an interstate, tollway or
  freeway crossing, plus 2x the off-road walk from where the drive stops.
- When the best is penalized, searches again from the nearest snap on a local road.
- When nothing is within 1 km, searches GeoNames rings at 1.5 and 3 km.
- When the best still scores over 300, tries the junctions on its own route, nearest the site
  first, and pairs of road names Google reports around the site, geocoded as intersections.
- When the vertex nearest the intersection gives a penalized route or a walk over 100 m, tries
  the next 4 vertices.
- `Intersection.verified` replaces the "(unverified)" suffix, which had reached 11 of 41 filed
  tickets.

**Result** (same 60 sites, same Google responses):

| Measure | Deployed (`a425cb5`) | This change |
| --- | --- | --- |
| No intersection found | 2 | 0 |
| "(unverified)" in ticket text | 19 | 0 |
| Interstate/tollway/freeway crossing picked | 4 | 0 |
| Ramp, merge or exit in route | 8 | 1 |
| Toll road / U-turn | 2 / 4 | 1 / 0 |
| Off-road walk over 500 ft | 8 | 3 |
| Staff's intersection is the shorter drive | 15/49 | 1/50 (by 29 m) |
| Median / max drive | 305 m / 14.9 km | 125 m / 1.5 km |

The remaining ramp and toll are one site that lies along the President George Bush Turnpike.
The three long walks are field sites where no nearby vertex is closer to a road.

**Cost.** Live, 8 of the sites: 18 to 102 API calls and 0.5 to 4.7 s per site, under the API's
15 s geocode timeout. Probes run at most 10 at a time: a burst past Google's per-second limit
comes back empty rather than as an error.
