import { entrypoints } from 'uxp';
import { executeAsModal, createCommand } from '@bubblydoo/uxp-toolkit';
import { z } from 'zod';
import { imaging, app } from "adobe:photoshop";

console.log('[c41] plugin script evaluated');

/** Cleaned up data format for your application logic */
export interface ChannelHistogramData {
    name: string;
    histogram: number[];
}

/** Histograms (256-entry pixel counts) for each component channel (e.g. red, green, blue) of the active document. Channels must be visible. */
export async function getChannelHistograms(): Promise<ChannelHistogramData[]> {
	return app.activeDocument.componentChannels.map((channel) => ({
		name: channel.name,
		histogram: channel.histogram,
	}));
}

interface ChannelValues {
	red: number;
	green: number;
	blue: number;
}

interface LimitValues {
	min: ChannelValues;
	max: ChannelValues;
}

async function getMaxChannelValues(): Promise<LimitValues> {
	const { imageData } = await imaging.getPixels({ applyAlpha: true, componentSize: 8 });
	try {
		const data = (await imageData.getData({ chunky: true })) as Uint8Array;
		let redMax = 0;
		let greenMax = 0;
		let blueMax = 0;

		let redMin = 255;
		let greenMin = 255;
		let blueMin = 255;
	
		for (let i = 0; i < data.length; i += imageData.components) {
			if (data[i] > redMax) redMax = data[i];
			if (data[i + 1] > greenMax) greenMax = data[i + 1];
			if (data[i + 2] > blueMax) blueMax = data[i + 2];
			if (data[i] < redMin) redMin = data[i];
			if (data[i + 1] < greenMin) greenMin = data[i + 1];
			if (data[i + 2] < blueMin) blueMin = data[i + 2];
		}
		return { min: { red: redMin, green: greenMin, blue: blueMin }, max: { red: redMax, green: greenMax, blue: blueMax } };
	} finally {
		await imageData.dispose();
	}
}

async function addC41AdjustmentLayers() {
	console.log('[c41] addC41AdjustmentLayers: start');
	try {
		await addLevelsAndInvert();
		console.log('[c41] addC41AdjustmentLayers: done');
	} catch (err) {
		console.error('[c41] addC41AdjustmentLayers: failed', err);
	}
}

async function addLevelsAndInvert() {
	await executeAsModal('Add C41 Adjustment Layers', async (executionContext) => {
		const limits = await getMaxChannelValues();

		const levelsCommand = createCommand({
			modifying: true,
			descriptor: {
				_obj: 'make',
				_target: [{ _ref: 'adjustmentLayer' }],
				using: {
					_obj: 'adjustmentLayer',
					type: {
						_obj: 'levels',
						presetKind: {
							_enum: 'presetKindType',
							_value: 'presetKindCustom',
						},
						adjustment: [
							{
								_obj: 'levelsAdjustment',
								channel: {
									_ref: 'channel',
									_enum: 'channel',
									_value: 'red',
								},
								input: [limits.min.red, limits.max.red],
								gamma: 1,
								output: [0, 255],
							},
							{
								_obj: 'levelsAdjustment',
								channel: {
									_ref: 'channel',
									_enum: 'channel',
									_value: 'green',
								},
								input: [limits.min.green, limits.max.green],
								gamma: 1,
								output: [0, 255],
							},
							{
								_obj: 'levelsAdjustment',
								channel: {
									_ref: 'channel',
									_enum: 'channel',
									_value: 'blue',
								},
								input: [limits.min.blue, limits.max.blue],
								gamma: 1,
								output: [0, 255],
							},
						],
					},
				},
			},
			schema: z.unknown(),
		});
		await executionContext.batchPlayCommand(levelsCommand);

		const invertCommand = createCommand({
			modifying: true,
			descriptor: {
				_obj: 'make',
				_target: [{ _ref: 'adjustmentLayer' }],
				using: {
					_obj: 'adjustmentLayer',
					type: {
						_obj: 'invert',
					},
				},
			},
			schema: z.unknown(),
		});
		await executionContext.batchPlayCommand(invertCommand);
	});
}

// @adobe-uxp-types/uxp declares two conflicting `Entrypoints` interfaces that merge into one,
// so the `setup()` config type incorrectly also demands the runtime API's members. Cast around it.
entrypoints.setup({
	commands: {
		addC41AdjustmentLayers: addC41AdjustmentLayers,
	},
} as unknown as Parameters<typeof entrypoints.setup>[0]);
