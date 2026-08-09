# Buki Pro implementation and iOS release progress

Last updated: **2026-08-09 22:24 +04 (Asia/Tbilisi)**

Release scope: **iOS only**. Android is deferred.

Current release decision: **READY FOR MANUAL APPLE VALIDATION — implementation, production security deployment, frozen-SHA verification, the zero-finding final security scan, production build 10 delivery, TestFlight processing, App Store metadata/privacy setup, purchase-product review screenshots, and build attachment are complete. Remaining work requires the user: Sign in with Apple, TestFlight sandbox purchase/restore/lifecycle checks, and the intentionally excluded App Review/Shipathon submission, video, and Devpost steps.**

This file is the single progress tracker for Buki Free + Pro. Update it after every material implementation, credential, verification, build, or release change. Never put credential values, tokens, passwords, service-account JSON, private keys, or OTP codes in this file.

Status legend:

- ✅ Complete and verified
- 🟡 Implemented or configured, but final/live verification remains
- ⛔ Blocking release
- ⏳ Not started or intentionally pending
- ➡️ Deferred from the iOS release

## 1. Current project snapshot

| Item | Current state |
|---|---|
| Repository | `SyntaxFear/Buki` |
| Delivery branch | `main`, pushed directly as previously approved |
| Current verified implementation head | `6098729` |
| Main worktree before this tracker | Clean and equal to `origin/main` |
| App name | Buki |
| Expo slug | `Bloombook` |
| Expo SDK | 57 |
| App version | `1.0.1` |
| iOS bundle ID | `com.parastashvili.bloombook` |
| URL scheme | `buki` |
| EAS project | `@parastashvili/Bloombook` |
| EAS project ID | `d600782c-a339-4fe0-88da-2605d7c4bcdc` |
| EAS remote iOS build number | `10` |
| Latest finished production build | Version `1.0.1` build `10`, EAS build `0afc8da0-a9a4-4d28-9e6d-f9e5dac49b36`, created from `6098729` |
| Supabase project reference | `hoaufnulrockulvwfzzo` |
| RevenueCat project | Buki |
| RevenueCat REST project ID | `proj32706f55` |
| RevenueCat entitlement | `pro` |
| RevenueCat offering | `default` |
| Release candidate SHA | `60987297c7eda1aeb65060950541388c4f5965c5` |

## 2. Locked product and subscription model

### 2.1 Access tiers

| Feature | Free | Pro |
|---|---:|---:|
| Adult account | Required | Required |
| Child profiles | 1 | Unlimited locally |
| Sketchpads | 1 | Unlimited locally |
| Artworks | 20 total | Unlimited locally |
| Existing layouts | All 5 | All 5 |
| Existing designs | All 4 | All 4 |
| Premium visuals | Preview only | 6 themes, 8 borders, decorations |
| Basic artwork details | Title, date, notes | Included |
| Advanced organization | Locked | Tags, favorites, search, filters, bulk actions |
| Capture/import | Included | Included |
| Cloud backup | None | Automatic backup and restore |
| Cloud quota | None | 2 GB optimized storage |
| Multiple devices | Separate local libraries | Same-account synchronization |
| Individual export | Locked | PNG, JPG, presentation/share card |
| Book export | Locked | Sketchpad PDF |
| Batch export | Locked | ZIP with images and metadata |
| Full archive | Locked | Versioned `.buki` export/import archive |

Existing content is never deleted merely because a limit is introduced or Pro expires. Applied premium styling remains visible after expiry.

### 2.2 Products

| Plan | Price | Access |
|---|---:|---|
| Monthly | $2.99 | Same Pro entitlement |
| Yearly | $19.99 | Same Pro entitlement, eligible 7-day trial, Best Value |
| Lifetime | $39.99 | Same Pro entitlement, one-time purchase |

The yearly plan saves approximately 44% versus paying monthly. Store-localized prices are used in the app.

### 2.3 Store identifiers

- Monthly: `buki_pro_monthly`
- Yearly: `buki_pro_yearly`
- Lifetime: `buki_pro_lifetime`
- Application code gates on entitlement `pro`, never on an individual product ID.

## 3. Credential and service readiness

### 3.1 Numbered readiness tracker

1. ✅ **GitHub**
   - Authenticated profile: `SyntaxFear`.
   - Push access to `SyntaxFear/Buki` is verified.
   - Repository-local attribution is configured for the personal profile.

2. ✅ **Expo/EAS account and project**
   - Authenticated EAS account: `parastashvili`.
   - Buki project access and iOS production build capability are verified.
   - Production EAS environment contains all six mobile-safe public variables.

