import { storage } from "uxp";
import { app, constants } from "adobe:photoshop";
import { BUNDLED_LINEAR_PROFILE, getPreferences } from "./preferences";
import { asSingleHistoryStep, UserError } from "./photoshop";

// Persistent-token key for the folder the user picked in `installLinearProfile`.
const PROFILES_FOLDER_TOKEN = "c41.colorSyncProfilesFolder";

/**
 * Copy the bundled linear profile (public/sRGB-elle-V4-g10.icc) into the user's
 * ColorSync profiles folder so Photoshop can find it by name. UXP can't reach
 * ~/Library directly, so the user picks the folder once (its access grant is
 * remembered). Photoshop only scans it at launch, hence the "restart".
 */
export async function installLinearProfile() {
  const fs = storage.localFileSystem;
  const src = await (await fs.getPluginFolder()).getEntry(BUNDLED_LINEAR_PROFILE);
  type Folder = Parameters<typeof src.copyTo>[0];

  let dest: Folder | null = null;
  const saved = localStorage.getItem(PROFILES_FOLDER_TOKEN);
  if (saved) {
    dest = (await fs.getEntryForPersistentToken(saved).catch(() => null)) as Folder | null;
  }

  if (!dest) {
    await app.showAlert(
      `Pick your colour-profile folder in the next dialog.\n\n` +
        `On macOS: press ⌘⇧G and enter  ~/Library/ColorSync/Profiles`,
    );
    dest = (await fs.getFolder()) as Folder | null;
    if (!dest) return; // cancelled
    localStorage.setItem(PROFILES_FOLDER_TOKEN, await fs.createPersistentToken(dest));
  }

  try {
    await src.copyTo(dest, { overwrite: true });
  } catch (err) {
    console.error("[c41] installLinearProfile: failed", err);
    localStorage.removeItem(PROFILES_FOLDER_TOKEN);
    await app.showAlert(
      `Couldn't copy the profile there (${err}).\n\n` +
        `Do it by hand: put\n${src.nativePath}\ninto ~/Library/ColorSync/Profiles, then restart Photoshop.`,
    );
    return;
  }

  await app.showAlert(
    `Installed "${BUNDLED_LINEAR_PROFILE}" to:\n${dest.nativePath}\n\n` +
      `Quit and reopen Photoshop, then use "Correct Raw Scan Gamma".`,
  );
}

/**
 * Convert a linear/raw scan into the working space: tag the document with the
 * linear capture profile, then Convert to Profile to working RGB, which applies
 * the exact linear -> working transfer curve. Rewrites the base image's pixels,
 * so it needs 16- or 32-bit precision - a separate step from adding the levels
 * and invert layers, run once on the raw scan first.
 */
export async function correctRawScanGamma() {
  console.log("[c41] correctRawScanGamma: start");
  try {
    const doc = app.activeDocument;
    const profile = getPreferences().linearProfileName.trim();

    if (
      doc.bitsPerChannel !== constants.BitsPerChannelType.SIXTEEN &&
      doc.bitsPerChannel !== constants.BitsPerChannelType.THIRTYTWO
    ) {
      throw new UserError(
        "Correcting raw scan gamma rewrites pixel data and needs a 16- or 32-bit document " +
          "(Image › Mode).",
      );
    }
    if (!profile) {
      throw new UserError("Set the linear scan profile name in C41 Preferences first.");
    }

    await asSingleHistoryStep("Correct Raw Scan Gamma", async () => {
      doc.colorProfileName = profile;
      if (doc.colorProfileType === constants.ColorProfileType.NONE) {
        throw new UserError(
          profile === BUNDLED_LINEAR_PROFILE
            ? `The linear scan profile isn't installed yet. Run "Install linear scan profile" ` +
              `(Plugins › C41 tools), restart Photoshop, then try again.`
            : `"${profile}" isn't an installed ICC profile - check the name in C41 Preferences.`,
        );
      }
      try {
        await doc.convertProfile("Working RGB", constants.Intent.RELATIVECOLORIMETRIC, true);
      } catch (err) {
        throw new UserError(`Couldn't convert from "${profile}" to the working space (${err}).`);
      }
    });
    console.log("[c41] correctRawScanGamma: done");
  } catch (err) {
    console.error("[c41] correctRawScanGamma: failed", err);
    await app.showAlert(err instanceof UserError ? err.message : `C41 tools: ${err}`);
  }
}
