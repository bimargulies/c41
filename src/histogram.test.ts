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

const { getChannelHistograms, getKneeLimitsFromHistogram, getLayerLimitsFromKnees } = await import('./histogram');

function emptyHistogram(): number[] {
	return new Array(256).fill(0);
}

function setChannels(channels: { red: number[]; green: number[]; blue: number[] }) {
	mockHistograms.red = channels.red;
	mockHistograms.green = channels.green;
	mockHistograms.blue = channels.blue;
}

// A block of equal mass over bins lo..hi and nothing elsewhere.
function block(lo: number, hi: number): number[] {
	const histogram = emptyHistogram();
	for (let i = lo; i <= hi; i++) histogram[i] = 1000;
	return histogram;
}

afterEach(() => {
	delete mockHistograms.red;
	delete mockHistograms.green;
	delete mockHistograms.blue;
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

describe('getKneeLimitsFromHistogram', () => {
	it('returns the first and last bins holding a meaningful fraction of the peak', () => {
		expect(getKneeLimitsFromHistogram(block(40, 210))).toEqual({ min: 40, max: 210 });
	});

	it('falls back to the full 0-255 range when no bin qualifies', () => {
		expect(getKneeLimitsFromHistogram(emptyHistogram())).toEqual({ min: 0, max: 255 });
	});
});

describe('getLayerLimitsFromKnees', () => {
	it('applies the knee detection to each channel independently', async () => {
		setChannels({ red: block(12, 200), green: block(30, 180), blue: block(5, 250) });

		expect(await getLayerLimitsFromKnees()).toEqual({
			red: { min: 12, max: 200 },
			green: { min: 30, max: 180 },
			blue: { min: 5, max: 250 },
		});
	});
});
