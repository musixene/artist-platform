# Musixene Artist Platform — CPAL 1.0 licensing decision

**Status: Adopted, November 16, 2026 (UTC).** The repository-root [LICENSE](../LICENSE), including completed Exhibits A and B, governs. This explanation does not replace the license.

## Copyright and identity

- **© 2026 Musixene**
- **Musixene is a trade name of Clara Vista Entertainment LLC.**
- Original Code: Musixene Artist Platform
- Original Developer and Initial Developer: Musixene (a trade name of Clara Vista Entertainment LLC)
- SPDX: CPAL-1.0
- No alternative/dual-license permission is intended.

## Exhibit B — required attribution

- Copyright notice: **© 2026 Musixene**
- Phrase: **Powered by an Open Source Concept from Musixene**
- URL: **https://musixene.com**
- Graphic: no additional graphic required.
- Display of attribution in Larger Works: **required**.

CPAL Section 14 specifies prominent GUI attribution at launch/session start; Section 15 addresses external network deployment and source availability. A footer alone may not establish first-screen visibility on small devices. Include the required wording and copyright near the beginning of the sign-in and administration experience and verify it on real devices.

Covered software is licensed; an artist's independently owned recordings, artwork, listener data and other private content are not automatically licensed merely because the platform handles them. Artists operate their own independent deployments. Musixene provides no mandatory hosting, technical support, registration service, payments or guarantees. The software is supplied AS IS under the license.

## Maintainer release checklist

1. Keep the official CPAL license, completed Exhibits A/B, and applicable Exhibit A notices in covered source files or relevant adjacent NOTICE files for formats without comments.
2. Preserve exact linked UI attribution and source availability for relevant network deployments and modifications.
3. Maintain dated modification descriptions in [CHANGES.md](../CHANGES.md).
4. Confirm rights in contributed material and third-party assets; do not assign others' contributions to Musixene without permission.
5. Audit Git history and the production release for secrets, personal information and unlicensed media.
6. Rerun test suites and physically inspect mobile UI, PWA and lock-screen behavior after changes.
7. Consider appropriate legal review of the CPAL and its exhibit configuration, especially larger-work attribution and downstream compatibility.

Adoption of the source license does **not** deploy or modify the LP-19 production instance or the legacy listening room.
