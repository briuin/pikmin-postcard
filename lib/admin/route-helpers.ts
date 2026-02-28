import { ZodError } from 'zod';
import { NextResponse } from 'next/server';
import { requireManagerActor } from '@/lib/api-guards';

export function invalidQueryResponse(error: ZodError) {
  return NextResponse.json(
    {
      error: 'Invalid query.',
      details: error.issues.map((item) => item.message).join('; ')
    },
    { status: 400 }
  );
}

type ManagerActor = {
  id: string;
};

type ManagerQueryResult<T> =
  | { ok: true; actor: ManagerActor; query: T }
  | { ok: false; response: NextResponse };

export async function requireManagerAndParseQuery<T>(
  request: Request,
  parse: () => { success: true; data: T } | { success: false; error: ZodError }
): Promise<ManagerQueryResult<T>> {
  const guard = await requireManagerActor();
  if (!guard.ok) {
    return { ok: false, response: guard.response };
  }

  const queryParse = parse();
  if (!queryParse.success) {
    return { ok: false, response: invalidQueryResponse(queryParse.error) };
  }

  return {
    ok: true,
    actor: guard.value,
    query: queryParse.data
  };
}

export async function withManagerParsedQuery<T>(
  request: Request,
  parse: () => { success: true; data: T } | { success: false; error: ZodError },
  run: (context: { actor: ManagerActor; query: T }) => Promise<NextResponse>
): Promise<NextResponse> {
  const requestContext = await requireManagerAndParseQuery(request, parse);
  if (!requestContext.ok) {
    return requestContext.response;
  }

  return run({
    actor: requestContext.actor,
    query: requestContext.query
  });
}
