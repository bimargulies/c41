import { entrypoints } from 'uxp';
import { executeAsModal, createCommand } from '@bubblydoo/uxp-toolkit';
import { z } from 'zod';
import { app, imaging } from "adobe:photoshop";

async function getMaxChannelValues(): Promise<{ red: number; green: number; blue: number }> {
	const { imageData } = await imaging.getPixels({ applyAlpha: true, componentSize: 8 });
	try {
		const data = (await imageData.getData({ chunky: true })) as Uint8Array;
		let red = 0;
		let green = 0;
		let blue = 0;
		for (let i = 0; i < data.length; i += imageData.components) {
			if (data[i] > red) red = data[i];
			if (data[i + 1] > green) green = data[i + 1];
			if (data[i + 2] > blue) blue = data[i + 2];
		}
		return { red, green, blue };
	} finally {
		await imageData.dispose();
	}
}

async function addLevelsAdjustmentLayer() {
	const { red, green, blue } = await getMaxChannelValues();
	await executeAsModal('Add C41 Adjustment Layers', async (executionContext) => {
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
								input: [0, red],
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
								input: [0, green],
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
								input: [0, blue],
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
		addLevelsAdjustmentLayer,
	},
} as unknown as Parameters<typeof entrypoints.setup>[0]);
