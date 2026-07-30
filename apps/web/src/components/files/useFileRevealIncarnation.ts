import { type RefObject, useLayoutEffect, useMemo, useRef } from "react";

import {
  createFileRevealIncarnation,
  type FileRevealIncarnation,
  ownsFileRevealIncarnation,
} from "./fileLineReveal";

export function useFileRevealIncarnation(input: FileRevealIncarnation): {
  incarnation: FileRevealIncarnation;
  currentIncarnationRef: RefObject<FileRevealIncarnation | null>;
} {
  const incarnation = useMemo(
    () => createFileRevealIncarnation(input),
    [input.ownerKey, input.relativePath, input.revealRequestId],
  );
  const currentIncarnationRef = useRef<FileRevealIncarnation | null>(incarnation);
  currentIncarnationRef.current = incarnation;
  useLayoutEffect(() => {
    currentIncarnationRef.current = incarnation;
    return () => {
      if (ownsFileRevealIncarnation(currentIncarnationRef.current, incarnation)) {
        currentIncarnationRef.current = null;
      }
    };
  }, [incarnation]);
  return { incarnation, currentIncarnationRef };
}