3. ✅ **Mobile-safe app configuration**
   - `EXPO_PUBLIC_SUPABASE_URL` is set.
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY` is set.
   - `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` is set.
   - `EXPO_PUBLIC_PRIVACY_URL` is set.
   - `EXPO_PUBLIC_TERMS_URL` is set.
   - `EXPO_PUBLIC_SUPPORT_URL` is set.
   - Values are not recorded in Git or this document.

4. ✅ **Supabase project and server secrets**
   - Project dashboard access to Buki is verified in Safari.
   - `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_PROJECT_ID`, and `REVENUECAT_WEBHOOK_AUTH` exist as encrypted Edge Function secrets.
   - Default Supabase server secrets are available to Edge Functions.
   - The local Supabase CLI is linked to the Buki project reference.

5. 🟡 **Supabase CLI account access**
   - The local CLI token currently lists only `samosi-production` and receives insufficient-privilege responses for Buki function administration.
   - The Buki dashboard itself is accessible in Safari and was used to deploy the release migrations and Edge Function updates.
   - Before release maintenance, authenticate the CLI with the personal account that owns Buki or intentionally continue administration through the dashboard.

6. ✅ **RevenueCat project configuration**
   - Project `Buki` and project ID `proj32706f55` are verified.
   - Active entitlement `pro` is verified through the official RevenueCat v2 endpoint.
   - Monthly, yearly, and lifetime products are attached and returned in the offering.
   - Restore behavior is configured as transfer.
   - The server API key is scoped to only:
     - `project_configuration:entitlements:read`
     - `customer_information:customers:read`
     - `customer_information:subscriptions:read`
     - `customer_information:purchases:read`

7. ✅ **RevenueCat-to-Supabase authoritative verification**
   - The earlier HTTP 503 was diagnosed from Supabase logs as a RevenueCat HTTP 403.
   - Root cause: the existing server key lacked `project_configuration:entitlements:read`.
   - The key permissions were corrected without exposing or rotating the secret value.
   - Signed-in simulator verification now returns valid Free and Pro responses from `verify-entitlement`.

8. 🟡 **App Store Connect products and sandbox**
   - The iOS products resolve through RevenueCat and return `$2.99`, `$19.99`, and `$39.99` in the simulator.
   - Yearly trial eligibility and localized paywall presentation work.
   - Monthly, yearly, and lifetime product metadata is complete in App Store Connect and each product has an accepted review screenshot.
   - App Store version `1.0.1` is saved with production build `10` attached.
   - A real TestFlight/App Store sandbox purchase has not yet been completed for monthly, yearly, or lifetime.
   - Cancellation, refund, billing grace, expiry, and cross-platform restore are not yet proven against store transactions.

9. 🟡 **Apple authentication — manual test deferred by user**
   - Native routing, callback security, account isolation, and iOS Sign in with Apple configuration are implemented.
   - Email magic-link sign-in is live-verified.
   - The Apple button reaches Apple's native system authentication flow.
   - The simulator is not signed into an Apple Account; the user will complete the final login/logout run manually later.

10. ✅ **Google authentication decision on iOS**
    - Google OAuth code paths remain available for a future configured release.
    - The unverified Google entry point is hidden from the initial iOS release in `6920204`.

11. 🟡 **Email magic link and SMTP**
    - Email magic-link sign-in works end to end with `levani.parastashvili@gmail.com`.
    - The onboarding UI now accurately describes a sign-in link rather than a numeric code.
    - A custom production Gmail SMTP setup has not been confirmed as the active Supabase mail provider.
    - Before production scale, configure the intended SMTP sender securely or select a dedicated transactional provider. Never commit an app password.

12. ✅ **Legal and support site**
    - Privacy: `https://buki.expo.app/privacy` — HTTP 200.
    - Terms: `https://buki.expo.app/terms` — HTTP 200.
    - Support: `https://buki.expo.app/support` — HTTP 200.
    - Account deletion: `https://buki.expo.app/delete-account` — HTTP 200.

13. 🟡 **Test accounts**
    - Adult Buki test account is working.
    - Apple sandbox/TestFlight purchase account still needs final purchase verification.
    - Destructive deletion was intentionally not completed during smoke testing.

14. ➡️ **Android credentials and Google Play**
    - Deferred until the future Android release.

## 4. Git backup and delivery safety

### 4.1 Verified backup points

| Backup | Commit | Local | Remote |
|---|---|---:|---:|
| `backup/pre-buki-pro-head-20260808` | `f80b229a8313c4c17fc1caba8f42180740944fdf` | ✅ | ✅ |
| `pre-buki-pro-head-20260808-f80b229` | `f80b229a8313c4c17fc1caba8f42180740944fdf` | ✅ tag | ✅ tag |
| `backup/pre-buki-pro-snapshot-20260808` | `e31787943c4c9e5eb4db4d87f58f5ec897d862a1` | ✅ | ✅ |
| `pre-buki-pro-snapshot-20260808` | `e31787943c4c9e5eb4db4d87f58f5ec897d862a1` | ✅ tag | ✅ tag |

### 4.2 Local recoverable backup files

- `/Volumes/Personal/Projects/Buki-Backups/pre-buki-pro-20260808/pre-buki-pro-working-tree.patch`
- `/Volumes/Personal/Projects/Buki-Backups/pre-buki-pro-20260808/pre-buki-pro-added-files.tar.gz`

### 4.3 Delivery rules still in force

- Commit small, coherent, validated changes.
- Stage explicit files or hunks.
- Fetch and compare `origin/main` before every push.
- Push each validated commit directly to `main` as previously approved.
- Never force-push or rewrite published history.
- Never commit credentials, OTP codes, private keys, `.env.local`, browser data, or runtime diagnostics.
- Stop if remote `main` changes unexpectedly.

## 5. Implementation status by feature area

