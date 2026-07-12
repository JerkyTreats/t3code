import { useAtomValue } from "@effect/atom-react";
import { useEffect } from "react";

import { environmentCatalog } from "~/connection/catalog";
import { connectionFlightRecorder } from "../connectionFlightRecorderHistory";

export function ConnectionDiagnosticsRecorder() {
  const entries = useAtomValue(environmentCatalog.diagnosticsValueAtom);

  useEffect(() => {
    connectionFlightRecorder.record(entries);
  }, [entries]);

  return null;
}
