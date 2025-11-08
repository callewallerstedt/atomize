import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Ensure Prisma client is available during build/runtime with Turbopack
  serverExternalPackages: ["@prisma/client"],
};

export default nextConfig;
