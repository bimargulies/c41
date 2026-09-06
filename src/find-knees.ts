/**
 * Knee (sharp-bend) detection for a Photoshop-style histogram.
 *
 * Requires: npm i ml-savitzky-golay
 *
 * Assumes the input is a raw counts array (e.g. 256 bins, values 0-255)
 * shaped like: near-zero flat region -> rises sharply -> arbitrary
 * behavior in the middle -> falls sharply -> near-zero flat region.
 *
 * The two ends want different things, so they are found differently:
 *
 * LEFT KNEE (black point) is simply where the channel data lifts off its
 * near-zero toe: the first bin reaching `onsetLevelFraction` of the peak.
 * A derivative scan was tried here too - it bought ~2 bins of accuracy on
 * a few steep-left channels, at the cost of a noise-floor estimator and a
 * threshold stack that fell over on gentle ramps and on blown highlights.
 * A plain level lands within ~4 of every hand-picked black point in the
 * test corpus, with none of that machinery.
 *
 * RIGHT KNEE (white point) is where the falling shoulder bends into the
 * tail, which is a slope question - a level rule there fights the channels
 * whose wanted knee sits partway up a steep shoulder rather than at the
 * floor. So: normalize to [0, 1] by the peak (keeps the derivative
 * scale-free), Savitzky-Golay smooth and differentiate, and scan in from
 * bin 255 for the first sustained run of derivative magnitude above a
 * threshold. Two wrinkles from real scans: (1) a channel can hold several
 * percent of its pixels in bin 255 (blown highlights / clipped) with no
 * quiet tail to scan in from, so a clipped right edge
 * (`flatEdgeMaxFraction`) uses a higher threshold
 * (`clippedEdgeThresholdFraction`) to avoid tripping on the first sample;
 * (2) if the scan latches onto interior structure - a secondary lobe
 * inside a clipped edge - the knee is rejected when real mass remains
 * outside it (`spuriousKneeMassFraction`), and a clipped edge then falls
 * back to the boundary (don't clip that side at all).
 *
 * An earlier version used geometric curvature (|y''| / (1 + y'^2)^1.5) for
 * both ends; that formula divides by the local slope and explodes on a
 * real histogram peak (slope in the hundreds), firing wherever the slope
 * is small again rather than at the bend. The current calibration is fit
 * against a corpus of real C41 negative scans - see the cases in
 * find-knees.test.ts, which carry hand-picked expected knee positions and
 * are the ground truth for any change here.
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
  /** Left knee: the first bin at which the normalized (unsmoothed)
   *  histogram reaches this fraction of the peak - i.e. where the channel
   *  data lifts off its near-zero toe. Default: 0.0015 */
  onsetLevelFraction?: number;
  /** Right knee: threshold for the inward derivative scan, as a fraction
   *  of the peak derivative magnitude, when the right edge is flat.
   *  Default: 0.05 */
  minThresholdFraction?: number;
  /** Right knee: threshold when the right edge is clipped instead (the
   *  falling shoulder runs off bin 255 with no quiet tail). Must be well
   *  above `minThresholdFraction` - the clipped tail still carries real
   *  slope, and a low bar would trip the scan on the first sample.
   *  Default: 0.18 */
  clippedEdgeThresholdFraction?: number;
  /** The right edge counts as clipped (see `clippedEdgeThresholdFraction`)
   *  when its largest normalized value exceeds this fraction of the peak.
   *  Default: 0.02 */
  flatEdgeMaxFraction?: number;
  /** Number of consecutive samples the derivative magnitude must stay
   *  above threshold for the right-knee scan to accept a bend, rejecting
   *  single-sample noise spikes. Default: 3 */
  sustainCount?: number;
  /** The right knee is rejected as spurious - the scan latched onto
   *  interior structure (a secondary lobe) rather than the shoulder - when
   *  the smoothed curve anywhere outside it still exceeds this fraction of
   *  the peak. A clipped edge then falls back to the boundary (no clipping
   *  on that side); otherwise no right knee is reported. Default: 0.15 */
  spuriousKneeMassFraction?: number;
  /** Samples to shift the right knee toward lower indices. The smoothed
   *  derivative gets significant a few bins before the scan reaches the
   *  true corner, so the raw crossing sits ~3 samples toward bin 255 from
   *  the hand-picked corner on the real-scan corpus in find-knees.test.ts.
   *  Default: round(windowSize / 4). Set to 0 for the raw crossing. */
  lagCorrection?: number;
}

