import {
  type AuthClientPresentationMetadata,
  ServerPrepareTriageError,
  type ServerPrepareTriageInput,
  type ServerPrepareTriageResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
import { serverVersion } from "../serverVersion.ts";
import { buildTriageAppPrompt } from "./triagePrompt.ts";
import { writeTriageSession } from "./triageSession.ts";

/**
 * Starts in-app triage sessions from the same files `t3 triage` writes. The
 * server never clones, fetches or prunes source on its own: the playbook asks
 * the user to approve the exact origin source and destination first.
 */
export class TriageService extends Context.Service<
  TriageService,
  {
    readonly prepare: (
      input: ServerPrepareTriageInput,
    ) => Effect.Effect<ServerPrepareTriageResult, ServerPrepareTriageError>;
  }
>()("t3/triage/TriageService") {}

const describeClient = (client: AuthClientPresentationMetadata) =>
  [
    client.label ?? "an unknown client",
    client.appVersion === undefined ? undefined : `version ${client.appVersion}`,
    client.os === undefined ? undefined : `on ${client.os}`,
    client.browser === undefined ? undefined : `in ${client.browser}`,
    client.webDeployment === "hosted" ? "(hosted web app)" : undefined,
  ]
    .filter((part) => part !== undefined)
    .join(" ");

const make = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const prepare: TriageService["Service"]["prepare"] = Effect.fn("TriageService.prepare")(
    function* (input) {
      const session = yield* writeTriageSession({
        baseDir: config.baseDir,
        paths: config,
        entry: { kind: "app", client: describeClient(input.client) },
        server: `running (pid ${String(process.pid)}, version ${serverVersion}); this session runs inside it`,
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, fs),
        Effect.provideService(Path.Path, path),
        Effect.mapError((cause) => new ServerPrepareTriageError({ cause })),
      );
      return { prompt: buildTriageAppPrompt(session.promptFilePath) };
    },
  );

  return TriageService.of({ prepare });
});

export const layer = Layer.effect(TriageService, make);
