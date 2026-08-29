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
 * above a noise-derived threshold. This was verified against synthetic
 * histograms spanning peak heights from ~200 to ~50,000 counts.
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
  threshold: number;
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
  // alone doesn't bias the estimate).
  const edgeSamples = [
    ...derivativeMagnitude.slice(0, edgeSampleCount),
    ...derivativeMagnitude.slice(n - edgeSampleCount),
  ];
  const mean = edgeSamples.reduce((a, b) => a + b, 0) / edgeSamples.length;
  const variance =
    edgeSamples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / edgeSamples.length;
  const std = Math.sqrt(variance);
  const noiseFloorThreshold = mean + noiseThresholdMultiplier * std;

  // The noise-floor threshold alone collapses to ~0 when the edge regions
  // are exactly flat (see `minThresholdFraction` doc comment), so floor it
  // against a fraction of the peak derivative magnitude.
  const maxDerivativeMagnitude = Math.max(...derivativeMagnitude, 0);
  const threshold = Math.max(noiseFloorThreshold, minThresholdFraction * maxDerivativeMagnitude);

  const leftKnee = scanForOnset(derivativeMagnitude, 0, n - 1, 1, threshold, sustainCount);
  const rightKnee = scanForOnset(derivativeMagnitude, n - 1, 0, -1, threshold, sustainCount);

  return {
    leftKnee,
    rightKnee,
    normalized: y,
    smoothed,
    derivative,
    derivativeMagnitude,
    threshold,
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
// - The detected index will lag the "true" geometric corner by roughly
//   windowSize/2 samples, since smoothing blurs the transition. If you
//   need pixel-exact corners, reduce windowSize (at the cost of more
//   noise sensitivity) or subtract half the window size as a correction.
// ---------------------------------------------------------------------------
