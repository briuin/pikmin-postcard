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

type QueryParseResult<T> = { success: true; data: T } | { success: false; error: ZodError };

export function safeParseRequestQuery<T>(
  request: Request,
  parse: (searchParams: URLSearchParams) => QueryParseResult<T>
): QueryParseResult<T> {
  const searchParams = new URL(request.url).searchParams;
  return parse(searchParams);
}

export async function requireManagerAndParseQuery<T>(
  request: Request,
  parse: () => QueryParseResult<T>
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
  parse: () => QueryParseResult<T>,
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
