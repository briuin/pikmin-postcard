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

export async function requireApprovedCreator(): Promise<GuardResult<AuthActor>> {
  const actor = await requireApprovedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!actor.value.canCreatePostcard) {
    return {
      ok: false,
      response: forbiddenResponse('You are not allowed to create postcards.')
    };
  }

  return actor;
}

export async function requireApprovedVoter(): Promise<GuardResult<AuthActor>> {
  const actor = await requireApprovedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!actor.value.canVote) {
    return {
      ok: false,
      response: forbiddenResponse('You are not allowed to vote or report locations.')
    };
  }

  return actor;
}

export async function requireApprovedDetectionSubmitter(): Promise<GuardResult<AuthActor>> {
  const actor = await requireApprovedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!actor.value.canSubmitDetection) {
    return {
      ok: false,
      response: forbiddenResponse('You are not allowed to submit AI detection jobs.')
    };
  }

  return actor;
}

export async function requireManagerActor(): Promise<GuardResult<AuthActor>> {
  const actor = await requireAuthenticatedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!isManagerOrAboveRole(actor.value.role)) {
    return {
      ok: false,
      response: forbiddenResponse()
    };
  }

  return actor;
}

export async function requireAdminActor(): Promise<GuardResult<AuthActor>> {
  const actor = await requireAuthenticatedActor({ createIfMissing: true });
  if (!actor.ok) {
    return actor;
  }
  if (!isAdminRole(actor.value.role)) {
    return {
      ok: false,
      response: forbiddenResponse()
    };
  }

  return actor;
}
