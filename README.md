# NearMe

A working French-language, map-first social POC for iOS and Android. Create a profile, accept the community charter, find people within 50-5000 meters, and start a persisted real-time conversation. A web preview runs the same screens with Leaflet in place of native maps.

## Stack

- pnpm TypeScript monorepo: `apps/mobile`, `apps/api`, `packages/shared`.
- Expo SDK 57, React Native 0.86.3, React 19.2.3, Expo Router, native maps, location, notifications, SecureStore, Zustand and TanStack Query.
- NestJS 12, Socket.IO, `pg`, PostgreSQL 17 / PostGIS 3.5.
- Zod shared validation; Node test runner and Playwright.

Versions were checked against npm and aligned with `expo install --fix`. Use the committed lockfile for reproducible installations. TypeScript 6 is selected for compatibility with typescript-eslint; the newer TypeScript 7 was outside its supported peer range.

No Bluetooth. No Firebase database, authentication, analytics, or application SDK. Android remote notifications use the platform's FCM transport through Expo; configuring Google FCM credentials is necessary for Android push, even though the application backend is entirely Nest/PostgreSQL.

## Quick start (Windows / PowerShell)

Prerequisites: current Node LTS (22.12+ or 24 recommended), pnpm 10.28+, Docker Desktop with Linux containers. This workspace was validated using Node 25.9.0. Android native builds also require Android Studio, Android SDK and JDK 17. Local iOS builds require macOS/Xcode; EAS cloud builds can be initiated from Windows.

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/mobile/.env.example apps/mobile/.env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Existing local `.env` files are already configured for this POC. Do not overwrite them when you have added credentials. `pnpm dev` starts API and Expo together. Alternatively:

```powershell
pnpm --filter @nearme/api dev
# Separate terminal:
pnpm --filter @nearme/mobile dev
# Browser preview instead:
pnpm --filter @nearme/mobile web
```

API: http://localhost:3000/health. Expo/browser: http://localhost:8081. Docker publishes Postgres on localhost:55432, avoiding collisions with an existing database. API listens on all interfaces for phones on the same Wi-Fi. Use `docker compose stop` to stop the database without removing data.

For a detached Windows preview after database setup, run `./scripts/start-local.ps1`. It selects free ports, starts hidden API/Expo processes, and writes logs and process IDs under `artifacts/`. Run `./scripts/stop-local.ps1` to stop those recorded processes. The detached preview disables Metro live watching; use `pnpm dev` while editing. Stop the preview before running `pnpm dev` on the same ports.

Migration runner executes sorted SQL files transactionally with an advisory lock and `schema_migrations` ledger. Reruns are safe. Seed reruns update the same five profiles.

## Accounts

On a new install, choose **Se connecter** or **Créer un compte**. Accounts use a unique username and a password of at least eight characters; no email address is collected. Passwords are stored as salted scrypt hashes, and bearer sessions are kept in SecureStore on iOS/Android (local browser storage on web). A login replaces the account's previous active session. Existing profiles from before password login can set a password in **Mon profil** while their old session is still active. The profile settings also provide logout and permanent account deletion; deletion removes the profile's locations, push tokens, conversations/messages, and related reports.

## Environment

| Variable                     | Location                 | Purpose                                                                         |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------- |
| `DATABASE_URL`               | API `.env`               | PostgreSQL connection string                                                    |
| `PORT`                       | API `.env`               | API port, default 3000                                                          |
| `DEMO_MODE`                  | API `.env`               | Explicitly enable demo seed and replies; forced off under `NODE_ENV=production` |
| `CORS_ORIGINS`               | API `.env`               | Comma-separated browser origins; native clients do not require CORS             |
| `EXPO_ACCESS_TOKEN`          | API `.env`               | Optional enhanced Expo push security token                                      |
| `EXPO_PUBLIC_API_URL`        | Mobile `.env`            | API URL reachable from this device                                              |
| `EXPO_PUBLIC_DEMO_MODE`      | Mobile `.env`            | Show Bordeaux fallback and request isolated seed profiles                       |
| `EXPO_PUBLIC_CARTO_API_KEY`  | Mobile `.env`            | Public CARTO raster tile key used by the web map                                |
| `EXPO_PUBLIC_EAS_PROJECT_ID` | Mobile `.env`            | Your actual EAS project UUID, required for Expo push token                      |
| `GOOGLE_MAPS_API_KEY`        | Mobile/build environment | Android Maps SDK key restricted by package/signing certificate                  |
| `GOOGLE_SERVICES_JSON`       | Mobile/build environment | Path to Android FCM configuration file                                          |

