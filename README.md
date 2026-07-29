# c41

A Photoshop UXP plugin ("C41 tools") for correcting scanned color negative
film. Its one command, **Add C41 Adjustment Layers**, adds two adjustment
layers to the active document:

1. **Levels** — for each of the red, green, and blue channels, the input
   range is stretched to that channel's actual minimum and maximum pixel
   value in the image (an auto-contrast per channel). This is a quick way
   to cancel out the orange film-base mask and color cast typical of C-41
   negative scans.
2. **Invert** — stacked directly above the Levels layer, flipping the
   (now channel-balanced) negative into a positive.

Both layers are added in a single undoable step.

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

## License

[BSD 3-Clause](./LICENSE)

## AI usage

I used Claude while developing this.