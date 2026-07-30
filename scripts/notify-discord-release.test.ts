import { assert, it } from "@effect/vitest";

import {
  buildDiscordReleaseAnnouncement,
  InvalidDiscordReleaseUrlError,
} from "./notify-discord-release.ts";

function latestAnnouncementOptions(releaseUrl: URL) {
  return {
    target: "latest" as const,
    roleId: "222222222222222222",
    releaseName: "T3 Code v1.2.3",
    version: "1.2.3",
    tag: "v1.2.3",
    releaseUrl,
    timestamp: "2026-05-01T01:41:00.000Z",
  };
}

it("builds a prerelease Discord announcement for nightly subscribers", () => {
  assert.deepStrictEqual(
    buildDiscordReleaseAnnouncement({
      target: "prerelease",
      roleId: "111111111111111111",
      releaseName: "T3 Code Nightly 1.2.4-nightly.20260501.17 (abcdef123456)",
      version: "1.2.4-nightly.20260501.17",
      tag: "v1.2.4-nightly.20260501.17",
      releaseUrl: new URL(
        "https://github.com/JerkyTreats/t3code/releases/tag/v1.2.4-nightly.20260501.17",
      ),
      timestamp: "2026-05-01T01:41:00.000Z",
    }),
    {
      content:
        "<@&111111111111111111> Prerelease published: T3 Code Nightly 1.2.4-nightly.20260501.17 (abcdef123456)",
      allowed_mentions: {
        roles: ["111111111111111111"],
      },
      embeds: [
        {
          title: "T3 Code Nightly 1.2.4-nightly.20260501.17 (abcdef123456)",
          url: "https://github.com/JerkyTreats/t3code/releases/tag/v1.2.4-nightly.20260501.17",
          description: "A new T3 Code prerelease is available for nightly testers.",
          color: 0x5865f2,
          fields: [
            {
              name: "Version",
              value: "1.2.4-nightly.20260501.17",
              inline: true,
            },
            {
              name: "Tag",
              value: "v1.2.4-nightly.20260501.17",
              inline: true,
            },
          ],
          timestamp: "2026-05-01T01:41:00.000Z",
        },
      ],
    },
  );
});

it("builds a latest Discord announcement for stable subscribers", () => {
  assert.deepStrictEqual(
    buildDiscordReleaseAnnouncement(
      latestAnnouncementOptions(
        new URL("https://github.com/JerkyTreats/t3code/releases/tag/v1.2.3"),
      ),
    ),
    {
      content: "<@&222222222222222222> Latest published: T3 Code v1.2.3",
      allowed_mentions: {
        roles: ["222222222222222222"],
      },
      embeds: [
        {
          title: "T3 Code v1.2.3",
          url: "https://github.com/JerkyTreats/t3code/releases/tag/v1.2.3",
          description: "A new T3 Code latest release is available.",
          color: 0x2ecc71,
          fields: [
            {
              name: "Version",
              value: "1.2.3",
              inline: true,
            },
            {
              name: "Tag",
              value: "v1.2.3",
              inline: true,
            },
          ],
          timestamp: "2026-05-01T01:41:00.000Z",
        },
      ],
    },
  );
});

it("rejects an upstream Discord release URL", () => {
  const upstreamRepository = ["pingdotgg", "t3code"].join("/");
  assert.throws(
    () =>
      buildDiscordReleaseAnnouncement(
        latestAnnouncementOptions(
          new URL(`https://github.com/${upstreamRepository}/releases/tag/v1.2.3`),
        ),
      ),
    InvalidDiscordReleaseUrlError,
  );
});

it("rejects malformed or ambiguous Discord release URLs", () => {
  const invalidUrls = [
    "http://github.com/JerkyTreats/t3code/releases/tag/v1.2.3",
    "https://github.com/JerkyTreats/t3code/releases/tag/",
    "https://github.com/JerkyTreats/t3code.evil/releases/tag/v1.2.3",
    "https://github.com/JerkyTreats/t3code/releases/tag/v1.2.3?download=1",
    "https://user@github.com/JerkyTreats/t3code/releases/tag/v1.2.3",
  ];

  for (const invalidUrl of invalidUrls) {
    assert.throws(
      () => buildDiscordReleaseAnnouncement(latestAnnouncementOptions(new URL(invalidUrl))),
      InvalidDiscordReleaseUrlError,
    );
  }
});

it("rejects a Discord release URL whose tag differs from the announcement", () => {
  assert.throws(
    () =>
      buildDiscordReleaseAnnouncement(
        latestAnnouncementOptions(
          new URL("https://github.com/JerkyTreats/t3code/releases/tag/v9.9.9"),
        ),
      ),
    InvalidDiscordReleaseUrlError,
  );
});
