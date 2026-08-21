import { consumeLink, nativeCallbackLink } from '@/features/auth/server/magicLink';
import { PRESERVED_VERSIONS } from '../../rootTab';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (token && url.searchParams.get('native') === '1') {
    return new Response(null, {
      status: 303,
      headers: { Location: nativeCallbackLink(token) },
    });
  }

  try {
    const cookie = await consumeLink(request, token);
    const version = url.searchParams.get('version');
    const destination = version && PRESERVED_VERSIONS.has(version)
      ? `/?version=${encodeURIComponent(version)}`
      : '/';
    return new Response(null, {
      status: 303,
      headers: { Location: destination, 'Set-Cookie': cookie },
    });
  } catch {
    return new Response('Sign-in link is invalid or expired.', { status: 400 });
  }
}
