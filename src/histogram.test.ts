import { afterEach, describe, expect, it, vi } from 'vitest';

// getChannelHistograms fetches each channel's histogram via action.batchPlay (Channel.histogram,
// the DOM API, throws for individual red/green/blue channels), so batchPlay is mocked to return
// canned histogram data keyed by the channel enum value ('red'/'green'/'blue') requested in each
// descriptor's _target.
const mockHistograms: Record<string, number[]> = {};

vi.mock('adobe:photoshop', () => ({
	action: {
		batchPlay: vi.fn(async (commands: { _target: [unknown, { _value: string }] }[]) => {
			return commands.map((command) => ({ histogram: mockHistograms[command._target[1]._value] }));
		}),
	},
}));

// findKnees has its own exhaustive test suite; here it is mocked so the fallback
// behaviour of getKneeLimitsFromHistogram can be exercised deterministically.
vi.mock('./find-knees', () => ({ findKnees: vi.fn() }));
const { findKnees } = await import('./find-knees');
const mockFindKnees = vi.mocked(findKnees);

const {
	getLayerThresholdsFromHistograms,
	getChannelHistograms,
	countNonzeroEntriesInHistogram,
	getLowerThresholdFromHistogram,
	getUpperThresholdFromHistogram,
	getThresholdsFromHistogram,
	getKneeLimitsFromHistogram,
} = await import('./histogram');

function emptyHistogram(): number[] {
	return new Array(256).fill(0);
}

function setChannels(channels: { red: number[]; green: number[]; blue: number[] }) {
	mockHistograms.red = channels.red;
	mockHistograms.green = channels.green;
	mockHistograms.blue = channels.blue;
}

afterEach(() => {
	delete mockHistograms.red;
	delete mockHistograms.green;
	delete mockHistograms.blue;
});

describe('getLayerThresholdsFromHistograms', () => {
	it('returns the full 0-255 range for every channel when threshold is 0%', async () => {
		const red = emptyHistogram();
		red[100] = 5000;
		setChannels({ red, green: emptyHistogram(), blue: emptyHistogram() });

		const result = await getLayerThresholdsFromHistograms(0);

		expect(result).toEqual({
			red: { min: 0, max: 255 },
			green: { min: 0, max: 255 },
			blue: { min: 0, max: 255 },
		});
	});

	it('trims small tails at each end while keeping the main mass, independently per channel', async () => {
		// Each channel has a small "noise" tail (5 pixels) at 0 and 255, with the bulk of the
		// pixels (100 each) in a handful of bins in between. A 20% threshold is comfortably more
		// than a single tail (5 / 210-310 total) but far less than tail + one main bin, so the
		// walk should skip past the tail and land on the first/last main bin for each channel.
		const red = emptyHistogram();
		red[0] = 5;
		red[10] = 100;
		red[20] = 100;
		red[30] = 100;
		red[255] = 5;

		const green = emptyHistogram();
		green[0] = 5;
		green[50] = 100;
		green[60] = 100;
		green[255] = 5;

		const blue = emptyHistogram();
		blue[0] = 5;
		blue[190] = 100;
		blue[200] = 100;
		blue[255] = 5;

		setChannels({ red, green, blue });

		const result = await getLayerThresholdsFromHistograms(20);

		expect(result).toEqual({
			red: { min: 10, max: 30 },
			green: { min: 50, max: 60 },
			blue: { min: 190, max: 200 },
		});
	});

	it('treats an entirely empty channel histogram as the full 0-255 range', async () => {
		setChannels({ red: emptyHistogram(), green: emptyHistogram(), blue: emptyHistogram() });

		const result = await getLayerThresholdsFromHistograms(75);

		expect(result).toEqual({
			red: { min: 0, max: 255 },
			green: { min: 0, max: 255 },
			blue: { min: 0, max: 255 },
		});
	});

	it('collapses to a single value when every pixel in a channel shares one value', async () => {
		// If a channel has only one distinct pixel value, trimming any percentage from each end
		// of its histogram still leaves just that one value.
		const red = emptyHistogram();
		red[128] = 9999;
		setChannels({ red, green: emptyHistogram(), blue: emptyHistogram() });

		const result = await getLayerThresholdsFromHistograms(50);

		expect(result.red).toEqual({ min: 128, max: 128 });
	});
});

describe('getChannelHistograms', () => {
	it('maps each component channel by name to its histogram', async () => {
		const red = emptyHistogram();
		red[10] = 5;
		const green = emptyHistogram();
		green[20] = 7;
		const blue = emptyHistogram();
		blue[30] = 9;
		setChannels({ red, green, blue });

		const result = await getChannelHistograms();

		expect(result.get('Red')).toBe(red);
		expect(result.get('Green')).toBe(green);
		expect(result.get('Blue')).toBe(blue);
		expect(result.size).toBe(3);
	});
});

