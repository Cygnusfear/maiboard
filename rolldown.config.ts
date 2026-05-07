import { defineConfig } from "rolldown";

export default defineConfig({
  input: "src/extension.ts",
  external: ["vscode"],
  output: {
    file: "dist/extension.cjs",
    format: "cjs",
    sourcemap: true,
  },
});
