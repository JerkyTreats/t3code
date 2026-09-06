import { PROVIDER_SEND_TURN_MAX_ATTACHMENTS } from "@t3tools/contracts";

export function composerAttachmentScope(input: {
  environmentId: string;
  targetKey: string;
  threadId: string | null;
  draftProject: { environmentId: string; projectId: string; logicalProjectKey: string } | null;
}): string {
  return JSON.stringify([
    input.environmentId,
    input.targetKey,
    input.threadId,
    input.draftProject?.environmentId,
    input.draftProject?.projectId,
    input.draftProject?.logicalProjectKey,
  ]);
}

export const composerAttachmentCapacityError = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} files per message.`;

export interface ComposerAttachmentReservation {
  readonly scope: string;
  readonly count: number;
}

/** One budget for native capture and ordinary asynchronous image preparation. */
export class ComposerAttachmentAdmission {
  private scope: string | null = null;
  private capturing = false;
  private readScope: (() => string) | null = null;
  private readonly reservations = new Map<ComposerAttachmentReservation, boolean>();

  constructor(
    private readonly onChange: (state: { pending: number; capturing: boolean }) => void = () => {},
  ) {}

  private changed(): void {
    this.onChange({ pending: this.pending, capturing: this.capturing });
  }

  async captureScreenshot(input: {
    scope: string;
    occupied: number;
    capture: () => Promise<File | null>;
    admit: (file: File, reservation: ComposerAttachmentReservation) => Promise<void>;
    reportError: (message: string) => void;
  }): Promise<void> {
    if (this.capturing || input.scope !== this.scope || input.scope !== this.readScope?.()) return;
    const reservation = this.reserve(input.scope, input.occupied);
    if (!reservation) {
      input.reportError(composerAttachmentCapacityError);
      return;
    }
    this.capturing = true;
    this.changed();
    try {
      const file = await input.capture();
      if (file && this.isCurrent(reservation)) await input.admit(file, reservation);
    } catch (cause) {
      if (this.isCurrent(reservation)) {
        input.reportError(cause instanceof Error ? cause.message : "Could not capture screenshot.");
      }
    } finally {
      this.capturing = false;
      this.release(reservation);
      this.changed();
    }
  }

  activate(scope: string, readScope: () => string = () => scope): void {
    this.dispose();
    this.scope = scope;
    this.readScope = readScope;
  }

  get pending(): number {
    let count = 0;
    for (const reservation of this.reservations.keys()) count += reservation.count;
    return count;
  }

  reserve(scope: string, occupied: number, count = 1): ComposerAttachmentReservation | null {
    if (
      scope !== this.scope ||
      scope !== this.readScope?.() ||
      count < 1 ||
      occupied + this.pending + count > PROVIDER_SEND_TURN_MAX_ATTACHMENTS
    )
      return null;
    const reservation = { scope, count };
    this.reservations.set(reservation, false);
    this.changed();
    return reservation;
  }

  isCurrent(reservation: ComposerAttachmentReservation): boolean {
    return (
      reservation.scope === this.scope &&
      reservation.scope === this.readScope?.() &&
      this.reservations.has(reservation)
    );
  }

  /** Transfer ownership without a release/re-reserve window or counting the slot twice. */
  transfer(reservation: ComposerAttachmentReservation): boolean {
    if (!this.isCurrent(reservation) || this.reservations.get(reservation)) return false;
    this.reservations.set(reservation, true);
    return true;
  }

  release(reservation: ComposerAttachmentReservation): void {
    if (this.reservations.delete(reservation)) this.changed();
  }

  dispose(): void {
    this.scope = null;
    this.readScope = null;
    if (this.reservations.size === 0) return;
    this.reservations.clear();
    this.changed();
  }
}
