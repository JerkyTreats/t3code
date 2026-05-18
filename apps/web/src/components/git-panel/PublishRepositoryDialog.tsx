import type {
  SourceControlDiscoveryResult,
  SourceControlProviderKind,
  SourceControlPublishRepositoryResult,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useEffect, useState } from "react";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";

type PublishProvider = Exclude<SourceControlProviderKind, "unknown">;
const PUBLISH_PROVIDERS: ReadonlyArray<{ id: PublishProvider; label: string }> = [
  { id: "github", label: "GitHub" },
  { id: "gitlab", label: "GitLab" },
  { id: "bitbucket", label: "Bitbucket" },
  { id: "azure-devops", label: "Azure DevOps" },
];

interface PublishRepositoryDialogProps {
  open: boolean;
  discovery: SourceControlDiscoveryResult | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  result: SourceControlPublishRepositoryResult | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: {
    provider: PublishProvider;
    repository: string;
    visibility: "private" | "public";
    remoteName: string;
    protocol: "ssh" | "https";
  }) => void;
  onOpenRepository: (url: string) => void;
}

export function PublishRepositoryDialog({
  open,
  discovery,
  isSubmitting,
  errorMessage,
  result,
  onOpenChange,
  onSubmit,
  onOpenRepository,
}: PublishRepositoryDialogProps) {
  const [provider, setProvider] = useState<PublishProvider>("github");
  const [repository, setRepository] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [remoteName, setRemoteName] = useState("origin");
  const [protocol, setProtocol] = useState<"ssh" | "https">("ssh");

  useEffect(() => {
    if (!open) {
      setRepository("");
      setRemoteName("origin");
      setVisibility("private");
      setProtocol("ssh");
    }
  }, [open]);

  const discoveryByProvider = new Map(
    (discovery?.sourceControlProviders ?? []).map((item) => [item.kind, item]),
  );
  const selectedDiscovery = discoveryByProvider.get(provider);
  const selectedProviderReady =
    selectedDiscovery?.status === "available" &&
    selectedDiscovery.auth.status !== "unauthenticated";
  const providerHint =
    selectedDiscovery?.status !== "available"
      ? selectedDiscovery?.installHint
      : selectedDiscovery?.auth.status === "unauthenticated"
        ? Option.getOrElse(selectedDiscovery.auth.detail, () => "Auth needed")
        : null;
  const canSubmit =
    selectedProviderReady &&
    repository.trim().includes("/") &&
    remoteName.trim().length > 0 &&
    !isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup>
        <DialogHeader>
          <DialogTitle>Publish repository</DialogTitle>
          <DialogDescription>Create a remote repository and push this branch.</DialogDescription>
        </DialogHeader>
        <DialogPanel className="space-y-4">
          <div className="grid grid-cols-2 gap-1">
            {PUBLISH_PROVIDERS.map((option) => {
              const item = discoveryByProvider.get(option.id);
              const disabled =
                item?.status !== "available" || item.auth.status === "unauthenticated";
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  title={disabled ? item?.installHint : option.label}
                  className={`rounded-md border px-2 py-1.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                    provider === option.id
                      ? "border-ring bg-background text-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={() => setProvider(option.id)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {providerHint && <p className="text-xs text-muted-foreground">{providerHint}</p>}
          <div className="space-y-1">
            <p className="text-xs font-medium">Repository</p>
            <input
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
              placeholder="owner/repository"
              value={repository}
              onChange={(event) => setRepository(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-xs font-medium">
              <span>Visibility</span>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                value={visibility}
                onChange={(event) => setVisibility(event.target.value as "private" | "public")}
              >
                <option value="private">Private</option>
                <option value="public">Public</option>
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>Protocol</span>
              <select
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
                value={protocol}
                onChange={(event) => setProtocol(event.target.value as "ssh" | "https")}
              >
                <option value="ssh">SSH</option>
                <option value="https">HTTPS</option>
              </select>
            </label>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium">Remote name</p>
            <input
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 font-mono text-xs"
              value={remoteName}
              onChange={(event) => setRemoteName(event.target.value)}
            />
          </div>
          {result && (
            <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
              <p className="font-medium">
                {result.status === "pushed" ? "Pushed" : "Remote added"} to{" "}
                {result.repository.nameWithOwner}
              </p>
              <p className="text-muted-foreground">
                {result.remoteName} points at {result.remoteUrl}
              </p>
              <Button
                size="xs"
                variant="outline"
                onClick={() => onOpenRepository(result.repository.url)}
              >
                Open repository
              </Button>
            </div>
          )}
          {errorMessage && <p className="text-xs text-destructive-foreground">{errorMessage}</p>}
        </DialogPanel>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            size="sm"
            disabled={!canSubmit}
            onClick={() =>
              onSubmit({
                provider,
                repository: repository.trim(),
                visibility,
                remoteName: remoteName.trim(),
                protocol,
              })
            }
          >
            {isSubmitting ? "Publishing..." : "Publish"}
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}
