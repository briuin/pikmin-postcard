import { NextResponse } from 'next/server';
import { requireApprovedCreator } from '@/lib/api-guards';
import { requireImageFileFromRequest } from '@/lib/request-image';
import { assertSupportedImage, buildObjectKey, uploadBytesToStorage } from '@/lib/storage';
import {
  buildUploadedFileActionMetadata,
  recordUserAction
} from '@/lib/user-action-log';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const guard = await requireApprovedCreator();
    if (!guard.ok) {
      return guard.response;
    }
    const actor = guard.value;

    const imageFile = await requireImageFileFromRequest(request);
    if (!imageFile.ok) {
      return imageFile.response;
    }
    const { file } = imageFile;

    await recordUserAction({
      request,
      userId: actor.id,
      action: 'IMAGE_UPLOAD',
      metadata: buildUploadedFileActionMetadata(file)
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
