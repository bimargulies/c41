import { entrypoints } from "uxp";
import { executeAsModal, createCommand } from "@bubblydoo/uxp-toolkit";
import { z } from "zod";
import { imaging } from "adobe:photoshop";
import { getPreferences, openC41Preferences } from "./preferences";
import { getLayerThresholdsFromHistograms } from "./histogram";

console.log("[c41] plugin script evaluated");

// FInd the lowest and highest pixel values for each channel in the active document, using the imaging API to get pixel data.
// This is used when the threshold preference is disabled, to set the levels adjustment layer input values to the full range of pixel values in the image.
async function gerChannelLimitValues(): Promise<AllLimitValues> {
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
    return {
      red: { min: redMin, max: redMax },
      green: { min: greenMin, max: greenMax },
      blue: { min: blueMin, max: blueMax },
    };
  } finally {
    await imageData.dispose();
  }
}

async function addC41AdjustmentLayers() {
  console.log("[c41] addC41AdjustmentLayers: start");
  try {
    await addLevelsAndInvert();
    console.log("[c41] addC41AdjustmentLayers: done");
  } catch (err) {
    console.error("[c41] addC41AdjustmentLayers: failed", err);
  }
}

async function addLevelsAndInvert() {
  const prefs = getPreferences();
  await executeAsModal("Add C41 Adjustment Layers", async (executionContext) => {
    let limits: AllLimitValues;
    if (prefs.useThreshold) {
      limits = await getLayerThresholdsFromHistograms(prefs.threshold);
	  console.log("[c41] addC41AdjustmentLayers: using threshold", prefs.threshold, "limits:", limits);
    } else {
      limits = await gerChannelLimitValues();
	  console.log("[c41] addC41AdjustmentLayers: using full range limits:", limits);
    }

    const levelsCommand = createCommand({
      modifying: true,
      descriptor: {
        _obj: "make",
        _target: [{ _ref: "adjustmentLayer" }],
        using: {
          _obj: "adjustmentLayer",
          type: {
            _obj: "levels",
            presetKind: {
              _enum: "presetKindType",
              _value: "presetKindCustom",
            },
            adjustment: [
              {
                _obj: "levelsAdjustment",
                channel: {
                  _ref: "channel",
                  _enum: "channel",
                  _value: "red",
                },
                input: [limits.red.min, limits.red.max],
                gamma: 1,
                output: [0, 255],
              },
              {
                _obj: "levelsAdjustment",
                channel: {
                  _ref: "channel",
                  _enum: "channel",
                  _value: "green",
                },
                input: [limits.green.min, limits.green.max],
                gamma: 1,
                output: [0, 255],
              },
              {
                _obj: "levelsAdjustment",
                channel: {
                  _ref: "channel",
                  _enum: "channel",
                  _value: "blue",
                },
                input: [limits.blue.min, limits.blue.max],
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
        _obj: "make",
        _target: [{ _ref: "adjustmentLayer" }],
        using: {
          _obj: "adjustmentLayer",
          type: {
            _obj: "invert",
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
    openC41Preferences: openC41Preferences,
  },
} as unknown as Parameters<typeof entrypoints.setup>[0]);
