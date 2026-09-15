import {
  CommandId,
  type DesktopInteractionBridge,
  type DesktopInteractionDisarmInput,
  type DesktopInteractionEvent,
  type EnvironmentId,
  type InteractionResource,
} from "@t3tools/contracts";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { randomHex, randomUUID } from "~/lib/utils";
import { threadEnvironment } from "~/state/threads";
import { useAtomCommand } from "~/state/use-atom-command";
import type { InteractionPointerInput } from "./InteractionResourceRow";

interface LocalLease {
  ownerClientId: string;
  engagementEpoch: number;
  resourceRevision: number;
  armed: boolean;
}

interface NativeSession {
  resourceId: string;
  nativeSessionId: string;
  presentationRevision: number | null;
  displayedFrameSequence: string | null;
  droppedFrames: number;
  sourceSequence: bigint;
  lastFrame: Extract<DesktopInteractionEvent, { kind: "Frame" }> | null;
  moveInFlight: boolean;
  requestedDisengageEpochs: Set<number>;
}

export interface NativeInteractionController {
  hostAvailable: boolean;
  ownedInteractionIds: ReadonlySet<string>;
  framedInteractionIds: ReadonlySet<string>;
  engage: (resource: InteractionResource) => void;
  disengage: (resource: InteractionResource) => void;
  cancel: (resource: InteractionResource) => void;
  registerCanvas: (resource: InteractionResource, canvas: HTMLCanvasElement | null) => void;
  pointerInput: (resource: InteractionResource, input: InteractionPointerInput) => void;
}

function currentBridge(): DesktopInteractionBridge | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.interaction ?? null;
}

function nextSourceSequence(session: NativeSession): string {
  session.sourceSequence += 1n;
  return session.sourceSequence.toString();
}

function rendererMonotonicNanoseconds(): string {
  return BigInt(Math.max(0, Math.floor(performance.now() * 1_000_000))).toString();
}

function addDecimalCounter(current: number, value: string): number {
  const total = BigInt(current) + BigInt(value);
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(total);
}

function safeDecimalInteger(value: string): number | null {
  const parsed = BigInt(value);
  return parsed <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(parsed) : null;
}

export function paintInteractionFrame(
  canvas: HTMLCanvasElement,
  frame: Extract<DesktopInteractionEvent, { kind: "Frame" }>,
): boolean {
  const context = canvas.getContext("2d", { alpha: false });
  if (context === null) return false;
  const image = context.createImageData(frame.width, frame.height);
  image.data.set(frame.payload);
  context.putImageData(image, 0, 0);
  return true;
}

export function interactionLeaseMatchesProjection(
  resource: InteractionResource,
  lease: Pick<LocalLease, "ownerClientId" | "engagementEpoch">,
): boolean {
  return (
    resource.engagement.state === "engaged" &&
    resource.engagement.ownerClientId === lease.ownerClientId &&
    resource.engagement.epoch === lease.engagementEpoch &&
    resource.engagement.presentationRevision === resource.presentation.presentationRevision
  );
}

