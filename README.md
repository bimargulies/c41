# c41

A Photoshop UXP plugin ("C41 tools") for correcting scanned color negative film. Its one command,
**Add C41 Adjustment Layers**, adds these adjustment layers to the active document:

1. **Invert** — the bottom layer, switching from negative to positive.
2. **Levels** — directly above Invert. For each of the red, green, and blue channels, the input
   black/white points are set to that channel's occupied range (an auto-contrast per channel; how
   the range is measured is configurable — see below). This cancels out the orange film-base mask
   and color cast typical of C-41 negative scans.

If **Correct gamma for raw scans** is enabled in preferences, a third layer — **Correct gamma for
raw scan**, a Screen-blended Curves layer — is added *below* Invert, to lift a linear/raw scan
before it is inverted.

All layers are added in a single undoable step.

How each channel's "minimum" and "maximum" pixel values are chosen is configurable in preferences;
there are two methods:

1. **Knee detection** (default) — trims the empty ends *and* the low-count tails, so the input range
   spans just the part of the histogram that carries the image.
2. **Darkest and lightest pixels** — the channel's literal minimum and maximum value.

## How the knee detector works

A scanned C-41 negative channel is near-zero at both ends with the real tonal data in between.
`src/find-knees.ts` normalizes the histogram to its peak and reports the outermost bin at each end
(scanning in from bin 0, and in from bin 255) that still holds at least 0.15% of the peak count —
i.e. where the data lifts off / settles back onto its near-zero floor. That's the whole algorithm.

Earlier versions ran a Savitzky-Golay derivative scan for the "knee" where the shoulder bends into
the tail, with a stack of thresholds for clipped edges, gentle ramps, blown highlights, and secondary
lobes. Against `src/find-knees.test.ts` — a corpus of real channel histograms (exported via
`export-histograms.ts`) with black/white points picked by eye — a plain per-bin level lands within a
few bins of every one of them, so all of that machinery is gone. If the detector misjudges a new
image, add its histogram to the test file with the points you'd pick and check the rule still holds.

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

1. Install the [UXP Developer Tool](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/)
   (UDT) and enable **Developer Mode** in Photoshop's Plugins preferences.
2. In UDT, **Add Plugin** and select `dist/manifest.json`.
3. Load the plugin into a running Photoshop instance with a document open.
4. Run it from Photoshop's **Plugins** menu → **C41 tools** → **Add C41 Adjustment Layers**.

## Installing into a normal Photoshop

To install without Developer Mode you need a `.ccx` package. Build one with:

```bash
pnpm run package        # writes ./c41.ccx
```

Then double-click `c41.ccx` to install it via the Creative Cloud desktop app.

Each [release](../../releases) also attaches the `.ccx` plus `install-ccx.sh`. Download both into one
folder and run `bash install-ccx.sh` (also `--remove` / `--list`) — a standalone macOS installer that
drives Adobe's bundled `UnifiedPluginInstallerAgent`, no repo checkout needed. For local development,
`scripts/install-macos.sh` does build + package + install in one step. Either way you must be signed
into the Creative Cloud desktop app (5.7+) with an entitled Adobe ID.

Packaging from the UXP Developer Tool (`...` menu → **Package**) also works.

### Why `pnpm run package`, not just `pnpm run build`

`pnpm run build` emits a `manifest.json` whose `host` is a one-element array, per the current UXP
manifest schema. The UXP runtime and UDT accept that, but Creative Cloud's installer does not — it
fails mxi generation with `Failed to install, status = -267!`. `pnpm run package` runs the build
with `MODE=package`, which has [`vite-uxp-plugin`](https://github.com/hyperbrew/bolt-uxp) collapse
`host` to a bare object in the packaged `.ccx` (UDT's own Package command does the same). The
wrapper script then copies `ccx/<id>_PS.ccx` to `./c41.ccx`.

### Why `host.minVersion` is `22.0.0`

An older Creative Cloud installer bug rejects any "real" minimum version
([thread](https://forums.creativeclouddeveloper.com/t/manifest-minversion-issue/2525)), so
`uxp.config.ts` pins it low. The plugin still needs a fairly current Photoshop in practice — that
comes from `apiVersion: 2` / `manifestVersion: 5` (~Photoshop 24.2+).

## License

[BSD 3-Clause](./LICENSE)

## AI usage

I used Claude while developing this.
