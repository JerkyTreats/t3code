import * as Effect from "effect/Effect";
import * as Migrator from "effect/unstable/sql/Migrator";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import Migration0001 from "./Migrations/001_OrchestrationEvents.ts";
import Migration0002 from "./Migrations/002_OrchestrationCommandReceipts.ts";
import Migration0003 from "./Migrations/003_CheckpointDiffBlobs.ts";
import Migration0004 from "./Migrations/004_ProviderSessionRuntime.ts";
import Migration0005 from "./Migrations/005_Projections.ts";
import Migration0006 from "./Migrations/006_ProjectionThreadSessionRuntimeModeColumns.ts";
import Migration0007 from "./Migrations/007_ProjectionThreadMessageAttachments.ts";
import Migration0008 from "./Migrations/008_ProjectionThreadActivitySequence.ts";
import Migration0009 from "./Migrations/009_ProviderSessionRuntimeMode.ts";
import Migration0010 from "./Migrations/010_ProjectionThreadsRuntimeMode.ts";
import Migration0011 from "./Migrations/011_OrchestrationThreadCreatedRuntimeMode.ts";
import Migration0012 from "./Migrations/012_ProjectionThreadsInteractionMode.ts";
import Migration0013 from "./Migrations/013_ProjectionThreadProposedPlans.ts";
import Migration0014 from "./Migrations/014_ProjectionThreadProposedPlanImplementation.ts";
import Migration0015 from "./Migrations/015_ProjectionTurnsSourceProposedPlan.ts";
import Migration0016 from "./Migrations/016_CanonicalizeModelSelections.ts";
import Migration0017 from "./Migrations/017_ProjectionThreadsArchivedAt.ts";
import Migration0018 from "./Migrations/018_ProjectionThreadsArchivedAtIndex.ts";
import Migration0019 from "./Migrations/019_ProjectionSnapshotLookupIndexes.ts";
import Migration0020 from "./Migrations/020_AuthAccessManagement.ts";
import Migration0021 from "./Migrations/021_AuthSessionClientMetadata.ts";
import Migration0022 from "./Migrations/022_AuthSessionLastConnectedAt.ts";
import Migration0023 from "./Migrations/023_ProjectionThreadShellSummary.ts";
import Migration0024 from "./Migrations/024_BackfillProjectionThreadShellSummary.ts";
import Migration0025 from "./Migrations/025_CleanupInvalidProjectionPendingApprovals.ts";
import Migration0026 from "./Migrations/026_CanonicalizeModelSelectionOptions.ts";
import Migration0027 from "./Migrations/027_ProviderSessionRuntimeInstanceId.ts";
import Migration0028 from "./Migrations/028_ProjectionThreadSessionInstanceId.ts";
import Migration0029 from "./Migrations/029_ProjectionThreadDetailOrderingIndexes.ts";
import Migration0030 from "./Migrations/030_ProjectionThreadShellArchiveIndexes.ts";
import Migration0031 from "./Migrations/031_AuthAuthorizationScopes.ts";
import Migration0032 from "./Migrations/032_AuthPairingProofKeyThumbprint.ts";
import Migration0033 from "./Migrations/033_ProjectionThreadsSettled.ts";
import Migration0034 from "./Migrations/034_ProjectionThreadsSnoozed.ts";
import Migration0035 from "./Migrations/035_ProjectionThreadTitleRegeneration.ts";
import Migration0036 from "./Migrations/036_ProjectionThreadsPinned.ts";
import Migration0037 from "./Migrations/037_ProjectionTurnsKeysetIndex.ts";
import Migration0038 from "./Migrations/038_ProjectionThreadsPinOrderKey.ts";
import Migration0039 from "./Migrations/039_ProjectionProjectsDefaultThreadEnvMode.ts";
import Migration0040 from "./Migrations/040_ProjectionProjectFaviconPath.ts";
import Migration0041 from "./Migrations/041_AuthSessionClientConnection.ts";
import Migration0042 from "./Migrations/042_ReconcileUpstreamAndSettingsAdmin.ts";
import Migration0043 from "./Migrations/043_ProjectionBoardPosts.ts";
import Migration0044 from "./Migrations/044_ProjectionBoardPostRevisions.ts";
import Migration0045 from "./Migrations/045_CollectiveExpeditions.ts";
import Migration0050 from "./Migrations/050_ThreadAdapterLaunchBindings.ts";
import Migration0051 from "./Migrations/051_RetireThreadAdapterAuthority.ts";
import Migration0058 from "./Migrations/058_PairingEnrollmentClass.ts";
import UpstreamMigration0042 from "./Migrations/042_ProjectionThreadLinkedPullRequest.ts";
import UpstreamMigration0043 from "./Migrations/043_ProjectionThreadsUnsettledAt.ts";
import UpstreamMigration0044 from "./Migrations/044_ClearAutomaticProjectModelDefaults.ts";
import UpstreamMigration0045 from "./Migrations/045_ProjectionProjectsAutoPull.ts";
import UpstreamMigration0046 from "./Migrations/046_RepairAutomaticSettlementTimestamps.ts";
import UpstreamMigration0047 from "./Migrations/047_ProjectionProjectIcon.ts";

