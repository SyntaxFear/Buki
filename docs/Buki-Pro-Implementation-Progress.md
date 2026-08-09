# Buki Pro implementation and iOS release progress

Last updated: **2026-08-09 15:57 +04 (Asia/Tbilisi)**

Release scope: **iOS only**. Android is deferred.

Current release decision: **BLOCKED — implementation is substantially complete, but independent verification, real TestFlight purchases, cloud upload/restore proof, and final App Store delivery are still required.**

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
| Implementation baseline before this tracker update | `f980e24ff963dc3aa3598ec678551498c829ea29` |
| Main worktree before this tracker | Clean and equal to `origin/main` |
| App name | Buki |
| Expo slug | `Bloombook` |
| Expo SDK | 57 |
| App version | `1.0.1` |
| iOS bundle ID | `com.parastashvili.bloombook` |
| URL scheme | `buki` |
| EAS project | `@parastashvili/Bloombook` |
| EAS project ID | `d600782c-a339-4fe0-88da-2605d7c4bcdc` |
| EAS remote iOS build number | `9`; the next auto-incremented production build should be `10` |
| Latest finished production build | Version `1.0.0` build `8`, created from `f80b229`; it does not contain the Pro implementation |
| Supabase project reference | `hoaufnulrockulvwfzzo` |
| RevenueCat project | Buki |
| RevenueCat REST project ID | `proj32706f55` |
| RevenueCat entitlement | `pro` |
| RevenueCat offering | `default` |
| Release candidate SHA | Not frozen yet |

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
   - Project dashboard access to Buki is verified in Brave.
   - `REVENUECAT_SECRET_API_KEY`, `REVENUECAT_PROJECT_ID`, and `REVENUECAT_WEBHOOK_AUTH` exist as encrypted Edge Function secrets.
   - Default Supabase server secrets are available to Edge Functions.
   - The local Supabase CLI is linked to the Buki project reference.

5. 🟡 **Supabase CLI account access**
   - The local CLI token currently lists only `samosi-production` and receives insufficient-privilege responses for Buki function administration.
   - The Buki dashboard itself is accessible in Brave and was used successfully for read-only logs/configuration checks.
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
   - A real TestFlight/App Store sandbox purchase has not yet been completed for monthly, yearly, or lifetime.
   - Cancellation, refund, billing grace, expiry, and cross-platform restore are not yet proven against store transactions.

9. 🟡 **Apple authentication**
   - Native routing, callback security, account isolation, and iOS Sign in with Apple configuration are implemented.
   - Email OTP is live-verified.
   - A complete independent Sign in with Apple login/logout/account-switch run is still pending.

10. 🟡 **Google authentication on iOS**
    - Google OAuth code paths exist in the intended product model.
    - Live Google login has not been independently verified for this iOS release.
    - Before release, either configure and verify it or hide it rather than ship a non-working option.

