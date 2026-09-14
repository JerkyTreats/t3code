# Shared interaction boundaries

Status: exploratory architecture constraint. No runtime behavior is implemented by this document.

## Product boundary

T3 Code owns authenticated conversation state for a live interaction resource. The resource is attached to the initiating position in a thread and remains visible there after the provider turn ends. Its lifecycle is independent from provider session lifetime, presentation lifetime, input engagement, and any later continuation turn.

The interaction PDS and its external owner define condition meaning. Meld owns condition reconciliation and asks T3 Code for continuation after it has accepted the condition. Wallpaper owns native simulation output and scoped input handling. T3 Code must not duplicate those authorities.

T3 Code must never treat Markdown, raw HTML, a discovered preview URL, or an arbitrary executable path as authority to create or run a native surface.

## Thread-owned state

Interaction state belongs to the existing thread command, event, and projection model. No standalone interaction store or scheduler is selected.

The durable state must cover these relationships:

- stable interaction identity
- initiating thread and causal message or turn anchor
- immutable owner-held request reference and condition revision
- lifecycle revision
- presentation availability and supported client class
- terminal status and bounded evidence reference
- continuation request identity and admitted continuation result
- cancellation, expiry, failure, and cleanup truth

Create, resolve, cancel, and continuation admission must carry stable idempotency identities. Reusing an identity for different content must fail. A repeated identical command must return the prior accepted or rejected receipt without repeating its side effect. Retrieval is read only and must never resurrect terminal state.

The existing command receipt model is a suitable admission foundation. Exactly once continuation across process failure is not established until durable reactor recovery is proved.

## Lifecycle authority

Creation starts disengaged. T3 Code authenticates the caller, binds the resource to one current thread, records its causal anchor, and admits only a recognized owner reference. T3 Code does not interpret the condition parameter grammar.

Meld may submit a terminal condition receipt through an authenticated server boundary. T3 Code verifies identity, thread binding, lifecycle revision, and terminal transition eligibility. It records the receipt reference and status but does not independently claim that the sensory condition is true.

Continuation is a separate admitted action after successful resolution. It uses the ordinary provider turn path with explicit interaction receipt context. The source is recorded as server-originated interaction continuation and must not appear as a human-authored message.

Admission must arbitrate these races in the thread decider:

- duplicate create, resolve, cancel, and continuation requests
- completion after cancellation or expiry
- cancellation during completion
- a continuation request while another turn is active
- provider unavailability or session replacement
- stale client state and reconnect replay
- thread archive or deletion

Policy for queueing behind an active turn remains a product decision. Silent steering into a running turn is not allowed.

## Presentation boundary

The first integrated host target is the desktop client. Web, mobile, and T3 Thread must render truthful status and unsupported presentation state. They do not gain native hosting parity by sharing conversation contracts.

The current browser preview is precedent for leased rectangle placement, viewport bookkeeping, crash reporting, and presentation restoration. It is not a native program host. Electron `WebContentsView` displays Electron `WebContents`. Electron offscreen rendering exports Electron-rendered content to a bitmap or shared texture. Neither primitive proves that Electron can import or parent an arbitrary external native window. See [WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view) and [Offscreen rendering](https://www.electronjs.org/docs/latest/tutorial/offscreen-rendering).

The native producer and presentation bridge belong to the harness owner. A T3 desktop adapter may present an authorized native output stream and return scoped input through that bridge. The adapter must accept a typed resource descriptor, never an executable path or shell command. Candidate frame transport and platform support remain unproved.

The presented output must come from the actual native Wallpaper runtime. A reimplemented browser simulation, screenshot-only card, detached native window, or synthetic pointer stream does not satisfy the integrated product proof.

## Input engagement

Input begins disarmed. The timeline shows a visible engage control and a visible engaged state. The activation click changes state only and must not count as task input.

An engagement lease is scoped to one interaction, one presentation, one client connection, and one engagement epoch. T3 server admission arbitrates concurrent clients. The desktop adapter disarms locally before waiting for a server acknowledgement whenever trustworthy presentation or input ownership is lost.

Disarm on these transitions:

- Escape or the visible disengage control
- application or surface blur
- document visibility loss
- timeline navigation or surface replacement
- the resource scrolling outside its trusted visible region
- occlusion that prevents trustworthy interaction
- connection loss, lease expiry, cancellation, or terminal resolution
- native producer failure or presentation teardown

Re-engagement creates a new epoch. Input carrying an old epoch or non-monotonic source sequence is rejected. Passive pointer traversal, stationary hover, background movement, synthetic events, and the activation click cannot become condition evidence.

While disengaged, wheel and pointer input belong to the conversation. While engaged, only the declared pointer actions route to the native surface. Escape and the visible disengage control remain owned by T3 Code. Keyboard and wheel forwarding require an explicit per-resource capability and must not be enabled by default.

## Evidence and privacy

High-rate pointer events and raw recordings do not enter the conversation event stream. Wallpaper and the condition owner retain bounded artifacts under their own authority. T3 Code stores only the minimum status, revision, provenance summary, and opaque evidence reference required for lifecycle and continuation.

Artifacts must be saved before normal teardown. Capture failure, native crash, cancellation, expiry, and cleanup failure remain distinct truthful outcomes. A saved video is evidence, not a replayable checkpoint.

Resource access uses environment authentication and thread authorization. Presentation tokens and evidence references must be scoped, short lived where possible, and absent from message text, logs, screenshots, and public documentation.

## Client and connection behavior

Desktop may engage only when a compatible authorized harness presentation is available in the owning environment. A remote browser, mobile client, or T3 Thread instance may observe lifecycle state and request allowed cancellation, but the first proof must report native engagement as unsupported there.

Local, relay, and tunnel connections carry the same authenticated thread contracts. This does not prove that native frames or high-rate input can traverse every mode. The first proof must not expose the harness through new network routes or promise remote presentation.

Reconnect uses the projected thread snapshot and sequence replay. A client must display the current revision before it may request engagement. Reconnect does not restore an engagement lease automatically.

## Provider boundary

Provider adapters receive a normal admitted turn with bounded interaction receipt context. They do not own interaction lifecycle, condition meaning, or evidence retention.

Promptless continuation is optional adapter capability. Codex support for a continuation flag and its in-memory `Deferred` request waits are useful precedents, but they do not establish a durable wait that outlives a provider turn. Other providers may receive explicit receipt context through the ordinary turn input path.

Provider failure after continuation admission must remain visible and retryable under a new authorized request or a defined recovery rule. It must not cause a duplicate hidden turn.

## Proof gates

The architecture remains unproved until a bounded experiment demonstrates all of these facts:

- actual native Wallpaper output is presented at the causal timeline position
- a deliberate engagement epoch routes actual user input to that runtime
- passive and stale input are rejected
- the provider turn may finish while the interaction remains pending
- Meld reconciles the owner condition without an LLM polling loop
- one authenticated continuation is admitted with interaction provenance
- reconnect, cancellation, crash, and teardown remain truthful
- unsupported clients and connection modes fail closed

No claim in this document authorizes runtime implementation or activation.
