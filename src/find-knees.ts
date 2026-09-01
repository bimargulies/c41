/**
 * Knee (sharp-bend) detection for a Photoshop-style histogram.
 *
 * Requires: npm i ml-savitzky-golay
 *
 * Assumes the input is a raw counts array (e.g. 256 bins, values 0-255)
 * shaped like: near-zero flat region -> rises sharply -> arbitrary
 * behavior in the middle -> falls sharply -> near-zero flat region.
 *
 * Finds the first significant "knee" (sharp bend) scanning in from the
 * left edge, and the first significant knee scanning in from the right
 * edge. Because both scans stop at the *first* qualifying bend, whatever
 * happens in the middle of the histogram (multiple modes, spikes, etc.)
 * is irrelevant.
 *
 * IMPLEMENTATION NOTE: an earlier version of this detector used geometric
 * curvature (|y''| / (1 + y'^2)^1.5). That formula divides by the local
 * slope, which is fine for curves where slope stays near O(1) but breaks
 * down on real histograms: a peak of a few thousand pixels rising over
 * ~20 levels has a slope in the hundreds, so (1 + y'^2)^1.5 explodes and
 * drowns out the actual corner - the detector ends up firing wherever the
 * slope happens to be small again, not at the real bend. This version
 * instead normalizes the histogram to [0, 1] by its own max and detects
 * the first sustained onset of the (now scale-free) derivative magnitude
 * above a noise-derived threshold. The scale-free derivative approach was
 * first shaken out against synthetic histograms spanning peak heights
 * from ~200 to ~50,000 counts; the current calibration (thresholds, lag
 * correction) is fit against a corpus of real C41 negative scans - see
 * the cases in find-knees.test.ts, which carry hand-picked expected knee
 * positions and are the ground truth for any future change here.
 *
 * CLIPPED HISTOGRAMS: the "near-zero flat region" at each end is not
 * guaranteed. A channel can still hold several percent of its pixels in
 * bin 0 or bin 255, so the falling shoulder runs straight off the edge.
 * Two adjustments handle this: (1) an edge is only pooled into the
 * noise-floor estimate when it is genuinely flat (`flatEdgeMaxFraction`),
 * otherwise the shoulder sitting in it inflates the threshold and
 * swallows a gentle onset on the far side; (2) the scan on a clipped
 * side uses a higher threshold (`clippedEdgeThresholdFraction`), since
 * that side has no quiet tail and a low threshold would trip on the
 * first sample.
 */

import savitzkyGolay from 'ml-savitzky-golay';

export interface KneeDetectionOptions {
  /** Window size (in samples) for the Savitzky-Golay filter. Must be odd
   *  and greater than `polynomial`. Larger = smoother but blurs sharp
   *  bends and adds lag to the detected knee position. Default: smallest
   *  odd number >= length * 0.05, minimum 5. */
  windowSize?: number;
  /** Polynomial order used by the Savitzky-Golay fit. Default: 3. */
  polynomial?: number;
  /** Number of leading/trailing samples assumed to be pure "flat" noise,
   *  used to estimate the noise floor for the derivative threshold. Keep
   *  this SMALLER than the shortest flat region you expect - if it's
   *  larger, it will pool in part of the real ramp and inflate the
   *  threshold, causing missed knees (see 'short flat region' case in
   *  the test harness). Default: max(4, round(length * 0.03)) -> ~8 for
   *  a 256-bin histogram. */
  edgeSampleCount?: number;
  /** Multiplier applied to the noise floor's standard deviation to set
   *  the significance threshold. Raise if flat-region wiggle triggers
   *  false knees; lower if a subtle real bend is being missed.
   *  Default: 5 */
  noiseThresholdMultiplier?: number;
  /** Minimum significance threshold, expressed as a fraction of the peak
   *  derivative magnitude. When the edge regions are exactly flat (zero
   *  counts, zero noise), the noise-floor threshold collapses to ~0, so
   *  the scan fires on the first nonzero slope it meets - which can be a
   *  secondary, gentler ramp far from the real knee, rather than the
   *  sharp bend itself. This floor keeps the threshold from collapsing
   *  in that case. Default: 0.05 */
  minThresholdFraction?: number;
  /** Number of consecutive samples the derivative magnitude must remain
   *  above threshold before a knee is accepted, to reject single-sample
   *  noise spikes. Default: 3 */
  sustainCount?: number;
  /** An edge region is only trusted as "flat noise" for the noise-floor
   *  estimate if its largest normalized value stays at or below this
   *  fraction of the histogram peak. Histograms are not guaranteed to
   *  decay to zero at both boundaries - a channel can still hold several
   *  percent of its pixels in the last bin - and pooling that falling
   *  shoulder into the noise estimate inflates the threshold enough to
   *  swallow a gentle onset on the opposite side. When one edge fails
   *  this test the other edge alone is used; when both fail, the
   *  noise-floor term is dropped and `minThresholdFraction` governs.
   *  Default: 0.02 */
  flatEdgeMaxFraction?: number;
  /** Threshold used on a side whose edge region is NOT flat (i.e. the
   *  histogram is clipped at that boundary, so the falling shoulder runs
   *  right off the edge and there is no quiet tail to scan in from).
   *  Expressed as a fraction of the peak derivative magnitude. It has to
   *  be well above `minThresholdFraction`: the clipped tail still carries
   *  real slope, and a low threshold would make the inward scan trip on
   *  the very first sample. Only ever applied to the clipped side - the
   *  opposite side keeps the noise-floor threshold. Default: 0.18 */
  clippedEdgeThresholdFraction?: number;
  /** Samples to shift each detected knee toward lower indices, correcting
   *  a systematic bias: the threshold-crossing scan lands a few samples
   *  inside the corner a human would pick (measured mean +2.4 on the left
   *  knee, +3.7 on the right, against the real-scan corpus in
   *  find-knees.test.ts). Applied to both ends equally, after the scan.
   *  Default: round(windowSize / 4). Set to 0 to get the raw crossing. */
  lagCorrection?: number;
}

