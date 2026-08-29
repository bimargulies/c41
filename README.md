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

To install without Developer Mode you need a `.ccx` package. Build one with:

```bash
pnpm run package        # writes ./c41.ccx
```

Then double-click `c41.ccx` to install it via the Creative Cloud desktop app,
or download the `.ccx` attached to a [release](../../releases). On macOS,
`scripts/install-macos.sh` does the build + package + install in one step
(and `scripts/install-macos.sh --remove` / `--list`), driving Adobe's bundled
`UnifiedPluginInstallerAgent`; you must be signed into the Creative Cloud
desktop app (5.7+) with an entitled Adobe ID.

Packaging from the UXP Developer Tool (`...` menu → **Package**) also works.

### Why `pnpm run package`, not just `pnpm run build`

`pnpm run build` emits a `manifest.json` whose `host` is a one-element array,
per the current UXP manifest schema. The UXP runtime and UDT accept that, but
Creative Cloud's installer does not — it fails mxi generation with
`Failed to install, status = -267!`. `pnpm run package` (and UDT's Package
command) collapse `host` to a bare object, which the installer accepts.

### Why `host.minVersion` is `22.0.0`

An older Creative Cloud installer bug rejects any "real" minimum version
([thread](https://forums.creativeclouddeveloper.com/t/manifest-minversion-issue/2525)),
so `uxp.config.ts` pins it low. The plugin still needs a fairly current
Photoshop in practice — that comes from `apiVersion: 2` /
`manifestVersion: 5` (~Photoshop 24.2+).

## License

[BSD 3-Clause](./LICENSE)

## AI usage

I used Claude while developing this.