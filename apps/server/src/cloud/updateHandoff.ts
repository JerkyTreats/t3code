/**
 * Whether this server is going down only to be replaced by an update. Shutdown
 * keeps the managed tunnel across those restarts instead of releasing it.
 */
import { DESKTOP_UPDATE_RESTART_MARKER_FILE } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as ServerConfig from "../config.ts";
// The desktop app stops its backends within seconds of writing the marker.
const DESKTOP_UPDATE_RESTART_MARKER_TTL = Duration.minutes(1);

// The desktop app writes its marker right before it stops this server to
// install an update, whether a remote client or the local app started it.
// Reading consumes it, so shutdown checks it first. Only a fresh marker counts,
// so a marker the server never read (a hard kill) cannot keep the tunnel on a
// later quit.
export const desktopUpdateRestartPending = Effect.gen(function* () {
  const config = yield* ServerConfig.ServerConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const markerPath = path.join(config.baseDir, "runtime", DESKTOP_UPDATE_RESTART_MARKER_FILE);
  const marker = yield* fs.stat(markerPath).pipe(Effect.option);
  if (Option.isNone(marker)) {
    return false;
  }
  yield* fs.remove(markerPath).pipe(Effect.ignore);
  const now = yield* Clock.currentTimeMillis;
  return Option.match(marker.value.mtime, {
    onNone: () => false,
    onSome: (writtenAt) =>
      now - writtenAt.getTime() < Duration.toMillis(DESKTOP_UPDATE_RESTART_MARKER_TTL),
  });
});