The only built-in password is for the loopback-only development database. No production secret is embedded. A production build requires a reachable HTTPS API and proper infrastructure, credentials and operational hardening.

## Android

1. Set `EXPO_PUBLIC_API_URL=http://YOUR_PC_LAN_IP:3000` for a phone, or `http://10.0.2.2:3000` for the standard Android emulator. Find the computer IPv4 with `ipconfig`.
2. Enable Maps SDK for Android in Google Cloud. Set `GOOGLE_MAPS_API_KEY`, restrict it to `com.nearme.poc` and your signing SHA-1. Without this key the Android native map may be blank; the browser preview remains usable.
3. Connect a phone with USB debugging, or start an Android Studio emulator.
4. Run `pnpm --filter @nearme/mobile android`. Expo generates native sources and builds the development client.
5. Run `pnpm --filter @nearme/mobile dev` and open the development build. Allow local-network access and Windows firewall access for the API/Metro on your private network if prompted.

For cloud builds, from `apps/mobile`:

```powershell
pnpm dlx eas-cli login
pnpm dlx eas-cli init
pnpm dlx eas-cli build --profile development --platform android
```

Use your own unique package identifiers before distributing. EAS `development` and `preview` permit local HTTP; `production` disables Android cleartext and iOS arbitrary loads.

## iOS

On macOS, install Xcode and its command-line tools, then run `pnpm --filter @nearme/mobile ios`. Apple Maps is used by default, without a Google key. Use an iPhone on the same Wi-Fi and the computer LAN API URL. In the simulator, set a simulated location or explicitly choose **Explorer Bordeaux** in demo mode.

From Windows, configure your EAS project and Apple signing credentials, then run from `apps/mobile`:

```powershell
pnpm dlx eas-cli build --profile development --platform ios
```

EAS may require device registration and an Apple Developer membership. Native directories are generated by Expo and ignored in git; `app.config.ts`, `eas.json`, config plugins and the lockfile are the source of truth.

## One-phone demo

Both demo flags must be true. Create a profile, accept the charter, and allow location. The API creates five profiles around your coordinates, belonging exclusively to your account:

| Person  | Approximate distance |
| ------- | -------------------- |
| Lina    | 80 m                 |
| Sarah   | 250 m                |
| Yassine | 700 m                |
| Lucas   | 1.4 km               |
| Emma    | 3 km                 |

If GPS is denied or unavailable, choose **Explorer Bordeaux**, or the same action in **Mon profil**. Fallback is explicit and marked on the map. It is never silently selected. Radius 200 m shows Lina; 1 km shows Lina, Sarah and Yassine. Tap an avatar, choose **Discuter**, send a message. Demo replies run through the same database and WebSocket message delivery path, with typing feedback. Profiles are visibly labeled as demonstrations.

Seed profiles have no bearer token and cannot authenticate. Each real account has its own demo cohort so testing on two phones does not move somebody else's demo profiles. Positions refresh while active and expire after 12 minutes. `pnpm db:seed` creates an invisible Bordeaux anchor; the app's `/demo/seed` creates its own cohort after location is available.

## Two-phone test

