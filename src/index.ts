import { entrypoints } from "uxp";
import { action, core, imaging } from "adobe:photoshop";
import { getPreferences, openC41Preferences } from "./preferences";
import { getLayerThresholdsFromHistograms, getLayerLimitsFromKnees } from "./histogram";
import { writeChannelHistogramsFile } from "./exportHistograms";

console.log("[c41] plugin script evaluated");

type ActionDescriptor = Parameters<typeof action.batchPlay>[0][number];

// core.executeAsModal swallows any error thrown inside its callback (it just
// rejects with a generic "callback threw" wrapper). Catch it and rethrow the
// real one so the command handlers can log something useful.
async function executeAsModal<T>(commandName: string, fn: () => Promise<T>): Promise<T> {
  let result: T;
  let error: unknown;
  await core.executeAsModal(
    async () => {
      try {
        result = await fn();
      } catch (e) {
        error = e;
      }
    },
    { commandName },
  );
  if (error) throw error;
  return result!;
}

// Run one modifying batchPlay descriptor, turning a returned error descriptor
// into a real thrown Error. Must be called inside an executeAsModal scope.
async function batchPlayModifying(descriptor: ActionDescriptor): Promise<void> {
  const [result] = await action.batchPlay([descriptor], {});
  if (result?._obj === "error") {
    console.error("[c41] batchPlay error descriptor:", result);
    throw new Error(`batchPlay command failed: ${result.message ?? "unknown error"}`);
  }
}

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
  await executeAsModal("Add C41 Adjustment Layers", async () => {
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
      case "threshold":
        limits = await getLayerThresholdsFromHistograms(prefs.threshold);
        console.log("[c41] addC41AdjustmentLayers: using threshold", prefs.threshold, "limits:", limits);
        break;
      case "knee detection":
        limits = await getLayerLimitsFromKnees();
        console.log("[c41] addC41AdjustmentLayers: using knee detection, limits:", limits);
        break;
      case "extreme":
      default:
        limits = await gerChannelLimitValues();
        console.log("[c41] addC41AdjustmentLayers: using full range limits:", limits);
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
    exportChannelHistograms: exportChannelHistograms,
    openC41Preferences: openC41Preferences,
  },
} as unknown as Parameters<typeof entrypoints.setup>[0]);
