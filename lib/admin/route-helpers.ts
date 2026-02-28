import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { getAuthenticatedUser, isManagerOrAboveRole } from '@/lib/api-auth';

type ManagerActor = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

type RequireManagerResult =
  | { ok: true; actor: ManagerActor }
  | { ok: false; response: NextResponse };

export async function requireManagerActor(): Promise<RequireManagerResult> {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    };
  }
  if (!isManagerOrAboveRole(actor.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden.' }, { status: 403 })
    };
  }

  return { ok: true, actor };
}

export function invalidQueryResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: 'Invalid query.',
      details: error.issues.map((item) => item.message).join('; ')
    },
    { status: 400 }
  );
}
