import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only: allow phone testing over LAN IP or cloudflared tunnel
  allowedDevOrigins: ["*.trycloudflare.com", "10.6.67.129"],
};

export default nextConfig;
