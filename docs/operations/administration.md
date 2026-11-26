# Artist administration and schema upgrades

This release adds a separate `/admin` interface. Credit charging defaults off; software licensing is now CPAL 1.0. The exact linked footer attribution is retained on both pages. Nothing in this workflow requires access to `stream.musixene.live` or its backups. Do not run these commands in that deployment, mount its storage, or use its MP3 backups.

## Bootstrap and recovery

After backing up, start the upgraded app once or run the account tool below. Migrations advance earlier schemas transactionally through schema 7. Version-1 accounts initially become listeners; later administrator roles, disabled state, password hashes, IDs, sessions and invitations are preserved. Existing track visibility/artwork, collections and ordered membership, private feedback and saved artist settings are retained. Migrations do not rewrite, delete, transcode or reimport media. Reopening the current schema is idempotent; a newer schema is rejected.

Schema 4 adds release status, explicit classification, content type, genres/tags and catalog kind/rules. Existing tracks default to Unpublished / Unreviewed / Other with empty genres/tags while remaining available or hidden exactly as before. These are mechanical initial defaults, not reviewed content assertions or legal publication determinations. Existing collections become Curated without changing membership/order. New drafts begin Hidden. See [the player/catalog redesign](../player-redesign.md) and [private feedback policy](../privacy.md).

Create or explicitly promote a local account using Node.js 24 (the optional final argument is the role):

```sh
read -r -s -p 'Administrator password: ' musixene_password
printf '\n'
printf '%s' "$musixene_password" | DATA_DIR=./data node scripts/manage-user.js artist-admin administrator
unset musixene_password
```

The same command resets an existing account password, preserves its ID, enables it when an explicit role is supplied, and revokes its sessions. Without a role argument, existing roles and disabled state are retained; new accounts are listeners. No first visitor is automatically promoted. The last active administrator cannot be disabled or demoted through administration. Filesystem operators remain responsible for protecting the database and can recover an administrator with this command. There is no email delivery or self-service password recovery.

Sign in at `/`, open **Account and privacy** in the header and follow **Administration**. Administrators can:

- Configure artist name, optional tagline/wordmark, header logo, favicon, PWA names/icons, accent and public signup. Changes persist in SQLite and override the startup branding/registration defaults. Initial public signup is disabled unless `ALLOW_REGISTRATION=true` is explicitly supplied; existing accounts still sign in. An upgraded public deployment must explicitly opt in to retain public signup.
- Create invitations expiring in 1–720 hours, optionally bound to a new username, and revoke unused invitations. Share the token privately with the invitee, who selects invited signup and pastes it into the invitation field. Tokens are displayed once, stored only as SHA-256 hashes, and never included in list responses. Account creation and single-use consumption share a transaction. A failed creation leaves the invitation unused. Invitations always create listeners; promote separately if necessary. A provided invalid token fails even when public signup is enabled.
- List listeners, change roles, disable/re-enable accounts and reset passwords. Every saved account revokes all its sessions; disabled accounts cannot sign in or request new audio/artwork bytes. Already buffered media cannot be recalled.
- Create Hidden drafts, upload/replace audio, upload/remove artwork, change title/artist/position and select Available to listeners independently of release status. Classification controls set release status, Explicit/Non-Explicit/Unreviewed, content type, genres and tags. Position sorts ascending, then creation time and ID. Hidden tracks are absent from listener catalogs/collections, and their direct media URLs reject listeners. Administrators can preview hidden media.
- Create, name, configure, reorder, make available/hide and delete catalogs. Curated catalogs retain explicit track order; dynamic catalogs automatically match their metadata rules. Catalog availability never exposes Hidden tracks. Deleting a catalog removes membership records, leaving tracks/audio intact. Three permanent system views include All Catalogs and release-designation views; see the redesign document for filter/queue semantics.

