# F30 native thread interactions

Status: source implementation under staging acceptance

## Ownership

T3 owns one durable interaction resource inside the existing thread authority. It owns creation, retrieval, engagement leases, cancellation, terminal resolution, and continuation admission. The existing `ProviderCommandReactor` is the only executor that may start the continuation turn.

Wallpaper owns native rendering and input receipts. The interaction PDS owns condition evaluation and qualification. Electron main is a narrow transport and evidence adapter. The renderer paints frames and forwards pointer input only while it holds the exact server lease and has received the native armed acknowledgment.

There is no second conversation store, provider executor, generic process launcher, browser guest, or synthetic JavaScript renderer.

## Public resource boundary

The authenticated owner surface is:

- `POST /api/interactions`
- `GET /api/interactions/:interactionId?threadId=:threadId`
- `POST /api/interactions/:interactionId/resolve`

Create binds the interaction to an existing thread turn, the immutable request identity, and the authenticated actor. Resolve must match the full request tuple, current resource revision, qualified owner receipt, engagement epoch, and requested provenance, and it records the authenticated resolving actor. Actor identity participates in the durable event and exact operation fingerprint. Source sequences and native monotonic times remain canonical decimal strings so JavaScript never rounds native unsigned 64 bit values.

An exact retry uses the durable command receipt. Interaction commands also persist a canonical payload fingerprint. Reusing an operation identity with changed content is a conflict rather than a replay.

The initial staging increment reuses the existing orchestration read and operate scopes. These credentials are staging maintainer capabilities and are not a claim of request-scoped delegated owner authority. Normal origin, CSRF, authentication, and scope enforcement still apply. A future production rollout needs the narrower interaction grant described by the design report before enabling this capability for less trusted clients.

## Durable state and recovery

Interaction snapshots are stored as a reserved durable thread activity payload and projected into `thread.interactions`. Reserved rows are excluded from ordinary activities and tool folding. This is a deliberate smaller implementation than the proposed dedicated projection table. The rows are not subject to the in-memory activity cap, and exact retrieval remains available through the interaction GET route.

Create, cancel, resolve, engagement, presentation, and continuation transitions are serialized by the thread command queue. Thread deletion first records cancellation for every open interaction. A human turn that wins before provider submission returns an admitted continuation to pending. A human turn cannot cross a continuation already in the submitting state. Startup recovery marks an interrupted submitting state ambiguous instead of risking a duplicate provider start.

Only a satisfied resolution with retained evidence requests a continuation. Admission uses a stable command identity derived from the interaction and resolution revision. The visible admitted, submitting, or started state is the receipt consumed by `t3.interaction_resolve_and_await_continuation` version 1. Its exact capability content identity is `capability-contract-1f57a21badb3dfe994c184f3af5873872f4753ff7aa510b6bfd2c949f67c3aff`.

That capability binds `t3.base-url` and the private `t3.access-token-file`, consumes `interaction_qualified_receipt`, and emits `t3_interaction_continuation_admission`. The output records request identity, interaction and thread identity, current resource and resolution revisions, snapshot sequence, owner receipt, qualified evidence reference and digest, continuation identity, and a continuation state of admitted, submitting, or started.

## Desktop capability boundary

Electron main accepts only two root-configured executable bindings:

- `T3_INTERACTION_BINARY_PATH` and `T3_INTERACTION_BINARY_SHA256`
- `T3_INTERACTION_OWNER_BINARY_PATH` and `T3_INTERACTION_OWNER_BINARY_SHA256`

`T3_INTERACTION_OWNER_STATE_ROOT` selects the trusted external owner state directory. Paths must be absolute regular executable artifacts and each lowercase SHA-256 is verified before launch. Neither renderer content nor conversation content can select a path, argument, environment, state root, or working directory. Child environments use a small allowlist.

`T3_INTERACTION_EVIDENCE_ROOT` selects an absolute main-process-only evidence directory so staging and production retention never share state. The host requires that directory to be private and not a symbolic link.

Wallpaper uses the fixed `meld-sim-lab --conversation-stdio --no-audio` invocation and MWI1 framing. The host enforces record sizes, exact dimensions, stream and session identity, presentation revision, monotonic interaction generation, source ordering, frame and input freshness, and an explicit armed fence. Armed and Disarmed records carry the exact generation after their applied transition. Input receipts carry the generation after their final accepted sample, and later frames may advance but never regress it. Cancellation stops input locally and fences later owner admissions. The durable presentation owner includes a unique authenticated WebSocket connection identity, so another connection using the same credential cannot share its lease. Connection teardown explicitly disengages and stops the owned presentation.

The owner adapter invokes the fixed `meld-interaction-owner` binary through the six bounded JSON standard input operations `resource-bind`, `engagement-activate`, `observation-admit`, `engagement-disarm`, `evidence-ack`, and `request-cancel`. Owner results must correlate to the exact operation and immutable request identity. Qualification latches locally, fences later observations, and starts orderly evidence teardown without cancelling qualified state. Electron performs no condition math and never calls T3 resolve.

Evidence is written privately, synced before acknowledgment, bounded to eight mebibytes, and reusable only when an existing artifact has identical bytes. The owner sees an opaque stable evidence identity, never the private host path. T3 stores only the qualified summary, range, digest, and opaque reference. Raw frames and pointer samples never enter the conversation projection.

## Presentation and accessibility

The interaction is a stable inline row anchored after its source turn. Native HTML buttons provide Engage, Disengage, and Cancel controls. Focus is separate from engagement. Enter and Space activate the focused button, Escape disengages, and moving focus away disengages without trapping keyboard navigation. Scrolling the engaged canvas outside the visible viewport, resizing it out of view, or hiding the document synchronously fences pointer delivery and requests explicit disengagement. No autofocus or decorative motion is introduced.

Hosted web clients show truthful native unavailability. Desktop paints only validated native RGBA frames. Pointer events are normalized against the canvas and cross the bridge only after the server lease, native armed acknowledgment, current presentation revision, displayed frame, and provenance all match.

The staging fixture uses the immutable synthetic provenance and the visible title `Synthetic input test`. Physical provenance describes the selected capture path and is not hardware attestation.

## Verification

Focused server, persistence, desktop bridge, owner adapter, timeline, controller, and accessibility tests accompany the implementation. Full repository formatting, lint, typecheck, and test gates are required before this source increment may be accepted or transferred into staging.
