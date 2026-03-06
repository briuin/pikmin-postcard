import crypto from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand
} from '@aws-sdk/lib-dynamodb';

function parseArgs(argv) {
  const args = {
    count: 32,
    email: 'local-seed@pikmin.askans.app'
  };

  for (const entry of argv) {
    if (entry.startsWith('--count=')) {
      const value = Number.parseInt(entry.slice('--count='.length), 10);
      if (Number.isFinite(value) && value > 0) {
        args.count = value;
      }
    } else if (entry.startsWith('--email=')) {
      const value = entry.slice('--email='.length).trim().toLowerCase();
      if (value.length > 3) {
        args.email = value;
      }
    }
  }

  return args;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function toFixed6(value) {
  return Number.parseFloat(value.toFixed(6));
}

function nowIso() {
  return new Date().toISOString();
}

function newId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function chunk(list, size) {
  const out = [];
  for (let index = 0; index < list.length; index += size) {
    out.push(list.slice(index, index + size));
  }
  return out;
}

const locations = [
  { placeName: 'Marina Bay', city: 'Singapore', state: 'Singapore', country: 'Singapore', lat: 1.2834, lon: 103.8607 },
  { placeName: 'Tokyo Tower', city: 'Tokyo', state: 'Tokyo', country: 'Japan', lat: 35.6586, lon: 139.7454 },
  { placeName: 'Shibuya Crossing', city: 'Tokyo', state: 'Tokyo', country: 'Japan', lat: 35.6595, lon: 139.7005 },
  { placeName: 'Namsan Tower', city: 'Seoul', state: 'Seoul', country: 'South Korea', lat: 37.5512, lon: 126.9882 },
  { placeName: 'Taipei 101', city: 'Taipei', state: 'Taipei', country: 'Taiwan', lat: 25.0339, lon: 121.5645 },
  { placeName: 'Victoria Harbour', city: 'Hong Kong', state: 'Hong Kong', country: 'Hong Kong', lat: 22.2933, lon: 114.1694 },
  { placeName: 'Sydney Opera House', city: 'Sydney', state: 'NSW', country: 'Australia', lat: -33.8568, lon: 151.2153 },
  { placeName: 'Eiffel Tower', city: 'Paris', state: 'Ile-de-France', country: 'France', lat: 48.8584, lon: 2.2945 },
  { placeName: 'Tower Bridge', city: 'London', state: 'England', country: 'United Kingdom', lat: 51.5055, lon: -0.0754 },
  { placeName: 'Central Park', city: 'New York', state: 'New York', country: 'United States', lat: 40.7829, lon: -73.9654 },
  { placeName: 'Golden Gate Bridge', city: 'San Francisco', state: 'California', country: 'United States', lat: 37.8199, lon: -122.4783 },
  { placeName: 'CN Tower', city: 'Toronto', state: 'Ontario', country: 'Canada', lat: 43.6426, lon: -79.3871 }
];

const titlePrefixes = ['Big Flower', 'Mushroom Spot', 'Pikmin Walk', 'Treasure Trail', 'Postcard Stop', 'Cute View'];
const titleSuffixes = ['Sunrise', 'Golden Hour', 'Blue Sky', 'Hidden Gem', 'Cozy Place', 'Adventure'];
const noteBits = ['Great walk today.', 'Perfect weather for Pikmin Bloom.', 'Fun postcard pickup.', 'Nice view and fresh air.'];
const types = ['MUSHROOM', 'FLOWER', 'EXPLORATION'];

async function findUserByEmail(doc, usersTableName, email) {
  const result = await doc.send(
    new QueryCommand({
      TableName: usersTableName,
      IndexName: 'email-index',
      KeyConditionExpression: '#email = :email',
      ExpressionAttributeNames: { '#email': 'email' },
      ExpressionAttributeValues: { ':email': email },
      Limit: 1
    })
  );

  return result.Items?.[0] || null;
}

async function ensureSeedUser(doc, usersTableName, email) {
  const existing = await findUserByEmail(doc, usersTableName, email);
  const timestamp = nowIso();

  if (existing) {
    const updated = {
      ...existing,
      displayName: 'Local Seeder',
      role: 'MEMBER',
      approvalStatus: 'APPROVED',
      canCreatePostcard:
        typeof existing.canCreatePostcard === 'boolean' ? existing.canCreatePostcard : true,
      canSubmitDetection:
        typeof existing.canSubmitDetection === 'boolean' ? existing.canSubmitDetection : true,
      canVote: typeof existing.canVote === 'boolean' ? existing.canVote : true,
      updatedAt: timestamp
    };

    await doc.send(
      new PutCommand({
        TableName: usersTableName,
        Item: updated
      })
    );

    return updated;
  }

  const created = {
    id: newId('usr'),
    email,
    displayName: 'Local Seeder',
    role: 'MEMBER',
    approvalStatus: 'APPROVED',
    canCreatePostcard: true,
    canSubmitDetection: true,
    canVote: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await doc.send(
    new PutCommand({
      TableName: usersTableName,
      Item: created
    })
  );

  return created;
}

async function batchWritePostcards(doc, postcardsTableName, rows) {
  for (const rowChunk of chunk(rows, 25)) {
    await doc.send(
      new BatchWriteCommand({
        RequestItems: {
          [postcardsTableName]: rowChunk.map((row) => ({
            PutRequest: {
              Item: row
            }
          }))
        }
      })
    );
  }
}

async function main() {
  const { count, email } = parseArgs(process.argv.slice(2));

  const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
  const prefix = String(process.env.DDB_TABLE_PREFIX || 'pikmin-postcard-dev').trim() || 'pikmin-postcard-dev';
  const usersTableName = `${prefix}-users`;
  const postcardsTableName = `${prefix}-postcards`;

  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region }), {
    marshallOptions: { removeUndefinedValues: true }
  });

  const user = await ensureSeedUser(doc, usersTableName, email);

  const nowMs = Date.now();
  const rows = Array.from({ length: count }, (_, index) => {
    const base = locations[index % locations.length];
    const lat = toFixed6(clamp(base.lat + (Math.random() - 0.5) * 0.18, -89.9, 89.9));
    const lon = toFixed6(clamp(base.lon + (Math.random() - 0.5) * 0.24, -179.9, 179.9));
    const createdAtDate = new Date(nowMs - Math.floor(Math.random() * 18 * 24 * 60 * 60 * 1000));
    const createdAt = createdAtDate.toISOString();
    const postcardType = pick(types);
    const aiGenerated = Math.random() < 0.45;
    const confidence = aiGenerated ? Number.parseFloat((0.72 + Math.random() * 0.27).toFixed(2)) : null;
    const aiLat = aiGenerated ? toFixed6(lat + (Math.random() - 0.5) * 0.02) : null;
    const aiLon = aiGenerated ? toFixed6(lon + (Math.random() - 0.5) * 0.02) : null;
    const imageSeed = `${base.city.toLowerCase().replace(/\s+/g, '-')}-${index}-${Math.floor(Math.random() * 9000)}`;
    const imageUrl = `https://picsum.photos/seed/${imageSeed}/960/640`;

    return {
      id: newId('pc'),
      userId: String(user.id),
      title: `${pick(titlePrefixes)} ${pick(titleSuffixes)}`,
      postcardType,
      notes: Math.random() < 0.65 ? pick(noteBits) : null,
      imageUrl,
      originalImageUrl: imageUrl,
      capturedAt: createdAt,
      city: base.city,
      state: base.state,
      country: base.country,
      placeName: `${base.placeName}, ${base.city}`,
      latitude: lat,
      longitude: lon,
      aiLatitude: aiLat,
      aiLongitude: aiLon,
      aiConfidence: confidence,
      aiPlaceGuess: aiGenerated ? `${base.placeName}, ${base.country}` : null,
      likeCount: Math.floor(Math.random() * 40),
      dislikeCount: Math.floor(Math.random() * 8),
      wrongLocationReports: Math.floor(Math.random() * 4),
      locationStatus: aiGenerated ? 'AUTO' : 'MANUAL',
      locationModelVersion: aiGenerated ? 'gemini-2.5-flash' : null,
      reportVersion: 1,
      deletedAt: null,
      createdAt,
      updatedAt: createdAt
    };
  });

  await batchWritePostcards(doc, postcardsTableName, rows);
  console.log(`Seeded ${rows.length} postcards for ${email} in ${postcardsTableName}`);
}

main().catch((error) => {
  console.error('Failed to seed random postcards:', error);
  process.exit(1);
});