| Area | Code | Unit/integration tests | Live iOS smoke | Final independent verification |
|---|---:|---:|---:|---:|
| Central Free/Pro capability resolver | ✅ | ✅ | ✅ | ✅ frozen-SHA suite |
| Free child/sketchpad/artwork limits | ✅ | ✅ | ✅ 19/20/21 and above-limit migration verified | ⏳ |
| SQLite schema and legacy JSON migration | ✅ | ✅ | 🟡 current library works; interruption/missing-media matrix pending | ⏳ |
| Supabase adult authentication | ✅ | ✅ | ✅ email magic link; Apple native flow reached | ⏳ manual Apple completion |
| Onboarding and default child/sketchpad | ✅ | ✅ | ✅ | ⏳ |
| Child profile CRUD and account ownership | ✅ | ✅ | ✅ Free-limit path | ⏳ full CRUD matrix |
| Account Center | ✅ | ✅ where applicable | ✅ all major sections inspected | ⏳ |
| Parental confirmation gates | ✅ | ✅ | ✅ purchase, external link, restore, clear, delete | ⏳ |
| RevenueCat customer identity | ✅ | ✅ | ✅ signed-in UUID is used | ⏳ |
| Custom Buki paywall | ✅ | ✅ | ✅ | ⏳ real purchase |
| Purchase and restore account pinning | ✅ | ✅ | ✅ warning flows | ⏳ store transaction |
| Subscription expiry/grace model | ✅ | ✅ | ✅ expiry and renewal transition verified | ⏳ real store lifecycle |
| Six Pro themes | ✅ | ✅ | ✅ preview, save, expiry persistence | ⏳ |
| Eight Pro borders and decorations | ✅ | ✅ | ✅ preview, save, expiry persistence | ⏳ |
| Artwork metadata | ✅ | ✅ | ✅ title/date/notes | ⏳ |
| Tags, favorites, search, filters, bulk actions | ✅ | ✅ | ✅ | ⏳ |
| PNG/JPG and share-card export | ✅ | ✅ | ✅ | ⏳ |
| Sketchpad PDF export | ✅ | ✅ | ✅ 329 KB file generated | ⏳ |
| ZIP export | ✅ | ✅ | ✅ 489 KB file generated | ⏳ |
| `.buki` archive export/import | ✅ | ✅ | ✅ valid duplicate-safe import and corrupt rejection | ⏳ |
| Supabase schema and RLS | ✅ | ✅ source-level coverage | 🟡 live function access verified | ⏳ cross-account proof |
| Persistent local sync queue | ✅ | ✅ | ✅ two-artwork upload completed and repeat sync drained | ⏳ |
| Deduplicated media uploads | ✅ | ✅ | ✅ repeat sync preserved 634.1 KB usage | ✅ exact row/checksum/object proof |
| Signed upload reservation/replay protection | ✅ | ✅ | ✅ production migration and affected functions deployed | ⏳ security agent |
| Cloud restore and 2 GB quota handling | ✅ | ✅ | ✅ clean-state restore of two artworks and six media files | ⏳ 2 GB destructive boundary |
| Ninety-day retention and scheduled cleanup | ✅ | ✅ lifecycle tests | ✅ production function deployed; live timeline remains deferred | ⏳ |
| Cloud/account deletion | ✅ | ✅ where applicable | ✅ warning flow; deletion canceled | ⏳ destructive test account run |
| Privacy-safe analytics | ✅ | ✅ | ⏳ event evidence | ⏳ |
| Legal/support web pages | ✅ | ✅ content tests | ✅ HTTP 200 | ⏳ final copy review |
| iOS production build and TestFlight | ✅ | N/A | ✅ build 10 processed and available to internal testers | 🟡 sandbox transactions pending |
| Android | ➡️ | ➡️ | ➡️ | ➡️ |

## 6. Live iOS runtime verification already completed

The following was verified on an iPhone 17 Pro Max simulator running iOS 26.5 with the native development build.

1. ✅ Email OTP/magic-link sign-in completed through Gmail and Brave.
2. ✅ Adult account UUID is consistently used as the RevenueCat App User ID.
3. ✅ Onboarding created adult profile `Levan Parastashvili`, child `Test Child`, and sketchpad `My Book`.
4. ✅ Free account shows one child and blocks creation of a second child with the Pro paywall.
5. ✅ Free account blocks creation of a second sketchpad with the Pro paywall.
6. ✅ Premium visual previews are available to Free users and saving premium styling opens Pro.
7. ✅ All six Pro themes were displayed:
   - Moonlight Magic
   - Rainbow Studio
   - Forest Friends
   - Ocean Adventure
   - Space Explorer
   - Candy Cloud
8. ✅ All eight Pro borders were displayed:
   - Gallery Mat
   - Polaroid
   - Torn Paper
   - Washi Tape
   - Scalloped
   - Crayon Edge
   - Sticker Stars
   - Museum Frame
