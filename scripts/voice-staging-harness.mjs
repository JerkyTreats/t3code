#!/usr/bin/env node
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { runVoiceHttpProbe } from "./lib/voice-staging-probe.mjs";

export function validateStagingOrigin(value) {
  const url = new URL(value);
  if (
    url.origin !== value ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !/^(stage|staging)([.-])/.test(url.hostname)
  ) {
    throw new Error("explicit-staging-https-origin-required");
  }
  return url.origin;
}

export async function runStagingVoiceHarness({
  origin,
  credential,
  outputDirectory,
  voiceId,
  fetch: request = fetch,
}) {
  validateStagingOrigin(origin);
  if (typeof credential !== "string" || !credential.trim() || credential.length > 4096)
    throw new Error("pairing-credential-required");
  // Never follow a redirect with the one-time credential or session cookie.
  const paired = await request(`${origin}/api/auth/browser-session`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ credential: credential.trim() }),
  });
  if (!paired.ok) throw new Error("staging-pairing-failed");
  const cookie = paired.headers
    .getSetCookie()
    .map((header) => header.split(";", 1)[0])
    .join("; ");
  if (!cookie) throw new Error("staging-session-cookie-missing");
  const result = await runVoiceHttpProbe(
    (endpoint, init = {}, authenticated = true) =>
      request(`${origin}${endpoint}`, {
        ...init,
        redirect: "error",
        signal: AbortSignal.timeout(125_000),
        headers: {
          "content-type": "application/json",
          origin,
          ...(authenticated ? { cookie } : {}),
        },
      }),
    { voiceId },
  );
  // Output contains synthetic audio and booleans only, never topology or credentials.
  await NodeFSP.mkdir(outputDirectory, { mode: 0o700 });
  await NodeFSP.writeFile(NodePath.join(outputDirectory, "speech.wav"), result.audio, {
    mode: 0o600,
    flag: "wx",
  });
  await NodeFSP.writeFile(
    NodePath.join(outputDirectory, "summary.json"),
    `${JSON.stringify(result.summary, null, 2)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  return result.summary;
}

async function main() {
  const args = process.argv.slice(2);
  if (
    ![4, 6].includes(args.length) ||
    args[0] !== "--staging-origin" ||
    args[2] !== "--output-dir" ||
    (args.length === 6 && args[4] !== "--voice")
  )
    throw new Error("invalid-harness-arguments");
  let credential = "";
  for await (const chunk of process.stdin) {
    credential += chunk;
    if (credential.length > 4096) throw new Error("pairing-credential-too-large");
  }
  const summary = await runStagingVoiceHarness({
    origin: args[1],
    credential,
    outputDirectory: args[3],
    ...(args[5] === undefined ? {} : { voiceId: args[5] }),
  });
  process.stdout.write(`${JSON.stringify({ success: true, ...summary })}\n`);
}

if (process.argv[1] && import.meta.url === NodeURL.pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    process.stderr.write(
      "Staging voice harness failed. Check staging configuration and use a fresh pairing credential.\n",
    );
    process.exitCode = 1;
  });
}
