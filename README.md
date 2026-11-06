# Outfit Combination

An Android-first, single-user wardrobe and outfit recommendation app. The mobile UI is in Turkish. Clothing records are stored in SQLite and photos are kept in the app's persistent document storage. The backend is used only for one-time clothing photo analysis, AI outfit suggestions, and mobile version information.

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
- Explicit Demo mode that works without an API key or running backend
- Startup version check for new APK releases
- Expo OTA updates for compatible JavaScript and asset changes

Reliable background removal is not part of this first release. When a trustworthy transparent cutout is unavailable, the result uses a clean three-item outfit board instead of stacking rectangular photos over a figure.

## Demo mode

The app starts in Demo mode. No OpenAI key or backend is required:

1. Add your own photo from the camera or gallery.
2. Enter the clothing attributes manually.
3. Save the item to the local SQLite wardrobe.
4. Generate outfits with the local rule engine.

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

The current managed environment could not download the newly added `expo-updates` package because npm was restricted to its local cache. Running `npm install` in a normal internet-connected PowerShell session updates both the package and `package-lock.json`.

## Run the backend locally

The backend uses one AI provider: the OpenAI Responses API. Images are sent only during the initial analysis request. Outfit requests contain IDs, categories, and text attributes only.

Set secrets only in the backend environment:

```powershell
cd C:\Users\krofosyonel\Desktop\OutfitCombination\api
$env:OPENAI_API_KEY="your-key"
$env:OpenAI__Model="gpt-5.4-mini"
dotnet restore
dotnet build
dotnet run --urls http://0.0.0.0:5080
```

Do not place the API key in source files, `appsettings.json`, Expo variables, the mobile app, or Git.

Health and version endpoints:

```text
http://localhost:5080/health
http://localhost:5080/api/version
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

The API address can be changed from the app's Settings screen and is stored locally. Production builds should use the HTTPS Render URL through `EXPO_PUBLIC_API_URL`.

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
- The app checks `/api/version` on startup and opens the latest APK download when a mandatory native update exists.

Compatible TypeScript, styling, text, and asset changes can use OTA updates. Native dependencies, Expo plugins, Android permissions, manifests, and SDK changes require a new APK version.

## Versioning

Keep these two values identical:

```text
mobile/package.json
mobile/app-version.json
```

For a native release, update both from `1.0.0` to a new semantic version such as `1.0.1`, then merge to `main`.

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
- Duplicate AI combinations
- Manual records after an API outage
- Exact photo-to-ID matching
- Semantic version comparison and mandatory update decisions

Current local verification:

- Mobile TypeScript check passed
- Mobile tests: 9/9 passed
- Backend Release build: 0 errors and 0 warnings
- Backend tests: 5/5 passed

SQLite persistence, camera orientation, and final photo placement still require validation inside BlueStacks or on a physical Android device.

## Acceptance scenario

1. Add 3 tops, 2 bottoms, and 2 pairs of shoes.
2. Fully close and reopen the app.
3. Confirm all seven items remain in the wardrobe.
4. Select Friend meetup, Smart casual, and Dark.
5. Confirm that three different outfit cards are shown.
6. Confirm each card's three photos exactly match its top, bottom, and shoe IDs.
