import { useEffect, useRef } from "react";

export function formatElapsedTime(startedAt: string, nowMs: number): string | null {
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return null;

  const totalSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1_000));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function ElapsedTime({
  label = "Working for",
  nowMs,
  startedAt,
}: {
  readonly label?: string;
  readonly nowMs?: number;
  readonly startedAt: string;
}) {
  const textRef = useRef<HTMLSpanElement>(null);
  const initialNow = nowMs ?? Date.now();
  const initialText = formatElapsedTime(startedAt, initialNow) ?? "0s";

  useEffect(() => {
    if (nowMs !== undefined) return;

    const update = () => {
      if (!textRef.current) return;
      const next = formatElapsedTime(startedAt, Date.now()) ?? "0s";
      textRef.current.textContent = next;
      textRef.current.setAttribute("aria-label", `${label} ${next}`);
    };
    const interval = setInterval(update, 1_000);
    return () => clearInterval(interval);
  }, [label, nowMs, startedAt]);

  return (
    <span className="inline-flex gap-1 tabular-nums">
      <span>{label} </span>
      <span aria-label={`${label} ${initialText}`} ref={textRef}>
        {initialText}
      </span>
    </span>
  );
}

export function ThreadClientStatus({
  modelLabel,
  isWorking,
  isConnecting,
  disconnected,
  startedAt,
}: {
  readonly modelLabel: string;
  readonly isWorking: boolean;
  readonly isConnecting: boolean;
  readonly disconnected: boolean;
  readonly startedAt?: string;
}) {
  const connectionLabel = isConnecting ? "Connecting" : disconnected ? "Disconnected" : null;
  if (!connectionLabel && !isWorking) return null;

  return (
    <div
      data-thread-client-status
      className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-2 text-xs text-muted-foreground"
    >
      <span role="status">
        {connectionLabel}
        {connectionLabel && isWorking ? " · " : null}
        {isWorking ? `Working · ${modelLabel || "Model unavailable"}` : null}
      </span>
      {isWorking && startedAt ? <ElapsedTime label="" startedAt={startedAt} /> : null}
    </div>
  );
}
