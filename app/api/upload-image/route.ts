import { NextResponse } from 'next/server';
import { requireApprovedCreator, withGuardedValue } from '@/lib/api-guards';
import { withOptionalExternalApiProxy } from '@/lib/external-api-proxy';
import { requireImageFileWithUploadAction } from '@/lib/request-image';
import { assertSupportedImage, buildObjectKey, uploadBytesToStorage } from '@/lib/storage';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  return withOptionalExternalApiProxy({
    request,
    path: '/upload-image',
    runLocal: async () =>
      withGuardedValue(requireApprovedCreator(), async (actor) => {
        try {
          const imageFile = await requireImageFileWithUploadAction({
            request,
            userId: actor.id,
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
      })
  });
}