export function useNativeInteractionController(
  environmentId: EnvironmentId,
  interactions: ReadonlyArray<InteractionResource>,
): NativeInteractionController {
  const bridge = currentBridge();
  const setPresentation = useAtomCommand(threadEnvironment.setInteractionPresentation, {
    reportFailure: true,
  });
  const engageInteraction = useAtomCommand(threadEnvironment.engageInteraction, {
    reportFailure: true,
  });
  const disengageInteraction = useAtomCommand(threadEnvironment.disengageInteraction, {
    reportFailure: true,
  });
  const cancelInteraction = useAtomCommand(threadEnvironment.cancelInteraction, {
    reportFailure: true,
  });
  const resources = useMemo(
    () =>
      new Map<string, InteractionResource>(interactions.map((resource) => [resource.id, resource])),
    [interactions],
  );
  const resourcesRef = useRef(resources);
  useLayoutEffect(() => {
    resourcesRef.current = resources;
  }, [resources]);
  const canvasesRef = useRef(new Map<string, HTMLCanvasElement>());
  const sessionRef = useRef<NativeSession | null>(null);
  const startedResourceIdsRef = useRef(new Set<string>());
  const localLeasesRef = useRef(new Map<string, LocalLease>());
  const [localLeases, setLocalLeases] = useState<ReadonlyMap<string, LocalLease>>(new Map());
  const [framedInteractionIds, setFramedInteractionIds] = useState<ReadonlySet<string>>(new Set());

  const replaceLocalLeases = useCallback((next: Map<string, LocalLease>) => {
    localLeasesRef.current = next;
    setLocalLeases(next);
  }, []);

  const reportPresentation = useCallback(
    async (
      resourceId: string,
      state: "starting" | "ready" | "stopped" | "failed",
      presentationRevision: number,
      lastFrameSequence: string | null,
      droppedFrames: number,
    ) => {
      const resource = resourcesRef.current.get(resourceId);
      if (resource === undefined || resource.lifecycle.state !== "open") return;
      await setPresentation({
        environmentId,
        input: {
          operationId: CommandId.make(randomUUID()),
          threadId: resource.threadId,
          interactionId: resource.id,
          resourceRevision:
            localLeasesRef.current.get(resourceId)?.resourceRevision ?? resource.revision,
          presentationRevision,
          state,
          lastFrameSequence,
          droppedFrames,
        },
      });
    },
    [environmentId, setPresentation],
  );

  const persistDisengagement = useCallback(
    async (resourceId: string, leaseRevision?: number) => {
      const resource = resourcesRef.current.get(resourceId);
      if (resource === undefined || resource.lifecycle.state !== "open") return;
      await disengageInteraction({
        environmentId,
        input: {
          operationId: CommandId.make(randomUUID()),
          threadId: resource.threadId,
          interactionId: resource.id,
          resourceRevision: leaseRevision ?? resource.revision,
          presentationRevision: resource.presentation.presentationRevision,
        },
      });
    },
    [disengageInteraction, environmentId],
  );

  const disarmById = useCallback(
    (resourceId: string, reason: DesktopInteractionDisarmInput["reason"], persist: boolean) => {
      const lease = localLeasesRef.current.get(resourceId);
      if (lease === undefined) return;
      const session = sessionRef.current;
      const nextLeases = new Map(localLeasesRef.current);
      nextLeases.delete(resourceId);
      replaceLocalLeases(nextLeases);
      if (session?.resourceId === resourceId && bridge !== null) {
        session.requestedDisengageEpochs.add(lease.engagementEpoch);
        void bridge
          .disarm({
            nativeSessionId: session.nativeSessionId,
            engagementEpoch: lease.engagementEpoch.toString(),
            sourceSequence: nextSourceSequence(session),
            reason,
          })
          .catch(() => undefined);
      }
      if (persist) void persistDisengagement(resourceId, lease.resourceRevision);
    },
    [bridge, persistDisengagement, replaceLocalLeases],
  );

  const handleNativeEvent = useEffectEvent((event: DesktopInteractionEvent) => {
    const session = sessionRef.current;
    if (session === null || event.nativeSessionId !== session.nativeSessionId) return;
    switch (event.kind) {
      case "Ready":
        session.presentationRevision = event.presentationRevision;
        void reportPresentation(
          session.resourceId,
          "ready",
          event.presentationRevision,
          null,
          session.droppedFrames,
        );
        return;
      case "Frame": {
        session.presentationRevision = event.presentationRevision;
        session.droppedFrames = addDecimalCounter(
          session.droppedFrames,
          event.droppedSincePrevious,
        );
        session.lastFrame = event;
        const canvas = canvasesRef.current.get(session.resourceId);
        if (canvas === undefined || !paintInteractionFrame(canvas, event)) return;
        session.displayedFrameSequence = event.frameSequence;
        setFramedInteractionIds((current) =>
          current.has(session.resourceId) ? current : new Set([...current, session.resourceId]),
        );
        return;
      }
      case "Armed": {
        const epoch = safeDecimalInteger(event.engagementEpoch);
        const lease = localLeasesRef.current.get(session.resourceId);
        if (epoch === null || lease?.engagementEpoch !== epoch) {
          disarmById(session.resourceId, "protocol-fault", true);
          return;
        }
        replaceLocalLeases(
          new Map(localLeasesRef.current).set(session.resourceId, { ...lease, armed: true }),
        );
        return;
      }
      case "Disarmed": {
        const epoch = safeDecimalInteger(event.engagementEpoch);
        if (epoch === null) {
          disarmById(session.resourceId, "protocol-fault", true);
          return;
        }
        const requested = session.requestedDisengageEpochs.delete(epoch);
        const lease = localLeasesRef.current.get(session.resourceId);
        if (lease?.engagementEpoch === epoch) {
          const nextLeases = new Map(localLeasesRef.current);
          nextLeases.delete(session.resourceId);
          replaceLocalLeases(nextLeases);
        }
        if (!requested && epoch > 0) {
          void persistDisengagement(session.resourceId, lease?.resourceRevision);
        }
        return;
      }
      case "Fault":
        if (!event.terminal) return;
        void reportPresentation(
          session.resourceId,
          "failed",
          session.presentationRevision ?? 0,
          session.displayedFrameSequence,
          session.droppedFrames,
        );
        disarmById(session.resourceId, "protocol-fault", false);
        if (bridge !== null) {
          void bridge.stop({
            nativeSessionId: session.nativeSessionId,
            reason: "protocol-fault",
          });
        }
        sessionRef.current = null;
        return;
      case "Terminal":
        void reportPresentation(
          session.resourceId,
          event.outcome === "success" ? "stopped" : "failed",
          session.presentationRevision ?? 0,
          event.finalFrameSequence === "0" ? null : event.finalFrameSequence,
          addDecimalCounter(0, event.droppedFrameCount),
        );
        disarmById(session.resourceId, "stop", false);
        sessionRef.current = null;
        return;
      case "InputReceipt":
      case "EvidenceReady":
        return;
    }
  });

  useEffect(() => {
    if (bridge === null) return;
    return bridge.onEvent(handleNativeEvent);
  }, [bridge]);

  useEffect(() => {
    if (bridge === null || sessionRef.current !== null) return;
    const resource = interactions.find(
      (entry) =>
        entry.lifecycle.state === "open" &&
        entry.presentation.state !== "stopped" &&
        entry.presentation.state !== "failed" &&
        !startedResourceIdsRef.current.has(entry.id),
    );
    if (resource === undefined) return;
    const session: NativeSession = {
      resourceId: resource.id,
      nativeSessionId: randomHex(16),
      presentationRevision: null,
      displayedFrameSequence: null,
      droppedFrames: 0,
      sourceSequence: 0n,
      lastFrame: null,
      moveInFlight: false,
      requestedDisengageEpochs: new Set(),
    };
    startedResourceIdsRef.current.add(resource.id);
    sessionRef.current = session;
    void bridge
      .start({
        nativeSessionId: session.nativeSessionId,
        threadId: resource.threadId,
        requestRef: resource.request.ref,
        requestRevision: resource.request.revision,
        requestDigest: resource.request.digest,
        interactionId: resource.id,
        resourceRevision: resource.revision,
        conditionRevision: resource.request.conditionRevision,
        resourceBindingProvenance: resource.request.inputProvenance,
      })
      .catch(() => {
        if (sessionRef.current === session) sessionRef.current = null;
        void reportPresentation(
          resource.id,
          "failed",
          resource.presentation.presentationRevision,
          null,
          0,
        );
      });
  }, [bridge, interactions, reportPresentation]);

  useEffect(() => {
    const currentIds = new Set<string>(interactions.map((resource) => resource.id));
    for (const id of startedResourceIdsRef.current) {
      if (!currentIds.has(id)) startedResourceIdsRef.current.delete(id);
    }
    const session = sessionRef.current;
    if (session === null || bridge === null) return;
    const resource = resourcesRef.current.get(session.resourceId);
    if (resource !== undefined && resource.lifecycle.state === "open") return;
    disarmById(session.resourceId, "navigation", true);
    void bridge.stop({ nativeSessionId: session.nativeSessionId, reason: "navigation" });
  }, [bridge, disarmById, interactions]);

  useEffect(() => {
    for (const [resourceId, lease] of localLeasesRef.current) {
      const resource = resources.get(resourceId);
      if (resource === undefined) {
        disarmById(resourceId, "navigation", false);
        continue;
      }
      if (
        resource.engagement.state === "engaged" &&
        (resource.engagement.ownerClientId !== lease.ownerClientId ||
          resource.engagement.epoch !== lease.engagementEpoch)
      ) {
        disarmById(resourceId, "lease-loss", false);
        continue;
      }
      if (
        resource.engagement.state === "engaged" &&
        resource.engagement.presentationRevision !== resource.presentation.presentationRevision
      ) {
        disarmById(resourceId, "lease-loss", true);
        continue;
      }
      if (
        resource.engagement.state === "disengaged" &&
        resource.engagement.latestEpoch >= lease.engagementEpoch
      ) {
        disarmById(resourceId, "lease-loss", false);
      }
    }
  }, [disarmById, resources]);

  useEffect(() => {
    const releaseForVisibility = () => {
      if (document.visibilityState !== "hidden") return;
      for (const resourceId of localLeasesRef.current.keys()) {
        disarmById(resourceId, "visibility-loss", true);
      }
    };
    const releaseForBlur = () => {
      for (const resourceId of localLeasesRef.current.keys()) {
        disarmById(resourceId, "blur", true);
      }
    };
    document.addEventListener("visibilitychange", releaseForVisibility);
    window.addEventListener("blur", releaseForBlur);
    return () => {
      document.removeEventListener("visibilitychange", releaseForVisibility);
      window.removeEventListener("blur", releaseForBlur);
    };
  }, [disarmById]);

  useEffect(
    () => () => {
      const session = sessionRef.current;
      if (session === null || bridge === null) return;
      void reportPresentation(
        session.resourceId,
        "stopped",
        session.presentationRevision ?? 0,
        session.displayedFrameSequence,
        session.droppedFrames,
      );
      for (const resourceId of localLeasesRef.current.keys()) {
        disarmById(resourceId, "navigation", false);
      }
      void bridge.stop({ nativeSessionId: session.nativeSessionId, reason: "navigation" });
      sessionRef.current = null;
    },
    [bridge, disarmById, reportPresentation],
  );

  const engage = useCallback(
    async (requestedResource: InteractionResource) => {
      if (bridge === null) return;
      const resource = resourcesRef.current.get(requestedResource.id);
      const session = sessionRef.current;
      if (
        resource === undefined ||
        session?.resourceId !== resource.id ||
        resource.lifecycle.state !== "open" ||
        resource.presentation.state !== "ready" ||
        resource.engagement.state !== "disengaged" ||
        session.presentationRevision !== resource.presentation.presentationRevision ||
        session.displayedFrameSequence === null
      ) {
        return;
      }
      const result = await engageInteraction({
        environmentId,
        input: {
          operationId: CommandId.make(randomUUID()),
          threadId: resource.threadId,
          interactionId: resource.id,
          resourceRevision: resource.revision,
          presentationRevision: resource.presentation.presentationRevision,
        },
      });
      if (result._tag !== "Success" || result.value.engagementEpoch <= 0) return;
      const lease: LocalLease = {
        ownerClientId: result.value.ownerClientId,
        engagementEpoch: result.value.engagementEpoch,
        resourceRevision: result.value.resourceRevision,
        armed: false,
      };
      replaceLocalLeases(new Map(localLeasesRef.current).set(resource.id, lease));
      const activationReleaseSourceSequence = nextSourceSequence(session);
      try {
        await bridge.arm({
          nativeSessionId: session.nativeSessionId,
          presentationRevision: resource.presentation.presentationRevision,
          engagementEpoch: lease.engagementEpoch.toString(),
          activationReleaseSourceSequence,
          provenanceClass: resource.request.inputProvenance,
        });
      } catch {
        disarmById(resource.id, "protocol-fault", true);
      }
    },
    [bridge, disarmById, engageInteraction, environmentId, replaceLocalLeases],
  );

  const disengage = useCallback(
    (resource: InteractionResource) => disarmById(resource.id, "visible-control", true),
    [disarmById],
  );

  const cancel = useCallback(
    async (requestedResource: InteractionResource) => {
      const resource = resourcesRef.current.get(requestedResource.id);
      if (resource === undefined || resource.lifecycle.state !== "open") return;
      const leaseRevision = localLeasesRef.current.get(resource.id)?.resourceRevision;
      disarmById(resource.id, "cancel", false);
      const session = sessionRef.current;
      if (session?.resourceId === resource.id && bridge !== null) {
        void bridge.stop({ nativeSessionId: session.nativeSessionId, reason: "cancel" });
      }
      await cancelInteraction({
        environmentId,
        input: {
          operationId: CommandId.make(randomUUID()),
          threadId: resource.threadId,
          interactionId: resource.id,
          resourceRevision: leaseRevision ?? resource.revision,
          presentationRevision: resource.presentation.presentationRevision,
        },
      });
    },
    [bridge, cancelInteraction, disarmById, environmentId],
  );

  const registerCanvas = useCallback(
    (resource: InteractionResource, canvas: HTMLCanvasElement | null) => {
      if (canvas === null) {
        canvasesRef.current.delete(resource.id);
        return;
      }
      canvasesRef.current.set(resource.id, canvas);
      const session = sessionRef.current;
      if (session?.resourceId !== resource.id || session.lastFrame === null) return;
      if (paintInteractionFrame(canvas, session.lastFrame)) {
        session.displayedFrameSequence = session.lastFrame.frameSequence;
      }
    },
    [],
  );

  const pointerInput = useCallback(
    (requestedResource: InteractionResource, input: InteractionPointerInput) => {
      if (!input.isTrusted || bridge === null) return;
      const resource = resourcesRef.current.get(requestedResource.id);
      const lease = localLeasesRef.current.get(requestedResource.id);
      const session = sessionRef.current;
      if (
        resource === undefined ||
        lease === undefined ||
        !lease.armed ||
        !interactionLeaseMatchesProjection(resource, lease) ||
        session?.resourceId !== resource.id ||
        session.presentationRevision !== resource.presentation.presentationRevision ||
        session.displayedFrameSequence === null ||
        (input.phase === "move" && session.moveInFlight)
      ) {
        return;
      }
      if (input.phase === "move") session.moveInFlight = true;
      void bridge
        .input({
          nativeSessionId: session.nativeSessionId,
          presentationRevision: resource.presentation.presentationRevision,
          displayedFrameSequence: session.displayedFrameSequence,
          engagementEpoch: lease.engagementEpoch.toString(),
          sourceSequence: nextSourceSequence(session),
          phase: input.phase,
          normalizedX: input.normalizedX,
          normalizedY: input.normalizedY,
          clientMonotonicNs: rendererMonotonicNanoseconds(),
          provenanceClass: resource.request.inputProvenance,
        })
        .then((accepted) => {
          if (!accepted) disarmById(resource.id, "input-overflow", true);
        })
        .catch(() => disarmById(resource.id, "protocol-fault", true))
        .finally(() => {
          if (input.phase === "move") session.moveInFlight = false;
        });
    },
    [bridge, disarmById],
  );

  const ownedInteractionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const resource of interactions) {
      const lease = localLeases.get(resource.id);
      if (lease?.armed === true && interactionLeaseMatchesProjection(resource, lease)) {
        ids.add(resource.id);
      }
    }
    return ids;
  }, [interactions, localLeases]);

  return {
    hostAvailable: bridge !== null,
    ownedInteractionIds,
    framedInteractionIds,
    engage,
    disengage,
    cancel,
    registerCanvas,
    pointerInput,
  };
}
