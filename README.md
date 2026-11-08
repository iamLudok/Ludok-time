<div align="center">

<img src="logo/time.svg" alt="Ludok Time logo" width="112">

# Ludok Time

**An Android app to track the series, movies and books you watch and read.**

Episode by episode, page by page, with dates, ratings and rewatches.<br>
No accounts, no servers: your data lives on your phone and is copied to your own Nextcloud.

[![License: MIT](https://img.shields.io/github/license/iamLudok/Ludok-time?style=flat-square&color=blue&label=license)](LICENSE)
[![Android](https://img.shields.io/badge/Android-3DDC84?style=flat-square&logo=android&logoColor=white)](https://www.android.com/)
[![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?style=flat-square&logo=expo&logoColor=white)](https://docs.expo.dev/versions/v57.0.0/)
[![React Native 0.86](https://img.shields.io/badge/React%20Native-0.86-61DAFB?style=flat-square&logo=react&logoColor=black)](https://reactnative.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![TMDB](https://img.shields.io/badge/data-TMDB-01B4E4?style=flat-square&logo=themoviedatabase&logoColor=white)](https://www.themoviedb.org/)

[Features](#features) · [Installation](#installation) · [Backups](#backups) · [Contributing](#contributing) · [License](#license)

<br>

<img src="docs/screenshots/biblioteca.webp" alt="Library: series in progress with their poster, the next episode and how many are left" width="260">&nbsp;
<img src="docs/screenshots/proximos.webp" alt="Upcoming: when the next episode of each series airs, and new releases from the actors you follow" width="260">&nbsp;
<img src="docs/screenshots/estadisticas.webp" alt="Stats: series, movies and books, with episodes watched, time watched and pages read" width="260">

<sub>Library · Upcoming · Stats</sub>

</div>

---

## Table of Contents

- [Why It Exists](#why-it-exists)
- [Features](#features)
- [What Leaves Your Phone](#what-leaves-your-phone)
- [Installation](#installation)
- [Backups](#backups)
- [Development](#development)
- [Design Notes](#design-notes)
- [History](#history)
- [Contributing](#contributing)
- [License](#license)

## Why It Exists

It was born when TV Time went down and a whole watch history was lost with it. Here the rule is
**never lose data**, and everything else comes second:

- Data lives in the app's private storage (`/data/data/com.ludok.time/`). There are no accounts and
  no servers of its own.
- JSON backups you can export and import at any time.
- **Automatic backup to your own Nextcloud** when you open the app on WiFi, one file per day.
- A warning in the Library when you haven't backed up in a while.
- The data layer is **actually tested** against a real SQLite, not just type-checked.

## Features

| Type | Source | Progress |
|---|---|---|
| Series | TMDB | Episode by episode, with "watch next" and a still for each episode |
| Movies | TMDB | Watched or pending, with watch date and rewatches |
| Books | Open Library, or by hand | By page, with % read |

**Library.** Filters by type and status (watching, rewatching, pending, completed, paused,
dropped), sorting by recent or by rating, "Continue watching" at the top and your favorite actors
below.

**Add.** Search TMDB and Open Library, and add books by hand when they don't show up. Before adding,
you get a **preview** with the full details.

**Detail pages.** Synopsis, rating, status and dates. Series and movies also have:

- **Where to watch** in Spain (JustWatch data through TMDB), with a link that opens the title's
  search on each platform.
- **You might also like**: similar titles, filtered by original language so an anime doesn't
  recommend Western series just because they share a genre.
- **Cast**: the top 12, by relevance.

**Episodes.** Mark one, "up to here" or a whole season, and edit the watch date. If you mark
episode 12 while 1 to 11 are unwatched, it offers to mark those too (and you can ask it to stop
asking for that series). Only **already aired** episodes are stored: TMDB returns whole seasons
including future episodes, and storing them left progress stuck at 24/25.

**Upcoming.** When the next episode of each series you follow comes out, sorted by what arrives
first, and below that the new releases of your favorite actors. It's a live query to TMDB: a stale
stored date would be worse than none. **Completed** series are included on purpose, because being
caught up with an airing series marks it as completed, and that's exactly when you want to know
when the next one comes out.

**Actors.** Tap a face in the cast to open their profile, with everything they've done and a ✓ on
what you already have. You can **follow** them. Favorites live in their own table rather than as
another kind of `items`: an actor isn't something you're watching, and putting them in the library
would mean excluding them from every query, filter and counter. Cast and profiles aren't stored;
only who you follow.

**Watch again.** On a completed series, **Verla otra vez** (watch it again) unmarks the episodes so
progress starts from zero, and what was marked moves to the `past_watches` table with its date. The
detail page shows previous watches and, on each episode, its earlier dates. It unmarks instead of
keeping a counter so that "continue watching", "watch next" and progress work just like the first
time. You can undo it as long as you haven't marked anything new. For movies, **La he vuelto a ver**
(I watched it again) moves the previous date to the history and sets today's.

**Stats.** For series, movies and books: how many you have, how many you've finished, how many
you've rewatched, episodes watched, total time (using TMDB's real runtimes, with an estimate that is
flagged when one is missing) and pages read. Rewatches count.

**Welcome.** On first launch it explains what a TMDB API key is and why it's needed, lets you
import a backup, and can be skipped: books work with nothing at all.

**Theme**: dark, light, or the system's.

The app's interface is in Spanish.

## What Leaves Your Phone

There is no Ludok Time server and no analytics, but the app does talk to external services:

> **What does leave your phone:**
> - **TMDB** (`api.themoviedb.org`, `image.tmdb.org`): your searches, the titles and actors you
>   open, and your API key. It's the source for series, movies, cast, platforms and dates.
> - **Open Library** (`openlibrary.org`, `covers.openlibrary.org`): your book searches and the
>   covers.
> - **Your Nextcloud**, if you turn on automatic backup: the whole backup, with your user and your
>   app password.
> - **Streaming platforms**: only if you tap a "Where to watch" link, which opens the search in the
>   browser or in their app.

Your library, your marks and your notes are never sent to TMDB or Open Library.

## Installation

### From an APK

Download the APK from the [latest release](https://github.com/iamLudok/Ludok-time/releases/latest)
and install it on your phone (Android will ask you to allow installing apps from that source). To
search series and movies you need a [free TMDB API key](https://www.themoviedb.org/settings/api);
the app explains how to get one.

Updates install **on top** and keep your data, as long as the new APK is signed with the same key
as the previous one.

### From source

You need Node 22, JDK 17, the Android SDK with API 36, and `adb`.

```bash
git clone https://github.com/iamLudok/Ludok-time.git
cd Ludok-time
npm install
npm run android      # installs and opens it on a phone connected over adb
```

> Gradle needs a **Java 17** toolchain. If it fails with "Cannot find a Java installation matching
> languageVersion=17" while you have a newer JDK, point it to the one Gradle already downloaded:
>
> ```bash
> export JAVA_HOME=~/.gradle/jdks/eclipse_adoptium-17-amd64-linux.2
> ```

### Build a signed APK

It has to be a **release** build, not debug: in debug the JavaScript isn't bundled in the APK, it's
loaded from the Metro server, so it doesn't work without your computer.

The first time, create your own keystore at the project root:

```bash
keytool -genkeypair -v -keystore release.jks -alias ludok -keyalg RSA -keysize 2048 -validity 10000
```

And a `keystore.properties` next to it:

```properties
storeFile=release.jks
storePassword=your-password
keyAlias=ludok
keyPassword=your-password
```

Both are in `.gitignore`. Then:

```bash
npm run build:apk                    # all architectures
./scripts/build-apk.sh --compartir   # arm64-v8a only, much lighter, for sharing
# → dist/Ludok-Time-<version>.apk
```

Install: `adb install -r dist/Ludok-Time-<version>.apk`.

> [!WARNING]
> **Guard the keystore with your life**, next to your backups and off your computer. Android only
> installs an APK on top of another if both are signed with the same key. If it's lost, the only way
> out is to uninstall, and **uninstalling deletes the app's data**. It's the one thing in this
> project that can't be regenerated.

## Backups

**By hand**, in Ajustes (Settings): exporting opens the system share menu with a JSON file, and
importing lets you choose between replacing everything or merging with what's already there. The
import runs in a transaction: if something fails halfway, the database isn't left half-written.

**Automatic to Nextcloud**, in Ajustes → Copia automática a Nextcloud: address, user, password and
folder. When you open the app on WiFi it uploads on its own, at most once every 12 hours, with one
file per day. No background task is used on purpose: Android kills them without warning, and you
couldn't even tell whether they work. Since the app gets opened every day, in practice the backup
ends up being daily anyway.

Use a Nextcloud **app password** (Personal settings → Security), not your account password: it can
be revoked without touching anything else. With `http://` the password and the backup travel
unencrypted; for a server outside your home, use `https://`.

**What isn't in the backups.** Neither the Nextcloud password nor the TMDB API key: a backup gets
shared and moved around, and the backup itself ends up uploaded to Nextcloud, so it would travel
with its own key inside. When restoring on a new phone you have to enter them again; if that phone
already had them, they're kept. Backups from before November 2026 do contain the key, and importing
them restores it.

The backup format **only grows**: optional fields are added, existing ones are never removed or
changed, so any saved backup can still be restored.

## Development

```bash
npm run typecheck    # types for the app and the verification scripts
npm run verify       # checks the data layer
```

### Verifying the data layer

Data is the part that can't fail, so it's tested by running **the same code that runs on the
phone** against a desktop SQLite:

```bash
npm run verify:data       # backup format: round trip, gaps, volume, rejections, secrets
npm run verify:library    # rules: episodes, statuses, rewatches, books, deletions
npm run verify:migration  # upgrading doesn't lose anything
npm run verify:upcoming   # which series show up in Upcoming
npm run verify:real ./ludok-time-backup-YYYY-MM-DD.json   # with a real backup of yours
```

This works because the logic gets its database from [`src/lib/dbRef.ts`](src/lib/dbRef.ts) instead
of creating it: [`src/lib/db.ts`](src/lib/db.ts) is the **only** file that touches `expo-sqlite`.

It uses **libsql** rather than `better-sqlite3` because the latter is synchronous and doesn't
support async transactions, while `expo-sqlite` does: with libsql the semantics match the real
thing. These tests have already caught bugs that would have silently corrupted data, such as an
upsert that mixed rows up during import.

### Structure

```
app/                     # routes (expo-router)
  (tabs)/                # Library, Add, Upcoming, Stats, Settings
  series|movie|book/[id] # detail pages
  person/[tmdbId]        # an actor's profile
  preview/…              # preview before adding
src/
  lib/                   # data and logic
    library/             # library rules: episodes, rewatches, books…
  ui/                    # design tokens and base components
  components/            # app components with logic
  hooks/                 # reactive queries (Drizzle's useLiveQuery)
verify/                  # checks (Node, not shipped in the APK)
scripts/                 # build and sign the APK
logo/                    # app logo and icons
docs/screenshots/        # README screenshots
```

## Design Notes

**"Sala oscura" (dark room).** The poster is the only thing that adds color; the interface is
monochrome **with no accent color**, and hierarchy comes from contrast. Color only appears when it
means something: red for deleting, amber for the backup warning. Everything comes from
[`src/ui/theme.ts`](src/ui/theme.ts). The light theme follows the same rule.

## History

Until July 2026 this was a PWA (Vite + React + Dexie) published on GitHub Pages. It was rewritten
as a native app for three reasons: the look wasn't convincing, the feel wasn't convincing, and **on
GrapheneOS it never became a real app**. Vanadium
[doesn't support WebAPKs](https://discuss.grapheneos.org/d/4175-does-pwa-use-webview-or-vanadium)
because they're generated on Google's servers, so what got installed was a shortcut that opened the
browser. The rewrite also solved the original fear better: on the web you had to *ask* the browser
not to delete the data (`navigator.storage.persist()`), and it could say no. On native, data only
disappears if you uninstall the app.

The backup format is still compatible with that version (`SCHEMA_VERSION` is still 2), so a backup
saved back then can still be restored. The web code remains in the git history.

Two things were removed along the way:

- **YouTube videos** (by link and by importing the Takeout history), in August 2026, because they
  weren't used. An older backup can still be imported: the videos are dropped and the app says how
  many.
- **Manga** (MangaDex, with a reading link to inManga), in November 2026, until it's better thought
  out. Manga already logged **isn't deleted**: it stays in the database and in backups, the app just
  doesn't show it. That's why the `currentChapter`, `totalChapters` and `readUrl` columns and the
  `manga` type remain in the schema.

## Contributing

Pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup and the
project's conventions. To report a security vulnerability, follow [SECURITY.md](SECURITY.md)
instead of opening a public issue.

## License

Distributed under the **MIT License**: you can use, modify and redistribute it, including for
commercial purposes, as long as you keep the copyright notice. See [LICENSE](LICENSE) for the full
text.

This product uses the TMDB API but is not endorsed or certified by TMDB. Book data comes from
[Open Library](https://openlibrary.org/).

---

<div align="center">

Made by [Luken Iriondo](https://github.com/iamLudok) · If Ludok Time is useful to you, consider giving it a ⭐

🇪🇸 [En castellano](https://iamludok.github.io/ludok-apps-web/apps/time/)

</div>
