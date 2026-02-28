import { NextResponse } from 'next/server';

type ImageFileResult =
  | { ok: true; file: File }
  | { ok: false; response: NextResponse };

export async function requireImageFileFromRequest(request: Request): Promise<ImageFileResult> {
  const formData = await request.formData();
  const file = formData.get('image');
  if (!(file instanceof File)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Missing image file.' }, { status: 400 })
    };
  }

  return { ok: true, file };
}
