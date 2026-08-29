# c41

A Photoshop UXP plugin ("C41 tools") for correcting scanned color negative
film. Its one command, **Add C41 Adjustment Layers**, adds two adjustment
layers to the active document:

1. **Invert** — the top layer, flipping the negative into a positive. Because
   it sits above Levels, it acts on the already channel-balanced image.
2. **Levels** — directly below Invert. For each of the red, green, and blue
   channels, the input range is stretched to that channel's actual minimum
   and maximum pixel value in the image (an auto-contrast per channel). This
   cancels out the orange film-base mask and color cast typical of C-41
   negative scans.

Both layers are added in a single undoable step.

How each channel's "minimum" and "maximum" pixel values are chosen is
configurable in preferences; there are three methods.

## Requirements

- Photoshop 24.0.0 or later
- Node.js and [pnpm](https://pnpm.io/)

## Development

Install dependencies:

```bash
pnpm install
```

Build once:

```bash
pnpm run build
```

Build and watch for changes (needed for the UXP Developer Tool's hot reload):

```bash
pnpm run watch
```

This produces `dist/manifest.json` and `dist/index.js`.

## Trying it out

1. Install the [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/) (UDT) and enable **Developer Mode** in Photoshop's Plugins preferences.
2. In UDT, **Add Plugin** and select `dist/manifest.json`.
3. Load the plugin into a running Photoshop instance with a document open.
4. Run it from Photoshop's **Plugins** menu → **C41 tools** → **Add C41 Adjustment Layers**.

## Installing into a normal Photoshop

To install without Developer Mode, package the plugin as a `.ccx` from UDT
(`...` menu → **Package**, built from `pnpm run build`, not `watch`, so the
dev-only hot-reload permission isn't included) and double-click the result
to install it via the Creative Cloud desktop app.

`scripts/install-macos.sh` automates the build + package + install on macOS
(and `--remove` / `--list`). It drives Adobe's bundled
`UnifiedPluginInstallerAgent`; you must be signed into the Creative Cloud
desktop app (5.7+) with an entitled Adobe ID.

### When `.ccx` installation fails

Packaged installs currently fail on recent Photoshop / Creative Cloud builds,
with either *"you do not have a compatible version of Photoshop installed"* or
`Failed to install, status = -267!` (the agent's log spells this out as
"Failed to generate mxi for uxp extension"). This is an Adobe-side
regression in the Creative Cloud install backend, not a problem with this
plugin's manifest or package:

- A byte-for-byte identical `.ccx` that installed fine a few weeks earlier
  now fails with the same error.
- `scripts/install-macos.sh` does **not** get around it — the agent just
  forwards the request to the Creative Cloud desktop app, which is where the
  failure happens.
- Loading the plugin through UDT (Developer Mode) is unaffected, because that
  path doesn't go through Creative Cloud's install/validation at all.

Things that sometimes help:

- Give **Full Disk Access** to the Creative Cloud desktop app and to
  `/Library/Application Support/Adobe/Adobe Desktop Common/ADS/Adobe Desktop Service.app`,
  then relaunch Creative Cloud; failing that, run **Repair** from the
  Creative Cloud Uninstaller and reboot.
- Put the `.ccx` in `~/Downloads` (same volume as Photoshop) before opening
  it — the installer only searches the drive the file is on.
- Otherwise, use Developer Mode until Adobe ships a fix.

`host.minVersion` in `uxp.config.ts` is deliberately pinned low (`22.0.0`)
because a *separate*, older installer bug rejects any "real" minimum version
regardless of what's installed. It does not fix the `-267` failure above. The
plugin still needs a reasonably current Photoshop in practice — that floor
comes from `apiVersion: 2` / `manifestVersion: 5` (~Photoshop 24.2+).

References:
[minVersion bug](https://forums.creativeclouddeveloper.com/t/manifest-minversion-issue/2525),
[Photoshop 27.9 install regression](https://forums.creativeclouddeveloper.com/t/photoshop-27-9-1-packaged-uxp-plugin-ccx-fails-to-install-couldnt-install-plugin-compatible-app-required-premiere-fine-dev-mode-fine/12089).

## License

[BSD 3-Clause](./LICENSE)

## AI usage

I used Claude while developing this.