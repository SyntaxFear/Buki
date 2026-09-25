# Buki — Family Art Book

Give your child's drawings a home you can return to.

**Buki** turns artwork on paper into a private family art book. Scan a drawing, save it in a child's sketchpad, and revisit it through animated pages, personal notes, and the small details that make it yours.

[Download on the App Store](https://apps.apple.com/us/app/buki-family-art-book/id6798754626) · [Website](https://buki.expo.app/) · [Shipaton project on Devpost](https://devpost.com/software/buki)

## Watch the demo

[![Watch Buki — Private Family Art Books, the Shipaton 2026 demo](https://i.ytimg.com/vi/VOoGyYMYUOo/hqdefault.jpg)](https://www.youtube.com/watch?v=VOoGyYMYUOo)

**[Watch the 96-second demo on YouTube →](https://www.youtube.com/watch?v=VOoGyYMYUOo)**

Follow a drawing from paper into a family sketchpad, then see the published app's page animations, artwork details, and voice memories. The demo uses synthetic family content and includes English subtitles.

## What you can do

- **Capture paper artwork.** Detect the sheet, straighten the perspective, and separate the drawing from its background.
- **Make a book for each child.** Organize artwork into child profiles and sketchpads, with covers and paper styles.
- **Keep the story with the drawing.** Add titles, dates, notes, tags, and favorites.
- **Enjoy the pages.** Browse an animated scrapbook or find artwork in the library.
- **Save and share keepsakes.** Export artwork and sketchpads, and create or restore archive backups.
- **Choose optional cloud backup.** Pro adds private backup and synchronization alongside advanced organization, exports, and visual options.

Buki is designed for an adult parent or guardian to manage the family's collection. Artwork is saved locally first; cloud backup is optional. See the [privacy policy](https://buki.expo.app/privacy) for details.

## Shipaton 2026

Buki is a RevenueCat Shipaton 2026 entry, built by **Levan Parastashvili**. RevenueCat powers the app's Pro purchases and entitlement handling.

For the product story and submission, visit [Buki on Devpost](https://devpost.com/software/buki). To try the released app, use the [App Store listing](https://apps.apple.com/us/app/buki-family-art-book/id6798754626). Judges can find premium-access instructions in the competition submission.

The video demonstrates the published app. Repository revisions and the App Store release may differ.

## How it is built

| Area | Technology |
| --- | --- |
| App | Expo SDK 57, React Native, TypeScript, Expo Router |
| Drawing and motion | React Native Skia, Reanimated, custom SkSL page-curl shader |
| Capture | Expo Camera and a local image-processing pipeline |
| Local data | SQLite, local files, Zustand |
| Accounts and cloud | Supabase authentication, database, and private storage |
| Purchases | RevenueCat and Apple in-app purchases |

### The paper-to-book pipeline

1. **Capture:** take a photo of a paper drawing.
2. **Find the sheet:** use Otsu thresholding and the largest bright connected component on a downscaled grid.
3. **Straighten:** detect corners and apply a projective transformation to correct perspective.
4. **Extract:** estimate the paper color and create a soft alpha matte, removing specks while preserving thin strokes.
5. **Place in the book:** animate the cutout into the scrapbook, with a handwritten title reveal and a page-curl shader.

The image-processing implementation lives in [`src/utils/cutout.ts`](src/utils/cutout.ts).

## Local development

Use Node.js **22.13 or newer** and the [Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/). Native iOS builds require macOS and Xcode.

```bash
git clone https://github.com/SyntaxFear/Buki.git
cd Buki
npm ci
cp .env.example .env
```

Fill in `.env` with your own Supabase URL and public anon key, RevenueCat iOS SDK key, and privacy, terms, and support URLs. The required variable names are listed in [`.env.example`](.env.example). Account, cloud, and purchase features require the corresponding services to be configured; cloning the repository does not provision them. Backend migrations and functions are in [`supabase/`](supabase/).

Build and run the native iOS app:

```bash
npx expo run:ios
```

For later JavaScript changes, start Metro with `npm start` and reopen the installed app. Use a native build for the full app, including its native dependencies and purchase integration. A physical device is needed to try real camera capture; the simulator uses bundled sample photos.

### Checks

```bash
npm test
npm run lint
npx tsc --noEmit
```

### Build and release

[`eas.json`](eas.json) includes `production` (store), `preview` (internal distribution), and `development` (development client) profiles. Store builds require your own EAS project configuration, Apple account, and signing credentials.

```bash
npx eas-cli build -p ios --profile production
npx eas-cli submit -p ios --profile production
```

## Repository guide

| Directory | Contents |
| --- | --- |
| [`src/app/`](src/app/) | Expo Router routes |
| [`src/screens/`](src/screens/) | Capture, library, artwork, account, and public website screens |
| [`src/components/`](src/components/) | Scrapbook, page curl, artwork viewer, and shared controls |
| [`src/utils/`](src/utils/) | Image processing, layout, and supporting utilities |
| [`src/database/`](src/database/) | Local database and repositories |
| [`src/archive/`](src/archive/) and [`src/export/`](src/export/) | Backup, restore, and keepsake exports |
| [`src/sync/`](src/sync/) | Cloud synchronization |
| [`src/subscription/`](src/subscription/) | Pro access and purchase handling |
| [`supabase/`](supabase/) | Backend migrations and functions |
| [`scripts/`](scripts/) and [`docs/`](docs/) | Development tools and project documentation |

## Acknowledgments

The original paper-to-scrapbook interaction was inspired by Hewad Mubariz's **Make it Bloom** demo and rebuilt in Expo.
