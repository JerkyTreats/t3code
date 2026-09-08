export interface VoicePlaybackState {
  readonly phase: "idle" | "loading" | "playing" | "error";
  readonly error: string | null;
  readonly replayText: string | null;
}

export interface VoicePlaybackResource {
  play(): void;
  dispose(): void;
}

export class VoicePlayback {
  state: VoicePlaybackState = { phase: "idle", error: null, replayText: null };
  private generation = 0;
  private request: AbortController | null = null;
  private resource: VoicePlaybackResource | null = null;
  private audioQueue = Promise.resolve();
  private ownsAudio = false;

  constructor(
    private readonly dependencies: {
      speech(text: string, signal: AbortSignal): Promise<Uint8Array>;
      activate(): Promise<void>;
      deactivate(): Promise<void>;
      create(bytes: Uint8Array, finished: (error?: string) => void): VoicePlaybackResource;
      changed(state: VoicePlaybackState): void;
    },
  ) {}

  private publish(patch: Partial<VoicePlaybackState>) {
    this.state = { ...this.state, ...patch };
    this.dependencies.changed(this.state);
  }

  async stop(clearReplay = false) {
    ++this.generation;
    this.request?.abort();
    this.request = null;
    const resource = this.resource;
    this.resource = null;
    this.publish({ phase: "idle", error: null, ...(clearReplay ? { replayText: null } : {}) });
    // Serialize audio ownership so a delayed release cannot deactivate a new
    // recording session after its caller has awaited stop.
    if (this.ownsAudio) {
      this.ownsAudio = false;
      this.audioQueue = this.audioQueue.catch(() => undefined).then(this.dependencies.deactivate);
    }
    try {
      resource?.dispose();
    } finally {
      const releasing = this.audioQueue;
      this.audioQueue = releasing.catch(() => undefined);
      await releasing;
    }
  }

  async play(text: string) {
    const stopping = this.stop();
    const generation = this.generation;
    try {
      await stopping;
      if (generation !== this.generation) return;
      this.request = new AbortController();
      this.publish({ phase: "loading", error: null, replayText: text });
      const bytes = await this.dependencies.speech(text, this.request.signal);
      if (generation !== this.generation) return;
      this.ownsAudio = true;
      this.audioQueue = this.audioQueue.catch(() => undefined).then(this.dependencies.activate);
      await this.audioQueue;
      if (generation !== this.generation) return;
      this.resource = this.dependencies.create(bytes, (error) => {
        if (generation !== this.generation) return;
        const stopped = this.stop();
        const stoppedGeneration = this.generation;
        void stopped
          .catch(() => undefined)
          .then(() => {
            if (error && stoppedGeneration === this.generation)
              this.publish({ phase: "error", error });
          });
      });
      this.resource.play();
      this.publish({ phase: "playing" });
    } catch (error) {
      if (generation !== this.generation) return;
      const stopping = this.stop();
      const stoppedGeneration = this.generation;
      await stopping.catch(() => undefined);
      if (stoppedGeneration !== this.generation) return;
      this.publish({
        phase: "error",
        error: error instanceof Error ? error.message : "Spoken reply could not play.",
      });
    }
  }
}