export const migrationEntries = [
  [1, "OrchestrationEvents", Migration0001],
  [2, "OrchestrationCommandReceipts", Migration0002],
  [3, "CheckpointDiffBlobs", Migration0003],
  [4, "ProviderSessionRuntime", Migration0004],
  [5, "Projections", Migration0005],
  [6, "ProjectionThreadSessionRuntimeModeColumns", Migration0006],
  [7, "ProjectionThreadMessageAttachments", Migration0007],
  [8, "ProjectionThreadActivitySequence", Migration0008],
  [9, "ProviderSessionRuntimeMode", Migration0009],
  [10, "ProjectionThreadsRuntimeMode", Migration0010],
  [11, "OrchestrationThreadCreatedRuntimeMode", Migration0011],
  [12, "ProjectionThreadsInteractionMode", Migration0012],
  [13, "ProjectionThreadProposedPlans", Migration0013],
  [14, "ProjectionThreadProposedPlanImplementation", Migration0014],
  [15, "ProjectionTurnsSourceProposedPlan", Migration0015],
  [16, "CanonicalizeModelSelections", Migration0016],
  [17, "ProjectionThreadsArchivedAt", Migration0017],
  [18, "ProjectionThreadsArchivedAtIndex", Migration0018],
  [19, "ProjectionSnapshotLookupIndexes", Migration0019],
  [20, "AuthAccessManagement", Migration0020],
  [21, "AuthSessionClientMetadata", Migration0021],
  [22, "AuthSessionLastConnectedAt", Migration0022],
  [23, "ProjectionThreadShellSummary", Migration0023],
  [24, "BackfillProjectionThreadShellSummary", Migration0024],
  [25, "CleanupInvalidProjectionPendingApprovals", Migration0025],
  [26, "CanonicalizeModelSelectionOptions", Migration0026],
  [27, "ProviderSessionRuntimeInstanceId", Migration0027],
  [28, "ProjectionThreadSessionInstanceId", Migration0028],
  [29, "ProjectionThreadDetailOrderingIndexes", Migration0029],
  [30, "ProjectionThreadShellArchiveIndexes", Migration0030],
  [31, "AuthAuthorizationScopes", Migration0031],
  [32, "AuthPairingProofKeyThumbprint", Migration0032],
  [33, "ProjectionThreadsSettled", Migration0033],
  [34, "ProjectionThreadsSnoozed", Migration0034],
  [35, "ProjectionThreadTitleRegeneration", Migration0035],
  [36, "ProjectionThreadsPinned", Migration0036],
  [37, "ProjectionTurnsKeysetIndex", Migration0037],
  [38, "ProjectionThreadsPinOrderKey", Migration0038],
  [39, "ProjectionProjectsDefaultThreadEnvMode", Migration0039],
  [40, "ProjectionProjectFaviconPath", Migration0040],
  [41, "AuthSessionClientConnection", Migration0041],
  [42, "ReconcileUpstreamAndSettingsAdmin", Migration0042],
  [43, "ProjectionBoardPosts", Migration0043],
  [44, "ProjectionBoardPostRevisions", Migration0044],
  [45, "CollectiveExpeditions", Migration0045],
  // Keep this exact identity so deployed journals can still apply their historical migration.
  [50, "ThreadAdapterLaunchBindings", Migration0050],
  [51, "RetireThreadAdapterAuthority", Migration0051],
  [52, "ProjectionThreadLinkedPullRequest", UpstreamMigration0042],
  [53, "ProjectionThreadsUnsettledAt", UpstreamMigration0043],
  [54, "ClearAutomaticProjectModelDefaults", UpstreamMigration0044],
  [55, "ProjectionProjectsAutoPull", UpstreamMigration0045],
  [56, "RepairAutomaticSettlementTimestamps", UpstreamMigration0046],
  [57, "ProjectionProjectIcon", UpstreamMigration0047],
  [58, "PairingEnrollmentClass", Migration0058],
] as const;

