# Musixene Artist Platform

An independently operated, artist-branded listening room. This first functional version provides local listener accounts, private audio streaming, a continuous player, and an installable PWA shell. **Listening credits are disabled; no deductions or reservations occur.**

Musixene is an existing music platform that believes in creative independence and artistic ownership. It is contributing independently deployable software for supplemental virtual sidestreet marketplaces and artist–fan creative feedback ecosystems. Artists operate their own instances on infrastructure of their choosing. Musixene is not a SaaS provider, nonprofit organization, hosting service, or technical support provider.

## Stack and capabilities

- Node.js 24 LTS, built-in SQLite (`node:sqlite`), and plain HTML/CSS/JavaScript. No production npm dependencies or frontend build step. Playwright is a development-only dependency.
- Single-artist modular monolith; SQLite with WAL, FULL synchronous durability, foreign keys, and a busy timeout. Private local media stays outside the web root.
- Local listener registration/login/logout; scrypt password hashes; opaque, hashed-at-rest sessions; HttpOnly/SameSite cookies and origin/CSRF checks. Operators can disable registration and provision/reset accounts locally.
- Authenticated HTTP byte-range audio with seeking, track selection, continuous queue playback, shuffle, repeat-all/repeat-one, and Media Session controls where supported.
- Configurable artist name, tagline, and accent color; container-based reference deployment. No mandatory Musixene infrastructure or external fonts, trackers, identity, or storage services.
- Service worker caches only the public shell. No offline audio or caching of private APIs/media. PWA installation requires a secure context and browser support.

PostgreSQL and object storage are optional future expansion paths. This phase does not include a browser administration/upload UI, collections editor, likes, feedback, analytics dashboards, commerce, or credit metering. Operator CLI tools import media and manage accounts. This is an initial development implementation, not a production-readiness claim.

## Run locally

Install Node.js 24, then from the repository root:

```sh
npm ci
npm run demo
npm start
```

Open `http://localhost:3000`, create a listener account, and select a track. `npm run demo` generates three original synthetic tone WAVs into ignored private storage; no recordings or external music are downloaded. Repeating it skips existing demo titles. Keep generated audio/data out of Git.

To customize, copy `branding.example.json` to `branding.json`, edit it, and start with:

```sh
BRANDING_FILE=./branding.json npm start
```

See [installation and operations](docs/operations/running.md) for configuration, importing audio, account recovery, containers, and backups. The default server binds only to loopback. Physical phones require a reachable HTTPS artist origin; phone localhost refers to the phone itself.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:browser
```

If Chromium is already installed, use `CHROMIUM_PATH=/path/to/chromium npm run test:browser`. Tests create isolated temporary databases and synthetic audio, never use the running instance's accounts or media. See [validation and mobile checklist](docs/validation.md) for actual results and remaining device tests.

## Architecture and decisions

- [Architecture](docs/architecture.md)
- [Repository structure](docs/repository-structure.md)
- [Accepted metering direction; protocol still under investigation](docs/credit-metering-review.md)
- [Requirements](docs/requirements.md)
- [Roadmap](docs/roadmap.md)

Renewable playback allowances and incremental reconciliation are accepted for further investigation, not implemented. Listener-favorable uncertainty remains required. Accounting must not unnecessarily interrupt background playback because browser callbacks are suspended.

## Boundaries, license, and attribution

The software does not manage copyright registration, creative provenance, recording production, or artist business operations. It does not determine whether streaming constitutes legal publication. Do not commit music, personal data, credentials, or private keys. No LP-19 production system or music is used by this implementation.

The software is intended to be supplied **AS IS** under an open-source license. **The software license has not been finalized. CPAL 1.0 remains a candidate pending approval.** No license grant is made by this README; final license text, notices, contribution terms, and downstream attribution obligations remain under review.

[Powered by an Open Source Concept from Musixene](https://musixene.com)