11. 🟡 **Email OTP and SMTP**
    - Email OTP/magic-link sign-in works end to end with `levani.parastashvili@gmail.com`.
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
| Central Free/Pro capability resolver | ✅ | ✅ | ✅ | ⏳ |
| Free child/sketchpad/artwork limits | ✅ | ✅ | 🟡 child and sketchpad live; 20-artwork live boundary pending | ⏳ |
| SQLite schema and legacy JSON migration | ✅ | ✅ | 🟡 current library works; interruption/missing-media matrix pending | ⏳ |
| Supabase adult authentication | ✅ | ✅ | ✅ email OTP | ⏳ Apple/Google matrix |
| Onboarding and default child/sketchpad | ✅ | ✅ | ✅ | ⏳ |
| Child profile CRUD and account ownership | ✅ | ✅ | ✅ Free-limit path | ⏳ full CRUD matrix |
| Account Center | ✅ | ✅ where applicable | ✅ all major sections inspected | ⏳ |
| Parental confirmation gates | ✅ | ✅ | ✅ purchase, external link, restore, clear, delete | ⏳ |
| RevenueCat customer identity | ✅ | ✅ | ✅ signed-in UUID is used | ⏳ |
| Custom Buki paywall | ✅ | ✅ | ✅ | ⏳ real purchase |
| Purchase and restore account pinning | ✅ | ✅ | ✅ warning flows | ⏳ store transaction |
| Subscription expiry/grace model | ✅ | ✅ | ⏳ | ⏳ |
| Six Pro themes | ✅ | ✅ | ✅ preview/save gate | ⏳ Pro-save lifecycle |
| Eight Pro borders and decorations | ✅ | ✅ | ✅ preview/save gate | ⏳ Pro-save lifecycle |
| Artwork metadata | ✅ | ✅ | ✅ title/date/notes | ⏳ |
| Tags, favorites, search, filters, bulk actions | ✅ | ✅ | 🟡 Free gates verified; active-Pro operations pending | ⏳ |
| PNG/JPG and share-card export | ✅ | ✅ | 🟡 Free lock verified; generated files pending | ⏳ |
| Sketchpad PDF export | ✅ | ✅ | 🟡 Free lock verified; generated file pending | ⏳ |
| ZIP export | ✅ | ✅ | 🟡 Free lock verified; generated file pending | ⏳ |
| `.buki` archive export/import | ✅ | ✅ | ⏳ | ⏳ corruption/duplicate matrix |
| Supabase schema and RLS | ✅ | ✅ source-level coverage | 🟡 live function access verified | ⏳ cross-account proof |
| Persistent local sync queue | ✅ | ✅ | 🟡 Pro access obtained; upload proof interrupted | ⏳ |
| Deduplicated media uploads | ✅ | ✅ | ⏳ | ⏳ |
| Signed upload reservation/replay protection | ✅ | ✅ | ⏳ | ⏳ security agent |
| Cloud restore and 2 GB quota handling | ✅ | ✅ | ⏳ | ⏳ |
| Ninety-day retention and scheduled cleanup | ✅ | ✅ lifecycle tests | ⏳ real timeline simulation | ⏳ |
| Cloud/account deletion | ✅ | ✅ where applicable | ✅ warning flow; deletion canceled | ⏳ destructive test account run |
| Privacy-safe analytics | ✅ | ✅ | ⏳ event evidence | ⏳ |
| Legal/support web pages | ✅ | ✅ content tests | ✅ HTTP 200 | ⏳ final copy review |
| iOS production build and TestFlight | 🟡 configuration present | N/A | Existing old build only | ⏳ build 10 and sandbox testing |
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

## 8. Current test and quality baseline

Verified on **2026-08-09** from `main` at implementation baseline `f980e24`:

- ✅ Jest: **49 suites, 274 tests passed**.
- ✅ TypeScript: `npx tsc --noEmit` passed.
- ✅ Expo Doctor: **20/20 checks passed**.
- ✅ Expo lint: **0 errors and 0 warnings** with a committed, scoped Expo SDK 57 configuration.
- ✅ iOS Metro export: **2,399 modules bundled successfully**.
- ✅ Public legal/support pages returned HTTP 200.
- ✅ GitHub authentication and direct push access are working.
- ✅ EAS project and production environment are accessible.

Known quality work still open:

- ✅ The lint strategy is now committed: Reanimated compiler exceptions, intentional state-reset effects, Jest import order, and Deno Edge Functions are narrowly scoped rather than disabled globally.
- 🟡 All six deprecated mutable Skia path-builder call sites were migrated to `Skia.PathBuilder`; Simulator confirmation that runtime warnings are gone remains pending.
- 🟡 RevenueCat logs non-blocking custom `ui_config` remote-config assembly warnings; Buki uses its custom paywall successfully.
- 🟡 A React Native Screens FormSheet/ScrollView subview warning appeared during artwork details and should be investigated for layout stability.
- 🟡 Final performance, memory, and long-library checks have not run.

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

- A one-day RevenueCat promotional entitlement was granted only for cloud/Pro verification.
- Product shown by RevenueCat: `rc_promo_pro_daily`.
- Expiry: **2026-08-10T11:29:28Z**.
- This grant must be revoked after the intended cloud, organization, and export smoke tests, or allowed to expire and then used to verify expiry behavior.

### 9.3 Disposable runtime worktree

