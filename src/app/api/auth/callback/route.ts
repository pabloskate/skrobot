import { consumeLink, nativeCallbackLink } from '@/features/auth/server/magicLink';

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
    return new Response(null, {
      status: 303,
      headers: { Location: '/', 'Set-Cookie': cookie },
    });
  } catch {
    return new Response('Sign-in link is invalid or expired.', { status: 400 });
  }
}
