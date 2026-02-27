import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assertSupportedImage, buildObjectKey, uploadBytesToStorage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
    }

    assertSupportedImage(file);

    const key = buildObjectKey(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const imageUrl = await uploadBytesToStorage({
      key,
      bytes,
      contentType: file.type
    });

    return NextResponse.json(
      {
        key,
        imageUrl
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to upload image.',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
