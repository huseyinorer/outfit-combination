# Outfit Combination

An Android-first wardrobe and outfit recommendation app. The mobile UI is in Turkish. Clothing records are stored in SQLite and photos are kept in the app's persistent document storage. The backend handles optional Google account sessions, per-user AI usage rights, one-time clothing photo analysis, AI outfit suggestions, and mobile version information.

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
- Persistent favorite outfits, full-screen photo viewing, and alternate local suggestions
- Persistent bulk-add queue for up to 20 gallery images in the same category
- Generated 420 px thumbnails and a virtualized wardrobe grid for larger closets
- Eight-second undo for clothing deletion with crash-safe cleanup
- First-run onboarding and local learning from repeated AI field corrections
- Responsive phone, tablet, BlueStacks, portrait, and landscape layouts
- Per-action manual entry and local outfit suggestions that work without an API key or running backend
- Explicit consent before any clothing photo or wardrobe metadata is sent to AI
- Two-step deletion of all local clothing, photos, favorites, drafts, and settings
- Optional Google account sessions with in-app account deletion and per-user AI usage rights
- Server-signed, time-limited installation and account access tokens
- Persistent daily and monthly AI cost quotas backed by Neon PostgreSQL
- In-app privacy/KVKK text, a public GitHub Pages policy, and a Play Data Safety draft
- Startup version check for new APK releases
- Expo OTA updates for compatible JavaScript and asset changes

Reliable background removal is not part of this first release. When a trustworthy transparent cutout is unavailable, the result uses a clean three-item outfit board instead of stacking rectangular photos over a figure.

## Use without AI

No OpenAI key or running backend is required for the local path:

1. Add your own photo from the camera or gallery.
2. Select **Elle doldur · Ücretsiz** and enter the clothing attributes.
3. Save the item to the local SQLite wardrobe.
4. Select **Yerel öner · Ücretsiz** to generate outfits with the on-device rule engine.

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
dotnet restore
dotnet build
dotnet run --urls http://0.0.0.0:5080
```

Do not place the OpenAI key, signing key, Google client secret, or Neon connection string in source files, `appsettings.json`, Expo variables, the mobile app, or Git. The Google web client ID is public, but this implementation keeps all Google OAuth configuration on the backend. Local Development can use an in-memory quota fallback. Production fails closed and does not send an AI request when the persistent quota database is missing or unavailable.

Google account access is disabled when the three `AccountAuth` values are empty. When enabled, the app opens Google's browser sign-in, the callback returns to the `outfitcombination://auth` app link with a short-lived one-time code, and AI quotas are keyed to the verified account. The same Neon database is used; `app_users`, temporary OAuth tables, and usage tables are created automatically. The wardrobe and photos still remain only on the phone.

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
- If `mobile/app-version.json` has a version with no matching GitHub Release, EAS builds an APK and publishes it as `outfit-combination.apk`.
- The app checks `/api/version` on startup and whenever it returns to the foreground. A normal update can be dismissed; only versions below `minimumVersion` are blocked.
- Internal APK builds from v1.3.0 onward download updates inside the app, show progress, and hand the completed APK to Android's installer. Android still requires explicit user approval. Store builds exclude the restricted package-install permission and must use the store update flow.

The Render Blueprint uses the Free compute plan. The service can spin down after an idle period, so clothing analysis and outfit requests allow up to 90 seconds for a cold start. A failed analysis keeps its local draft and can be retried safely.

The public app page and legal documents are published from `privacy-site/` by `.github/workflows/privacy-pages.yml`. Enable **Settings > Pages > Build and deployment > GitHub Actions** once. The homepage is `https://huseyinorer.github.io/outfit-combination/`, the privacy policy is `/privacy.html`, and the terms are `/terms.html`. Review the developer name and support contact before a Play Store submission. `docs/PLAY_DATA_SAFETY_TR.md` contains the current Play Console declaration draft.

Compatible TypeScript, styling, text, and asset changes can use OTA updates. Native dependencies, Expo plugins, Android permissions, manifests, and SDK changes require a new APK version.

## Versioning

Keep these two values identical:

```text
mobile/package.json
mobile/app-version.json
```

The current native app version is `1.3.0`. Increment both files together for the next native release.

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
- Mismatched image signatures and oversized outfit metadata
- Duplicate AI combinations
- Manual records after an API outage
- Exact photo-to-ID matching
- Semantic version comparison and mandatory update decisions

Current local verification:

- Mobile TypeScript check passed
- Mobile tests: 16/16 passed
- Mobile/app version consistency passed for 1.3.0
- Android Metro export passed with the local update-installer module included; Expo Autolinking resolved the Android module successfully
- This Windows environment has no Java/Android SDK, so the local Kotlin/Gradle build remains for EAS to verify
- The managed local environment could not download Npgsql from NuGet, so the GitHub backend check must verify the normal restore/build and 17 backend scenarios

SQLite persistence, camera orientation, and final photo placement still require validation inside BlueStacks or on a physical Android device.

## Acceptance scenario

1. Add 3 tops, 2 bottoms, and 2 pairs of shoes.
2. Fully close and reopen the app.
3. Confirm all seven items remain in the wardrobe.
4. Select Friend meetup, Smart casual, and Dark.
5. Confirm that three different outfit cards are shown.
6. Confirm each card's three photos exactly match its top, bottom, and shoe IDs.
