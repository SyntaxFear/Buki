# Buki weekly X runbook

## Schedule and campaign window

- Planner: Saturday at 09:00 `Asia/Tbilisi`.
- Batch: Sunday through Saturday, two X posts per day.
- Early window: one unique time from 13:00 through 13:30.
- Late window: one unique time from 18:30 through 19:00.
- One-time bridge: August 16–22, 2026.
- Recurring Saturday runs: August 22 through October 24, 2026.
- Final scheduled date: October 31, 2026. Never create November posts.

## 1. Prepare the weekly template

Run:

```bash
npm run build-in-public:week-template -- --week-start YYYY-MM-DD
```

The template contains 14 ordered slots and reproducible varied times. Each window uses seven unique times and avoids the previous week’s same-day pattern.

Before drafting, inspect verified repository changes, current tests, release artifacts, product UI, the local weekly ledger, already scheduled posts, and X posts visible on `@Parastashvilii` from August 11, 2026 onward. Write visible account history to a temporary JSON file as `{ "items": [...] }`. Never inspect cookies, local storage, passwords, profiles, or browser history.

## 2. Prepare synthetic-only media

Verify the dedicated simulator without changing it:

```bash
npm run build-in-public:simulator-verify
```

Approved device:

- Name: `Buki-PageFlip-Debug-Disposable-20260813`
- UDID: `83382C8C-B573-44BB-8DB6-CBFD6E24E608`

The weekly reset requires a current simulator Buki app, an immutable seed data container, and `.buki-synthetic-seed.json` confirming `syntheticOnly: true`, the Buki bundle ID, the approved simulator name, and `seedSha256`. The hash covers only `Documents`, `Library`, and `tmp`; symlinks and other root entries are rejected.

```bash
npm run build-in-public:simulator-reset -- \
  --confirm-disposable \
  --simulator 83382C8C-B573-44BB-8DB6-CBFD6E24E608
```

The reset uninstalls and reinstalls Buki, then restores only the approved synthetic Buki data container. It never erases the simulator or touches another app.

Prepare 14 unique media files: at least four short videos, at least six current screenshots, and no more than four deterministic evidence-backed cards. Every item needs its local path, SHA-256, type, source type, and evidence source. Never reuse a media hash.

## 3. Draft and validate

Before writing public copy, read Plainspoken and the social-post-publisher app workflow named in the automation prompt.

Fill the template with exactly:

- four `product-demo` posts;
- three `technical-lesson` posts;
- two `testing` posts;
- two `builder-process` posts;
- one `app-store-process` post;
- one `user-problem` post;
- one `weekly-reflection` post.

Every post must be English, under 280 characters, contain 3–4 relevant hashtags including `#Shipaton` and `#BuildInPublic`, and reference one verified media item. Record its hook, topic, angle, evidence sources, and media hash. Avoid metrics, unstable App Store/TestFlight status, hype, em dashes, and generic engagement bait.

Exactly ten posts use a specific answerable question. The verified `https://buki.expo.app/` link appears in two or three posts.

```bash
npm run build-in-public:week-validate -- \
  --week-start YYYY-MM-DD \
  --input /absolute/path/weekly-copy.json \
  --history /absolute/path/x-history.json
```

The validator compares captions, hooks, questions, hashtag sets, topic-angle pairs, and media hashes with the current week and campaign history. A returning feature needs fresh evidence and a new angle. If either post fails, both posts for that date are held. Other complete days remain eligible.

## 4. Weekly approval and Brave scheduling

Show the user the generated `approval.md`, including every ready caption, media path/hash, date, and time. Revise rejected items and rerun validation.

One action-time confirmation is mandatory before scheduling. After confirmation, create an approval JSON naming the exact batch SHA-256, account, and every ready post ID:

```bash
npm run build-in-public:week-results -- \
  --manifest /absolute/path/weekly-manifest.json \
  --approve /absolute/path/approval.json
```

Use only the connected Brave extension and one dedicated background X tab. Verify `@Parastashvilii`; leave every other Brave tab and window untouched.

For each approved future post, enter the caption once, attach the exact media, select the manifest date/time in Georgia Standard Time, re-check the account/caption/media/date/time, schedule it, then read it back from X Scheduled posts. Record the exact visible result with `--record`.

Skip elapsed slots. Never backfill. If a schedule action is ambiguous, the read-back differs, sign-in expires, an account challenge appears, or the tab disappears, stop immediately. Never retry, delete, or edit automatically.

## 5. Daily verification

At 19:15 `Asia/Tbilisi`, use the dedicated Brave X tab read-only. Check both expected posts and record `published`, `missing`, `mismatch`, or `unknown`:

```bash
npm run build-in-public:week-results -- \
  --manifest /absolute/path/weekly-manifest.json \
  --verify /absolute/path/verification.json
```

Verification is notify-only. It never creates, edits, deletes, reschedules, or retries a post.

## Platform separation

- X uses this weekly Brave workflow. Buffer X publishing is disabled by default.
- Weekend LinkedIn remains a separate 18:15 automation using its existing route.
- Reddit remains controlled only by its existing approved calendar automation.
