import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = {
  root: fileURLToPath(new URL("./playground", import.meta.url)),
  publicDir: false as const,
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1" },
  build: { outDir: "../dist-playground", emptyOutDir: true, sourcemap: false as const },
  test: { root: fileURLToPath(new URL(".", import.meta.url)), include: ["tests/**/*.test.{ts,tsx}"] },
};

export default defineConfig(config);
