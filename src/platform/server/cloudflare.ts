import { getCloudflareContext } from '@opennextjs/cloudflare';

export async function getCloudflareEnv(): Promise<CloudflareEnv> {
  const { env } = await getCloudflareContext({ async: true });
  return env;
}

export async function getOptionalCloudflareEnv(): Promise<CloudflareEnv | undefined> {
  try {
    return await getCloudflareEnv();
  } catch {
    return undefined;
  }
}
