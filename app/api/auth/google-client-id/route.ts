import { NextResponse } from 'next/server';

export async function GET() {
  const clientId = (
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ??
    process.env.GOOGLE_CLIENT_ID ??
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
