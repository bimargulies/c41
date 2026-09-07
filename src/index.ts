import { entrypoints } from "uxp";
import { app, imaging } from "adobe:photoshop";
import { getPreferences, openC41Preferences } from "./preferences";
import { getLayerLimitsFromKnees } from "./histogram";
import { writeChannelHistogramsFile } from "./export-histograms";
import { asSingleHistoryStep, batchPlayModifying } from "./photoshop";
import { correctRawScanGamma, installLinearProfile } from "./raw-scan";

console.log("[c41] plugin script evaluated");

// The brains of "extreme" levels method (preferences: "the darkest and lightest pixels").
// Reads the composite with the imaging API and takes each channel's actual min
// and max pixel value; addLevelsAndInvert uses those as the Levels input
// black/white points, stretching the occupied range across the full 0-255 output.
async function getChannelLimitValues(): Promise<AllLimitValues> {
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
    await app.showAlert(`C41 tools: ${err}`);
  }
}

async function exportChannelHistograms() {
  console.log("[c41] exportChannelHistograms: start");
  try {
    await writeChannelHistogramsFile();
    console.log("[c41] exportChannelHistograms: done");
  } catch (err) {
    console.error("[c41] exportChannelHistograms: failed", err);
  }
}

async function addLevelsAndInvert() {
  const prefs = getPreferences();

  await asSingleHistoryStep("Add C41 Adjustment Layers", async () => {
    await batchPlayModifying({
      _obj: "make",
      _target: [{ _ref: "adjustmentLayer" }],
      using: {
        _obj: "adjustmentLayer",
        type: {
          _obj: "invert",
        },
      },
    });

    let limits: AllLimitValues;
    switch (prefs.detectionMethod) {
      case "knee detection":
        limits = await getLayerLimitsFromKnees();
        console.log("[c41] addC41AdjustmentLayers: using knee detection, limits:", limits);
        break;
      case "extreme":
      default:
        limits = await getChannelLimitValues();
        console.log("[c41] addC41AdjustmentLayers: using darkest/lightest pixels, limits:", limits);
        break;
    }

    await batchPlayModifying({
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
              channel: { _ref: "channel", _enum: "channel", _value: "red" },
              input: [limits.red.min, limits.red.max],
              gamma: 1,
              output: [0, 255],
            },
            {
              _obj: "levelsAdjustment",
              channel: { _ref: "channel", _enum: "channel", _value: "green" },
              input: [limits.green.min, limits.green.max],
              gamma: 1,
              output: [0, 255],
            },
            {
              _obj: "levelsAdjustment",
              channel: { _ref: "channel", _enum: "channel", _value: "blue" },
              input: [limits.blue.min, limits.blue.max],
              gamma: 1,
              output: [0, 255],
            },
          ],
        },
      },
    });
  });
}

// @adobe-uxp-types/uxp declares two conflicting `Entrypoints` interfaces that merge into one,
// so the `setup()` config type incorrectly also demands the runtime API's members. Cast around it.
entrypoints.setup({
  commands: {
    addC41AdjustmentLayers: addC41AdjustmentLayers,
    correctRawScanGamma: correctRawScanGamma,
    exportChannelHistograms: exportChannelHistograms,
    openC41Preferences: openC41Preferences,
    installLinearProfile: installLinearProfile,
  },
} as unknown as Parameters<typeof entrypoints.setup>[0]);
