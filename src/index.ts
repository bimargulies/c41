import { entrypoints, storage } from "uxp";
import { action, app, constants, imaging } from "adobe:photoshop";
import { BUNDLED_LINEAR_PROFILE, getPreferences, openC41Preferences } from "./preferences";
import { getLayerLimitsFromKnees } from "./histogram";
import { writeChannelHistogramsFile } from "./export-histograms";

console.log("[c41] plugin script evaluated");

type ActionDescriptor = Parameters<typeof action.batchPlay>[0][number];

// Run `fn` as a single undoable step on the active document. suspendHistory
// (a thin wrapper over core.executeAsModal) coalesces every change made in the
// callback into one named history state, so both adjustment layers are added
// and removed by a single undo. A throw inside the callback can surface as an
// opaque wrapper that loses the original error, so capture and rethrow it.
async function asSingleHistoryStep(name: string, fn: () => Promise<void>): Promise<void> {
  let error: unknown;
  await app.activeDocument.suspendHistory(async () => {
    try {
      await fn();
    } catch (e) {
      error = e;
    }
  }, name);
  if (error) throw error;
}

// Run one modifying batchPlay descriptor, turning a returned error descriptor
// into a real thrown Error. Must be called inside a modal scope (asSingleHistoryStep).
async function batchPlayModifying(descriptor: ActionDescriptor): Promise<void> {
  const [result] = await action.batchPlay([descriptor], {
    modalBehavior: "execute",
    dialogOptions: "silent",
  });
  if (result?._obj === "error") {
    console.error("[c41] batchPlay error descriptor:", result);
    throw new Error(`batchPlay command failed: ${result.message ?? "unknown error"}`);
  }
}

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

// Raised for a condition the user can fix (wrong bit depth, missing profile
// name); shown to them verbatim instead of just logged.
class UserError extends Error {}

async function addC41AdjustmentLayers() {
  console.log("[c41] addC41AdjustmentLayers: start");
  try {
    await addLevelsAndInvert();
    console.log("[c41] addC41AdjustmentLayers: done");
  } catch (err) {
    console.error("[c41] addC41AdjustmentLayers: failed", err);
    await app.showAlert(err instanceof UserError ? err.message : `C41 tools: ${err}`);
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

// Copy the bundled linear profile (public/sRGB-elle-V4-g10.icc) into the user's
// ColorSync profile folder so Photoshop can find it by name. Photoshop only
// scans that folder at launch, hence the "restart" in the message.
async function installLinearProfile() {
  const fs = storage.localFileSystem;
  const src = await (await fs.getPluginFolder()).getEntry(BUNDLED_LINEAR_PROFILE);
  type Folder = Parameters<typeof src.copyTo>[0];

  const manualInstructions =
    `The profile file is here:\n${src.nativePath}\n\n` +
    `Copy it into your system colour-profile folder (~/Library/ColorSync/Profiles on macOS), ` +
    `restart Photoshop, then set "Linear scan profile" in C41 Preferences to "${BUNDLED_LINEAR_PROFILE}".`;

  // UXP has no os.homedir(); derive ~ from the (always user-scoped) data folder.
  const home = (await fs.getDataFolder()).nativePath.match(/^(\/Users\/[^/]+)\//)?.[1];
  if (!home) {
    await app.showAlert(`Automatic install is macOS only.\n\n${manualInstructions}`);
    return;
  }

  // ~/Library exists but ~/Library/ColorSync[/Profiles] often doesn't - walk
  // down from ~/Library, creating each level.
  const subfolder = async (parent: Folder, name: string): Promise<Folder> =>
    (((await parent.getEntry(name).catch(() => null)) as Folder | null) ??
      ((await parent.createFolder(name)) as Folder));

  try {
    const library = (await fs.getEntryWithUrl(`file:${home}/Library`)) as Folder;
    const profiles = await subfolder(await subfolder(library, "ColorSync"), "Profiles");
    await src.copyTo(profiles, { overwrite: true });
  } catch (err) {
    console.error("[c41] installLinearProfile: failed", err);
    await app.showAlert(`Couldn't install the profile automatically (${err}).\n\n${manualInstructions}`);
    return;
  }

  await app.showAlert(
    `Installed "${BUNDLED_LINEAR_PROFILE}" to ~/Library/ColorSync/Profiles.\n\n` +
      `Quit and reopen Photoshop for it to become available, then use "Correct gamma for raw scans".`,
  );
}

// Turn a linear/raw scan into the working space before inversion: tag the
// document with the linear capture profile, then Convert to Profile to the
// working RGB space, which applies the exact linear -> working transfer curve
// (unlike the old Screen-blended Curves layer, which only approximated it).
// This rewrites the base image's pixels, so it needs 16- or 32-bit precision.
async function correctRawScanGamma(linearProfileName: string) {
  const doc = app.activeDocument;
  doc.colorProfileName = linearProfileName;
  if (doc.colorProfileType === constants.ColorProfileType.NONE) {
    throw new UserError(
      linearProfileName === BUNDLED_LINEAR_PROFILE
        ? `The linear scan profile isn't installed yet. Run "Install linear scan profile" ` +
          `(Plugins › C41 tools), restart Photoshop, then try again.`
        : `"${linearProfileName}" isn't an installed ICC profile - check the name in C41 Preferences.`,
    );
  }
  try {
    await doc.convertProfile("Working RGB", constants.Intent.RELATIVECOLORIMETRIC, true);
  } catch (err) {
    throw new UserError(
      `Couldn't convert from "${linearProfileName}" to the working space (${err}).`,
    );
  }
}

async function addLevelsAndInvert() {
  const prefs = getPreferences();

  if (prefs.correctGammaForRawScans) {
    const bits = app.activeDocument.bitsPerChannel;
    if (bits !== constants.BitsPerChannelType.SIXTEEN && bits !== constants.BitsPerChannelType.THIRTYTWO) {
      throw new UserError(
        '"Correct gamma for raw scans" rewrites pixel data and needs a 16- or 32-bit document ' +
          "(Image › Mode). No layers were added.",
      );
    }
    if (!prefs.linearProfileName.trim()) {
      throw new UserError(
        'Set the linear scan profile name in C41 Preferences to use "Correct gamma for raw scans". ' +
          "No layers were added.",
      );
    }
  }

  await asSingleHistoryStep("Add C41 Adjustment Layers", async () => {
    if (prefs.correctGammaForRawScans) {
      await correctRawScanGamma(prefs.linearProfileName.trim());
    }

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
    exportChannelHistograms: exportChannelHistograms,
    openC41Preferences: openC41Preferences,
    installLinearProfile: installLinearProfile,
  },
} as unknown as Parameters<typeof entrypoints.setup>[0]);