- Path: `/Users/bitcoin/.codex/tmp/Buki-iOS-Runtime-c52b6f8`
- Purpose: native simulator diagnostics and smoke testing.
- Contains uncommitted diagnostic logging and copied fixes.
- Must never be committed or used as the release source.
- Main repository remains the source of truth.

### 9.4 Current interruption point

The last run proved active Pro and authoritative cloud access. It was interrupted immediately before proving that the two local artworks upload, deduplicate, appear in private Supabase storage/metadata, and restore correctly.

## 10. Remaining work in priority order

1. ⛔ **Finish the active Pro cloud smoke test**
   - Confirm Automatic Backup state.
   - Trigger Sync Now.
   - Verify queue drains.
   - Verify two artwork records, previews/originals, checksums, and usage accounting in Supabase.
   - Verify a repeated sync does not duplicate files.
   - Verify cloud restore on a clean device/account-scoped local state.

2. ⛔ **Complete Pro feature smoke tests while the temporary grant is active**
   - Add/edit tags.
   - Favorite/unfavorite.
   - Search and filter.
   - Exercise bulk actions.
   - Save premium styling while Pro.
   - Generate PNG/JPG/share card, PDF, ZIP, and `.buki` exports.
   - Import a valid archive and reject duplicate/corrupt archives.

3. ⛔ **Verify expiry/retention behavior**
   - Revoke or let the promotional entitlement expire.
   - Confirm local content and applied styling remain.
   - Confirm new creation follows Free limits.
   - Confirm uploads and exports lock.
   - Confirm cloud data becomes read-only and restore remains available.
   - Confirm renewal immediately resumes uploads.

4. ⛔ **Run remaining account/authentication smoke tests**
   - Sign out.
   - Confirm local library is not exposed to another account.
   - Sign back into the same account and recover the library.
   - Verify Apple login end to end.
   - Verify or remove/hide Google login for iOS.

5. ⛔ **Run exact Free artwork boundary tests in the simulator**
   - 19 artworks.
   - 20 artworks.
   - Attempt 21st artwork.
   - Migrated library already above 20.

6. ⛔ **Resolve or explicitly accept runtime warnings**
   - FormSheet/ScrollView warning.
   - Confirm the Skia deprecated path API warnings are gone after the source migration in `f980e24`.
   - RevenueCat `ui_config` warning.
   - ✅ Intentional lint migration/fix strategy is committed and lint passes cleanly.

7. ⏳ **Freeze an exact release-candidate SHA**
   - Main must be clean.
   - Full tests, TypeScript, Expo Doctor, and relevant native build must pass.
   - Runtime-only diagnostics must be absent.

8. ⛔ **Run the 15 independent verification agents sequentially**
   - Each agent gets a clean isolated worktree at the exact RC SHA.
   - Agents test only and do not modify code.
   - Any failure blocks release and creates a new RC SHA after a small fix commit.

9. ⛔ **Create iOS production build 10**
   - Build from the final verified SHA.
   - Confirm version/build metadata.
   - Upload to TestFlight.

10. ⛔ **Complete real Apple sandbox purchase testing**
    - Monthly purchase.
    - Yearly trial eligibility/start.
    - Lifetime purchase.
    - Restore on same Buki account.
    - Restore/transfer warning on a different Buki account.
    - Cancellation, refund/revocation, grace, and expiry.

11. ⏳ **Create and approve App Store screenshots**
    - User font decision remains: Manrope is recommended; Figtree, Instrument Sans, and Plus Jakarta Sans are alternatives.
    - Generate final screenshot set from the release build.

12. ⏳ **Finalize App Store Connect submission**
    - Confirm privacy nutrition labels.
    - Confirm subscription metadata and review notes.
    - Confirm account-deletion URL and support URL.
    - Confirm screenshots, age rating, encryption declaration, and review account/instructions.

13. ⏳ **Tag the final tested release candidate**
    - Only after all independent agents pass and TestFlight purchase/restore succeeds.

## 11. Independent verification agents

All agents are currently **pending**. None of the current simulator smoke work counts as the final independent pass.

