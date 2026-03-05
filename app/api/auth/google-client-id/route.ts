import { NextResponse } from 'next/server';

export async function GET() {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const clientId = (
    runtimeEnv.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
    runtimeEnv.GOOGLE_CLIENT_ID ??
    ''
  )
    .trim();

  if (!clientId) {
    return NextResponse.json(
      { error: 'Google sign-in is not configured.' },
      { status: 500 }
    );
  }

  return NextResponse.json({ clientId }, { status: 200 });
}
