# Running and operating the first application

Run commands from the repository root. Use Node.js 24 LTS. `node:sqlite` is built into this runtime; follow Node's supported versions and release notes. The application is one process; no Redis, external database, object storage, or Musixene account is needed.

## Local development

```sh
npm ci
npm run demo
npm start
```

The server listens on `127.0.0.1:3000`. Use the [administration guide](administration.md) to bootstrap an administrator; public signup defaults to invite-only. Demo generation produces original 18-second synthesized tone WAVs, not recordings. It is optional and repeatable by title. To install only runtime requirements, `npm ci --omit=dev` works; the application has no production npm dependencies.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATA_DIR` | `./data` | Persistent SQLite database and private `media/`; local disk only. |
| `APP_ORIGIN` | `http://localhost:3000` | Exact browser-facing origin used for request origin validation. Production requires HTTPS. |
| `HOST` | `127.0.0.1` | Bind address; container uses `0.0.0.0`. |
| `PORT` | `3000` | Application listen port. |
| `BRANDING_FILE` | unset | Path to artist-owned JSON with `name`, `tagline`, and hex `accent`. |
| `ALLOW_REGISTRATION` | `false` | Startup default; set `true` to opt into public signup. Saved administrator settings override this value. Existing listeners still sign in. |
| `NODE_ENV` | unset | `production` requires an HTTPS origin and enables the production configuration guard. |

HTTPS origins always produce Secure cookies; local HTTP development uses non-Secure cookies. Sessions expire after 30 days, are checked on every API/media request, and are revoked on logout or operator password reset. No background accounting renewal is required. Expiry/revocation can prevent subsequent range requests, while already buffered audio cannot be recalled. No CORS or third-party embedding is supported.

### Artist branding

Copy `branding.example.json` to ignored `branding.json`, edit name/tagline/accent, then run `BRANDING_FILE=./branding.json npm start`. Saved branding in `/admin` overrides these defaults and applies without restarting. Artist Branding in `/admin` controls optional wordmark/tagline, logo, favicon, PWA names, 192/512 icons and accent. PWA names fall back to artist name; generic assets are neutral music symbols. Track artwork remains private and separate. See [branding image requirements and caching](../player-redesign.md). Configured assets are in `DATA_DIR/branding/` and must be included in backups. Reload browser tabs after branding changes; installed identity updates depend on the browser/OS. The exact attribution remains linked in the footer.

### Import trusted audio

```sh
npm run import -- /absolute/path/to/owned-test.wav "Track title" "Artist name"
```

Use audio you have rights to distribute. Supported container formats: WAV, MP3, M4A, Ogg; codec support varies by browser. Files are signature-checked, limited to 512 MiB, and copied under generated filenames into private storage; this is not a malware scanner or a transcoder. Import only trusted files. Reload the library to see new tracks. A failed database insert removes the copied file, but an abrupt process crash during import can leave an unreferenced file; inspect against the catalog before removing anything.

### Operator account creation/recovery

There is no email recovery. See [administration](administration.md) for role bootstrap, invitation signup and browser controls. Operators with local filesystem access can create a listener or reset a password, including when registration is disabled. In Bash, use a hidden prompt; the password is supplied on stdin, not as a process argument:

```sh
read -r -s -p 'New password: ' musixene_password
printf '\n'
printf '%s' "$musixene_password" | node scripts/manage-user.js listener-name
unset musixene_password
```

Resetting a password revokes that listener's sessions atomically. Passwords must be 12–128 characters. Do not use sample passwords in deployed accounts. No credentials are required in source configuration.

## Containers

The supplied image runs as the non-root `node` user. Compose binds the service to host loopback, persists `/data` in a named volume, mounts branding read-only, and uses a read-only root filesystem. An artist-controlled TLS reverse proxy must forward requests to this listener, preserve cookies/range headers, and disable caching for `/api/` responses. Configure authentication rate limits at the proxy as well; the app does not trust forwarded IP headers, so its in-process auth limit is shared behind a proxy and resets on restart. High-volume/public deployments need a reviewed proxy policy.

```sh
cp branding.example.json branding.json
APP_ORIGIN=https://listen.your-domain.example docker compose up --build -d
# Optional synthetic catalog:
APP_ORIGIN=https://listen.your-domain.example docker compose exec artist node scripts/generate-demo.js
```

Replace the example with your actual artist origin; do not expose raw HTTP publicly. Configure your proxy separately before using the instance. `docker compose exec` can run import/manage-user tools inside the container; source audio must be available there via a temporary operator-controlled mount/copy. Secure and remove temporary copies afterward. Named volumes belong to the operator, not Musixene.

For local container testing without a TLS proxy:

```sh
docker build -t musixene-artist-platform:local .
docker volume create musixene-local-data
docker run --rm --name musixene-local -p 127.0.0.1:3000:3000 \
  -e NODE_ENV=development -e APP_ORIGIN=http://localhost:3000 \
  -v musixene-local-data:/data musixene-artist-platform:local
# In another terminal:
docker exec musixene-local node scripts/generate-demo.js
```

This local override is for loopback development only. Health endpoint: `GET /api/health`; an open port/health response is not proof playback works. Stop the native server first if using its port.

## Backup, upgrades, and migration

Use a persistent local filesystem for SQLite and its WAL/journal; do not put the database on NFS or run multiple hosts against the same file. WAL and FULL synchronous writes are configured; durability still depends on underlying disk behavior. Transactions serialize writes with a bounded busy timeout. Versioned transactional migrations add schema-2 administration, schema-3 private feedback and schema-4 track metadata/catalog rules; existing data/media are preserved. See [migration and deployment commands](administration.md) before upgrading.

For a simple consistent backup: stop the application and operator imports/account commands, copy the complete data directory and branding/configuration, then restart. Encrypt backups, restrict access, and keep them off-host. Database backups include password hashes and live session hashes: treat them as sensitive. Do not copy only a live SQLite main file while ignoring its WAL. A supported online SQLite backup tool can be added later with tests.

Restore a copy into an isolated instance on a distinct origin, use matching code/schema, verify login, catalog, full/range playback, and file counts, then securely remove test data. Do not use production music or credentials in development validation. Back up before upgrades; downgrade across incompatible future schemas may require restoring the previous backup. `docker compose down` preserves volumes; `down -v` destroys data and must not be used for routine upgrades.

Schema upgrades run automatically at database open; pre-upgrade backups require a complete stopped-instance data/configuration copy. A provider-neutral logical export/import tool and PostgreSQL/object-storage adapters are not implemented yet. No production migration has been performed. Container image tags and npm lockfile versions should be reviewed during updates; deploy immutable image digests for releases.