9. ✅ Paywall defaults to yearly and shows Best Value, Save 44%, the 7-day trial, and localized prices.
10. ✅ Monthly and lifetime options are visible with the correct prices.
11. ✅ Purchase attempts display the grown-ups-only gate.
12. ✅ Advanced organization controls are Pro-gated for Free users.
13. ✅ Export & Backup and artwork export controls are Pro-gated for Free users.
14. ✅ Account Center displays adult profile, children, membership, usage, cloud, data/export, preferences, support, About, and Danger Zone.
15. ✅ The exact Automatic Backup switch opens Pro for Free users after the fix in `007fb75`.
16. ✅ Privacy Policy and destructive actions use parental confirmation.
17. ✅ Native simulator passcode confirmation was successfully completed during testing.
18. ✅ Clear-local-data second confirmation was displayed and safely canceled.
19. ✅ Account-deletion second confirmation warns that deleting Buki does not cancel an App Store subscription; deletion was safely canceled.
20. ✅ Restore Purchases warns that membership can move to the signed-in Buki account while artwork does not move; restore was safely canceled.
21. ✅ Simulator demo capture saved two artworks.
22. ✅ The gentle one-time Pro introduction appeared after the first saved artwork and did not repeat after the second.
23. ✅ Free artwork title and notes were edited and persisted (`Sailing Day`, `First Buki test artwork.`).
24. ✅ Favorites and tags remain Pro-gated while Free.
25. ✅ Supabase `verify-entitlement` returned a valid Free result after the RevenueCat permission fix.
26. ✅ A temporary promotional `pro` entitlement was granted to the test account.
27. ✅ RevenueCat SDK refreshed the customer from the network and detected the active entitlement.
28. ✅ Supabase `verify-entitlement` then returned `active: true`, `hadPro: true`, `cloudAccess: true`, and active retention/uploads.
29. ✅ Exact Supabase proof found two artwork rows, six uploaded-media rows, six distinct valid checksums, six matching private storage objects, and 649,289 accounted bytes.
30. ✅ A clean local state restored both artworks, all six media files, favorites, tags, and premium styling.
31. ✅ Tags, favorites, search, filters, and bulk organization actions were exercised while Pro.
32. ✅ PNG/JPG/share-card, 329 KB PDF, 489 KB ZIP, and 489 KB `.buki` archive exports were generated.
33. ✅ Valid archive re-import skipped two duplicate artworks; a truncated archive was rejected as invalid ZIP data.
34. ✅ Expiry preserved both local artworks and Moonlight Magic styling, enforced Free creation/organization/export/upload limits, and kept cloud restore read-only until **2026-11-07**.
35. ✅ Renewal immediately resumed automatic backup and drained the local queue.
36. ✅ Free boundaries were verified live at 19 artworks, 20 artworks, attempted artwork 21, and a migrated 21-artwork library.
37. ✅ Email magic-link sign-in completed from Gmail; Supabase's temporary email-rate-limit change was restored to two emails per hour.
38. ✅ Google sign-in is hidden for this iOS release; onboarding exposes only Apple and email-link sign-in.
39. ✅ A symbolicated ETTrace run loaded and scrolled a 500-artwork local library on iPhone 17 Pro Max / iOS 26.5. The original two-artwork database and zero-item sync queue were restored afterward.

## 7. Defects found and fixed during runtime verification

| Defect | Resolution | Commit/configuration |
|---|---|---|
| Native auth callback did not finish reliably from Expo Router params | Completed callback routing and session handoff | `f134a13` |
| Paywall and parental gate rendered behind native modal routes | Rendered iOS gates in `FullWindowOverlay` and added accessibility labels | `3b4a2ad` |
| Automatic Backup switch did nothing for Free users | Switch now opens the Pro paywall | `007fb75` |
| Supabase entitlement function returned HTTP 503 | Supabase logs showed RevenueCat entitlement lookup HTTP 403 | Live configuration fix |
| RevenueCat server key lacked entitlement-read permission | Replaced the permission set with four required read-only scopes | Live configuration fix |
| Signed upload token could be replayed | Upload reservations hardened | `c52b6f8` |
| Auth callback/account boundary risks | Native sign-in and callback validation hardened | `ffd91ef`, `f134a13` |
| Persisted local media paths broke after an iOS app-container relocation | Rebased safe `Documents` file URIs to the current app container during database startup | `46bd903` |
| Expo Crypto rejected raw `ArrayBuffer` input during native media hashing | Centralized SHA-256 hashing through copied `Uint8Array` input | `f9e5816` |
| Account Center action rows were not exposed as accessible buttons | Added explicit button roles, labels, and hints | `bbfcd0e` |
| React Native Supabase download blobs did not expose `arrayBuffer()` | Restores now use short-lived signed URLs and Expo FileSystem native downloads before checksum verification | `cb1b188` |
| Export format choices were not exposed as accessible buttons | Added explicit button semantics | `67cb8b0` |
| Native form-sheet container boundaries produced a React Native Screens warning | Preserved the form-sheet container boundary | `338563b` |
| Destructive account actions lacked complete accessibility labels | Added explicit destructive-action labels | `1725ac9` |
| Onboarding promised a numeric code while Supabase sent a magic link | Reworked onboarding copy and flow around email sign-in links | `f0c1ee4` |
| Unverified Google login was visible in the iOS release UI | Hid the Google entry point while preserving future provider code | `6920204` |
| Destructive cloud/account deletion accepted old sessions | Required authentication no older than ten minutes and added user-facing reauthentication guidance | `d7eaaa9` |
| Entitlement verification could amplify RevenueCat traffic | Added an atomic per-owner rate limit and a 30-second authoritative snapshot cache | `d7eaaa9` |
| RevenueCat account operations could race during account switching | Serialized connect, refresh, purchase, restore, and disconnect operations and revalidated the expected owner | `d7eaaa9` |
| Archive/imported images relied on structural headers alone | Added complete PNG/JPEG/WebP structural checks and native decoder validation before persistence | `d7eaaa9` |
| Native image sanitization decoded before enforcing source limits | Enforced byte and dimension limits before the first native decode | `d7eaaa9` |
| Analytics accepted arbitrary source/version dimensions | Added server-side source allowlisting and strict version/build validation | `d7eaaa9` |
| Retention cron deployment URL was derived from mutable configuration | Pinned the exact production function URL in the scheduled job | `d7eaaa9` |