describe('countNonzeroEntriesInHistogram', () => {
	it('sums all bin values', () => {
		const histogram = emptyHistogram();
		histogram[0] = 5;
		histogram[128] = 10;
		histogram[255] = 3;

		expect(countNonzeroEntriesInHistogram(histogram)).toBe(18);
	});

	it('returns 0 for an all-zero histogram', () => {
		expect(countNonzeroEntriesInHistogram(emptyHistogram())).toBe(0);
	});
});

describe('getLowerThresholdFromHistogram', () => {
	it('returns the index where cumulative count first reaches the threshold', () => {
		const histogram = emptyHistogram();
		histogram[10] = 50;
		histogram[20] = 50;

		// totalNonzero passed in explicitly, independent of the histogram's actual sum, to
		// exercise the threshold math in isolation from countNonzeroEntriesInHistogram.
		expect(getLowerThresholdFromHistogram(histogram, 100, 60)).toBe(20);
	});

	it('returns 0 immediately when the threshold is 0', () => {
		const histogram = emptyHistogram();
		histogram[128] = 999;

		expect(getLowerThresholdFromHistogram(histogram, 999, 0)).toBe(0);
	});

	it('falls back to 0 if the cumulative count never reaches the threshold', () => {
		const histogram = emptyHistogram();
		histogram[128] = 5;

		// totalNonzero is deliberately inflated so thresholdCount (100) can never be reached by
		// the histogram's actual cumulative sum (5), forcing the fallback branch.
		expect(getLowerThresholdFromHistogram(histogram, 1000, 10)).toBe(0);
	});
});

describe('getUpperThresholdFromHistogram', () => {
	it('returns the index where cumulative count first reaches the threshold, from the top', () => {
		const histogram = emptyHistogram();
		histogram[10] = 50;
		histogram[20] = 50;

		expect(getUpperThresholdFromHistogram(histogram, 100, 60)).toBe(10);
	});

	it('returns the last index immediately when the threshold is 0', () => {
		const histogram = emptyHistogram();
		histogram[128] = 999;

		expect(getUpperThresholdFromHistogram(histogram, 999, 0)).toBe(255);
	});

	it('falls back to the last index if the cumulative count never reaches the threshold', () => {
		const histogram = emptyHistogram();
		histogram[128] = 5;

		expect(getUpperThresholdFromHistogram(histogram, 1000, 10)).toBe(255);
	});
});

describe('getThresholdsFromHistogram', () => {
	it('combines the nonzero count and both walks into a min/max pair', () => {
		const histogram = emptyHistogram();
		histogram[0] = 5;
		histogram[10] = 100;
		histogram[20] = 100;
		histogram[30] = 100;
		histogram[255] = 5;

		expect(getThresholdsFromHistogram(histogram, 20)).toEqual({ min: 10, max: 30 });
	});
});

describe('getKneeLimitsFromHistogram', () => {
	// A block of equal mass over bins lo..hi and nothing elsewhere.
	function block(lo: number, hi: number): number[] {
		const histogram = emptyHistogram();
		for (let i = lo; i <= hi; i++) histogram[i] = 1000;
		return histogram;
	}

	const kneeResult = (leftKnee: number | null, rightKnee: number | null) => ({
		leftKnee,
		rightKnee,
		normalized: [],
		smoothed: [],
		derivative: [],
		derivativeMagnitude: [],
		leftThreshold: 0,
		rightThreshold: 0,
		lagCorrection: 0,
	});

	afterEach(() => mockFindKnees.mockReset());

	it('passes the detected knees straight through when both ends resolve', () => {
		mockFindKnees.mockReturnValue(kneeResult(42, 205));

		expect(getKneeLimitsFromHistogram(block(40, 210))).toEqual({ min: 42, max: 205 });
	});

	it('falls back to a 0.1% cumulative-mass clip on an end with no knee', () => {
		mockFindKnees.mockReturnValue(kneeResult(null, 205));

		// Mass spans bins 40..210, so the lower clip lands at bin 40 - not 0.
		expect(getKneeLimitsFromHistogram(block(40, 210))).toEqual({ min: 40, max: 205 });
	});

	it('falls back on both ends when no knee is found at all', () => {
		mockFindKnees.mockReturnValue(kneeResult(null, null));

		expect(getKneeLimitsFromHistogram(block(40, 210))).toEqual({ min: 40, max: 210 });
	});
});
