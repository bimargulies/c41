# c41

A Photoshop UXP plugin ("C41 tools") for correcting scanned color negative film. Its one command,
**Add C41 Adjustment Layers**, adds two adjustment layers to the active document:

1. **Invert** — the bottom layer, switching from negative to positive.
2. **Levels** — directly above Invert. For each of the red, green, and blue channels, the input
   range is stretched to that channel's actual minimum and maximum pixel value in the image (an
   auto-contrast per channel). This cancels out the orange film-base mask and color cast typical of
   C-41 negative scans.

Both layers are added in a single undoable step.

How each channel's "minimum" and "maximum" pixel values are chosen is configurable in preferences;
there are three methods:

1. A knee-detection algorithm.
2. Simply finding the lowest and highest values.
3. Chopping the channel based on a percentage of pixel mass.

Typical images have some range of 'no pixels' at the top and bottom, followed by a range of values
with a small, near-constant number of pixels, and then the 'interesting' part of the histogram.
(Obviously, some images are over- or under- exposed and lack one tail or the other.)

The knee algorithm removes both the 'no pixels' range and the 'tail' of very low values. The simple
chopper stops as soon as it sees a pixel. The percentage is probably a less useful alternative to
the knee: it pays no attention to the shape of the curve, and simply assumes that the extremes are
unwanted.

## How the knee detector works

`src/find-knees.ts` scans a channel's histogram in from bin 0, and separately in from bin 255, and
reports the first place each scan hits a *significant* bend. Because it stops at the first bend,
whatever's going on in the messy middle of the histogram (secondary peaks, spikes) doesn't matter.

To decide what counts as significant, it normalizes the histogram to [0, 1] by its own peak (so the
same logic works whether the peak is a few hundred pixels or a few million), smooths it and takes
the derivative, and sets a threshold from the noise level in the flat regions near each edge. A run
of samples whose derivative clears that threshold is a knee.

Two things about real scans forced adjustments that a tidier, synthetic histogram wouldn't have
needed:

- **Not every histogram is flat at both edges.** A channel can hold several percent of its pixels in
  bin 0 or 255 — usually the film-base end. If that falling shoulder gets pooled into the "this edge
  is flat noise" estimate, it drags the threshold up enough to miss a real, gentle bend on the far
  side. So an edge only counts toward the noise estimate if it's actually flat (`flatEdgeMaxFraction`);
  a clipped edge gets scanned with a separate, higher threshold instead (`clippedEdgeThresholdFraction`).
- **The raw crossing lands a few samples inside the corner a person would pick**, a side effect of the
  smoothing. That bias was measured against real scans, not derived analytically, and is subtracted
  as a small constant (`lagCorrection`).

`src/find-knees.test.ts` is where this is actually tuned, and it's the ground truth: every case is a
real channel histogram exported from a scan (see `exportHistograms.ts`), with a knee position picked
by eye, not by running the algorithm and calling it correct. If the detector misjudges a new image,
the fix is to add its histogram as a case with the position you'd pick, then adjust `find-knees.ts`
until it — and every case already passing — lands within tolerance. A few samples of slack per case
is normal; smoothing can't be made pixel-exact without also becoming noise-sensitive.

One known soft spot: a shoulder that's a near-vertical cliff, rather than a gradual bend, gets read
at "where the flat tail first starts bending," which can sit a bit inside of where a person would
eyeball the true corner. That case in the test file just carries extra tolerance, rather than
distorting the algorithm to chase it.

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

Then double-click `c41.ccx` to install it via the Creative Cloud desktop app, or download the `.ccx`
attached to a [release](../../releases). On macOS, `scripts/install-macos.sh` does the build +
package + install in one step (and `scripts/install-macos.sh --remove` / `--list`), driving Adobe's
bundled `UnifiedPluginInstallerAgent`; you must be signed into the Creative Cloud desktop app (5.7+)
with an entitled Adobe ID.

Packaging from the UXP Developer Tool (`...` menu → **Package**) also works.

### Why `pnpm run package`, not just `pnpm run build`

`pnpm run build` emits a `manifest.json` whose `host` is a one-element array, per the current UXP
manifest schema. The UXP runtime and UDT accept that, but Creative Cloud's installer does not — it
fails mxi generation with `Failed to install, status = -267!`. `pnpm run package` (and UDT's Package
command) collapse `host` to a bare object, which the installer accepts.

### Why `host.minVersion` is `22.0.0`

An older Creative Cloud installer bug rejects any "real" minimum version
([thread](https://forums.creativeclouddeveloper.com/t/manifest-minversion-issue/2525)), so
`uxp.config.ts` pins it low. The plugin still needs a fairly current Photoshop in practice — that
comes from `apiVersion: 2` / `manifestVersion: 5` (~Photoshop 24.2+).

## License

[BSD 3-Clause](./LICENSE)

## AI usage

I used Claude while developing this.
