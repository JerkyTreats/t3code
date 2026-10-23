import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
  },
  pack: [
    {
      clean: true,
      deps: {
        alwaysBundle: (id) => id.startsWith("@t3tools/"),
        neverBundle: (id) => id === "electron",
      },
      entry: ["src/main.ts"],
      format: "cjs",
      outDir: "dist-electron",
      outExtensions: () => ({ js: ".cjs" }),
      sourcemap: true,
    },
    {
      clean: false,
      deps: {
        alwaysBundle: (id) => id.startsWith("@t3tools/"),
        neverBundle: (id) => id === "electron",
      },
      entry: ["src/preload.ts"],
      format: "cjs",
      outDir: "dist-electron",
      outExtensions: () => ({ js: ".cjs" }),
      sourcemap: true,
    },
  ],
});
