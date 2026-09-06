/**
 * Black/white-point detection for a Photoshop-style channel histogram.
 *
 * A scanned C41 negative channel is near-zero at both ends, with the real
 * tonal data in between. The black point is where the counts first lift
 * off that near-zero floor scanning up from bin 0; the white point is
 * where they settle back onto it scanning down from bin 255. Both are the
 * outermost bin still holding at least `floorLevelFraction` of the peak
 * count.
 *
 * (Earlier versions of this ran a Savitzky-Golay derivative scan looking
 * for the "knee" where the shoulder bends into the tail, with a stack of
 * thresholds for clipped edges, gentle ramps, blown highlights, and
 * secondary lobes. Against a corpus of hand-picked points on real scans -
 * see find-knees.test.ts - a plain per-bin level lands within a few bins
 * of every one of them, so all of that is gone. The name "knee" stuck.)
 */

export interface KneeDetectionOptions {
  /** A channel's black/white point is the outermost bin (scanning in from
   *  each end) that still holds at least this fraction of the histogram's
   *  peak count. Default: 0.0015 */
  floorLevelFraction?: number;
}

export interface KneeResult {
  /** Level (e.g. 0-255) where the data lifts off its low-end floor.
   *  Null only if no bin reaches `floorLevelFraction` of the peak, which
   *  cannot happen for a real histogram (the peak bin normalizes to 1). */
  leftKnee: number | null;
  /** Level where the data settles back onto its high-end floor. Null under
   *  the same (impossible) condition as `leftKnee`. */
  rightKnee: number | null;
  /** The histogram normalized to [0, 1] by its peak, for plotting. */
  normalized: number[];
}

export function findKnees(counts: number[], options: KneeDetectionOptions = {}): KneeResult {
  const n = counts.length;
  if (n < 8) {
    throw new Error('findKnees: need at least 8 samples to do anything meaningful.');
  }
  const floorLevelFraction = options.floorLevelFraction ?? 0.0015;

  const raw = counts.map((v) => Number(v) || 0);
  const max = Math.max(...raw, 1e-9);
  const y = raw.map((v) => v / max);

  let leftKnee: number | null = null;
  let rightKnee: number | null = null;
  for (let i = 0; i < n; i++) {
    if (y[i] >= floorLevelFraction) {
      leftKnee = i;
      break;
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    if (y[i] >= floorLevelFraction) {
      rightKnee = i;
      break;
    }
  }

  return { leftKnee, rightKnee, normalized: y };
}
