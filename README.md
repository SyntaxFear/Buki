# Bloombook

A cozy scrapbook for kids' drawings. Point the camera at a drawing on paper — Bloombook finds the sheet, straightens it, cuts the artwork out of the background, and the drawing flies into an animated notebook where it can never get lost.

Inspired by Hewad Mubariz's "Make it Bloom" demo. Rebuilt from scratch in Expo.

## How it works

- **Scan** — `expo-camera` captures the photo (bundled sample photos on the simulator, which has no camera).
- **Find the paper** — Otsu threshold + largest bright connected component over a downscaled grid ([`src/utils/cutout.ts`](src/utils/cutout.ts)).
- **Straighten it** — corner detection (extreme-point method) plus a square→quad projective homography rectifies sheets photographed at an angle before extraction.
- **Cut out the drawing** — the paper color is estimated from the sheet, and per-pixel color distance becomes a soft alpha matte; despeckling removes dust while keeping thin strokes.
- **The magic** — React Native Skia + Reanimated: the segmentation glow, the cutout flying into the book, a hand-written title reveal, and a real page-curl (an SkSL runtime shader modeling the page rolling around a cylinder).

## Run it

```bash
npm install
npx expo start
```

Runs in Expo Go (simulator uses the bundled demo photos; a real device uses the camera).

```bash
npm test        # pixel-pipeline unit tests
npx tsc --noEmit
```

## Build & release

EAS is configured (`eas.json`): `production` (store), `preview` (internal), `development` (dev client).

```bash
npx eas-cli build -p ios --profile production
npx eas-cli submit -p ios
```

## Structure

- `src/app/` — Expo Router routes
- `src/screens/` — home (scrapbook) and scan screens
- `src/components/` — Skia scrapbook, page-curl shader, handwritten title, flying cutout
- `src/utils/` — pure-TS pixel pipeline (tested), Skia image IO, layout
- `scripts/` — deterministic Pillow generators for the icon and sample photos
