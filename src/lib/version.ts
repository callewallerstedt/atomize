// Automatically read version from environment variable set at build time
// The version is injected from package.json via next.config.ts
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

