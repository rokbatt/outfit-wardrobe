import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: { unoptimized: true },
  // open the dev server from a phone on the same Wi-Fi (http://192.168.x.x:3000)
  allowedDevOrigins: ["192.168.*.*"],
};

export default nextConfig;