## 8. Current test and quality baseline

Verified on **2026-08-09** from the clean frozen release candidate at `6098729`:

- ✅ Jest: **52 suites, 292 tests passed**.
- ✅ TypeScript: `npx tsc --noEmit` passed.
- ✅ Expo Doctor: **20/20 checks passed**.
- ✅ Expo lint: **0 errors and 0 warnings** with a committed, scoped Expo SDK 57 configuration.
- ✅ iOS Metro export: **2,402 modules bundled successfully**.
- ✅ Public legal/support pages returned HTTP 200.
- ✅ GitHub authentication and direct push access are working.
- ✅ EAS project and production environment are accessible.
- ✅ Deno shared tests: **18 tests passed**.
- ✅ Deno checks passed for the changed Edge Functions.
- ✅ Production migrations `20260809153000_harden_media_completion.sql` and `20260809154000_rate_limit_analytics.sql` were applied and recorded.
- ✅ Production migration `20260809203000_harden_release_boundaries.sql` was applied and recorded; all five rate-limit, privilege, analytics, and cron assertions returned true.
- ✅ Production schema verification returned true for all eight expected migration, function, constraint, and rate-limit checks.
- ✅ `complete-media-upload`, `create-media-upload`, `delete-media`, `request-account-deletion`, and `retention-cleanup` were deployed through the Supabase dashboard.
- ✅ Unauthenticated endpoint smoke tests returned the expected HTTP 401 rejection paths for all five deployed functions.
- ✅ Security-remediation deployments are active as `request-account-deletion` v3, `delete-cloud-data` v2, `verify-entitlement` v7, and `retention-cleanup` v5; unauthenticated smoke tests returned the expected 401 paths.
- ✅ Final standard security scan `e1072a3e-b313-49f5-ae54-15552658b915` completed with **0 findings**.
- ✅ EAS production build `0afc8da0-a9a4-4d28-9e6d-f9e5dac49b36` finished for version `1.0.1` build `10` from exact commit `6098729`.
- ✅ EAS submission `83b8c9bc-9af0-4a3a-bf4f-89da09165bae` finished successfully; App Store Connect shows build 10 processed and ready.
- ✅ App Store Connect version 1.0.1 metadata, privacy disclosures, review information, manual release choice, and five iPhone screenshots are saved.
- ✅ Monthly, yearly, and lifetime products have accepted App Review screenshots; the lifetime image uses Apple's accepted 640×920 review format.
- ✅ Version 1.0.1 is saved with build 10 attached. No App Review submission was started.
- 🟡 `npm audit` reports 17 high and 9 moderate development/build-tool findings; no safe compatible upgrade is currently available, and the findings are not shipped runtime code. Do not run a breaking `npm audit fix` for this release.

Known quality work still open:

- ✅ The lint strategy is now committed: Reanimated compiler exceptions, intentional state-reset effects, Jest import order, and Deno Edge Functions are narrowly scoped rather than disabled globally.
- ✅ All six deprecated mutable Skia path-builder call sites were migrated to `Skia.PathBuilder`; the deprecated runtime warnings no longer appeared.
- 🟡 RevenueCat logs non-blocking custom `ui_config` remote-config assembly warnings; Buki uses its custom paywall successfully.
- ✅ The React Native Screens FormSheet/ScrollView subview warning was resolved in `338563b`.
- ✅ The 500-artwork ETTrace performance run completed with app-owned symbols present; the main active cost was Skia/Metal redraw work during scrolling, with no crash or data loss.

## 9. Current live test state and temporary diagnostics

### 9.1 Test account

- Adult email: `levani.parastashvili@gmail.com`
- Supabase/RevenueCat App User ID: `0cff6283-46c3-45ec-a933-c7339f782e48`
- Child: `Test Child`
- Sketchpad: `My Book`
- Current local artworks: 2
  - `Sailing Day`
  - One untitled house artwork

### 9.2 Temporary Pro access

- A fresh one-day RevenueCat promotional entitlement was granted only for cloud/Pro verification.
- Product shown by RevenueCat: `rc_promo_pro_daily`.
- Latest observed expiry: **2026-08-10 14:15 UTC**.
- This grant must be revoked after the intended cloud, organization, and export smoke tests, or allowed to expire and then used to verify expiry behavior.

### 9.3 Disposable runtime worktree

