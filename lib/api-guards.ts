import { NextResponse } from 'next/server';
import {
  getAuthenticatedUser,
  getAuthenticatedUserId,
  isAdminRole,
  isApprovedUser,
  isManagerOrAboveRole
} from '@/lib/api-auth';

type AuthActor = NonNullable<Awaited<ReturnType<typeof getAuthenticatedUser>>>;
type GuardResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

export async function withGuardedValue<T>(
  guardPromise: Promise<GuardResult<T>>,
  run: (value: T) => Promise<NextResponse>
): Promise<NextResponse> {
  const guard = await guardPromise;
  if (!guard.ok) {
    return guard.response;
  }

  return run(guard.value);
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
}

function forbiddenResponse(message = 'Forbidden.') {
  return NextResponse.json({ error: message }, { status: 403 });
}

async function requireAuthenticatedActor(options: {
  createIfMissing?: boolean;
} = {}): Promise<GuardResult<AuthActor>> {
  const actor = await getAuthenticatedUser({ createIfMissing: options.createIfMissing });
  if (!actor) {
    return {
      ok: false,
      response: unauthorizedResponse()
    };
  }

  return {
    ok: true,
    value: actor
  };
}

export async function requireAuthenticatedUserId(options: {
  createIfMissing?: boolean;
} = {}): Promise<GuardResult<string>> {
  const userId = await getAuthenticatedUserId({ createIfMissing: options.createIfMissing });
  if (!userId) {
    return {
      ok: false,
      response: unauthorizedResponse()
    };
  }

  return {
    ok: true,
    value: userId
  };
}

export async function requireApprovedActor(options: {
  createIfMissing?: boolean;
} = {}): Promise<GuardResult<AuthActor>> {
  const actor = await requireAuthenticatedActor({
    createIfMissing: options.createIfMissing
  });
  if (!actor.ok) {
    return actor;
  }
  if (!isApprovedUser(actor.value)) {
    return {
      ok: false,
      response: forbiddenResponse('Account pending approval.')
    };
  }

  return actor;
}

async function requireApprovedActorCapability(params: {
  canAccess: (actor: AuthActor) => boolean;
  forbiddenMessage: string;
}): Promise<GuardResult<AuthActor>> {
  const actor = await requireApprovedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!params.canAccess(actor.value)) {
    return {
      ok: false,
      response: forbiddenResponse(params.forbiddenMessage)
    };
  }

  return actor;
}

export async function requireApprovedCreator(): Promise<GuardResult<AuthActor>> {
  return requireApprovedActorCapability({
    canAccess: (actor) => actor.canCreatePostcard,
    forbiddenMessage: 'You are not allowed to create postcards.'
  });
}

export async function requireApprovedVoter(): Promise<GuardResult<AuthActor>> {
  return requireApprovedActorCapability({
    canAccess: (actor) => actor.canVote,
    forbiddenMessage: 'You are not allowed to vote or report locations.'
  });
}

export async function requireApprovedDetectionSubmitter(): Promise<GuardResult<AuthActor>> {
  return requireApprovedActorCapability({
    canAccess: (actor) => actor.canSubmitDetection,
    forbiddenMessage: 'You are not allowed to submit AI detection jobs.'
  });
}

async function requireRoleActor(
  roleCheck: (role: AuthActor['role']) => boolean
): Promise<GuardResult<AuthActor>> {
  const actor = await requireAuthenticatedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!roleCheck(actor.value.role)) {
    return {
      ok: false,
      response: forbiddenResponse()
    };
  }

  return actor;
}

export async function requireManagerActor(): Promise<GuardResult<AuthActor>> {
  return requireRoleActor((role) => isManagerOrAboveRole(role));
}

export async function requireAdminActor(): Promise<GuardResult<AuthActor>> {
  return requireRoleActor((role) => isAdminRole(role));
}
