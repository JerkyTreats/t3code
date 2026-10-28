import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";

import * as ServerConfig from "../config.ts";
import * as TriageService from "./TriageService.ts";

const TestLayer = ServerConfig.layerTest(process.cwd(), { prefix: "t3-triage-service-" }).pipe(
  Layer.provideMerge(NodeServices.layer),
);

const readSession = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const config = yield* ServerConfig.ServerConfig;
  const sessions = `${config.stateDir}/triage`;
  const [session] = yield* fs.readDirectory(sessions);
  return {
    context: yield* fs.readFileString(`${sessions}/${session}/context.md`),
    prompt: yield* fs.readFileString(`${sessions}/${session}/triage-playbook.md`),
  };
});

it.effect("starts in-app triage without cloning or touching the source cache", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const config = yield* ServerConfig.ServerConfig;
    // Entries an agent cloned earlier, with approval, stay exactly as they are.
    const kept = `${config.baseDir}/source/0123456789abcdef`;
    const staging = `${config.baseDir}/source-staging`;
    yield* fs.makeDirectory(kept, { recursive: true });
    yield* fs.makeDirectory(staging, { recursive: true });

    const triage = yield* Layer.build(TriageService.layer).pipe(
      Effect.map(Context.get(TriageService.TriageService)),
    );
    const { prompt } = yield* triage.prepare({
      client: { label: "T3 Code Desktop", webDeployment: "hosted" },
    });

    assert.include(prompt, "triage-playbook.md");
    assert.deepEqual(yield* fs.readDirectory(`${config.baseDir}/source`), ["0123456789abcdef"]);
    assert.isTrue(yield* fs.exists(staging));

    const session = yield* readSession;
    assert.include(session.context, "## This session runs inside T3 Code");
    assert.include(session.context, "- Repo: https://github.com/JerkyTreats/t3code");
    assert.include(session.context, "exact source and destination approval");
    assert.include(session.context, "(hosted web app)");
    assert.notInclude(session.context, "The server cloned");
    assert.notInclude(session.context, "The server is cloning");
    assert.notInclude(`${session.context}${session.prompt}`, "pingdotgg/t3code");
    assert.notInclude(session.context, "app.t3.codes");
    assert.notMatch(session.prompt, /\b(?:npx|bunx|pnpm\s+dlx)\b/u);
  }).pipe(Effect.provide(TestLayer)),
);
