/**
 * GitHubCli - Effect service contract for `gh` process interactions.
 *
 * Provides thin command execution helpers used by Git workflow orchestration.
 *
 * @module GitHubCli
 */
import { Context } from "effect";
import type { Effect } from "effect";

import type { ProcessRunResult } from "../../processRunner.ts";
import type {
  GitHubCliError,
  GitHubCreateIssueInput,
  GitHubCreateIssueResult,
  GitHubIssueMutationInput,
  GitHubIssueMutationResult,
  GitHubListIssuesInput,
  GitHubListIssuesResult,
  GitHubLoginInput,
  GitHubStatusInput,
  GitHubStatusResult,
  SourceControlRepositoryVisibility,
} from "@t3tools/contracts";

export interface GitHubPullRequestSummary {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly baseRefName: string;
  readonly headRefName: string;
  readonly state?: "open" | "closed" | "merged";
  readonly updatedAt?: string | null;
  readonly isCrossRepository?: boolean;
  readonly headRepositoryNameWithOwner?: string | null;
  readonly headRepositoryOwnerLogin?: string | null;
}

export interface GitHubRepositoryCloneUrls {
  readonly nameWithOwner: string;
  readonly url: string;
  readonly sshUrl: string;
}

/**
 * GitHubCliShape - Service API for executing GitHub CLI commands.
 */
export interface GitHubCliShape {
  /**
   * Execute a GitHub CLI command and return full process output.
   */
  readonly execute: (input: {
    readonly cwd: string;
    readonly args: ReadonlyArray<string>;
    readonly timeoutMs?: number;
  }) => Effect.Effect<ProcessRunResult, GitHubCliError>;

  /**
   * List open pull requests for a head branch.
   */
  readonly listOpenPullRequests: (input: {
    readonly cwd: string;
    readonly headSelector: string;
    readonly state?: "open" | "all";
    readonly limit?: number;
  }) => Effect.Effect<ReadonlyArray<GitHubPullRequestSummary>, GitHubCliError>;

  /**
   * Resolve a pull request by URL, number, or branch-ish identifier.
   */
  readonly getPullRequest: (input: {
    readonly cwd: string;
    readonly reference: string;
  }) => Effect.Effect<GitHubPullRequestSummary, GitHubCliError>;

  /**
   * Resolve clone URLs for a GitHub repository.
   */
  readonly getRepositoryCloneUrls: (input: {
    readonly cwd: string;
    readonly repository: string;
  }) => Effect.Effect<GitHubRepositoryCloneUrls, GitHubCliError>;

  /**
   * Create a GitHub repository and resolve its clone URLs.
   */
  readonly createRepository: (input: {
    readonly cwd: string;
    readonly repository: string;
    readonly visibility: SourceControlRepositoryVisibility;
  }) => Effect.Effect<GitHubRepositoryCloneUrls, GitHubCliError>;

  /**
   * Create a pull request from branch context and body file.
   */
  readonly createPullRequest: (input: {
    readonly cwd: string;
    readonly baseBranch: string;
    readonly headSelector: string;
    readonly title: string;
    readonly bodyFile: string;
  }) => Effect.Effect<void, GitHubCliError>;

  /**
   * Resolve repository default branch through GitHub metadata.
   */
  readonly getDefaultBranch: (input: {
    readonly cwd: string;
  }) => Effect.Effect<string | null, GitHubCliError>;

  /**
   * Checkout a pull request into the current repository worktree.
   */
  readonly checkoutPullRequest: (input: {
    readonly cwd: string;
    readonly reference: string;
    readonly force?: boolean;
  }) => Effect.Effect<void, GitHubCliError>;

  /**
   * Read GitHub auth and repository status for the current workspace.
   */
  readonly getStatus: (
    input: GitHubStatusInput,
  ) => Effect.Effect<GitHubStatusResult, GitHubCliError>;

  /**
   * Run GitHub auth login and return the resulting auth status.
   */
  readonly login: (input: GitHubLoginInput) => Effect.Effect<GitHubStatusResult, GitHubCliError>;

  /**
   * List repository issues.
   */
  readonly listIssues: (
    input: GitHubListIssuesInput,
  ) => Effect.Effect<GitHubListIssuesResult, GitHubCliError>;

  /**
   * Create a new issue.
   */
  readonly createIssue: (
    input: GitHubCreateIssueInput,
  ) => Effect.Effect<GitHubCreateIssueResult, GitHubCliError>;

  /**
   * Close an existing issue.
   */
  readonly closeIssue: (
    input: GitHubIssueMutationInput,
  ) => Effect.Effect<GitHubIssueMutationResult, GitHubCliError>;

  /**
   * Reopen an existing issue.
   */
  readonly reopenIssue: (
    input: GitHubIssueMutationInput,
  ) => Effect.Effect<GitHubIssueMutationResult, GitHubCliError>;
}

/**
 * GitHubCli - Service tag for GitHub CLI process execution.
 */
export class GitHubCli extends Context.Service<GitHubCli, GitHubCliShape>()(
  "t3/git/Services/GitHubCli",
) {}
