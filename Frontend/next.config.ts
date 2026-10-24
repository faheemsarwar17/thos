import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Dev-only Next.js badge overlapped topbar actions (G17), and bottom-left covers the rail footer and mobile tabs.
  devIndicators: false,
  // Lets a production build run beside `next dev` without clobbering its .next folder (e.g. NEXT_DIST_DIR=.next-build).
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
