import type { NextConfig } from 'next';
import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

const nextConfig: NextConfig = {};

export default nextConfig;

// Makes getCloudflareContext() (bindings, .dev.vars) work inside `next dev`.
initOpenNextCloudflareForDev();