export interface KneeResult {
  /** Histogram level (e.g. 0-255) where the data lifts off its near-zero
   *  toe - see `onsetLevelFraction`. Null only if no bin reaches that
   *  level (impossible for a real histogram: the peak bin is always 1.0). */
  leftKnee: number | null;
  /** Histogram level where the falling shoulder bends into the tail,
   *  scanning in from bin 255. Null if the scan finds no bend, or if the
   *  bend was rejected as spurious on a non-clipped edge; the last index
   *  if rejected as spurious on a clipped edge (see
   *  `spuriousKneeMassFraction`). */
  rightKnee: number | null;
  /** Intermediate arrays, exposed for debugging/plotting in your plugin UI. */
  normalized: number[];
  smoothed: number[];
  derivative: number[];
  derivativeMagnitude: number[];
  /** Derivative-magnitude threshold used for the right-knee scan. */
  rightThreshold: number;
  /** Samples subtracted from the raw right-side crossing to produce
   *  `rightKnee` (add it back for the raw crossing, modulo clamping). */
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
  const onsetLevelFraction = options.onsetLevelFraction ?? 0.0015;
  const minThresholdFraction = options.minThresholdFraction ?? 0.05;
  const clippedEdgeThresholdFraction = options.clippedEdgeThresholdFraction ?? 0.18;
  const flatEdgeMaxFraction = options.flatEdgeMaxFraction ?? 0.02;
  const sustainCount = options.sustainCount ?? 3;
  const spuriousKneeMassFraction = options.spuriousKneeMassFraction ?? 0.15;
  const lagCorrection = options.lagCorrection ?? Math.round(windowSize / 4);

  const raw = counts.map((v) => Number(v) || 0);

  // Normalize to [0, 1] by the histogram's own max. This keeps the right-knee
  // derivative on a scale-free footing whatever the peak height - see the
  // module comment for why the geometric-curvature alternative fails.
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

  // LEFT KNEE (black point): the first bin where the data lifts off the toe.
  let leftKnee: number | null = null;
  for (let i = 0; i < n; i++) {
    if (y[i] >= onsetLevelFraction) {
      leftKnee = i;
      break;
    }
  }

  // RIGHT KNEE (white point): scan in from bin 255 for the first sustained
  // run of significant slope. A clipped right edge (its last bins still a
  // few percent of the peak) has no quiet tail, so it gets a higher bar or
  // the scan trips on the first sample.
  const clipTestWidth = Math.max(4, Math.round(n * 0.03));
  const rightEdgeClipped = Math.max(...y.slice(n - clipTestWidth)) > flatEdgeMaxFraction;
  const maxDerivativeMagnitude = Math.max(...derivativeMagnitude, 0);
  const rightThreshold =
    (rightEdgeClipped ? clippedEdgeThresholdFraction : minThresholdFraction) * maxDerivativeMagnitude;

  const rawRightKnee = scanForOnset(derivativeMagnitude, n - 1, 0, -1, rightThreshold, sustainCount);

  // Reject a knee that still has real structure outside it (a secondary
  // lobe, a sub-shoulder): the scan caught interior detail, not the
  // shoulder. The guard band skips the smoothing-blurred transition at the
  // knee itself. A clipped edge then keeps the boundary (the data runs off
  // it - don't clip that side); a flat edge reports no knee.
  const guard = Math.round(windowSize / 2);
  const structureOutsideRight = (knee: number): boolean => {
    for (let i = Math.min(n - 1, knee + guard); i <= n - 1; i++) {
      if (smoothed[i] > spuriousKneeMassFraction) return true;
    }
    return false;
  };

  let rightKnee: number | null;
  if (rawRightKnee == null) {
    rightKnee = null;
  } else if (structureOutsideRight(rawRightKnee)) {
    rightKnee = rightEdgeClipped ? n - 1 : null;
  } else {
    // Savitzky-Golay smoothing + post-padding biases the crossing a few
    // samples inside the corner; shift back out by a window-derived constant.
    rightKnee = Math.min(n - 1, rawRightKnee - lagCorrection);
  }

  return {
    leftKnee,
    rightKnee,
    normalized: y,
    smoothed,
    derivative,
    derivativeMagnitude,
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
// - `onsetLevelFraction` sets the black point directly. Lower it and every
//   left knee moves toward bin 0; it is a single constant fit to the
//   real-scan corpus (within ~4 of every hand-picked black point).
// - The raw right-side crossing sits ~3 samples toward bin 255 from the
//   hand-picked corner (the smoothed derivative gets significant before
//   the scan reaches the true bend). `lagCorrection` subtracts one
//   window-derived constant (round(windowSize/4)); the residual is within
//   ~4 samples on every channel bar three deliberately wider-tolerance
//   shoulders. It scales with windowSize.
// ---------------------------------------------------------------------------