- Path: `/Users/bitcoin/.codex/tmp/Buki-Phase2-c47bee1`
- Purpose: native simulator diagnostics and smoke testing.
- Contains generated native files, copied environment configuration, and the validated Phase 2 commits on a detached head.
- Must never be committed or used as the release source.
- Main repository remains the source of truth.

### 9.4 Current interruption point

All automatable pre-submission work is complete. The release candidate is build 10 from `6098729`, processed in TestFlight and attached to App Store version 1.0.1. The remaining validation requires the user's Apple account or sandbox interaction: Sign in with Apple and real TestFlight purchase/restore/lifecycle checks. App Review and Shipathon submission actions were intentionally not performed.

## 10. Remaining work in priority order

1. 🟡 **Complete manual Sign in with Apple verification**
   - The user has explicitly deferred this test and will perform it manually later.
   - Verify login, logout, account isolation, and return to the email-owned library.

2. 🟡 **Complete real TestFlight sandbox purchase testing**
   - Monthly purchase.
   - Yearly trial eligibility/start.
   - Lifetime purchase.
   - Restore on the same Buki account.
   - Restore/transfer warning on a different Buki account.
   - Cancellation, refund/revocation, grace, and expiry where Apple sandbox controls permit.

3. ⏳ **Final submission actions — intentionally excluded from this process**
   - Add version 1.0.1 and its first subscriptions/in-app purchase to App Review.
   - Submit to App Review and manually release after approval.
   - Record the Shipathon video and complete the Devpost/Shipathon submission.

4. ⏳ **Tag the transaction-tested release candidate**
   - Tag only after the manual Apple and TestFlight transaction checks pass.

## 11. Independent verification matrix

The frozen-SHA automated, production-boundary, and security work is complete. Rows that require real Apple authentication or StoreKit transactions remain pending and must not be presented as passed.

| # | Agent | Status | Required evidence |
|---:|---|---|---|
| 1 | Migration | ✅ | Legacy migration, interruption recovery, media relocation, above-limit libraries |
| 2 | Authentication | 🟡 | Email link and callback boundaries pass; manual Apple completion remains |
| 3 | Free limits | ✅ | Children, sketchpads, artwork 19/20/21 and above-limit behavior |
| 4 | RevenueCat purchase | ⏳ | Monthly, yearly trial, lifetime, localized prices, unlock |
| 5 | Subscription lifecycle | ⏳ | Restore, transfer, cancellation, refund, grace, expiry, offline |
| 6 | Profiles and Account Center | ✅ | Profile, children, usage, preferences, parental gates, warnings |
| 7 | Premium visuals | ✅ | Preview, save lock, all themes/borders, expiry preservation |
| 8 | Organization | ✅ | Metadata, tags, search, favorites, filters, bulk actions |
| 9 | Export/import | ✅ | Images, card, PDF, ZIP, `.buki`, duplicate/corrupt/expiry cases |
| 10 | Cloud synchronization | ✅ | Queue, retry, restore, renewal, deduplication and exact object proof |
| 11 | Quota and retention | 🟡 | Enforcement, read-only transition, renewal, and cleanup deployment pass; destructive 2 GB boundary remains deferred |
| 12 | Security and privacy | ✅ | RLS/boundaries, signed uploads, minimization, deletion controls, final scan 0 findings |
| 13 | iOS end to end | 🟡 | Simulator and TestFlight delivery pass; real purchase flow remains |
| 14 | Android end to end | ➡️ | Deferred with Android release |
| 15 | Release | ✅ pre-submission | Version/build, links, config, privacy, metadata, screenshots, TestFlight readiness |

For the iOS-only release, Android verification remains deferred and must not be presented as passed.

## 12. Actions that may require the user

1. Complete the deferred manual Sign in with Apple test and any Apple 2FA/account confirmation.
2. Run the TestFlight monthly, yearly-trial, lifetime, restore, and lifecycle checks with an Apple sandbox account.
3. If custom Gmail SMTP is required before launch, create/configure it directly in the secure provider UI; do not paste an app password into chat or Git.
4. When ready, explicitly authorize the separate App Review and Shipathon submission phase.

## 13. Work that can continue without the user

All currently authorized and automatable pre-submission work is complete. Further release progress depends on the manual Apple/TestFlight checks or explicit authorization to begin the excluded submission phase.

## 14. Full Pro implementation commit ledger

These commits were added after the complete pre-subscription snapshot `e317879`:

