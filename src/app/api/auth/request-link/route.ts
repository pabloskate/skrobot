import { requestLink } from '@/features/auth/server/magicLink';

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: unknown };
  try {
    return Response.json(await requestLink(request, body.email));
  } catch (error) {
    const message = error instanceof Error && error.message === 'invalid_email' ? 'Enter a valid email address' : 'Could not send sign-in link';
    return Response.json({ error: message }, { status: 400 });
  }
}