export interface KneeResult {
  /** Index (histogram level, e.g. 0-255) of the first sharp bend scanning
   *  in from the left. Null if none found above the noise floor. */
  leftKnee: number | null;
  /** Index of the first sharp bend scanning in from the right. Null if
   *  none found above the noise floor. */
  rightKnee: number | null;
  /** Intermediate arrays, exposed for debugging/plotting in your plugin UI. */
  normalized: number[];
  smoothed: number[];
  derivative: number[];
  derivativeMagnitude: number[];
  /** Derivative-magnitude threshold used for the left-side scan. */
  leftThreshold: number;
  /** Derivative-magnitude threshold used for the right-side scan. Differs
   *  from `leftThreshold` only when exactly one edge is clipped. */
  rightThreshold: number;
  /** Samples subtracted from each raw threshold-crossing index to produce
   *  `leftKnee` / `rightKnee`. Add it back to recover the raw crossing
   *  (modulo clamping at the array bounds). */
  lagCorrection: number;
}

/** Ensure a window size is odd and at least `min`. */
function toOdd(value: number, min: number): number {
  let v = Math.max(Math.round(value), min);
  if (v % 2 === 0) v += 1;
  return v;
}

/**
 * Scan `values` from `start` toward `end` (step +1 or -1) and return the
 * first index where the value stays above `threshold` for `sustainCount`
 * consecutive samples. Returns null if nothing qualifies.
 */
function scanForOnset(
  values: number[],
  start: number,
  end: number,
  step: 1 | -1,
  threshold: number,
  sustainCount: number
): number | null {
  let run = 0;
  for (let i = start; step === 1 ? i <= end : i >= end; i += step) {
    if (values[i] > threshold) {
      run++;
      if (run >= sustainCount) {
        // Report the start of the sustained run (not the confirmation
        // point) so the returned index sits right at the bend itself.
        return i - step * (sustainCount - 1);
      }
    } else {
      run = 0;
    }
  }
  return null;
}