1. Install the development build on both phones. Configure the same LAN API URL. Use distinct usernames; identities persist independently in SecureStore.
2. Accept the charter and grant location on both. Enable visibility and select a sufficient radius.
3. Select the other real profile and start a chat. Watch live delivery and typing on the other phone.
4. Close the conversation on phone B. Send another message from A: B still receives the user-room event, its chat list updates, and the push path runs because that conversation is inactive.
5. Background B: its socket disconnects and location polling stops. Send again and verify a remote notification on B. Tap it to open the conversation.
6. Disable visibility: the profile disappears from discovery. Block: both users lose discovery and message access. Report: a report is saved in PostgreSQL.

Messages can be exchanged when users move outside the discovery radius; discovery distance only controls finding people, not existing relationships.

## Push notifications

Real Expo push integration lives in `apps/api/src/push.ts`, behind `PushNotificationService`. The app creates an Android notification channel, asks permission, obtains an Expo token using your EAS project ID and registers it with the authenticated API. Permission/configuration status can be checked from **Mon profil**.

- Use a physical device and a development build for validation. Expo Go is deliberately not treated as proof of remote push support. Android Expo Go has not supported remote push since SDK 53.
- Run `eas init`, set your real `EXPO_PUBLIC_EAS_PROJECT_ID`, and configure APNs credentials for iOS via EAS.
- For Android, configure FCM v1 credentials in EAS and provide the associated `google-services.json` through `GOOGLE_SERVICES_JSON`. This is Google platform push transport, not a Firebase app backend.
- Put the public API URL and all needed map/push build variables in the selected EAS environment. Rebuild after native configuration changes; restarting Metro alone does not update native credentials.
- Backend needs outbound HTTPS access to Expo Push Service. Enhanced push security, if enabled, requires `EXPO_ACCESS_TOKEN` server-side.
- Delivery is suppressed if any connected device for the recipient is actively viewing that conversation. Inactive or disconnected recipients get push. Foreground banners are suppressed for the currently open chat.
- Both cold-start and running-app notification taps route to `/chat/:conversationId`; membership is still validated by the API.
- Invalid/unregistered tokens are removed based on Expo tickets and receipts. Receipt lookup is scheduled 15 minutes later. Network errors are logged without rolling back saved messages.

POC limitation: push jobs/receipt timers are in-process, not a durable queue, so an API restart can lose a notification attempt. Add a transactional outbox and worker before production. Actual APNs/FCM device delivery is not validated by bundle compilation or browser tests.

