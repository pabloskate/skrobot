import { consumeLink } from '@/features/auth/server/magicLink';

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token');
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