```text
3f775ff chore: add account, database, and purchase dependencies
91a3241 feat: add membership capabilities and free limits
9528ca9 feat: add SQLite schema and legacy migration
8c38ba2 feat: add Supabase adult authentication
f7e5826 feat: add onboarding and child profiles
401803c feat: add account center and parental gates
d48c538 feat: connect RevenueCat customer state
a7355b3 feat: add Buki Pro paywall and purchases
ba026cb feat: add purchase restore and expiry handling
126250f feat: add premium themes, borders, and decorations
26c323d feat: add artwork metadata and organization
2e8a55c feat: add artwork and share-card export
e559f3b feat: add PDF and ZIP exports
af421ac feat: add Buki archive import and export
2d6d624 feat: add Supabase schema and row-level security
9cdd380 feat: add local synchronization queue
0b20d6a fix: keep signed-out hydration stable
da0e40c feat: add deduplicated cloud uploads
4999a3a feat: add cloud restore and quota handling
ec67812 feat: add retention cleanup and account deletion
244a430 feat: add privacy-safe subscription analytics
f3b9e3b chore: finalize release and legal configuration
04d1da5 fix: keep legacy migration recoverable
459a4d0 fix: harden authentication account boundaries
81df5c1 fix: enforce free limits atomically
cbca1fb fix: close remaining free limit races
49048da fix: enforce library limits at commit time
a22479e fix: secure purchase account and Expo config
c073560 fix: pin purchase and restore account identity
57d44de fix: preserve bounded billing grace access
d698d2d fix: harden account center isolation and replay
3e99998 fix: enforce and render premium sketchpad visuals
293776a fix: align premium visual previews and page turns
d7dee6d fix: scope and normalize artwork organization
2704dd6 fix: enforce advanced organization at persistence boundary
3a6b3d2 fix: preserve queued tags during cloud restore
5e44c08 fix: anonymize server analytics records
8765b4c fix: enforce export access at service boundaries
ef4ba44 fix: harden archive import integrity
1ca10e2 fix: polish and verify Pro exports
fcded4b fix: clean up temporary export files
2e26705 fix: isolate cloud sync across accounts
8d6ec2b fix: harden cloud upload reservations
62b7e93 fix: close remaining export cleanup gaps
ac15053 fix: reject cross-account library collisions
22db28c fix: serialize cloud sync scheduling
f815dda fix: surface cloud restore checkpoint failures
cd888f9 test: cover entitlement retention lifecycle
e459823 fix: reject unsolicited auth callbacks
fb06a15 fix: enforce quota for pending uploads
1952e48 test: verify pending upload quota release
eefbff8 fix: neutralize spreadsheet export formulas
e33abe7 fix: bound archive import resources
88d85b8 fix: require device owner confirmation
7406eab fix: bound decoded artwork cache
afe1f9d fix: refresh account release notes
299923d fix: remove unused microphone permissions
df0c357 chore: add accurate App Store metadata
c52b6f8 fix: prevent signed upload token replay
ffd91ef fix: harden native sign-in security and accessibility
f134a13 fix: complete native auth callbacks from router params
3b4a2ad fix: present Pro gates above native modals
007fb75 fix: open Pro from backup switch
f980e24 chore: establish release lint baseline
46bd903 fix: rebase local media paths after reinstall
f9e5816 fix: pass typed bytes to native crypto
bbfcd0e fix: label account setting actions
cb1b188 fix: restore cloud media through native downloads
700266a docs: record phase two cloud verification
67cb8b0 fix: expose export formats as accessible buttons
338563b fix: preserve form sheet container boundaries
1725ac9 fix: label account destructive actions
f0c1ee4 fix: align email sign-in with magic links
6920204 fix: hide unverified google sign-in on ios
49db0f3 docs: finalize phase two verification
bc5be37 fix: harden release security boundaries
42885be docs: record production security deployment
d7eaaa9 fix: close release security findings
6098729 fix: narrow cached entitlement snapshot
```

## 15. Final release acceptance checklist

Release is allowed only when all applicable items are checked:

- [x] All automatable frozen-SHA verification passes at `6098729`; manual Apple/StoreKit rows remain explicitly pending.
- [x] No validated critical or high-severity release defects remain; final standard security scan has 0 findings.
- [x] Full Jest suite passes.
- [x] TypeScript passes.
- [x] Expo Doctor passes.
- [x] Intentional lint decision is documented.
- [x] Production iOS build succeeds from the final SHA.
- [x] TestFlight processing completes.
- [ ] Monthly sandbox purchase succeeds.
- [ ] Yearly trial sandbox flow succeeds.
- [ ] Lifetime sandbox purchase succeeds.
- [ ] Restore and transfer behavior succeeds.
- [x] Cloud upload, deduplication, restore, and retention transitions pass; destructive 2 GB boundary remains independently deferred.
- [x] RLS and account-scoped server paths are covered by implementation tests and exact account-owned row/object proof; final independent security scan completed with 0 findings.
- [x] Account deletion and App Store subscription warning flow pass without executing destructive deletion.
- [x] Legal/support pages and App Store links are final.
- [x] App Store screenshots, metadata, privacy labels, review information, and product screenshots are saved.
- [x] GitHub contains all implementation/security commits and both backup points.
- [x] Runtime diagnostic worktrees are isolated outside release inputs; the temporary build-10 paywall worktree was removed after screenshot capture.
- [ ] Final tested SHA is tagged as the release candidate.

## 16. Progress update log

### 2026-08-09

