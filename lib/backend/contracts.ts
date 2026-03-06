import { NextResponse } from 'next/server';

export type ApiErrorPayload = {
  error: string;
  details?: string;
};

export function getUnknownErrorDetails(error: unknown): string | undefined {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function apiError(
  status: number,
  error: string,
  details?: string
): NextResponse<ApiErrorPayload> {
  return NextResponse.json(
    details ? { error, details } : { error },
    { status }
  );
}
