import { GitBranchIcon, GitPullRequestIcon, RefreshCwIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import type {
  SourceControlProviderAuthStatus,
  SourceControlProviderDiscoveryItem,
  VcsDiscoveryItem,
} from "@t3tools/contracts";

import { sourceControlDiscoveryQueryOptions } from "../../lib/sourceControlReactQuery";
import { cn } from "../../lib/utils";
import {
  getSourceControlCapabilityPresentation,
  getSourceControlDiscoveryItemPresentation,
} from "../../sourceControlPresentation";
import { Button } from "../ui/button";
import { SettingsPageContainer, SettingsRow, SettingsSection } from "./settingsLayout";

function getOptionValue<T>(option: { _tag: string; value?: T } | null | undefined): T | null {
  return option?._tag === "Some" ? (option.value ?? null) : null;
}

function formatAuthStatusLabel(status: SourceControlProviderAuthStatus) {
  switch (status) {
    case "authenticated":
      return "Authenticated";
    case "unauthenticated":
      return "Unauthenticated";
    case "unknown":
      return "Unknown";
  }
}

function SourceControlStatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "muted";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em]",
        tone === "success" && "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
        tone === "warning" && "border-amber-500/20 bg-amber-500/10 text-amber-700",
        tone === "muted" && "border-border bg-muted text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function renderVcsRowStatus(item: VcsDiscoveryItem) {
  const version = getOptionValue(item.version);
  const detail = getOptionValue(item.detail);

  return (
    <>
      <span className="block text-[11px] text-muted-foreground">
        {item.implemented ? "Supported in this build" : "Planned substrate"}
      </span>
      {version ? (
        <span className="mt-1 block font-mono text-[11px] text-foreground">{version}</span>
      ) : null}
      {detail ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span>
      ) : null}
    </>
  );
}

function renderProviderRowStatus(item: SourceControlProviderDiscoveryItem) {
  const version = getOptionValue(item.version);
  const detail = getOptionValue(item.detail);
  const account = getOptionValue(item.auth.account);
  const host = getOptionValue(item.auth.host);
  const authDetail = getOptionValue(item.auth.detail);
  const capability = getSourceControlCapabilityPresentation(item.kind);

  return (
    <>
      <span className="block text-[11px] text-muted-foreground">
        {formatAuthStatusLabel(item.auth.status)}
      </span>
      <span className="mt-1 block text-[11px] text-muted-foreground">{capability.description}</span>
      {account ? (
        <span className="mt-1 block font-mono text-[11px] text-foreground">{account}</span>
      ) : null}
      {host ? <span className="mt-1 block text-[11px] text-muted-foreground">{host}</span> : null}
      {version ? (
        <span className="mt-1 block font-mono text-[11px] text-foreground">{version}</span>
      ) : null}
      {authDetail ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">{authDetail}</span>
      ) : detail ? (
        <span className="mt-1 block text-[11px] text-muted-foreground">{detail}</span>
      ) : null}
    </>
  );
}

function VcsSection() {
  const discoveryQuery = useQuery(sourceControlDiscoveryQueryOptions());
  const discovery = discoveryQuery.data ?? null;
  const items = discovery?.versionControlSystems ?? [];

  return (
    <SettingsSection
      title="Version Control Systems"
      icon={<GitBranchIcon className="size-3.5" />}
      headerAction={
        <Button
          variant="outline"
          size="sm"
          disabled={discoveryQuery.isFetching}
          onClick={() => void discoveryQuery.refetch()}
        >
          <RefreshCwIcon
            className={cn("mr-2 size-4", discoveryQuery.isFetching && "animate-spin")}
          />
          Refresh
        </Button>
      }
    >
      {items.length > 0 ? (
        items.map((item) => (
          <SettingsRow
            key={`vcs-${item.kind}`}
            title={item.label}
            description={item.installHint}
            status={renderVcsRowStatus(item)}
            control={
              item.status === "available" ? (
                <SourceControlStatusPill
                  label={item.implemented ? "available" : "detected"}
                  tone={item.implemented ? "success" : "warning"}
                />
              ) : (
                <SourceControlStatusPill label="missing" tone="muted" />
              )
            }
          />
        ))
      ) : (
        <SettingsRow
          title="Detection"
          description={
            discoveryQuery.isError
              ? "Source control discovery failed."
              : "Waiting for the server to report version control detection."
          }
          status={discoveryQuery.error instanceof Error ? discoveryQuery.error.message : undefined}
          control={
            <SourceControlStatusPill
              label={discoveryQuery.isPending ? "pending" : "idle"}
              tone="muted"
            />
          }
        />
      )}
    </SettingsSection>
  );
}

function SourceControlProvidersSection() {
  const discoveryQuery = useQuery(sourceControlDiscoveryQueryOptions());
  const discovery = discoveryQuery.data ?? null;
  const items = discovery?.sourceControlProviders ?? [];

  return (
    <SettingsSection
      title="Source Control Providers"
      icon={<GitPullRequestIcon className="size-3.5" />}
    >
      {items.length > 0 ? (
        items.map((item) => {
          const presentation = getSourceControlDiscoveryItemPresentation(item);
          const capability = getSourceControlCapabilityPresentation(item.kind);
          const Icon = presentation.Icon;
          const tone =
            item.status !== "available"
              ? "muted"
              : capability.actionable && item.auth.status === "authenticated"
                ? "success"
                : capability.actionable
                  ? "warning"
                  : "muted";
          const label =
            item.status !== "available"
              ? "missing"
              : capability.actionable && item.auth.status === "authenticated"
                ? "ready"
                : capability.actionable
                  ? "setup"
                  : capability.label;

          return (
            <SettingsRow
              key={`provider-${item.kind}`}
              title={
                <span className="inline-flex items-center gap-2">
                  <Icon className="size-4" />
                  <span>{presentation.providerName}</span>
                </span>
              }
              description={item.installHint}
              status={renderProviderRowStatus(item)}
              control={<SourceControlStatusPill label={label} tone={tone} />}
            />
          );
        })
      ) : (
        <SettingsRow
          title="Provider discovery"
          description={
            discoveryQuery.isError
              ? "Provider discovery failed."
              : "Waiting for the server to report source control integrations."
          }
          status={discoveryQuery.error instanceof Error ? discoveryQuery.error.message : undefined}
          control={
            <SourceControlStatusPill
              label={discoveryQuery.isPending ? "pending" : "idle"}
              tone="muted"
            />
          }
        />
      )}
    </SettingsSection>
  );
}

export function SourceControlSettingsPanel() {
  return (
    <SettingsPageContainer>
      <VcsSection />
      <SourceControlProvidersSection />
    </SettingsPageContainer>
  );
}
