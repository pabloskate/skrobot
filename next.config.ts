import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {
  // The app is commonly tested from phones and remote browsers over Tailscale.
  // Keep that development origin authorized so Next can hydrate the client and
  // establish its development WebSocket when the page is not opened as localhost.
  allowedDevOrigins: [
    '127.0.0.1',
    '100.79.108.61',
    'pablos-13-inch-macbook-air.tail5cae3f.ts.net',
  ],
  transpilePackages: ['@skrobot/animations'],
};

export default nextConfig;

// Makes getCloudflareContext() (bindings, .dev.vars) work inside `next dev`.
initOpenNextCloudflareForDev();
