import * as Schema from "effect/Schema";

import { IsoDateTime, PositiveInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

const GitHubHostname = TrimmedNonEmptyString;
const GitHubProtocol = Schema.Literals(["https", "ssh"]);
const GitHubIssueListState = Schema.Literals(["open", "closed", "all"]);
const GitHubIssueState = Schema.Literals(["open", "closed"]);

export const GitHubRepository = Schema.Struct({
  nameWithOwner: TrimmedNonEmptyString,
  url: Schema.String,
  description: Schema.NullOr(Schema.String),
  defaultBranch: Schema.NullOr(TrimmedNonEmptyString),
});
export type GitHubRepository = typeof GitHubRepository.Type;

export const GitHubIssueLabel = Schema.Struct({
  name: TrimmedNonEmptyString,
  color: Schema.NullOr(TrimmedNonEmptyString),
});
export type GitHubIssueLabel = typeof GitHubIssueLabel.Type;

export const GitHubIssueAssignee = Schema.Struct({
  login: TrimmedNonEmptyString,
});
export type GitHubIssueAssignee = typeof GitHubIssueAssignee.Type;

export const GitHubIssue = Schema.Struct({
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  state: GitHubIssueState,
  url: Schema.String,
  body: Schema.NullOr(Schema.String),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  labels: Schema.Array(GitHubIssueLabel),
  assignees: Schema.Array(GitHubIssueAssignee),
  author: Schema.NullOr(TrimmedNonEmptyString),
});
export type GitHubIssue = typeof GitHubIssue.Type;

export const GitHubIssueLink = Schema.Struct({
  repoNameWithOwner: TrimmedNonEmptyString,
  number: PositiveInt,
  title: TrimmedNonEmptyString,
  url: Schema.String,
  state: GitHubIssueState,
});
export type GitHubIssueLink = typeof GitHubIssueLink.Type;

export const GitHubStatusInput = Schema.Struct({
  cwd: Schema.NullOr(TrimmedNonEmptyString),
  hostname: Schema.optional(GitHubHostname),
});
export type GitHubStatusInput = typeof GitHubStatusInput.Type;

export const GitHubLoginInput = Schema.Struct({
  cwd: Schema.NullOr(TrimmedNonEmptyString),
  hostname: Schema.optional(GitHubHostname),
  gitProtocol: Schema.optional(GitHubProtocol),
});
export type GitHubLoginInput = typeof GitHubLoginInput.Type;

export const GitHubListIssuesInput = Schema.Struct({
  cwd: Schema.NullOr(TrimmedNonEmptyString),
  state: Schema.optional(GitHubIssueListState),
  limit: Schema.optional(PositiveInt),
});
export type GitHubListIssuesInput = typeof GitHubListIssuesInput.Type;

export const GitHubIssueMutationInput = Schema.Struct({
  cwd: Schema.NullOr(TrimmedNonEmptyString),
  repo: Schema.optional(TrimmedNonEmptyString),
  issueNumber: PositiveInt,
});
export type GitHubIssueMutationInput = typeof GitHubIssueMutationInput.Type;

export const GitHubCreateIssueInput = Schema.Struct({
  cwd: Schema.NullOr(TrimmedNonEmptyString),
  repo: Schema.optional(TrimmedNonEmptyString),
  title: TrimmedNonEmptyString,
  body: Schema.optional(Schema.NullOr(Schema.String)),
});
export type GitHubCreateIssueInput = typeof GitHubCreateIssueInput.Type;

export const GitHubStatusResult = Schema.Struct({
  installed: Schema.Boolean,
  authenticated: Schema.Boolean,
  hostname: GitHubHostname,
  accountLogin: Schema.NullOr(TrimmedNonEmptyString),
  gitProtocol: Schema.NullOr(GitHubProtocol),
  tokenSource: Schema.NullOr(TrimmedNonEmptyString),
  scopes: Schema.Array(TrimmedNonEmptyString),
  repo: Schema.NullOr(GitHubRepository),
});
export type GitHubStatusResult = typeof GitHubStatusResult.Type;

export const GitHubListIssuesResult = Schema.Struct({
  repo: Schema.NullOr(GitHubRepository),
  issues: Schema.Array(GitHubIssue),
});
export type GitHubListIssuesResult = typeof GitHubListIssuesResult.Type;

export const GitHubIssueMutationResult = Schema.Struct({
  number: PositiveInt,
  state: GitHubIssueState,
});
export type GitHubIssueMutationResult = typeof GitHubIssueMutationResult.Type;

export const GitHubCreateIssueResult = GitHubIssue;
export type GitHubCreateIssueResult = typeof GitHubCreateIssueResult.Type;

export type GitHubIssueListState = typeof GitHubIssueListState.Type;
