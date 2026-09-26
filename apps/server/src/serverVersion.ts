import packageJson from "../package.json" with { type: "json" };

declare const __T3CODE_BUILD_VERSION__: string | undefined;

export const serverBaseVersion = packageJson.version;
export const serverVersion =
  typeof __T3CODE_BUILD_VERSION__ === "undefined" ? serverBaseVersion : __T3CODE_BUILD_VERSION__;
