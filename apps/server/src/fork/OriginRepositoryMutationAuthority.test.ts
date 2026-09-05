import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChildProcessSpawner } from "effect/unstable/process";
import type { RepositoryIdentity } from "@t3tools/contracts";

import * as VcsProcess from "../vcs/VcsProcess.ts";
import * as OriginRepositoryMutationAuthority from "./OriginRepositoryMutationAuthority.ts";

const expectedIdentity: RepositoryIdentity = {
  canonicalKey: "github.com/acme/web",
  locator: {
    source: "git-remote",
    remoteName: "origin",
    remoteUrl: "https://github.com/acme/web.git",
  },
  provider: "github",
  displayName: "acme/web",
};

function output(stdout: string, exitCode = 0): VcsProcess.VcsProcessOutput {
  return {
    exitCode: ChildProcessSpawner.ExitCode(exitCode),
    stdout,
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    stdoutInvalidUtf8: false,
    stderrInvalidUtf8: false,
  };
}

function makeAuthority(
  run: VcsProcess.VcsProcess["Service"]["run"],
): Effect.Effect<OriginRepositoryMutationAuthority.OriginRepositoryMutationAuthority["Service"]> {
  return OriginRepositoryMutationAuthority.make.pipe(
    Effect.provide(
      Layer.mock(VcsProcess.VcsProcess)({
        run: (input) =>
          input.args[0] === "branch" || input.args[0] === "config"
            ? Effect.succeed(output(""))
            : run(input),
      }),
    ),
  );
}

it.effect("authorizes equivalent live origin fetch and push URLs", () =>
  Effect.gen(function* () {
    const calls: ReadonlyArray<string>[] = [];
    const authority = yield* makeAuthority((input) => {
      calls.push(input.args);
      return Effect.succeed(
        output(
          input.args.includes("--push")
            ? "git@github.com:acme/web.git\nssh://git@github.com/acme/web\n"
            : "https://github.com/acme/web.git\n",
        ),
      );
    });

    yield* authority.authorize({ cwd: "/workspace", expectedIdentity });

    assert.deepStrictEqual(calls, [
      ["remote", "get-url", "--all", "origin"],
      ["remote", "get-url", "--push", "--all", "origin"],
    ]);
  }),
);

it.effect("rejects a projected identity that is not exact origin without inspecting git", () =>
  Effect.gen(function* () {
    let calls = 0;
    const authority = yield* makeAuthority(() => {
      calls += 1;
      return Effect.succeed(output("https://github.com/acme/web.git\n"));
    });

    const error = yield* Effect.flip(
      authority.authorize({
        cwd: "/workspace",
        expectedIdentity: {
          ...expectedIdentity,
          locator: { ...expectedIdentity.locator, remoteName: "upstream" },
        },
      }),
    );

    assert.strictEqual(error.reason, "expected-identity-invalid");
    assert.strictEqual(calls, 0);
  }),
);

it.effect("rejects a live origin that changed after projection", () =>
  Effect.gen(function* () {
    let calls = 0;
    const authority = yield* makeAuthority(() => {
      calls += 1;
      return Effect.succeed(output("https://github.com/other/web.git\n"));
    });

    const error = yield* Effect.flip(authority.authorize({ cwd: "/workspace", expectedIdentity }));

    assert.strictEqual(error.reason, "origin-changed");
    assert.strictEqual(calls, 1);
  }),
);

it.effect("rejects when any live origin push URL disagrees", () =>
  Effect.gen(function* () {
    const authority = yield* makeAuthority((input) =>
      Effect.succeed(
        output(
          input.args.includes("--push")
            ? "https://github.com/acme/web.git\nhttps://github.com/other/web.git\n"
            : "https://github.com/acme/web.git\n",
        ),
      ),
    );

    const error = yield* Effect.flip(authority.authorize({ cwd: "/workspace", expectedIdentity }));

    assert.strictEqual(error.reason, "push-url-disagrees");
  }),
);

it.effect("rejects an origin push URL on a different non-default port", () =>
  Effect.gen(function* () {
    const portIdentity: RepositoryIdentity = {
      ...expectedIdentity,
      canonicalKey: "github.example.test/acme/web",
      locator: {
        ...expectedIdentity.locator,
        remoteUrl: "https://github.example.test:8443/acme/web.git",
      },
    };
    const authority = yield* makeAuthority((input) =>
      Effect.succeed(
        output(
          input.args.includes("--push")
            ? "https://github.example.test:9443/acme/web.git\n"
            : "https://github.example.test:8443/acme/web.git\n",
        ),
      ),
    );

    const error = yield* Effect.flip(
      authority.authorize({ cwd: "/workspace", expectedIdentity: portIdentity }),
    );

    assert.strictEqual(error.reason, "push-url-disagrees");
  }),
);

it.effect("fails closed when exact origin is unavailable", () =>
  Effect.gen(function* () {
    const authority = yield* makeAuthority(() => Effect.succeed(output("", 2)));

    const error = yield* Effect.flip(authority.authorize({ cwd: "/workspace", expectedIdentity }));

    assert.strictEqual(error.reason, "origin-unavailable");
  }),
);

for (const redirectKey of ["remote.pushDefault", "branch.main.pushRemote"]) {
  it.effect(`revalidates live ${redirectKey} before allowing hosted mutations`, () =>
    Effect.gen(function* () {
      const authority = yield* OriginRepositoryMutationAuthority.make.pipe(
        Effect.provide(
          Layer.mock(VcsProcess.VcsProcess)({
            run: (input) =>
              Effect.succeed(
                output(
                  input.args[0] === "remote"
                    ? expectedIdentity.locator.remoteUrl
                    : input.args[0] === "branch"
                      ? "main"
                      : input.args.at(-1) === redirectKey
                        ? "upstream"
                        : "",
                ),
              ),
          }),
        ),
      );
      const error = yield* authority
        .authorize({ cwd: "/replacement", expectedIdentity })
        .pipe(Effect.flip);
      assert.equal(error.reason, "push-redirect");
    }),
  );
}
