import type { AuthSessionState } from "@t3tools/contracts";
import React, { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { APP_DISPLAY_NAME } from "../../branding";
import {
  peekPairingTokenFromUrl,
  readAuthBootstrapEnvironmentSnapshot,
  stripPairingTokenFromUrl,
  submitServerAuthCredential,
  useServerAuthDiagnostics,
  type ServerAuthDiagnosticEvent,
} from "../../serverAuthBootstrap";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";

export function PairingPendingSurface() {
  const diagnostics = useServerAuthDiagnostics();
  const diagnosticsEndRef = useRef<HTMLDivElement | null>(null);
  const [env, setEnv] = useState(() => readAuthBootstrapEnvironmentSnapshot());

  useEffect(() => {
    setEnv(readAuthBootstrapEnvironmentSnapshot());
  }, [diagnostics.length]);

  useEffect(() => {
    diagnosticsEndRef.current?.scrollIntoView({ block: "end" });
  }, [diagnostics.length]);

  const lastDiagnostic = diagnostics.at(-1);
  const lastMessageLooksLikeUnreachable =
    lastDiagnostic !== undefined &&
    (lastDiagnostic.level === "error" ||
      lastDiagnostic.message.toLowerCase().includes("retrying") ||
      /\bfailed to fetch\b/i.test(lastDiagnostic.detail ?? ""));

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-2xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <div className="mt-3 flex flex-wrap items-start gap-3">
          <Spinner className="mt-1 size-7 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Connecting to this environment
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              Contacting the local server, checking your auth session, and preparing pairing. This
              screen stays up while we retry short network blips during startup.
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-amber-500/25 bg-amber-500/8 px-3 py-3 text-sm leading-relaxed text-foreground/90">
          <p className="font-medium text-foreground">Cannot reach this environment?</p>
          <p className="mt-1.5 text-muted-foreground">
            If you see <span className="font-mono text-foreground/80">Failed to fetch</span> or many{" "}
            <span className="font-mono text-foreground/80">Transient auth bootstrap failure</span>{" "}
            lines, the bundled server may still be starting, may have exited, or the browser blocked
            a loopback request. Use{" "}
            <strong className="font-medium text-foreground">Reload app</strong> below or fully quit
            and reopen the desktop app.
          </p>
        </div>

        {lastDiagnostic && lastMessageLooksLikeUnreachable ? (
          <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-3 text-sm">
            <p className="font-medium text-destructive">Latest issue</p>
            <p className="mt-1 text-foreground/90">{lastDiagnostic.message}</p>
            {lastDiagnostic.detail ? (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/50 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {lastDiagnostic.detail}
              </pre>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 rounded-lg border border-border/70 bg-background/55 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground">Connection details</p>
          <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
            <DetailRow label="Desktop label" value={env.desktopLabel ?? "—"} />
            <DetailRow label="HTTP API" value={env.resolvedHttpBaseUrl} monospace />
            <DetailRow label="Auth session check" value={env.authSessionUrl} monospace />
            <DetailRow label="WebSocket" value={env.wsBaseUrl ?? "—"} monospace />
            <DetailRow label="Page origin" value={env.pageOrigin} monospace />
            <DetailRow
              label="Desktop bridge"
              value={env.desktopBridgePresent ? "present" : "missing"}
            />
            <DetailRow
              label="Bootstrap credential"
              value={env.desktopBootstrapCredentialPresent ? "present" : "missing"}
            />
            <DetailRow
              label="Desktop session token"
              value={env.desktopSessionTokenPresent ? "present" : "missing"}
            />
          </dl>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => window.location.reload()} size="sm" variant="outline">
            Reload app
          </Button>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-border/70 bg-background/65">
          <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
            <span className="text-xs font-medium text-muted-foreground">Live diagnostics</span>
            <span className="text-[11px] text-muted-foreground/70">
              {diagnostics.length === 0 ? "waiting" : `${diagnostics.length} events`}
            </span>
          </div>
          <div className="max-h-72 space-y-2 overflow-auto px-3 py-3">
            {diagnostics.length === 0 ? (
              <p className="text-xs text-muted-foreground">Waiting for auth bootstrap activity.</p>
            ) : (
              diagnostics.map((event) => <DiagnosticEventRow event={event} key={event.id} />)
            )}
            <div ref={diagnosticsEndRef} />
          </div>
        </div>
      </section>
    </div>
  );
}

function DetailRow({
  label,
  value,
  monospace,
}: {
  label: string;
  value: string;
  monospace?: boolean;
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          monospace ? "min-w-0 break-all font-mono text-foreground/85" : "text-foreground/85"
        }
      >
        {value}
      </dd>
    </>
  );
}

function DiagnosticEventRow({ event }: { event: ServerAuthDiagnosticEvent }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs">
      <span className={`mt-0.5 size-2 rounded-full ${diagnosticDotClassName(event.level)}`} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-medium text-foreground/90">{event.message}</span>
          <time className="text-[11px] text-muted-foreground/60">
            {formatDiagnosticTime(event.at)}
          </time>
        </div>
        {event.detail ? (
          <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 px-2 py-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {event.detail}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

function diagnosticDotClassName(level: ServerAuthDiagnosticEvent["level"]): string {
  switch (level) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "error":
      return "bg-destructive";
    case "info":
      return "bg-sky-500";
  }
}

function formatDiagnosticTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function PairingUnavailableSurface({ errorMessage }: { errorMessage: string }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Cannot reach this environment
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{errorMessage}</p>
        <Button
          className="mt-6"
          onClick={() => window.location.reload()}
          size="sm"
          variant="outline"
        >
          Reload app
        </Button>
      </section>
    </div>
  );
}

export function PairingRouteSurface({
  auth,
  initialErrorMessage,
  onAuthenticated,
}: {
  auth: AuthSessionState["auth"];
  initialErrorMessage?: string;
  onAuthenticated: () => void;
}) {
  const autoPairTokenRef = useRef<string | null>(peekPairingTokenFromUrl());
  const [credential, setCredential] = useState(() => autoPairTokenRef.current ?? "");
  const [errorMessage, setErrorMessage] = useState(initialErrorMessage ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const autoSubmitAttemptedRef = useRef(false);

  const submitCredential = useCallback(
    async (nextCredential: string) => {
      setIsSubmitting(true);
      setErrorMessage("");

      const submitError = await submitServerAuthCredential(nextCredential).then(
        () => null,
        (error) => errorMessageFromUnknown(error),
      );

      setIsSubmitting(false);

      if (submitError) {
        setErrorMessage(submitError);
        return;
      }

      startTransition(() => {
        onAuthenticated();
      });
    },
    [onAuthenticated],
  );

  const handleSubmit = useCallback(
    async (event?: React.FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      await submitCredential(credential);
    },
    [credential, submitCredential],
  );

  useEffect(() => {
    const token = autoPairTokenRef.current;
    if (!token || autoSubmitAttemptedRef.current) {
      return;
    }

    autoSubmitAttemptedRef.current = true;
    stripPairingTokenFromUrl();
    void submitCredential(token);
  }, [submitCredential]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-10 text-foreground sm:px-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-44 bg-[radial-gradient(44rem_16rem_at_top,color-mix(in_srgb,var(--color-emerald-500)_14%,transparent),transparent)]" />
        <div className="absolute inset-y-0 left-0 w-72 bg-[radial-gradient(28rem_18rem_at_left,color-mix(in_srgb,var(--color-sky-500)_10%,transparent),transparent)]" />
        <div className="absolute inset-0 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--background)_90%,var(--color-black))_0%,var(--background)_55%)]" />
      </div>

      <section className="relative w-full max-w-xl rounded-2xl border border-border/80 bg-card/90 p-6 shadow-2xl shadow-black/20 backdrop-blur-md sm:p-8">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          {APP_DISPLAY_NAME}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          Pair with this environment
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {describeAuthGate(auth.bootstrapMethods)}
        </p>

        <form className="mt-6 space-y-4" onSubmit={(event) => void handleSubmit(event)}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="pairing-token">
              Pairing token
            </label>
            <Input
              id="pairing-token"
              autoCapitalize="none"
              autoComplete="off"
              autoCorrect="off"
              disabled={isSubmitting}
              nativeInput
              onChange={(event) => setCredential(event.currentTarget.value)}
              placeholder="Paste a one-time token or pairing secret"
              spellCheck={false}
              value={credential}
            />
          </div>

          {errorMessage ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/6 px-3 py-2 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button disabled={isSubmitting} size="sm" type="submit">
              {isSubmitting ? "Pairing..." : "Continue"}
            </Button>
            <Button
              disabled={isSubmitting}
              onClick={() => window.location.reload()}
              size="sm"
              variant="outline"
            >
              Reload app
            </Button>
          </div>
        </form>

        <div className="mt-6 rounded-lg border border-border/70 bg-background/55 px-3 py-3 text-xs leading-relaxed text-muted-foreground">
          {describeSupportedMethods(auth.bootstrapMethods)}
        </div>
      </section>
    </div>
  );
}

function errorMessageFromUnknown(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }

  return "Authentication failed.";
}

function describeAuthGate(bootstrapMethods: ReadonlyArray<string>): string {
  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return "This environment expects a trusted pairing credential before the app can connect.";
  }

  return "Enter a pairing token to start a session with this environment.";
}

function describeSupportedMethods(bootstrapMethods: ReadonlyArray<string>): string {
  if (
    bootstrapMethods.includes("desktop-bootstrap") &&
    bootstrapMethods.includes("one-time-token")
  ) {
    return "Desktop-managed pairing and one-time pairing tokens are both accepted for this environment.";
  }

  if (bootstrapMethods.includes("desktop-bootstrap")) {
    return "This environment is desktop-managed. Open it from the desktop app or paste a bootstrap credential if one was issued explicitly.";
  }

  return "This environment accepts one-time pairing tokens. Pairing links can open this page directly, or you can paste the token here.";
}
