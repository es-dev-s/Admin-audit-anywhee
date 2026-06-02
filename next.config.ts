import type { NextConfig } from "next";

/** Hostnames allowed to load dev assets when not using localhost (Next.js 16+). */
const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "localhost,127.0.0.1")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins,
};

export default nextConfig;
