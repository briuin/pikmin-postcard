import { NextResponse } from 'next/server';
import {
  buildUploadedFileActionMetadata,
  recordUserAction
} from '@/lib/user-action-log';

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

export async function requireImageFileWithUploadAction(params: {
  request: Request;
  userId: string;
  action: string;
}): Promise<ImageFileResult> {
  const imageFile = await requireImageFileFromRequest(params.request);
  if (!imageFile.ok) {
    return imageFile;
  }

  await recordUserAction({
    request: params.request,
    userId: params.userId,
    action: params.action,
    metadata: buildUploadedFileActionMetadata(imageFile.file)
  });

  return imageFile;
}