Uploads require a current administrator session, same-origin POST and CSRF token. Bodies stream to generated exclusive filenames with private permissions outside the web root, bounded to 512 MiB audio / 5 MiB artwork and checked against allowed MIME types and file signatures. Artwork is PNG/JPEG only (no SVG or HTML). Browser audio MIME values must be `audio/wav`, `audio/mpeg`, `audio/mp4` or `audio/ogg`; an empty/unsupported MIME value is rejected. These checks are not a malware scanner or transcoder; trusted uploads and browser codec testing are still required. The server request timeout is 30 seconds; proxy limits may be stricter. A failed upload removes its new file. A crash can leave an unreferenced file. Replacing media retains the superseded file intentionally: no automatic deletion of music or artwork occurs. Reconcile retained files against the catalog and stopped-instance backups before considering manual cleanup.

Branding PNG uploads use separate dimension/checksum/decompression validation (2 MiB maximum); [appearance requirements](../player-redesign.md) describe exact sizes and public asset delivery. Audio and track artwork remain protected by authentication/visibility.

## Consistent backup and deployment (Compose)

Run from this artist-platform checkout only, against its own Compose project. Supply the artist application's actual HTTPS origin; **never use `stream.musixene.live` here**. These commands are instructions for the operator; no live deployment or production data was accessed during implementation.

Prepare `branding.json` from `branding.example.json` if this is a new installation. Retain the existing Compose project name/working directory when upgrading so that its named `artist-data` volume is reused. Stop operator imports/account tools as well as the service during backup. Keep backups private and off-host; they contain password/session hashes, private feedback and media. Copy all of `/data`, including the `branding/` directory; copying the database alone is insufficient.

```bash
set -euo pipefail
export APP_ORIGIN=https://listen.your-domain.example
# Replace with the exact reviewed merge commit AFTER approval, not a moving branch.
release=REPLACE_WITH_APPROVED_MERGE_SHA
[[ "$release" =~ ^[0-9a-f]{40}$ ]] || { echo "Set the approved release SHA first"; exit 1; }
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Review local tracked changes before continuing"
  exit 1
fi
docker compose config -q
git fetch origin main
git merge-base --is-ancestor "$release" origin/main
git merge-base --is-ancestor HEAD "$release"
container_id="$(docker compose ps -q artist)"
test -n "$container_id"
umask 077
musixene_backup="$(pwd)/backups/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$musixene_backup"
git rev-parse HEAD > "$musixene_backup/code-revision.txt"
cp compose.yaml branding.json "$musixene_backup/"
[ ! -f .env ] || cp .env "$musixene_backup/"
docker compose config > "$musixene_backup/compose-resolved.yaml"
docker inspect "$container_id" > "$musixene_backup/container-inspect.json"
docker compose exec -T artist node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(x=>console.log(JSON.stringify(x)))" > "$musixene_backup/health.json"
# Restart the existing image if backup fails. Do not proceed on any backup error.
trap 'docker start "$container_id" >/dev/null || true' EXIT
docker compose stop artist
# Docker copies the stopped volume regardless of the application's file permissions.
docker cp "$container_id":/data/. - | gzip > "$musixene_backup/data.tar.gz"
gzip -t "$musixene_backup/data.tar.gz"
tar -tzf "$musixene_backup/data.tar.gz" > "$musixene_backup/files.txt"
grep -Eq '^(\./)?artist\.sqlite$' "$musixene_backup/files.txt"
sha256sum "$musixene_backup/data.tar.gz" > "$musixene_backup/data.tar.gz.sha256"
trap - EXIT
git switch main
git merge --ff-only "$release"
test "$(git rev-parse HEAD)" = "$release"
docker compose up -d --no-deps --build --wait --wait-timeout 120 artist
docker compose exec -T artist node --input-type=module -e '
const response=await fetch("http://127.0.0.1:3000/api/health");
const health=await response.json(); console.log(health);
if(!response.ok||health.version!=="0.5.0"||health.schema!==7)process.exit(1);
'
echo "Keep the verified backup: $musixene_backup"
```

Version 0.5.0 adds schema 7, private article images under `/data/editorial-images`, and Social links; it does not change charging settings, balances or `.env` requirements. Refresh/reopen the PWA after upgrading to replace shell cache v8 with v9. Verify the four navigation buttons, private article/draft/image access, timestamps, pin conflict choices, social links and existing playback/credits. CI runs isolated synthetic regressions before review; do not generate demo content in a real catalog. If the build or health check fails after migration, inspect `docker compose logs --tail=100 artist`; do not restart old code against schema 7.