- Confirmed `main` at `007fb75` and equal to `origin/main` before creating this tracker.
- Re-ran 49 Jest suites/274 tests, TypeScript, and Expo Doctor successfully.
- Verified GitHub, EAS project, EAS production environment names, legal URLs, and backup refs.
- Diagnosed Supabase entitlement HTTP 503 as RevenueCat entitlement lookup HTTP 403.
- Corrected the RevenueCat server key to the minimum required read-only permissions.
- Verified authoritative Free entitlement response.
- Granted temporary one-day Pro access to the test account.
- Verified authoritative active Pro/cloud access response.
- Recorded the interruption point before actual cloud media upload/restore verification.
- Read the exact Expo SDK 57 reference before changing code.
- Added and documented the release lint configuration; Expo lint now passes with zero errors and zero warnings.
- Migrated all six deprecated mutable Skia path-builder call sites to `Skia.PathBuilder`.
- Re-ran 49 Jest suites/274 tests, TypeScript, Expo Doctor 20/20, and the iOS Metro export successfully at `f980e24`.
- Confirmed the FormSheet/ScrollView warning still requires Simulator reproduction and was not changed speculatively.
- Rebased persisted local `Documents` media URIs after app-container relocation; live artwork decoding recovered.
- Fixed Expo Crypto native hashing to always receive copied typed bytes.
- Uploaded two artworks with six media records; cloud usage reached 634.1 KB and remained unchanged after repeat sync.
- Fixed Account Center action accessibility so Sync, Restore, organization, and export rows are operable by assistive technology and automation.
- Replaced unsupported React Native Blob `arrayBuffer()` restore handling with signed native FileSystem downloads.
- Live restore completed with `2 artworks restored` and no failed media after the download fix.
- Verified active-Pro library search reduced two artworks to the matching `Sailing Day` result and generated the share-card export preview.
- Re-ran 51 Jest suites/279 tests, TypeScript, Expo lint, and Expo Doctor 20/20 successfully at `cb1b188`.
- Safari was subsequently authenticated to the Buki-owning Supabase project and the exact dashboard proof was completed.
- Completed exact Buki Supabase row, checksum, reservation, usage, and private-storage-object proof.
- Completed clean-state same-account cloud restore with two artworks and six media files.
- Completed active-Pro organization and all export formats, including valid/duplicate/corrupt `.buki` import cases.
- Completed live expiry, read-only retention, renewal, and automatic-sync-resumption verification.
- Completed live Free 19/20/21 and above-limit migration boundary verification.
- Completed real Gmail magic-link sign-in and restored Supabase email rate limiting to two emails per hour.
- Hid unverified Google sign-in from the initial iOS UI.
- Completed a symbolicated 500-artwork ETTrace profile and restored the original two-artwork database with zero queued sync items.
- Re-ran 51 Jest suites/279 tests, TypeScript, Expo lint, Expo Doctor 20/20, and a clean native Simulator build at `6920204`.
- Hardened RevenueCat identity, cloud-backup consent, archive/image handling, upload completion, storage paths, account deletion, and analytics retention/rate limiting in `bc5be37`.
- Re-ran 52 Jest suites/285 tests, TypeScript, Expo lint, Expo Doctor 20/20, iOS Metro export, 16 Deno shared tests, and Deno checks successfully at `bc5be37`.
- Applied and recorded the two pending production database migrations through Safari; all eight live verification assertions returned true.
- Deployed the five affected Edge Functions through Safari and confirmed expected unauthenticated HTTP 401 rejection paths for each endpoint.
- Completed a standard independent release security scan, validated seven low-to-medium release-boundary findings, and remediated all seven in `d7eaaa9`.
- Applied and recorded `20260809203000_harden_release_boundaries.sql`; live verification confirmed the entitlement rate table/function privileges, analytics allowlist, and pinned retention URL.
- Deployed the final remediated functions through the authenticated Safari session: `request-account-deletion` v3, `delete-cloud-data` v2, `verify-entitlement` v6, and `retention-cleanup` v5.
- Re-ran 52 Jest suites/292 tests, TypeScript, Expo lint, Expo Doctor 20/20, iOS Metro export, and 18 Deno shared tests successfully at `d7eaaa9`.
- Narrowed the authoritative entitlement snapshot in `6098729`, deployed `verify-entitlement` v7, and re-ran the clean frozen-SHA suite successfully.
- Completed final standard security scan `e1072a3e-b313-49f5-ae54-15552658b915` with 0 findings.
- Built EAS iOS production version 1.0.1 build 10 from exact commit `6098729`; build `0afc8da0-a9a4-4d28-9e6d-f9e5dac49b36` finished successfully.
- Submitted build 10 to App Store Connect; submission `83b8c9bc-9af0-4a3a-bf4f-89da09165bae` finished and TestFlight processing completed.
- Saved complete TestFlight test information and internal testing availability.
- Saved App Store version 1.0.1 metadata, review instructions, manual-release selection, five iPhone screenshots, and corrected App Privacy disclosures.
- Added accepted App Review screenshots for monthly, yearly, and lifetime products and verified all three remain Prepare for Submission.
- Replaced the obsolete build association and saved version 1.0.1 with build 10 attached.
- Removed the temporary build-10 paywall worktree and shut down the simulator; no diagnostic paywall code exists in `main`.
- Intentionally did not press Add for Review or perform App Review, Shipathon, video, or Devpost submission actions.

### Update procedure for every future session

1. Change the `Last updated` timestamp.
2. Update the relevant status table and exact evidence.
3. Add a dated entry to this log.
4. Record any temporary account, entitlement, build, worktree, or test state that must be cleaned up.
5. Record the exact commit SHA used for verification.
6. Never mark a feature complete solely because its source code exists; distinguish implementation from live and independent verification.
