# Spray Wall Route Setter

A mobile-first, offline-capable tool for photographing a climbing wall, detecting the holds
in that photo, and composing boulder problems by tapping holds. Personal, single-user, local
storage only — no accounts, no backend, no sharing (see [Non-goals](#non-goals-v1)).

Status: **M1 — skeleton**. Routing, storage schema and the Capacitor/Android scaffold are in
place; capture, detection and the route editor are placeholders being built out milestone by
milestone (see [Build order](#build-order)).

## Stack

- React + TypeScript + Vite, built as an installable PWA (offline after first load)
- Tailwind CSS v4
- Dexie.js over IndexedDB for storage (`walls`, `routes`, `blobs` tables)
- OpenCV.js in a Web Worker for hold detection (M4)
- Wrapped with [Capacitor](https://capacitorjs.com) for an installable Android `.apk`

All camera/file and wake-lock access goes through a thin `src/platform/` adapter module, so
swapping the web implementation for a native Capacitor plugin never touches call sites.

## Setup

```bash
npm install
npm run dev       # Vite dev server, http://localhost:5173
npm run build      # type-check + production build to dist/
npm run test        # unit tests (vitest)
npm run lint          # oxlint
```

## Installing as a PWA on Android

1. Serve the production build over HTTPS (or run `npm run dev` and visit it from the phone on
   the same network) and open it in Chrome on Android.
2. Chrome will offer "Add to Home screen" (or use the ⋮ menu → "Add to Home screen").
3. The installed icon launches full-screen, works offline after the first load, and behaves
   like a native app shell.

## Building the Android APK

The app is wrapped with Capacitor (`android/` is a real Android Gradle project, added via
`npx cap add android`). To produce an APK locally, you need Android Studio / the Android SDK
and build tools installed, then:

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug   # or assembleRelease, with signing configured
```

**CI build:** `.github/workflows/android-build.yml` builds a debug APK on every push and
uploads it as a downloadable workflow artifact, so you can get an installable `.apk` without
a local Android SDK setup. (This is also how the APK is produced in this development
environment — the sandbox used to write this code has its outbound network restricted to a
policy allowlist that excludes Google's Maven repository, so `dl.google.com` — which both the
Android SDK components *and* the Android Gradle Plugin itself are resolved from — is
unreachable here, and a local Gradle build fails at the `com.android.tools.build:gradle`
dependency-resolution step. GitHub-hosted runners have unrestricted internet access, so the
same build succeeds there.)

The native camera/file/wake-lock plugins to swap into `src/platform/` (e.g. `@capacitor/camera`,
`@capacitor-community/keep-awake`) get added as each milestone that needs them lands.

## Build order

Milestones are shipped in order, each working end-to-end before the next starts:

1. **M1 — Skeleton.** Routing, Dexie schema, `useWalls`/`useRoutes` hooks, Capacitor Android
   project + CI APK build.
2. **M2 — Photo in, photo out.** Camera/gallery capture, EXIF normalisation, downscaling, blob
   storage, real thumbnails.
3. **M3 — Manual holds only.** The route editor end-to-end against manually tapped circular
   holds — zoom/pan/hit-testing/role-cycling/save, before any CV exists.
4. **M4 — Detection.** OpenCV.js in a worker, the background-model hold detector, tuning UI.
5. **M5 — Correction tools.** Add/delete/merge/split holds, undo/redo.
6. **M6 — Polish.** Route view with wake lock, export/import, storage settings, empty states,
   offline check.

## Non-goals (v1)

User accounts/login/server component, sharing/feeds/comments, outdoor climbing/GPS/guidebooks,
grade consensus, video upload, automatic grade estimation, multi-wall stitching. See the spec
for the full list and what's planned for v2.