Official references: [Expo notification support](https://docs.expo.dev/versions/latest/sdk/notifications/), [push setup](https://docs.expo.dev/push-notifications/push-notifications-setup/), [Expo SDK 57](https://expo.dev/sdk/57).

## Architecture and protocol

`DataService` owns user, geospatial and conversation rules. REST controllers authenticate opaque bearer tokens; SHA-256 token hashes are stored in PostgreSQL. Raw tokens are returned only at registration. Native storage is SecureStore; browser preview uses local storage through AsyncStorage and is development-only. This POC intentionally has no account recovery or cross-device sign-in.

Discovery uses the caller's stored position, not arbitrary query coordinates. `ST_DWithin` operates on indexed `geography(Point,4326)`; `ST_Distance` sorts results. Server enforces 50-5000 m, blocks both directions, visibility and 12-minute expiry. Third-party marker coordinates are rounded to 3 decimals. Distances are approximate in the UI; positions never appear as text. Quantization alone is not production anti-triangulation protection.

The app obtains balanced-accuracy GPS immediately, then every 45 seconds while foregrounded. It does not request background location. Radius visuals update immediately; network subscriptions debounce by 250 ms. Camera changes follow user movement or explicit recenter, not each radius step.

Socket authentication uses the same bearer token, with charter acceptance required. Rooms are `user:<id>` for authenticated private delivery and `chat:<id>` for authorized typing/presence. Each socket can actively view one chat. Blocked rooms are revoked on refresh; every new message rechecks authorization.

| Direction        | Event                     | Payload/result                                |
| ---------------- | ------------------------- | --------------------------------------------- |
| Client to server | `nearby:subscribe`        | `{ radius }`; ack and `nearby:users` snapshot |
| Client to server | `location:update`         | `{ latitude, longitude }`; throttled          |
| Client to server | `chat:join`, `chat:leave` | `{ conversationId }`                          |
| Client to server | `typing:update`           | `{ conversationId, typing }`                  |
| Client to server | `message:send`            | `{ conversationId, clientId, body }`          |
| Server to client | `message:new`             | Persisted message                             |
| Server to client | `presence:update`         | `{ conversationId, online }`                  |
| Server to client | `chat:unavailable`        | Revokes unavailable conversation              |

Every client event returns `{ ok: true, data }` or `{ ok: false, error }`. Socket.IO acknowledgment is the delivery acknowledgment; no extra redundant `message:ack` event. Message `clientId` ensures retries do not create duplicates. Conversation pair keys and unique constraints deduplicate concurrent requests. History uses stable `(created_at,id)` cursors, 50 per page.

Nearby refreshes are coalesced over 300 ms and periodically expire stale entries every 15 seconds. Results are sent only to subscribers after their server-side query; raw GPS is never globally broadcast. This single-process POC recomputes active subscriber queries on changes. At scale use spatial subscription buckets, Redis adapter and bounded workers.

REST endpoints are discoverable in `apps/api/src/main.ts`. Reports are persisted for later moderation; no moderation dashboard or emergency-response promise is included.

## Validation

Start DB/API before integration tests; start Expo web before browser tests.

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm test:integration
pnpm exec playwright install chromium
pnpm exec playwright test
pnpm --filter @nearme/mobile exec expo install --check
pnpm --filter @nearme/mobile export
pnpm --filter @nearme/mobile exec expo prebuild --no-install --platform android
```

Integration tests use real PostGIS and running Nest/Socket.IO: charter/auth gates, radius results at 50/200/1000/5000 m, sorting, coordinate quantization, stale/invisible profiles, seed isolation, concurrent conversation deduplication, message membership, socket authentication, enter/leave snapshots, typing, persistent/idempotent messages, demo replies, reports and blocks. Test-created integration data is removed afterward. Playwright accounts are retained to allow inspecting the demo.

UI checks exercise profile creation, disabled consent button, permission-driven location, radius changes, loaded map tiles/avatars, marker-to-profile navigation, actual chat reply, reload persistence and invisibility. Screenshots/traces go in `artifacts/` (gitignored).

See `VALIDATION.md` for observed results and remaining device-only checks. No iOS/Xcode build success or physical push delivery is implied by JavaScript export.

## POC boundaries

- Single API process; no HA, durable push queue, account recovery or comprehensive abuse moderation.
- Light theme intentionally polished first; no partial dark-mode styling.
- Avatars use public placeholder portraits from Pravatar. No uploaded personal photos are required. Native maps use platform providers; web map tiles use CARTO/OpenStreetMap with attribution. These external assets require internet; no user coordinates are placed in avatar URLs.
- Approximate location is still sensitive. Production needs stronger privacy controls, retention/deletion policy, consent review, abuse limits and moderation before public release.
- A development endpoint can place its own demo profiles but is unavailable in production. Disable both demo flags for real-use deployments.
# Configure Expo Go on your local network

To test the app on a phone with Expo Go, connect both the phone and the computer hosting the API to the same Wi-Fi network. Expo Go cannot reach an API at `localhost` or `127.0.0.1`; those addresses refer to the phone itself. Find your computer's local IPv4 address (for example, run `ipconfig` on Windows), then set it in `apps/mobile/.env`:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.42:3000
```

Replace `192.168.1.42` with the address shown on your computer, and `3000` with the port actually exposed by the API. Allow incoming connections on that port in your firewall if needed. After changing `.env`, restart Expo and clear its cache:

```bash
pnpm --filter @nearme/mobile start -- --clear
```

Then scan the QR code with Expo Go. If your computer's IP address changes, update `EXPO_PUBLIC_API_URL` and restart Expo.
