import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  transpilePackages: ['@skrobot/animations'],
};

export default nextConfig;

// Makes getCloudflareContext() (bindings, .dev.vars) work inside `next dev`.
initOpenNextCloudflareForDev();
