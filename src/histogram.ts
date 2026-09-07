import { action } from 'adobe:photoshop';
import { findKnees } from './find-knees';

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

// The black/white point for a channel: the first and last histogram bins that
// still hold a meaningful fraction of the peak count (see find-knees.ts).
export function getKneeLimitsFromHistogram(histogram: number[]): LimitValues {
	const { leftKnee, rightKnee } = findKnees(histogram);
	return { min: leftKnee ?? 0, max: rightKnee ?? histogram.length - 1 };
}

export async function getLayerLimitsFromKnees(): Promise<AllLimitValues> {
	const histograms = await getChannelHistograms();
	return {
		red: getKneeLimitsFromHistogram(histograms.get('Red')!),
		green: getKneeLimitsFromHistogram(histograms.get('Green')!),
		blue: getKneeLimitsFromHistogram(histograms.get('Blue')!),
	};
}
