import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const devApi = process.env.BETWEEN_ADMIN_DEV_API;
if (devApi && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(devApi))
  throw new Error("Development API must be an explicitly started loopback test service");
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    host: "127.0.0.1",
    ...(devApi
      ? {
          proxy: {
            "/api": {
              target: devApi,
              changeOrigin: true,
              configure(proxy) {
                proxy.on("proxyReq", (request) => request.setHeader("Origin", devApi));
              },
            },
          },
        }
      : {}),
  },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
