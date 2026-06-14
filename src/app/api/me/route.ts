import { getCurrentUser, getMeResponse } from '@/features/auth/server/sessions';

export async function GET(request: Request) {
  const user = await getCurrentUser(request);
  return Response.json(await getMeResponse(user));
}
