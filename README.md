# Outfit Combination

[![Test, publish and release](https://github.com/huseyinorer/outfit-combination/actions/workflows/pipeline.yml/badge.svg)](https://github.com/huseyinorer/outfit-combination/actions/workflows/pipeline.yml)

An Android-first wardrobe and outfit recommendation app with Turkish and English UI. Clothing records are stored in account-separated SQLite wardrobes and photos are kept in the app's persistent document storage. The backend handles Google or passwordless email sessions, account-and-installation AI usage rights, one-time clothing photo analysis, AI outfit suggestions, and mobile version information.

## Project structure

- `mobile/`: React Native, Expo SDK 58, and TypeScript
- `api/`: ASP.NET Core 8 Web API
- `api/OutfitCombination.Api.Tests/`: lightweight backend test runner with no additional test packages
- `.github/workflows/pipeline.yml`: GitHub Actions checks, Expo OTA publishing, and APK releases
- `render.yaml`: Render Blueprint for the API

See [DEPLOYMENT.md](./DEPLOYMENT.md) for the GitHub, EAS, and Render setup.

## Main features

- Photo-focused wardrobe with Top, Bottom, and Shoes filters
- Camera and gallery import with category-specific capture guidance
- Persistent photos independent of temporary camera/gallery paths
- SQLite draft recovery when analysis is unavailable
- Retry and manual-entry paths when the AI service cannot be reached
- Editable AI attributes before saving
- Duplicate-save protection and unique clothing IDs
- AI or local-rule outfit generation from three preferences
- Strict validation of returned IDs, categories, and duplicate combinations
- Up to three different valid outfits when the wardrobe permits
- Swipeable result cards using the actual photos associated with each returned ID
- Persistent favorite outfits, date-ordered suggestion history, full-screen photo viewing, and alternate quick suggestions
- Persistent bulk-add queue for up to 20 gallery images in the same category
- Generated 420 px thumbnails and a virtualized wardrobe grid for larger closets
- Eight-second undo for clothing deletion with crash-safe cleanup
- First-run onboarding and local learning from repeated AI field corrections
- Turkish and English UI with system-language default and explicit profile override
- System-aware light/dark theme with an explicit profile override
- Auth-first entry with Google, passwordless email code, or an explicit local guest path
- Separate on-device wardrobes when accounts are switched; switching accounts never deletes another wardrobe
- Exact duplicate-photo detection before saving
- Outfit search and richer wardrobe filters for recent, summer, and winter items
- Per-outfit like/dislike feedback, pinned-piece replacement, suggestion history, and wear history
- Responsive phone, tablet, BlueStacks, portrait, and landscape layouts
- Per-action manual entry and local outfit suggestions that work without an API key or running backend
- Explicit consent before any clothing photo or wardrobe metadata is sent to AI
- Two-step deletion of all local clothing, photos, favorites, drafts, histories, and settings
- Optional Google and passwordless email account sessions with in-app account deletion
- Server-signed, time-limited installation and account access tokens
- Account and installation access tokens encrypted at rest with Android Keystore in native APK builds
- Persistent daily and monthly AI cost quotas enforced against both the account and installation, backed by Neon PostgreSQL
- In-app privacy/KVKK text, a public GitHub Pages policy, and a Play Data Safety draft
- Startup version check for new APK releases
- Expo OTA updates for compatible JavaScript and asset changes

Reliable background removal is not part of this first release. When a trustworthy transparent cutout is unavailable, the result uses a clean three-item outfit board instead of stacking rectangular photos over a figure.

## Use without AI

No OpenAI key or running backend is required for the local path:

1. Add your own photo from the camera or gallery.
2. Select **Bilgileri kendim gireceğim · Ücretsiz** and enter the clothing attributes.
3. Save the item to the local SQLite wardrobe.
4. Select **Hızlı Kombin · Ücretsiz** to generate outfits with the on-device rule engine.

No sample clothing is automatically added to the personal wardrobe.

## Run the mobile app

Requirements:

- Node.js 24 or another Expo-supported Node.js LTS release
- Android phone or BlueStacks
- Expo account only when using EAS Build or EAS Update

Run in PowerShell:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm install
npx expo install --fix
npm run typecheck
npm test
npx expo start --clear
```

## Run the backend locally

The backend uses one AI provider: the OpenAI Responses API. Images are sent only during the initial analysis request. Outfit requests contain IDs, categories, and text attributes only.

Set secrets only in the backend environment:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\api
$env:OPENAI_API_KEY="your-key"
$env:OpenAI__Model="gpt-5.4-mini"
$env:AppSecurity__TokenSigningKey="a-random-secret-with-at-least-32-bytes"
$env:UsageQuota__ConnectionString="Host=...;Database=neondb;Username=...;Password=...;SSL Mode=Require"
# Optional account authentication (set all three together):
$env:AccountAuth__GoogleClientId="your-web-client-id.apps.googleusercontent.com"
$env:AccountAuth__GoogleClientSecret="your-google-client-secret"
$env:AccountAuth__CallbackUrl="https://your-api.example.com/api/account/google/callback"
# Optional passwordless email authentication (Resend-compatible endpoint):
$env:EmailAuth__ApiKey="your-email-provider-key"
$env:EmailAuth__FromAddress="login@your-verified-domain.example"
$env:EmailAuth__FromName="Outfit Combination"
dotnet restore
dotnet build
dotnet run --urls http://0.0.0.0:5080
```

Do not place the OpenAI key, signing key, Google client secret, email provider key, or Neon connection string in source files, `appsettings.json`, Expo variables, the mobile app, or Git. The Google web client ID is public, but this implementation keeps all Google OAuth configuration on the backend. Local Development can use an in-memory quota fallback. Production fails closed and does not send an AI request when the persistent quota database is missing or unavailable.

Google access is disabled when the three `AccountAuth` values are empty. Passwordless email access is disabled unless both `EmailAuth__ApiKey` and a valid `EmailAuth__FromAddress` are configured. A Production backend requires at least one of these providers and fails to start instead of silently allowing account-free AI access. Development can still run without either provider. Google opens the browser and returns a short-lived one-time code through `outfitcombination://auth`; email sends a six-digit, short-lived code. Both methods resolve to a stable internal account UUID. The same Neon database is used; profile, identity-link, temporary login-code, and usage tables are created automatically. No second Neon database or manual migration is required.

AI quotas are checked against both the signed-in account UUID and the random installation UUID. The stricter remaining allowance wins, so changing email accounts on one installation cannot reset the device allowance. Wardrobe records and photos still remain only on the phone. The first signed-in account may claim an existing guest wardrobe once; later account switching selects that account's own local wardrobe without deleting any other wardrobe.

Health and version endpoints:

```text
http://localhost:5080/health
http://localhost:5080/api/version
http://localhost:5080/api/account/config
```

## Connect Android or BlueStacks to a local API

For BlueStacks, the host computer is commonly reachable from the emulator through:

```text
http://10.0.2.2:5080
```

For a physical phone on the same Wi-Fi network, find the computer's current IPv4 address:

```powershell
ipconfig
```

Then use an address such as:

```text
http://192.168.1.110:5080
```

Development builds expose an **Internal developer tools** section in Settings where the API address can be changed and stored locally. Preview and production builds hide backend controls from end users and use the HTTPS Render URL supplied through `EXPO_PUBLIC_API_URL` at build time.

When the backend is unavailable:

- The wardrobe remains available.
- Existing items can still be edited or deleted.
- Photos can be added through manual entry.
- Local outfit generation still works.
- Only AI photo analysis and AI-written outfit explanations are unavailable.

## Build an installable Android APK

The `preview` profile in `mobile/eas.json` produces a directly installable APK:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm install
npx expo install --fix
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

On the first build, allow EAS to create an Android keystore. Once credentials exist, GitHub Actions can perform non-interactive builds.

To install in BlueStacks, drag the downloaded APK onto the BlueStacks window or use its **Install APK** button.

## Automated release behavior

- Pull requests run mobile and backend checks without publishing.
- Merges to `main` trigger Render after CI checks pass.
- When `DEPLOY_ENABLED=true`, merges to `main` also publish an Expo OTA update.
- If `mobile/app-version.json` has a version with no healthy GitHub Release asset, EAS builds an APK and publishes it as `outfit-combination.apk`. A manual workflow run can set `rebuild_apk=true` to replace a missing or broken asset for the current version.
- The app checks `/api/version` on startup and whenever it returns to the foreground. A normal update can be dismissed; only versions below `minimumVersion` are blocked.
- Internal APK builds from v1.3.0 onward download updates inside the app, show progress, and hand the completed APK to Android's installer. Android still requires explicit user approval. Store builds exclude the restricted package-install permission and must use the store update flow.

The Render Blueprint uses the Free compute plan. The service can spin down after an idle period, so clothing analysis and outfit requests allow up to 90 seconds for a cold start. A failed analysis keeps its local draft and can be retried safely.

The public app page and legal documents are published from `privacy-site/` by `.github/workflows/privacy-pages.yml`. Enable **Settings > Pages > Build and deployment > GitHub Actions** once. The English homepage is `https://huseyinorer.github.io/outfit-combination/`; Turkish pages are under `/tr/`. Review the developer name and support contact before a Play Store submission. `docs/PLAY_DATA_SAFETY_TR.md` contains the current Play Console declaration draft.

Compatible TypeScript, styling, text, and asset changes can use OTA updates. Native dependencies, Expo plugins, Android permissions, manifests, and SDK changes require a new APK version.

## Versioning

Keep these two values identical:

```text
mobile/package.json
mobile/app-version.json
```

The current native app version is `1.4.0`. Increment both files together for the next native release.

## Tests

Mobile:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\mobile
npm run typecheck
npm test
```

Backend:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\api
dotnet build .\OutfitCombination.Api.Tests\OutfitCombination.Api.Tests.csproj -c Release
dotnet run --project .\OutfitCombination.Api.Tests\OutfitCombination.Api.Tests.csproj -c Release --no-build
```

Verified test scenarios include:

- Missing clothing category
- Only one possible outfit
- At least three distinct outfits
- Invalid or wrong-category AI IDs
- Valid, tampered, and expired installation access tokens
- User-session token validation and separation from installation tokens
- Passwordless email normalization/configuration and account identity linking
- Dual account-and-installation quota enforcement and refunds
- Mismatched image signatures and oversized outfit metadata
- Duplicate AI combinations
- Manual records after an API outage
- Exact photo-to-ID matching
- Semantic version comparison and mandatory update decisions

Current local verification:

- Mobile TypeScript check passed
- Mobile tests: 17/17 passed
- Mobile/app version consistency passed for 1.4.0
- Android Metro export passed (Hermes bytecode was skipped only because this managed Windows shell blocks child executable launch); Expo Autolinking resolved both the update-installer and Keystore-backed secure-session modules
- Expo Doctor could not be fetched in the network-restricted local environment and remains part of GitHub CI
- This Windows environment has no Java/Android SDK, so the local Kotlin/Gradle build remains for EAS to verify
- The API source compiled locally against a temporary Npgsql surface and all 20 backend scenarios passed; the managed local environment could not reach NuGet, so GitHub CI must still verify the real Npgsql restore/build

SQLite persistence, camera orientation, and final photo placement still require validation inside BlueStacks or on a physical Android device.

## Acceptance scenario

1. Add 3 tops, 2 bottoms, and 2 pairs of shoes.
2. Fully close and reopen the app.
3. Confirm all seven items remain in the wardrobe.
4. Select Friend meetup, Smart casual, and Dark.
5. Confirm that three different outfit cards are shown.
6. Confirm each card's three photos exactly match its top, bottom, and shoe IDs.
