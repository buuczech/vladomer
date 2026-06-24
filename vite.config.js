import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" keeps asset paths relative, so the build works under any
// GitHub Pages project path (https://<user>.github.io/<repo>/) without
// hard-coding the repository name.
export default defineConfig({
  base: "./",
  plugins: [react()],
});
