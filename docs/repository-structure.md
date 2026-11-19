# Repository structure

The first application uses the approved independent single-artist modular monolith, SQLite, private local storage, and container deployment. Paths below exist; generated private data remains ignored.

```text
artist-platform/
├── README.md
├── package.json / package-lock.json   # Node 24; Playwright is dev-only
├── Dockerfile / compose.yaml          # Non-root container, persistent data
├── branding.example.json              # Safe public configuration template
├── apps/
│   ├── server/
│   │   ├── index.js                   # Startup/configuration and shutdown
│   │   ├── app.js                     # HTTP/auth/catalog/range delivery
│   │   ├── config.js                  # Artist-owned configuration
│   │   └── database.js                # SQLite schema v4, transactional migrations and durability settings
│   └── web/                          # PWA shell, persistent player, queue policy
├── packages/domain/accounting.js      # Defined boundary; no charges/reservations
├── scripts/
│   ├── generate-demo.js               # Original synthetic test tones
│   ├── import-track.js                # Operator-only trusted-media import
│   ├── manage-user.js                 # Operator create/reset; password via stdin
│   └── e2e-server.js                  # Isolated temporary browser-test server
├── tests/
│   ├── api.test.js
│   ├── player.test.js
│   └── browser/player.spec.js
├── playwright.config.js
└── docs/
    ├── architecture.md
    ├── credit-metering-review.md
    ├── requirements.md
    ├── roadmap.md
    ├── repository-structure.md
    ├── validation.md
    └── operations/running.md
```

No mandatory worker, broker, PostgreSQL, or object-storage service exists. Narrow domain/storage boundaries should support later expansion without prematurely implementing multiple backends. Future migrations, integration adapters, decision records, contribution/security policies, and CI can be added as needed. CPAL 1.0 LICENSE and Musixene notices are included; retain these notices and maintain attribution/source obligations.

Database/journals, private media, exports, backups, logs, local branding, credentials, and private keys must remain outside version control. The default ignored `data/` contains SQLite and `media/`; containers use a named persistent volume instead. Static web assets are the only files reachable through the server's explicit public allowlist. Versioned migrations and a stopped-instance data/configuration archive support upgrades; provider-neutral logical exports remain future work.

The player redesign adds `apps/server/catalog.js` for bounded catalog/metadata behavior and `apps/server/branding.js` for validated public identity assets. `DATA_DIR/branding/` is operator data alongside private media, included in complete backups and excluded from Git. Browser queue policy remains in player.js; Like/Note APIs and privacy controls are reused.
