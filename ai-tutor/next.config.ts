import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["tldraw"],
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