export const migrationManifest = migrationEntries.map(([id, name]) => [id, name] as const);

// These are recorded identities from the supported fork histories. They are
// accepted journal evidence, never selectable migration implementations.
const historicalNames = new Map<number, string>([
  [31, "RepairProjectionThreadShellSummary"],
  [32, "ProjectionThreadIssueLink"],
  [33, "AuthAuthorizationScopes"],
  [34, "AuthPairingProofKeyThumbprint"],
  [35, "ProjectionThreadStatusSummary"],
  [36, "ReconcileV0028MigrationHistories"],
  [37, "ProjectionThreadRuntimeSummary"],
  [38, "ProjectionThreadProposedPlanPagingIndex"],
  [39, "ProjectionThreadsSettled"],
  [40, "SettingsAdminClients"],
  [41, "ReconcileUpstreamAndSettingsAdmin"],
  [46, "CollectiveResidentRuntime"],
  [47, "CollectiveResidentTurnSettlements"],
  [48, "CollectiveWeeklyQuotaObservations"],
  [49, "CollectiveFanoutRuns"],
]);
const currentNames = new Map<number, string>(migrationManifest);

/** Selects the single fork lineage before the upstream runner admits any writes. */
export const makeMigrationLoader = (throughId?: number): Migrator.Loader<SqlClient.SqlClient> =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const journal = yield* sql<{ readonly migrationId: number; readonly name: string }>`
      SELECT migration_id AS "migrationId", name FROM effect_sql_migrations
      ORDER BY migration_id ASC
    `.pipe(
      Effect.mapError(
        (cause) =>
          new Migrator.MigrationError({
            cause,
            kind: "Failed",
            message: "Could not inspect the fork migration journal",
          }),
      ),
    );
    for (const row of journal) {
      if (
        currentNames.get(row.migrationId) !== row.name &&
        historicalNames.get(row.migrationId) !== row.name
      ) {
        return yield* new Migrator.MigrationError({
          kind: "Failed",
          message: `Unsupported fork migration identity at ${row.migrationId}: ${row.name}`,
        });
      }
    }
    // Released upgrades may retain a historical prefix before the canonical
    // suffix. A historical identity cannot restart after that suffix begins.
    let canonicalSuffixStarted = false;
    for (const row of journal) {
      if (row.migrationId < 31 || row.migrationId > 41) continue;
      if (row.name === currentNames.get(row.migrationId)) {
        canonicalSuffixStarted = true;
      } else if (canonicalSuffixStarted) {
        return yield* new Migrator.MigrationError({
          kind: "Failed",
          message: `Unsupported fork migration lineage at ${row.migrationId}: historical identity after canonical suffix`,
        });
      }
    }
    const retiredEntries = journal.filter(
      ({ migrationId }) => migrationId >= 46 && migrationId <= 49,
    );
    if (retiredEntries.length !== 0 && retiredEntries.length !== 4) {
      return yield* new Migrator.MigrationError({
        kind: "Failed",
        message: "Unsupported fork migration lineage: incomplete retired 46 through 49 group",
      });
    }
    const latest = journal.at(-1)?.migrationId ?? 0;
    const applied = new Set(journal.map((row) => row.migrationId));
    for (const [id] of migrationManifest) {
      if (id <= latest && !applied.has(id)) {
        return yield* new Migrator.MigrationError({
          kind: "Failed",
          message: `Incomplete fork migration history: missing ${id}`,
        });
      }
    }
    const fresh = journal.length === 0;
    return yield* Migrator.fromRecord(
      Object.fromEntries(
        migrationEntries
          .filter(([id]) => throughId === undefined || id <= throughId)
          .map(([id, name, migration]) => [
            `${id}_${name}`,
            // Preserve the deployed 50 identity without rebuilding retired state on a fresh install.
            fresh && id === 50 ? Effect.void : migration,
          ]),
      ),
    );
  });