export function findKnees(counts: number[], options: KneeDetectionOptions = {}): KneeResult {
  const n = counts.length;
  if (n < 8) {
    throw new Error('findKnees: need at least 8 samples to do anything meaningful.');
  }

  const polynomial = options.polynomial ?? 3;
  const windowSize = options.windowSize ?? toOdd(n * 0.05, Math.max(5, polynomial + 2));
  const edgeSampleCount = options.edgeSampleCount ?? Math.max(4, Math.round(n * 0.03));
  const noiseThresholdMultiplier = options.noiseThresholdMultiplier ?? 5;
  const minThresholdFraction = options.minThresholdFraction ?? 0.05;
  const sustainCount = options.sustainCount ?? 3;
  const flatEdgeMaxFraction = options.flatEdgeMaxFraction ?? 0.02;
  const clippedEdgeThresholdFraction = options.clippedEdgeThresholdFraction ?? 0.18;
  const lagCorrection = options.lagCorrection ?? Math.round(windowSize / 4);

  const raw = counts.map((v) => Number(v) || 0);

  // Normalize to [0, 1] by the histogram's own max. This keeps the
  // derivative on a scale-free footing regardless of whether the peak is
  // a few hundred pixels or a few hundred thousand - see the module
  // comment above for why this matters.
  const max = Math.max(...raw, 1e-9);
  const y = raw.map((v) => v / max);

  const sgOptions = (derivative: number) => ({
    windowSize,
    polynomial,
    derivative,
    pad: 'post' as const,
    padValue: 'replicate' as const,
  });

  const smoothed: number[] = savitzkyGolay(y, 1, sgOptions(0));
  const derivative: number[] = savitzkyGolay(y, 1, sgOptions(1));
  const derivativeMagnitude = derivative.map(Math.abs);

  // Estimate the noise floor from short, presumed-flat segments at both
  // edges (pooling both ends so an unusually quiet left or right side
  // alone doesn't bias the estimate) - but only from edges that are
  // genuinely flat. A histogram clipped at a boundary (its last bin still
  // several percent of the peak) has a falling shoulder sitting in that
  // "edge" region; pooling it inflates the threshold and swallows a
  // gentle onset on the far side.
  const leftEdgeFlat = Math.max(...y.slice(0, edgeSampleCount)) <= flatEdgeMaxFraction;
  const rightEdgeFlat = Math.max(...y.slice(n - edgeSampleCount)) <= flatEdgeMaxFraction;
  const edgeSamples = [
    ...(leftEdgeFlat ? derivativeMagnitude.slice(0, edgeSampleCount) : []),
    ...(rightEdgeFlat ? derivativeMagnitude.slice(n - edgeSampleCount) : []),
  ];
  let noiseFloorThreshold = 0;
  if (edgeSamples.length > 0) {
    const mean = edgeSamples.reduce((a, b) => a + b, 0) / edgeSamples.length;
    const variance =
      edgeSamples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / edgeSamples.length;
    const std = Math.sqrt(variance);
    noiseFloorThreshold = mean + noiseThresholdMultiplier * std;
  }

  // The noise-floor threshold alone collapses to ~0 when the edge regions
  // are exactly flat (see `minThresholdFraction` doc comment), so floor it
  // against a fraction of the peak derivative magnitude.
  const maxDerivativeMagnitude = Math.max(...derivativeMagnitude, 0);
  const flatThreshold = Math.max(noiseFloorThreshold, minThresholdFraction * maxDerivativeMagnitude);

  // A clipped side has no quiet tail - its falling shoulder runs off the
  // edge - so the low flat-region threshold would make the inward scan
  // trip on the very first sample. Give that side (only) a higher bar.
  const clippedThreshold = Math.max(
    flatThreshold,
    clippedEdgeThresholdFraction * maxDerivativeMagnitude
  );
  const leftThreshold = leftEdgeFlat ? flatThreshold : clippedThreshold;
  const rightThreshold = rightEdgeFlat ? flatThreshold : clippedThreshold;

  const rawLeftKnee = scanForOnset(derivativeMagnitude, 0, n - 1, 1, leftThreshold, sustainCount);
  const rawRightKnee = scanForOnset(derivativeMagnitude, n - 1, 0, -1, rightThreshold, sustainCount);

  // Savitzky-Golay smoothing (and the asymmetric post-padding) biases the
  // threshold crossing a few samples above the corner a human would pick
  // - and, measured against the real-scan corpus in the test file, by
  // about the same amount on both ends. Subtract one window-derived
  // constant from each knee.
  const leftKnee = rawLeftKnee == null ? null : Math.max(0, rawLeftKnee - lagCorrection);
  const rightKnee = rawRightKnee == null ? null : Math.min(n - 1, rawRightKnee - lagCorrection);

  return {
    leftKnee,
    rightKnee,
    normalized: y,
    smoothed,
    derivative,
    derivativeMagnitude,
    leftThreshold,
    rightThreshold,
    lagCorrection,
  };
}

// ---------------------------------------------------------------------------
// Example usage:
//
// const counts: number[] = /* 256-length array of raw histogram counts */;
// const result = findKnees(counts);
// console.log('Left knee at level', result.leftKnee);
// console.log('Right knee at level', result.rightKnee);
//
// Tuning notes:
// - `edgeSampleCount` must stay smaller than your shortest expected flat
//   region, or the noise-floor estimate gets contaminated by the real
//   ramp and knees get missed. See test-harness.ts's "short flat region"
//   case.
// - The raw threshold crossing carries a fairly uniform positive index
//   bias (smoothing blur plus post-padding phase): against the real-scan
//   corpus the detected knee sat ~2-4 samples above the hand-picked
//   corner on BOTH ends. `lagCorrection` subtracts a single
//   window-derived constant (round(windowSize/4)) from both knees, which
//   leaves the residual within ~4 samples on every channel bar one
//   deliberately-tolerated steep shoulder. It scales with windowSize.
// ---------------------------------------------------------------------------
