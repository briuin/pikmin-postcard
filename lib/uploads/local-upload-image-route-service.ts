import { NextResponse } from 'next/server';
import { requireImageFileWithUploadAction } from '@/lib/request-image';
import { assertSupportedImage, buildObjectKey, uploadBytesToStorage } from '@/lib/storage';

export async function uploadImageLocal(args: {
  request: Request;
  actorId: string;
}): Promise<NextResponse> {
  const { request, actorId } = args;
  try {
    const imageFile = await requireImageFileWithUploadAction({
      request,
      userId: actorId,
      action: 'IMAGE_UPLOAD'
    });
    if (!imageFile.ok) {
      return imageFile.response;
    }
    const { file } = imageFile;

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
