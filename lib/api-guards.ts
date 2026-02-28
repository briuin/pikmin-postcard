import { NextResponse } from 'next/server';
import { getAuthenticatedUser, isApprovedUser } from '@/lib/api-auth';

type CreatorActor = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;

type CreatorGuardResult =
  | { ok: true; actor: CreatorActor }
  | { ok: false; response: NextResponse };

export async function requireApprovedCreator(): Promise<CreatorGuardResult> {
  const actor = await getAuthenticatedUser({ createIfMissing: true });
  if (!actor) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
    };
  }
  if (!isApprovedUser(actor)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Account pending approval.' }, { status: 403 })
    };
  }
  if (!actor.canCreatePostcard) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'You are not allowed to create postcards.' },
        { status: 403 }
      )
    };
  }

  return { ok: true, actor };
}
