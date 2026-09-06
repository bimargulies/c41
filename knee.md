# History of the knee detector

`src/find-knees.ts` picks a black point and a white point for each channel of a
scanned C-41 negative, feeding the **Levels** layer that `Add C41 Adjustment
Layers` creates. This file records how it got to its current form — a two-line
per-bin level rule — in case that turns out to be too simple and someone wants
to walk it back.

The ground truth throughout has been `src/find-knees.test.ts`: real channel
histograms exported from scans, each with black/white points **picked by eye**,
never by running the algorithm and blessing its output. The test asserts the
detector lands within a few bins of each hand-picked point.

---

## Timeline

### 0. Geometric curvature (before this repo's history)

Original approach: find the point of maximum curvature,
`|y''| / (1 + y'^2)^1.5`.

**Why it died:** that formula divides by the local slope. On a real histogram a
peak of a few thousand pixels rising over ~20 levels has a slope in the
hundreds, so `(1 + y'^2)^1.5` explodes and drowns the actual corner — the
detector fires wherever the slope happens to be small again, not at the bend.

### 1. Savitzky-Golay derivative scan (commit `2abe5a5`, "Add knee-detection algo")

- Normalize the histogram to `[0, 1]` by its own max (scale-free derivative).
- Savitzky-Golay smooth + differentiate.
- Scan in from each edge for the first *sustained* run of derivative magnitude
  above a threshold derived from the noise in the flat edge regions
  (`mean + k·std`, floored at a fraction of the peak derivative).
- Report the start of the sustained run as the knee.

Verified against **synthetic** histograms with peak heights ~200–50,000. Knobs:
`windowSize`, `polynomial`, `edgeSampleCount`, `noiseThresholdMultiplier`,
`minThresholdFraction`, `sustainCount`.

### 2. Real scans start breaking it (commit `ea10143`, PR #4)

Feeding it actual scans (`knee-gets-confused.ts`) exposed that "normalize by
max" makes the derivative threshold the wrong reference whenever the histogram's
dynamic range is unusual. Each fix was a new knob:

- **`flatEdgeMaxFraction` (0.02)** — a histogram is not guaranteed to decay to
  zero at both ends; a channel can hold several percent of its pixels in bin 0
  or bin 255 (film-base end / blown highlights). Pooling that falling shoulder
  into the "flat edge noise" estimate inflated the threshold ~10× and blinded
  the scan on the *other* side. Fix: only pool an edge that is genuinely flat.
  → red-from-knee-gets-confused left knee **214 → 75**.
- **`clippedEdgeThresholdFraction` (0.18)** — a clipped side has no quiet tail,
  so the low flat-region threshold trips on the first sample. Give it a higher
  bar. → red-from-knee-gets-confused right knee **255 → ~247**.
- **`lagCorrection` (`round(windowSize/4)` ≈ 3)** — measured against the scan
  corpus, the raw crossing sat a fairly *uniform* ~+2.4 (left) / +3.7 (right)
  bins from the hand-picked corner. Not the symmetric "smoothing lag" originally
  assumed — a uniform positive index offset, probably SG blur plus asymmetric
  post-padding. Subtract a window-derived constant.
- **Null fallback in `getKneeLimitsFromHistogram`** — a missing knee had meant
  `0` / `255` (no clipping). Changed to a 0.1% cumulative-mass clip.

### 3. Spurious-knee rejection (commit `50989db`, PR #8)

`macro-mostly-pink.ts`'s green channel is clipped at the top and never flattens;
the scan latched onto a bend deep in the interior (the far side of a secondary
hump, curve still ~40% of peak).

- **`spuriousKneeMassFraction` (0.15)** — reject a knee when the smoothed curve
  anywhere *outside* it still exceeds this fraction of the peak (real structure
  remains → the scan caught interior detail, not the shoulder). On a clipped
  edge, fall back to the boundary; otherwise report nothing.
  → green-from-macro-mostly-pink right knee **189 → 255**.

### 4. Onset level for the left knee (commits `7b773ce`, `2fed45c`, PR #10)

`from-2026-09-06-02.ts`'s blue channel climbs so gradually off the toe that the
derivative never trips until the ramp steepens ~100 bins in.
`from-2026-09-06-02-with-gamma.ts` (the same scan after the Screen Curves gamma
layer) is worse: the blown highlights become one huge spike at white, so
normalizing by it buries the whole left shoulder below 3% of peak — the left
scan finds nothing, or finds the spike and rejects it as spurious → **null**.

- **`onsetLevelFraction` (0.002, later 0.0015)** — the black point is *also*
  taken as the first bin where the raw normalized histogram reaches this
  fraction of the peak (where it lifts off the near-zero toe). The earlier of
  that and the scan wins, and it stands in when the scan comes up empty.
  → blue-from-2026-09-06-02 left **125 → 25**; blue-gamma left **null → 56**.

