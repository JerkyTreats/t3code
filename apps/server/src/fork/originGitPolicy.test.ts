import { assert, describe, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import {
  originPushRedirectError,
  originUrlConfigurationError,
  requireOriginProductRemote,
  requireOriginTracking,
} from "./originGitPolicy.ts";

const origin = "https://git.example.test:8443/acme/web.git";
describe("origin Git policy independently of the driver host", () => {
  it("validates every push URL and keeps distinct ports separate", () => {
    assert.isNull(
      originUrlConfigurationError(origin, "ssh://git@git.example.test:8443/acme/web.git"),
    );
    assert.include(
      originUrlConfigurationError(origin, `${origin}\nhttps://git.example.test:9443/acme/web.git`)!,
      "push URL differs",
    );
    assert.include(
      originUrlConfigurationError(`${origin}\nhttps://git.example.test:9443/acme/web.git`, origin)!,
      "unambiguous",
    );
    assert.isNotNull(originUrlConfigurationError(origin, ""));
    assert.isNotNull(originPushRedirectError("upstream", "origin"));
    assert.isNotNull(originPushRedirectError("", "upstream"));
  });

  it.effect(
    "a replacement command host receives only explicit origin inspection and keeps the decision",
    () =>
      Effect.gen(function* () {
        const calls: ReadonlyArray<string>[] = [];
        const remote = yield* requireOriginProductRemote(
          (_operation, _cwd, args) => {
            calls.push(args);
            return Effect.succeed(args[0] === "remote" ? origin : "");
          },
          "/replacement",
          "feature/topic",
          "push",
          ["push", "origin"],
        );
        assert.equal(remote, "origin");
        assert.deepStrictEqual(
          calls.filter((args) => args[0] === "remote"),
          [
            ["remote", "get-url", "--all", "origin"],
            ["remote", "get-url", "--push", "--all", "origin"],
          ],
        );
        const failure = yield* requireOriginTracking({
          cwd: "/replacement",
          operation: "pull",
          remoteName: "upstream",
          required: true,
        }).pipe(Effect.flip);
        assert.include(failure.detail, "not origin");
      }),
  );
});
