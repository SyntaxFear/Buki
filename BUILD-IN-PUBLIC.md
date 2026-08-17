# Buki Build in Public

Buki’s 30-day campaign runs from **August 11 through September 9, 2026** in the `Asia/Tbilisi` timezone.

The campaign shows the real product-building process: scanning paper drawings, extracting artwork, the animated sketchbook, privacy, accessibility, exports, and a fair Free/Pro boundary. It asks for specific feedback instead of pretending unfinished proof exists.

## Daily commands

```bash
npm run build-in-public:plan
npm run build-in-public:today
npm run test:build-in-public
```

To prepare another day:

```bash
npm run build-in-public:capture -- --day D12 --evidence /absolute/path/to/fresh-proof.mov
```

Simulator videos are intentionally fail-closed. They require an already booted, explicitly disposable simulator containing only approved synthetic Buki data:

```bash
npm run build-in-public:capture -- --day D02 \
  --allow-simulator \
  --disposable-simulator \
  --simulator <SIMULATOR_UDID>
```

The automation never boots a personal simulator, bypasses authentication, publishes posts, sends messages, updates App Store records, or submits to Shipaton/Devpost.

## Where the output goes

- Calendar: `docs/build-in-public-30-day-calendar.md`
- Visual calendar: `build-in-public-calendar.html`
- Machine-readable plan: `docs/build-in-public-assets/30-day/plan.json`
- Daily receipts and media: `docs/build-in-public-assets/30-day/generated/<DAY>/<RUN>/`
- Latest result for a day: `docs/build-in-public-assets/30-day/generated/<DAY>/latest.json`
- Operating procedure: `docs/build-in-public-daily-session-runbook.md`

Every run records the source truth, hashes, image or video metadata, missing proof, rollback instructions, platform drafts, and the final human approval checkpoint.

On this machine, `generated/` is a project-local symlink to `/Users/bitcoin/.codex/artifacts/buki-build-in-public/generated` because `/Volumes/Personal` is nearly full. The visible project path and commands stay unchanged; only reproducible campaign output is stored on the roomier system disk.
