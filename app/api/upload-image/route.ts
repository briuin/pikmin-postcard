import { NextResponse } from 'next/server';
import { requireApprovedCreator } from '@/lib/api-guards';
import { assertSupportedImage, buildObjectKey, uploadBytesToStorage } from '@/lib/storage';
import { recordUserAction } from '@/lib/user-action-log';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const guard = await requireApprovedCreator();
    if (!guard.ok) {
      return guard.response;
    }
    const { actor } = guard;

    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
    }

    await recordUserAction({
      request,
      userId: actor.id,
      action: 'IMAGE_UPLOAD',
      metadata: {
        fileName: file.name,
        mimeType: file.type,
        size: file.size
      }
    });

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
