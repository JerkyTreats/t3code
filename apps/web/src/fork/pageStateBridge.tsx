import { useAtomValue } from "@effect/atom-react";
import {
  type EnvironmentId,
  type PageStateDocument,
  PageStateError,
  type PageStateWriteInput,
  type ScopedThreadRef,
  type ThreadId,
} from "@t3tools/contracts";
import {
  htmlRenderStateChanged,
  htmlRenderStateRefused,
  htmlRenderStateWithoutHost,
  htmlRenderStateWritten,
  readHtmlRenderStateSubscribe,
  readHtmlRenderStateWrite,
} from "@t3tools/shared/htmlRender";
import * as Cause from "effect/Cause";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/reactivity";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { pageStateDocument, pageStateWrite } from "../state/pageState";
import { useAtomCommand } from "../state/use-atom-command";

const isPageStateError = Schema.is(PageStateError);

// A page names the keys it reads; past this many, a page is fishing rather than reading.
const MAX_KEYS_PER_PAGE = 64;

function PageStateFeed(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly stateKey: string;
  readonly onDocument: (document: PageStateDocument) => void;
}) {
  const { environmentId, threadId, stateKey, onDocument } = props;
  const result = useAtomValue(
    pageStateDocument({ environmentId, input: { threadId, key: stateKey } }),
  );
  const document = AsyncResult.isSuccess(result) ? result.value : null;
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- posts each server value into the page's sandboxed frame
  useEffect(() => {
    if (document !== null) onDocument(document);
  }, [document, onDocument]);
  return null;
}

/**
 * Serves `t3.state` to a page in a frame: follows the keys the page subscribes to, posting each
 * value in, and saves the page's writes as the reader's. `onMessage` takes the page's messages and
 * says whether it handled one; `feeds` must render beside the frame.
 */
export function usePageStateBridge(
  threadRef: ScopedThreadRef | undefined,
  frameRef: RefObject<HTMLIFrameElement | null>,
): { readonly onMessage: (data: unknown) => boolean; readonly feeds: ReactNode } {
  const [keys, setKeys] = useState<ReadonlyArray<string>>([]);
  const documents = useRef(new Map<string, PageStateDocument>());
  const environmentId = threadRef?.environmentId ?? null;
  const canWrite = useAtomValue(pageStateWrite.permissionAtom(environmentId));
  const write = useAtomCommand(pageStateWrite, { reportFailure: false });
  const post = (message: unknown) => frameRef.current?.contentWindow?.postMessage(message, "*");
  const [onDocument] = useState(() => (document: PageStateDocument) => {
    documents.current.set(document.key, document);
    frameRef.current?.contentWindow?.postMessage(htmlRenderStateChanged(document), "*");
  });

  const onMessage = (data: unknown) => {
    if (threadRef === undefined) {
      const reply = htmlRenderStateWithoutHost(data, "unavailable", "This page has no thread.");
      if (reply !== undefined) post(reply);
      return reply !== undefined;
    }
    const key = readHtmlRenderStateSubscribe(data);
    if (key !== undefined) {
      const known = documents.current.get(key);
      // A reloaded page subscribes again to a key this frame already follows.
      if (known !== undefined) post(htmlRenderStateChanged(known));
      else
        setKeys((current) =>
          current.includes(key) || current.length >= MAX_KEYS_PER_PAGE
            ? current
            : [...current, key],
        );
      return true;
    }
    const request = readHtmlRenderStateWrite(data);
    if (request === undefined) return false;
    const { id, ...change } = request;
    if (threadRef === undefined) {
      post(
        htmlRenderStateRefused(id, { code: "unavailable", message: "This page has no thread." }),
      );
    } else if (!canWrite) {
      post(
        htmlRenderStateRefused(id, { code: "read_only", message: "You can only view this page." }),
      );
    } else {
      void write({
        environmentId: threadRef.environmentId,
        // The page's bootstrap sends plain JSON, and the server decodes it as JSON again.
        input: { threadId: threadRef.threadId, ...change } as PageStateWriteInput,
      }).then((result) => {
        if (AsyncResult.isSuccess(result)) {
          post(htmlRenderStateWritten(id, result.value.revision));
          return;
        }
        const error = Cause.squash(result.cause);
        post(
          htmlRenderStateRefused(
            id,
            isPageStateError(error)
              ? { code: error.reason, message: error.message, revision: error.revision }
              : { code: "unavailable", message: "Could not save; reconnect and try again." },
          ),
        );
      });
    }
    return true;
  };

  const feeds =
    threadRef === undefined
      ? null
      : keys.map((key) => (
          <PageStateFeed
            key={key}
            environmentId={threadRef.environmentId}
            threadId={threadRef.threadId}
            stateKey={key}
            onDocument={onDocument}
          />
        ));
  return { onMessage, feeds };
}
