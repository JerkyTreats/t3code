# Main without Fleet installation history

Date: 2026-10-09
Branch: `cleanup/never-fleet-main-20261009`
Status: source verified; deployment pending

## Objective and boundary

Main assumes Fleet manager was never installed. Remove the one-time retired-Fleet journal admission and native-session fingerprint guards added for the earlier production transition. Preserve the accepted upstream intake, ordinary provider discovery and import, unrelated fork responsibilities, and the stable migration execution identities 79 through 82.

The user also requested moving production onto this cleaned build. Production alignment is a separately verified, private offline operation. It preserves surviving data and prevents retired native conversations from returning before startup. The application does not gain a compatibility mode, migration repair command, or new generic exclusion feature. Publication is prepared separately from deployment.

The base is `253836c2636f085b8afb2d181b38f040c8e801da`; upstream remains pinned to `ec80933ac8cd02fec5c97b342462ccc9567cdb1e`. The earlier intake baseline and evidence remain immutable history. The user-approved retirement ends the active applicability of `PERSIST.D8`; surviving persistence decisions remain unchanged.

## Source changes

- Remove retired journal identities 71 through 78 and their evidence-specific admission branch.
- Remove the retirement fingerprint service, scanner filters, import checks, provider-operation checks, startup dependencies and dedicated fixtures.
- Restore the scanner to pinned upstream behavior and retain ordinary native import coverage, including unavailable providers.
- Keep unknown journal rejection before writes, historical never-Fleet upgrades, stable continuation IDs and transactional rollback evidence.
- Update active persistence and operator documentation and record the retired compatibility decision as history.

## Verification and review

Focused migration and runtime tests passed. `pnpm fmt`, `pnpm lint`, `pnpm typecheck`, and `NODE_ENV=test pnpm test` passed across all 24 workspace tasks. The server suite passed 469 files and 6,513 tests, with four files and 19 tests skipped by their existing conditions. A fresh reviewer found no blocking or deferred source findings after checking the source boundary, surviving behavior and documentation. The scanner and its tests match the pinned upstream bytes.

The immutable release must remain clean, report the exact committed version, and pass isolated artifact smoke before activation. Managed Electron packaging and installed readiness are separate acceptance checks. Mobile source and build inputs did not change in this cleanup.

The private deployment proof must bind the exact source to a rehearsed normalization, preserve every retained database row and schema object, validate integrity and foreign keys, and establish that retired native sources are unavailable to ordinary discovery. Activation requires a fresh stopped-service backup and one writer. Restoring data remains an explicit operator decision.

## Commit effect

If applied, this commit removes Fleet retirement compatibility from main while preserving ordinary provider sessions and stable upstream migration identities.

## Acceptance status

Source acceptance is complete. Independent operational review and copied-state rehearsal passed for the external database alignment and native retirement quarantine. Production activation and installed Electron acceptance remain pending the committed immutable artifacts and fresh stopped-service backups. Detailed private operational evidence stays outside Git.
