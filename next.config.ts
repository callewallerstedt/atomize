import type { NextConfig } from "next";
import { execSync } from "child_process";

// Get commit date from git at build time
let appVersion = "0.1.0";
try {
  // Get the commit date (author date)
  const commitDate = execSync("git log -1 --format=%ai HEAD", { encoding: "utf-8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  
  // Format date as dd.mm.yy (e.g., 12.11.25 for 2025-11-12)
  if (commitDate) {
    const date = new Date(commitDate);
    const day = date.getDate().toString().padStart(2, "0");
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const year = date.getFullYear().toString().slice(-2); // Last 2 digits
    appVersion = `${day}.${month}.${year}`;
  }
} catch (e) {
  console.warn("Could not read git date, using default");
}

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // Ensure Prisma client is available during build/runtime with Turbopack
  serverExternalPackages: ["@prisma/client"],
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
};

export default nextConfig;