| # | Agent | Status | Required evidence |
|---:|---|---|---|
| 1 | Migration | ⏳ | Legacy migration, interruption, missing media, above-limit libraries |
| 2 | Authentication | ⏳ | Apple, Google/decision, OTP, persistence, sign-out, switching |
| 3 | Free limits | ⏳ | Children, sketchpads, artwork 0/19/20/above-limit behavior |
| 4 | RevenueCat purchase | ⏳ | Monthly, yearly trial, lifetime, localized prices, unlock |
| 5 | Subscription lifecycle | ⏳ | Restore, transfer, cancellation, refund, grace, expiry, offline |
| 6 | Profiles and Account Center | ⏳ | Profile, children, usage, preferences, parental gates, warnings |
| 7 | Premium visuals | ⏳ | Preview, save lock, all themes/borders, expiry preservation |
| 8 | Organization | ⏳ | Metadata, tags, search, favorites, filters, bulk actions |
| 9 | Export/import | ⏳ | Images, card, PDF, ZIP, `.buki`, duplicate/corrupt/expiry cases |
| 10 | Cloud synchronization | ⏳ | Queue, retry, devices, conflict, tombstone, deduplication |
| 11 | Quota and retention | ⏳ | Below/at/above 2 GB, read-only, renewal, 90-day cleanup |
| 12 | Security and privacy | ⏳ | RLS, signed uploads, secrets, minimization, deletion |
| 13 | iOS end to end | ⏳ | Development/TestFlight build, purchase, parent workflow, visuals |
| 14 | Android end to end | ➡️ | Deferred with Android release |
| 15 | Release | ⏳ | Version/build, links, config, analytics, store readiness |

For the iOS-only release, Android verification remains deferred and must not be presented as passed.

## 12. Actions that may require the user

1. Complete Apple 2FA or account confirmation if App Store Connect/TestFlight requests it.
2. Provide or confirm the Apple sandbox tester when the purchase run begins.
3. Approve the final App Store screenshot font and visual direction.
4. Approve final Privacy, Terms, Support, and App Store marketing copy.
5. If custom Gmail SMTP is required now, create/configure an app password directly in the secure provider UI; do not paste it into chat or Git.
6. Decide whether Google login is required for the initial iOS release or should be hidden until configured.
7. Perform any final Apple purchase confirmation that cannot be completed through the simulator/TestFlight automation.

## 13. Work that can continue without the user

1. Finish Pro cloud upload, deduplication, restore, and usage verification.
2. Complete Pro organization and export smoke tests.
3. Revoke/expire the promotional entitlement and test retention behavior.
4. Fix code defects found during testing in small commits and push them to `main`.
5. Clean runtime warnings where they are source defects.
6. Run all independent agents sequentially at a frozen SHA.
7. Produce App Store screenshots after the visual font decision.
8. Build and upload the final iOS binary until Apple requires an interactive account step.
9. Keep this tracker updated after every material action.

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
```

## 15. Final release acceptance checklist

Release is allowed only when all applicable items are checked:

- [ ] All iOS verification agents report PASS at the same final SHA.
- [ ] No critical or high-severity defects remain.
- [ ] Full Jest suite passes.
- [ ] TypeScript passes.
- [ ] Expo Doctor passes.
- [x] Intentional lint decision is documented.
- [ ] Production iOS build succeeds from the final SHA.
- [ ] TestFlight processing completes.
- [ ] Monthly sandbox purchase succeeds.
- [ ] Yearly trial sandbox flow succeeds.
- [ ] Lifetime sandbox purchase succeeds.
- [ ] Restore and transfer behavior succeeds.
- [ ] Cloud upload, deduplication, quota, restore, and retention pass.
- [ ] RLS proves one account cannot access another account's data.
- [ ] Account deletion and App Store subscription warning pass.
- [ ] Legal/support pages and App Store links are final.
- [ ] App Store screenshots and metadata are approved.
- [ ] GitHub contains all small commits and both backup points.
- [ ] Runtime diagnostic worktree is discarded or archived outside release inputs.
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

### Update procedure for every future session

1. Change the `Last updated` timestamp.
2. Update the relevant status table and exact evidence.
3. Add a dated entry to this log.
4. Record any temporary account, entitlement, build, worktree, or test state that must be cleaned up.
5. Record the exact commit SHA used for verification.
6. Never mark a feature complete solely because its source code exists; distinguish implementation from live and independent verification.
