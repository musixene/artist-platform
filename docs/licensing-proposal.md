# DRAFT — Musixene CPAL 1.0 licensing review

> REVIEW DOCUMENT ONLY. This document does not adopt CPAL 1.0 or grant software reuse rights. The formal license must be approved before adding a LICENSE file or changing licensing metadata. No production deployment is affected.

## Project identity and scope

Musixene is a music platform that contributes independently deployable artist-branded software to the artistic community. It is not a nonprofit, a SaaS operator, or a hosting/support provider. Artists operate their own instances and independently control their own brands, servers, domains, accounts, creative content and integrations.

Musixene encourages independent management of the creative and commercial relationship with listeners. It does not register copyright claims, determine whether a preview is published, or guarantee against copying and other misuse.

Public copyright notice: **© 2026 Musixene**. Legal clarification: **Musixene is a trade name of Clara Vista Entertainment LLC.**

## Candidate open-source license

**Common Public Attribution License Version 1.0 (CPAL-1.0)**

Official terms: https://opensource.org/license/CPAL-1.0

- Section 14 permits an Original Developer to require modest, prominent GUI attribution, as specified in Exhibit B.
- Section 15 treats external network deployment as distribution for applicable source-code availability duties.
- Sections 3.2, 3.3, 3.5 and 3.6 impose duties for source availability, change records, source-file notices and executable notices.
- Section 7 includes an AS IS warranty disclaimer, subject to applicable law.
- Section 14(d) does not give recipients unrestricted Musixene trademark rights.

The software license covers the covered software, not an artist's separately uploaded recordings, compositions, interviews, images, listener data or transactions simply because the software handles them.

## Proposed Exhibit A identifiers — not yet adopted

Original Code: **Musixene Artist Platform**

Original Developer and Initial Developer: **Musixene (a trade name of Clara Vista Entertainment LLC)**.

Copyright display in source notices: **© 2026 Musixene**.

The standard Exhibit A notice must be completed and positioned in covered source files (or an appropriate nearby directory notice for files whose structure prevents inclusion). Rights in external contributions and AI-assisted work must be reviewed; do not assert that Musixene wrote or owns every third-party contribution. No alternative license or dual-license permission has been approved.

## Proposed Exhibit B attribution — not yet adopted

**Attribution Phrase:** Powered by an Open Source Concept from Musixene

**Attribution URL:** https://musixene.com

**Graphic image:** None requested.

**Attribution Copyright Notice:** Legal and source notices will identify © 2026 Musixene; whether Exhibit B should require this *additionally* in the visible user interface needs final review. The desired listener-facing acknowledgment is the exact linked phrase above.

**Display in Larger Works:** Propose REQUIRED, subject to review of compatibility and downstream effect. This is important to Musixene's goal of retaining attribution when the platform is embedded in another artist-branded application.

Section 14 calls for prominent notice on initial run/session. Current app and admin footers display the link, but their visibility on initial mobile views has not been verified. Review whether a small, visible sign-in and/or About presentation is needed while keeping artist branding primary and the exact phrase unchanged.

## Requirements before an actual license grant

1. Verify the rights-holder and authority to license the code, including any third-party assets or contributions.
2. Review CPAL and its exhibits with appropriately qualified legal counsel; confirm the larger-works option and whether an Exhibit B copyright notice is desired on screen.
3. Review current tracked files and Git history for credentials, personal data, copyrighted music or other undistributable material.
4. Upon authorization, add the verbatim official CPAL 1.0 license with correctly completed exhibits; apply the specified notices, license metadata and contributor/change-history requirements.
5. Update application attribution placement and an accessible source-code location if necessary, test these changes, and merge to main only after the public-release gate is cleared.
6. Preserve the existing feature branch and LP-19 deployment until a separate reviewed release is ready.

The requested attribution should not suggest that Musixene operates, supports or guarantees individual artist deployments. A license cannot exclude commercial users and still satisfy the usual Open Source Definition.
