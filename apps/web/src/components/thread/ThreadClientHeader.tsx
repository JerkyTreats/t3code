import type { RuntimeMode } from "@t3tools/contracts";
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
    <span className="t3-thread-elapsed">
      <span>{label} </span>
      <span aria-label={`${label} ${initialText}`} ref={textRef}>
        {initialText}
      </span>
    </span>
  );
}

export function ThreadClientHeader({
  modelLabel,
  runtimeMode,
  startedAt,
  statusLabel,
  title,
}: {
  readonly modelLabel: string;
  readonly runtimeMode: RuntimeMode;
  readonly startedAt?: string;
  readonly statusLabel: string;
  readonly title: string;
}) {
  return (
    <header className="t3-native-thread-header" data-chat-header>
      <div className="t3-native-thread-header-topline">
        <span className="t3-native-thread-brand">
          <span aria-hidden="true" className="t3-native-thread-logo">
            T3
          </span>
          <span>t3code</span>
        </span>
        <span className="t3-native-thread-status" data-status={statusLabel.toLowerCase()}>
          <span aria-hidden="true" className="t3-native-thread-status-ring" />
          {statusLabel}
          {startedAt ? <ElapsedTime label="" startedAt={startedAt} /> : null}
        </span>
      </div>
      <h1>{title}</h1>
      <div className="t3-native-thread-meta" aria-label="Thread runtime">
        <span>{modelLabel}</span>
        <span aria-hidden="true">·</span>
        <span>{threadRuntimeLabels[runtimeMode]}</span>
      </div>
    </header>
  );
}

const threadRuntimeLabels: Record<RuntimeMode, string> = {
  "approval-required": "Supervised",
  "auto-accept-edits": "Auto-accept edits",
  auto: "Auto",
  "full-access": "Full access",
};
