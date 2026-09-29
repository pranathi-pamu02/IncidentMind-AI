import type { NextConfig } from "next";
const config: NextConfig = { output: "standalone", outputFileTracingRoot: process.cwd() };
export default config;
