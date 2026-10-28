import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { SourceControlProviderKind } from "@t3tools/contracts";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as GitHubCredentials from "./GitHubCredentials.ts";
import * as GitHubMediaFetch from "./gitHubMediaFetch.ts";

const origin = {
  provider: {
    kind: SourceControlProviderKind.make("github"),
    name: "GitHub",
    baseUrl: "https://github.com",
  },
  remoteName: "origin",
  remoteUrl: "git@github.com:owner/repo.git",
};

const signedIn = (onLookup: () => void = () => {}) =>
  Layer.mock(GitHubCredentials.GitHubCredentials)({
    get: (host) =>
      Effect.sync(() => {
        onLookup();
        return {
          host,
          token: Redacted.make("signed-in"),
          source: "gh" as const,
          fingerprint: "fingerprint",
        };
      }),
  });

describe("GitHubMediaFetch", () => {
  it.effect("loads private media immediately after login with the GitHub credential", () => {
    let lookups = 0;
    const authorizations: Array<string | undefined> = [];
    return Effect.gen(function* () {
      const fetchMedia = yield* GitHubMediaFetch.make;
      const request = {
        url: "https://raw.githubusercontent.com/owner/repo/main/shot.png",
        headers: {},
        origin,
      };
      expect((yield* fetchMedia(request))?.status).toBe(404);
      expect((yield* fetchMedia(request))?.status).toBe(200);
      expect((yield* fetchMedia(request))?.status).toBe(200);
      expect(lookups).toBe(3);
      expect(authorizations).toEqual([undefined, "Bearer signed-in", "Bearer signed-in"]);
    }).pipe(
      Effect.provide(
        Layer.mock(GitHubCredentials.GitHubCredentials)({
          get: (host) =>
            ++lookups === 1
              ? Effect.fail(new GitHubCredentials.GitHubNotSignedInError({ host }))
              : Effect.succeed({
                  host,
                  token: Redacted.make("signed-in"),
                  source: "gh" as const,
                  fingerprint: "fingerprint",
                }),
        }),
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) => {
          authorizations.push(request.headers.authorization);
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new Response(null, {
                status: request.headers.authorization ? 200 : 404,
                headers: { "content-type": "image/png" },
              }),
            ),
          );
        }),
      ),
      Effect.scoped,
    );
  });

  it.effect("keeps the credential off the object store a redirect hands the media to", () => {
    const authorizations: Array<[string, string | undefined]> = [];
    return Effect.gen(function* () {
      const fetchMedia = yield* GitHubMediaFetch.make;
      const response = yield* fetchMedia({
        url: "https://github.com/user-attachments/assets/1a1842fb",
        headers: { range: "bytes=0-1" },
        // Account-scoped uploads name no repository, so they load as upstream serves them.
        origin: null,
      });
      expect(response?.status).toBe(200);
      expect(authorizations).toEqual([
        ["github.com", "Bearer signed-in"],
        ["objects.example.com", undefined],
      ]);
    }).pipe(
      Effect.provide(
        Layer.mock(GitHubCredentials.GitHubCredentials)({
          get: (host) =>
            Effect.succeed({
              host,
              token: Redacted.make("signed-in"),
              source: "gh" as const,
              fingerprint: "fingerprint",
            }),
        }),
      ),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) => {
          const url = new URL(request.url);
          authorizations.push([url.hostname, request.headers.authorization]);
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              url.hostname === "github.com"
                ? new Response(null, {
                    status: 302,
                    headers: { location: "https://objects.example.com/signed" },
                  })
                : new Response(null, { status: 200 }),
            ),
          );
        }),
      ),
      Effect.scoped,
    );
  });
  // Fork F06: repository-scoped media is fetched with the credential only for exact origin.
  it.effect("refuses another repository's media before reading the credential or fetching", () => {
    let lookups = 0;
    const requested: Array<string> = [];
    return Effect.gen(function* () {
      const fetchMedia = yield* GitHubMediaFetch.make;
      for (const [url, requestOrigin] of [
        ["https://raw.githubusercontent.com/someone/else/main/shot.png", origin],
        ["https://raw.githubusercontent.com/owner/repository/main/shot.png", origin],
        ["https://media.githubusercontent.com/media/someone/else/main/clip.mp4", origin],
        ["https://github.com/someone/else/assets/12/1a1842fb", origin],
        ["https://raw.githubusercontent.com/owner/repo%2F..%2F..%2Fsomeone/else/f.png", origin],
        ["https://raw.githubusercontent.com/owner/repo/main/shot.png", null],
        [
          "https://raw.githubusercontent.com/owner/repo/main/shot.png",
          { ...origin, remoteName: "upstream" },
        ],
        [
          "https://raw.githubusercontent.com/owner/repo/main/shot.png",
          { ...origin, remoteUrl: "https://github.example.com/owner/repo.git" },
        ],
      ] as const) {
        expect(yield* fetchMedia({ url, headers: {}, origin: requestOrigin })).toBeNull();
      }
      expect(lookups).toBe(0);
      expect(requested).toEqual([]);
    }).pipe(
      Effect.provide(signedIn(() => (lookups += 1))),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) => {
          requested.push(request.url);
          return Effect.succeed(
            HttpClientResponse.fromWeb(request, new Response(null, { status: 200 })),
          );
        }),
      ),
      Effect.scoped,
    );
  });

  it.effect("follows a redirect within the origin repository and refuses one leaving it", () => {
    const sent: Array<[string, string | undefined]> = [];
    let redirectTo = "";
    return Effect.gen(function* () {
      const fetchMedia = yield* GitHubMediaFetch.make;
      const request = {
        url: "https://raw.githubusercontent.com/Owner/Repo/main/clip.mp4",
        headers: {},
        origin,
      };

      redirectTo = "https://media.githubusercontent.com/media/owner/repo/main/clip.mp4";
      expect((yield* fetchMedia(request))?.status).toBe(200);
      expect(sent).toEqual([
        ["https://raw.githubusercontent.com/Owner/Repo/main/clip.mp4", "Bearer signed-in"],
        [redirectTo, "Bearer signed-in"],
      ]);

      sent.length = 0;
      redirectTo = "https://media.githubusercontent.com/media/someone/else/main/clip.mp4";
      expect(yield* fetchMedia(request)).toBeNull();
      expect(sent).toEqual([
        ["https://raw.githubusercontent.com/Owner/Repo/main/clip.mp4", "Bearer signed-in"],
      ]);
    }).pipe(
      Effect.provide(signedIn()),
      Effect.provideService(
        HttpClient.HttpClient,
        HttpClient.make((request) => {
          sent.push([request.url, request.headers.authorization]);
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              new URL(request.url).hostname === "raw.githubusercontent.com"
                ? new Response(null, { status: 302, headers: { location: redirectTo } })
                : new Response(null, { status: 200 }),
            ),
          );
        }),
      ),
      Effect.scoped,
    );
  });
});
