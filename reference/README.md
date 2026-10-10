# Reference data

Every physical constant the app uses lives here, one JSON file per topic, and every entry carries its source.
`src/reference/index.ts` validates the files at load time (`src/reference/schema.ts`).

## Entry shapes

- **Value:** `{ "value": <number, SI>, "unit": "<SI unit>", "bounds": [lo, hi]?, "source": "<citation or URL>",
"provenance": "direct" | "analogue" | "derived", "note": "<original units, conversion, caveats>"? }`
- **Quote:** `{ "quote": "<verbatim text>", "source": …, "provenance": …, "note": …? }`
- **Fit:** `{ "form": "<formula>", "coefficients": { "<name>": <number, SI>, … }, "range": [lo, hi], "rangeUnit":
"<unit of the fitted variable>", "source": …, "provenance": …, "note": …? }` (contact.json's face fits; P2b.2b.2b.2a
  design §3.1). The range is where the fit was measured; the engine states how it treats speeds outside it.
- **Placeholder:** any entry may carry `"provisional": "placeholder"`: a labelled stand-in, by a stated rule, until
  data or a fit replaces it (swing.json; P2b.2b.2a design §6.2). Its `provenance` is `"derived"` and its `source`
  names the rule.
- **Stroke shape** (swing.json): one object per stroke type, keyed by the type, holding values and quotes as above
  and an optional `kinematics` array of `{ "backswing", "contactSpeed" | "downswingTime", "source", "provenance",
"note"? }`. `reference/sources/README.md` cites each source (URL, fetch date, SHA-256 of the fetched file) and
  quotes the extracted passages; the originals are cited, not mirrored.
- **Offset rule** (laws.json): a quote plus `"ballRadii"` and `"uprightRadii"` coefficients (see below).
- **Fault law** (laws.json): a quote keyed by its Law number (`"29.1.8"`) or Glossary entry (`"groupOfBalls"`), the
  text the fault judge (`src/engine/faults.ts`) applies.

`bounds` are the plausible range: the Laws' tolerance for specified equipment, or the spread in the literature
for measured quantities. `provenance: "analogue"` means the figure comes from a comparable domain and is
explained in `note`.

## Coordinates

Origin at the south-west corner of the court (the inner edge of the boundary). `x` runs east along the south
boundary, `y` runs north along the west boundary. Hoop `normalX`/`normalY` is the unit horizontal vector
perpendicular to the plane of the hoop (the direction a ball runs it when going "north" for hoops set
north–south).

## Offset rules

A rule's threshold is `ballRadii × R + uprightRadii × r`, where `R` is the ball radius and `r` the upright radius.

- `outOfCourt`: a ball is out of court when its centre's distance **beyond** the boundary line is at least the
  threshold. A negative threshold means "still inside by that much" (e.g. `-1 × R` if any part of the ball
  crossing the line makes it out).
- `hoopRunStart`: a ball can run a hoop in a stroke only if, at the start of the stroke, its centre's signed
  distance from the plane through the uprights' axes (positive in the running direction) is at most the threshold.
- `hoopRunComplete`: the ball has completed running when that signed distance is at least the threshold.

The derivation of each coefficient from the quoted Law goes in `note`.