For first administrator creation/recovery in the container, use the hidden password prompt above but pipe into `docker compose exec -T artist node scripts/manage-user.js artist-admin administrator` instead. Verify login, track counts, collection membership and full/range playback on the intended artist origin. Do not run demo generation on a real catalog merely to validate the upgrade. No application command touches a separate streaming deployment.

## Isolated restore drill and rollback

Restore into a **new empty directory**, never over a running database or a live media directory:

```sh
mkdir -m 700 /tmp/artist-platform-restore
# Use the absolute path of the backup created above.
tar --no-same-owner -xzf "$musixene_backup/data.tar.gz" -C /tmp/artist-platform-restore
DATA_DIR=/tmp/artist-platform-restore APP_ORIGIN=http://localhost:3200 PORT=3200 npm start
```

Keep this instance on loopback with a distinct origin. Verify account login, catalog counts, artwork, collection order, full/range audio bytes and filesystem counts. For real sensitive media, use a secure operator-controlled isolated host; automated tests use only synthetic data. Do not test against the protected streaming host or its MP3 backups. Restore drills can apply migrations to the copy; they do not replace the original backup.

Rollback requires the recorded previous code revision **and a complete stopped-instance pre-upgrade data restore**. Schema downgrade is not supported. Stop the service, retain the failed upgraded volume for investigation, restore the archive into a separate empty volume, point Compose at it, and deploy the recorded previous revision with its saved configuration. Never overlay a database while leaving newer WAL files, and never use `docker compose down -v` as an upgrade step. Post-backup changes must be separately reconciled.

## Corresponding source for a release

Record the exact reviewed commit and any deployment modifications with each image release. Retain its corresponding covered source and notices, and make that source available under CPAL for network deployments. The application links to the public repository; modified operators must ensure that link or their accompanying source offer actually provides their deployed covered modifications. Artist media, credentials and listener data do not belong in source archives. Runtime images include LICENSE, NOTICE and CHANGES.md. Never infer a live revision from the current GitHub branch.

## Qualifying-play credits (0.4 / schema 6)

Back up the stopped instance before upgrading; migration preserves existing records and media, sets all prices/balances to zero and assigns nobody unlimited automatically. In Tracks set Credits per qualifying play (0 = free). In Listeners open an account, grant a decimal amount or explicitly select Unlimited credits, enter a reason, and Save listener credits. A zero adjustment changes eligibility only. Subtract cannot consume funds held by active engagements. In Plays & credits enable charging only after prices, funds/eligibility and device testing are ready. Disabling charging releases pending holds; unlimited changes do not revoke login sessions.

The dashboard labels qualifying plays, not complete listens, over the last 90 days. Recent financial audit entries are private. Account-menu exports and analytics identity unlinking do not delete financial history. Open crash/orphaned holds expire after 24 hours. No automatic payment collection or purchase flow exists. Old code cannot open schema 6: rollback requires the matching full stopped-data backup and code revision. See [the specification](../credit-metering-review.md) before enabling paid listening, especially background undercounting and modified-client enforcement limitations.

## Artist Blog and Social (0.5 / schema 7)

Use Blog in administration to create a draft, format text with the toolbar, save/preview, upload supporting images and publish. Edits to a published article are live when saved; unpublish first to revise privately. Saving text or changing images on an article that has ever been published advances Updated; the original Published timestamp remains fixed. Pin controls require saved content, so cancelling a Top Pin conflict cannot save unrelated edits. Unpublishing a Top Pin demotes it to standard Pin; republishing retains that Pin and never displaces a new Top Pin.

Social administration configures profile label, HTTPS URL, local icon, numeric order and enabled state. Other/generic supports additional platforms. No account connection, embeds, payments, public article links or sharing tools are provided. New Blog/Social tables start empty; no invented artist material is installed. See [the publishing guide](../artist-publishing.md) for safety limits, review screenshots and rollback commands.
