import { action } from 'adobe:photoshop';

// `Channel.histogram` (the DOM API) throws "the operation is not valid for channels of
// type component" for the individual red/green/blue channels of an RGB document, so the
// histogram has to be fetched via batchPlay instead.
const COMPONENT_CHANNELS = [
	{ key: 'Red', value: 'red' },
	{ key: 'Green', value: 'green' },
	{ key: 'Blue', value: 'blue' },
] as const;

/** Histograms (256-entry pixel counts) for each component channel (e.g. red, green, blue) of the active document. Channels must be visible. */
export async function getChannelHistograms(): Promise<Map<string, number[]>> {
	const results = await action.batchPlay(
		COMPONENT_CHANNELS.map(({ value }) => ({
			_obj: 'get',
			_target: [{ _property: 'histogram' }, { _ref: 'channel', _enum: 'channel', _value: value }],
		})),
		{},
	);

	const map = new Map<string, number[]>();
	COMPONENT_CHANNELS.forEach(({ key }, i) => {
		map.set(key, results[i].histogram as number[]);
	});
	return map;
}

// Total number of nonzero pixels in a histogram.
export function countNonzeroEntriesInHistogram(histogram: number[]): number {
	return histogram.reduce((count, value) => count + value, 0);
}


// Find the pixel value at which we have accounted for the threshold percentage of nonzero pixels in the histogram, working up.
export function getLowerThresholdFromHistogram(histogram: number[], totalNonzero: number,thresholdPercentage: number): number {
	const thresholdCount = Math.floor((thresholdPercentage / 100) * totalNonzero);
	let cumulativeCount = 0;
	for (let i = 0; i < histogram.length; i++) {
		cumulativeCount += histogram[i];
		if (cumulativeCount >= thresholdCount) {
			return i;
		}
	}
	return 0; // Fallback, should not happen if totalNonzero > 0
}

export function getUpperThresholdFromHistogram(histogram: number[], totalNonzero: number, thresholdPercentage: number): number {
	const thresholdCount = Math.floor((thresholdPercentage / 100) * totalNonzero);
	let cumulativeCount = 0;
	for (let i = histogram.length - 1; i >= 0; i--) {
		cumulativeCount += histogram[i];
		if (cumulativeCount >= thresholdCount) {
			return i;
		}
	}
	return histogram.length - 1; // Fallback, should not happen if totalNonzero > 0
}

export function getThresholdsFromHistogram(histogram: number[], thresholdPercentage: number): LimitValues {
	const totalNonzero = countNonzeroEntriesInHistogram(histogram);
	return {
		min: getLowerThresholdFromHistogram(histogram, totalNonzero, thresholdPercentage),
		max: getUpperThresholdFromHistogram(histogram, totalNonzero, thresholdPercentage)
	};
}

// Calculate level thresholds by color channel based on the histogram of the active document and a given threshold percentage. 
// The thresholds are calculated such that the specified percentage of nonzero pixels are excluded from both the lower and upper ends of the histogram for each channel.
export async function getLayerThresholdsFromHistograms(thresholdPercentage: number): Promise<AllLimitValues> {
	const histograms = await getChannelHistograms();
	return {
		red: getThresholdsFromHistogram(histograms.get('Red')!, thresholdPercentage),
		green: getThresholdsFromHistogram(histograms.get('Green')!, thresholdPercentage),
		blue: getThresholdsFromHistogram(histograms.get('Blue')!, thresholdPercentage)
	};
}