This was the detector quietly conceding that for a black/white point, *where
does the data lift off the floor* (a level question) is what a person actually
picks — not *where does the slope get steep* (a shape question).

### 5. Split the sides, drop the noise floor (commit `e7bbf96`, PR #10)

Two measurements against the (by now 18-case) corpus:

- A **pure** level crossing for the left knee — no derivative machinery at all —
  is within ~4 of every hand-picked black point. The derivative scan bought ~2
  bins on 3 steep-left channels and nothing else.
- The **noise-floor estimator** (`mean + 5·std` of flat-edge derivative
  magnitude, pooled across both edges) never beat `0.05·maxDeriv` on the right
  of any real scan, and is moot on the left once the left knee is a level.

So the left side lost all derivative logic, and `edgeSampleCount` /
`noiseThresholdMultiplier` / the pooled noise floor were deleted. One
`rightThreshold` instead of a two-sided max-of-three. 373 → 262 lines, 11 → 9
knobs, left and right fully decoupled. (Removing the pooled noise floor also
*improved* three right knees, where left-edge derivative noise had been
inflating the shared threshold.)

### 6. Collapse to a per-bin floor rule (commit `3c1737b`, PR #10)

The human who picked the corpus decided the **mid-cliff right-knee values were
wrong** — the floor is what they want. That removed the one thing the right-side
derivative scan was for (landing partway up a steep shoulder), so the right knee
became a level crossing too, mirroring the left. Nine expected right values
moved outward toward zero; every `tolerance` override went away (default ±5 fits
all 18).

Everything else was then dead: Savitzky-Golay entirely, `scanForOnset`,
`structureOutsideRight`, `lagCorrection`, `clippedEdgeThresholdFraction`,
`flatEdgeMaxFraction`, `minThresholdFraction`, `sustainCount`,
`spuriousKneeMassFraction`, and the `ml-savitzky-golay` dependency.

**Current algorithm, in full:**

```ts
const y = counts.map((v) => (Number(v) || 0) / max);           // normalize to peak
// black point: first bin at or above floorLevelFraction of the peak
for (let i = 0; i < n; i++) if (y[i] >= floorLevelFraction) { leftKnee = i; break; }
// white point: last such bin
for (let i = n - 1; i >= 0; i--) if (y[i] >= floorLevelFraction) { rightKnee = i; break; }
```

One knob: `floorLevelFraction` (0.0015). Zero runtime dependencies. Bundle
85 kB → 8 kB. `find-knees.ts` 373 → ~65 lines.

The same commit also removed the **"threshold percentage of pixel mass"** levels
method — three methods to two (*knee detection*, *darkest and lightest pixels*).
Note the floor rule is essentially that method, but *instantaneous* (per bin)
instead of *cumulative* — arguably what it should have been.

---

## The test corpus

18 channels from 6 scanned frames, in `src/find-knees.test.ts`:

| frame | notes |
|---|---|
| `2026-08-28-01`, `2026-08-28-07` | the first real scans; unremarkable shapes |
| `knee-gets-confused` | clipped-ish red tail; steep blue cliff (the "mid-cliff" argument) |
| `macro-mostly-pink` | heavy magenta cast; green clipped at top with a secondary hump |
| `2026-09-06-02` | blue has an ultra-gradual left ramp |
| `2026-09-06-02-with-gamma` | same frame, after the Screen Curves gamma layer — highlights blown into a white spike |

To add a case: export the channel histograms from a scan
(`Export Channel Histograms…`, see `src/export-histograms.ts`), paste the arrays
in, and set `expectedLeft` / `expectedRight` to the bins you'd pick by eye.

---

## Why you might want to walk this back

- **The floor rule has no notion of shape.** It cannot tell a real shoulder from
  a long gentle slope. A scan with meaningful image data below 0.15% of its peak
  count — a very high-key negative, or one with shadow detail you care about —
  will get clipped.
- **`floorLevelFraction = 0.0015` is one magic number fit to 6 frames.** A wider
  or more varied corpus could push it, or reveal that one global value isn't
  enough.
- **The mid-cliff-vs-floor question was a reversed human judgment.** It could
  reverse again. If the white point should sometimes sit partway up a steep
  shoulder, a level rule can't do it and the derivative scan (commit `e7bbf96`
  state) is the thing to restore.
- **The derivative scan was ~2 bins more accurate** than the level on channels
  with a genuinely sharp left shoulder. Small, but real.

If you go back, `git show e7bbf96:src/find-knees.ts` is the last
derivative-based version (left already a level, right still a scan), and
`git show 50989db:src/find-knees.ts` is the fully-featured one with all nine
knobs.
