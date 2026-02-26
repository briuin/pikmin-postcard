import { NextResponse } from 'next/server';
import { assertSupportedImage, buildObjectKey, getStorageConfig } from '@/lib/storage';

export const runtime = 'nodejs';

type AwsS3Module = {
  S3Client: new (config: { region: string }) => {
    send: (command: unknown) => Promise<unknown>;
  };
  PutObjectCommand: new (input: {
    Bucket: string;
    Key: string;
    Body: Uint8Array;
    ContentType: string;
    CacheControl: string;
  }) => unknown;
};

async function loadAwsS3Module(): Promise<AwsS3Module> {
  try {
    const load = new Function('return import("@aws-sdk/client-s3")') as () => Promise<AwsS3Module>;
    return await load();
  } catch {
    throw new Error('Missing @aws-sdk/client-s3 dependency. Run npm install.');
  }
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('image');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
    }

    assertSupportedImage(file);

    const config = getStorageConfig();
    const key = buildObjectKey(file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());

    const { S3Client, PutObjectCommand } = await loadAwsS3Module();
    const s3 = new S3Client({ region: config.region });

    await s3.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: bytes,
        ContentType: file.type,
        CacheControl: 'public,max-age=31536000,immutable'
      })
    );

    return NextResponse.json(
      {
        key,
        imageUrl: `${config.baseUrl}/${key}`
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
