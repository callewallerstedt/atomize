import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Ensure Prisma client is available during build
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
  },
};

export default nextConfig;
