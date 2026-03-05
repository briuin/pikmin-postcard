import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';

const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
const tablePrefix = process.env.DDB_TABLE_PREFIX || 'pikmin-postcard';
const usersTableName = `${tablePrefix}-users`;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
  marshallOptions: { removeUndefinedValues: true }
});

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
}

function verifyJwt(token: string, secret: string): { sub: string } | null {
  try {
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    if (!headerPart || !payloadPart || !signaturePart) {
      return null;
    }

    const signingInput = `${headerPart}.${payloadPart}`;
    const expected = crypto.createHmac('sha256', secret).update(signingInput).digest();
    const signature = fromBase64Url(signaturePart);
    if (expected.length !== signature.length || !crypto.timingSafeEqual(expected, signature)) {
      return null;
    }

    const payload = JSON.parse(fromBase64Url(payloadPart).toString('utf8')) as {
      sub?: string;
      exp?: number;
    };
    if (!payload?.sub || typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) {
      return null;
    }
    return { sub: payload.sub };
  } catch {
    return null;
  }
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

export async function GET(request: Request) {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const secret = (runtimeEnv.APP_JWT_SECRET ?? '').trim();
  const token = getBearerToken(request);
  if (!secret || !token) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const payload = verifyJwt(token, secret);
  if (!payload?.sub) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  const result = await ddb.send(
    new GetCommand({
      TableName: usersTableName,
      Key: { id: payload.sub }
    })
  );
  const user = result.Item;
  if (!user) {
    return NextResponse.json({ user: null }, { status: 200 });
  }

  return NextResponse.json(
    {
      user: {
        id: String(user.id),
        email: String(user.email || '').trim().toLowerCase(),
        displayName: user.displayName ? String(user.displayName) : null,
        role: String(user.role || 'MEMBER').toUpperCase(),
        approvalStatus: String(user.approvalStatus || 'PENDING').toUpperCase()
      }
    },
    { status: 200 }
  );
}
