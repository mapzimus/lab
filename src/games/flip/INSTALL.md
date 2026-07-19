# Putting Flip Game on a phone

The game is a Progressive Web App (PWA): it has an app manifest, app icons, and a
service worker that caches everything for offline play. Matter.js is vendored
locally (`js/vendor/matter.min.js`) so nothing depends on a CDN at runtime.

There are two ways to get it onto an Android device. **Both need the game hosted
over HTTPS first** — the easy free option is GitHub Pages on this repo.

---

## Step 0 — Host it (one-time)

1. Push this repo to GitHub.
2. On github.com → the repo → **Settings → Pages**.
3. **Build and deployment → Source = Deploy from a branch**, branch = `master`,
   folder = **/ (root)**. Save.
4. Wait ~1 minute, then open: **https://mapzimus.github.io/flipgame/**

GitHub Pages serves this over HTTPS automatically, which is what lets the service
worker register and the app install.

> All asset paths in the app are **relative** on purpose, because the site lives at
> `/flipgame/`, not the domain root. Don't change them to start with `/`.

---

## Option A — Install as an app (no APK, easiest)

On the **Android phone**, open `https://mapzimus.github.io/flipgame/` in Chrome:

1. Tap the **⋮ menu → Install app** (or **Add to Home Screen**).
2. Launch it from the new home-screen icon — it opens fullscreen, no address bar.
3. After the first load it works **offline** (the service worker cached it).

That's it — it behaves like an installed app. iOS works too (Safari → Share → Add to
Home Screen), though iOS is a bit more limited.

---

## Option B — Generate a real `.apk` file (to sideload / share)

Uses **PWABuilder** — it builds the APK in the cloud, so you need **no Android
Studio, no SDK, no admin rights**, just a browser.

1. Go to **https://www.pwabuilder.com**, paste `https://mapzimus.github.io/flipgame/`,
   click **Start**. It checks the manifest / service worker.
2. **Package For Stores → Android → Generate Package.**
3. In the signing-key options choose **New** (so the test `.apk` is **signed** and
   directly installable). Note the keystore password/alias it shows.
4. **Download the zip.** Inside:
   - `*.apk` ← **this is the one to install** (signed test build)
   - `*.aab` ← Google Play only, **cannot** be sideloaded
   - `assetlinks.json`, `signing.keystore`, `signing-key-info.txt` ← **keep these
     safe**; you need the same key to ship updates.
5. Put the `.apk` on the phone (email/Drive/USB) and tap it. On the phone, enable
   **Settings → Apps → Special access → Install unknown apps** for the browser/file
   manager you used. Install, launch — done. No Android Studio involved.
6. Share the same `.apk` with friends; they just enable "install unknown apps" too.

### Optional: remove the address bar in the APK
PWABuilder's APK is a Trusted Web Activity that shows a small Chrome address bar
until you prove you own the domain. To remove it, commit the `assetlinks.json` from
the zip to `/.well-known/assetlinks.json` in this repo (so it serves at
`https://mapzimus.github.io/flipgame/.well-known/assetlinks.json`), push, and
reinstall. The app works fine either way.

> Note: the PWABuilder APK loads the **live hosted site**, so updates you push to
> GitHub Pages show up automatically. Offline still works via the service worker.

---

## Updating the game later

When you change any game file, bump the version in `service-worker.js`
(`CACHE_NAME = 'flipgame-v1'` → `'flipgame-v2'`) and push. The old cache is purged on
next launch so players get the new build instead of a stale one.
