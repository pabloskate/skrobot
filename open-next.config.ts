import { defineCloudflareConfig } from '@opennextjs/cloudflare';

// Defaults are fine: the app is a static shell + one API route, so no
// incremental cache (R2/KV) is needed. Revisit if ISR/SSG caching is added.
export default defineCloudflareConfig();
