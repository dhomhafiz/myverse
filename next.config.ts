import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  distDir: process.env.NEXT_BUILD_DIR || '.next',
  images: { unoptimized: true },
  devIndicators: false,
};

export default nextConfig;
