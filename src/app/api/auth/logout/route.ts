import { destroySessionCookie } from '@/features/auth/server/sessions';

export async function POST(request: Request) {
  return Response.json(
    { ok: true },
    {
      headers: { 'Set-Cookie': await destroySessionCookie(request) },
    },
  );
}
