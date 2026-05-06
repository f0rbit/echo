import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://f0rbit.github.io",
  base: "/echo",
  output: "static",
  trailingSlash: "always",
});
