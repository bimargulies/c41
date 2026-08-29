# c41

A Photoshop UXP plugin ("C41 tools") for correcting scanned color negative
film. Its one command, **Add C41 Adjustment Layers**, adds two adjustment
layers to the active document:

1. **Invert** — the bottom layer, switching from negative to positive.
2. **Levels** — directly above Invert. For each of the red, green, and blue
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

As of Photoshop 27.10 / Creative Cloud 6.10 (August 2026), packaged installs
fail on this machine with `Failed to install, status = -267!`. The installer
agent's own log (`~/Library/Application Support/Adobe/UPI/Log/EMCL.log`) gives
the real reason:

```
uxp manifest file is invalid or fields missing
Failed to generate mxi for uxp extension
```

This is an Adobe-side regression, not a problem with this plugin:

- A byte-for-byte identical `.ccx` that installed cleanly in August now fails
  with the same error.
- `scripts/install-macos.sh` does **not** get around it — the agent forwards
  the request to the Creative Cloud desktop app, which is where it fails.
- Developer Mode (loading via UDT) is unaffected; it never touches Creative
  Cloud's install path.

No manifest change fixes this. Until Adobe ships a fix, use Developer Mode.
Others are hitting the same wall on Photoshop 27.9+:
<https://forums.creativeclouddeveloper.com/t/photoshop-27-9-1-packaged-uxp-plugin-ccx-fails-to-install-couldnt-install-plugin-compatible-app-required-premiere-fine-dev-mode-fine/12089>

Note also that `host.minVersion` in `uxp.config.ts` is pinned low (`22.0.0`)
for an unrelated, older installer bug that rejects a "real" minimum version
([thread](https://forums.creativeclouddeveloper.com/t/manifest-minversion-issue/2525));
that pin has nothing to do with `-267`. The plugin still needs a fairly
current Photoshop in practice, from `apiVersion: 2` / `manifestVersion: 5`
(~Photoshop 24.2+).

## License

[BSD 3-Clause](./LICENSE)

## AI usage

I used Claude while developing this.