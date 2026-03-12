import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ddbDoc, ddbTables } from '@/lib/repos/dynamodb/shared';
import {
  clonePlantPath,
  createPlantPath,
  listPlantPaths,
  savePublicPlantPath,
  unsavePublicPlantPath,
  updatePlantPath
} from '@/lib/plant-paths/service';
import { PlantPathVisibility } from '@/lib/plant-paths/types';
import { FakeDynamoDocClient } from '@/tests/helpers/fake-dynamodb-doc';

const originalSend = ddbDoc.send.bind(ddbDoc);

afterEach(() => {
  (ddbDoc as { send: typeof ddbDoc.send }).send = originalSend;
});

function setFakeClient(seed: Record<string, Array<Record<string, unknown>>>) {
  const fake = new FakeDynamoDocClient(seed);
  (ddbDoc as { send: typeof ddbDoc.send }).send = fake.send.bind(fake) as typeof ddbDoc.send;
  return fake;
}

test('plant paths list own, saved, and public paths correctly', async () => {
  setFakeClient({
    [ddbTables.users]: [
      { id: 'usr_1', email: 'alice@example.com', displayName: 'Alice' },
      { id: 'usr_2', email: 'bob@example.com', displayName: 'Bob' },
      { id: 'usr_3', email: 'carol@example.com', displayName: null }
    ],
    [ddbTables.plantPaths]: [
      {
        id: 'pp_1',
        ownerUserId: 'usr_1',
        name: 'Private Loop',
        visibility: 'PRIVATE',
        coordinates: [{ id: 'a', latitude: 1.1, longitude: 103.1 }],
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z'
      },
      {
        id: 'pp_2',
        ownerUserId: 'usr_2',
        name: 'Bob Public',
        visibility: 'PUBLIC',
        coordinates: [{ id: 'b', latitude: 2.2, longitude: 104.2 }],
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-11T10:00:00.000Z'
      },
      {
        id: 'pp_3',
        ownerUserId: 'usr_3',
        name: 'Carol Public',
        visibility: 'PUBLIC',
        coordinates: [{ id: 'c', latitude: 3.3, longitude: 105.3 }],
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-12T10:00:00.000Z'
      }
    ],
    [ddbTables.plantPathSaves]: [
      {
        id: 'pps_1',
        userId: 'usr_1',
        pathId: 'pp_2',
        uniqueKey: 'usr_1#pp_2',
        createdAt: '2026-03-11T11:00:00.000Z'
      }
    ]
  });

  const payload = await listPlantPaths('usr_1');
  assert.deepEqual(payload.ownedPaths.map((item) => item.id), ['pp_1']);
  assert.deepEqual(payload.savedPaths.map((item) => item.id), ['pp_2']);
  assert.deepEqual(payload.publicPaths.map((item) => item.id), ['pp_3', 'pp_2']);
  assert.equal(payload.publicPaths[1].isSavedByViewer, true);
});

test('plant paths can be created, updated, saved, unsaved, and cloned', async () => {
  const fake = setFakeClient({
    [ddbTables.users]: [
      { id: 'usr_1', email: 'alice@example.com', displayName: 'Alice' },
      { id: 'usr_2', email: 'bob@example.com', displayName: 'Bob' }
    ],
    [ddbTables.plantPaths]: [
      {
        id: 'pp_public',
        ownerUserId: 'usr_2',
        name: 'Shared Route',
        visibility: 'PUBLIC',
        coordinates: [
          { id: 'p1', latitude: 1.1, longitude: 103.1 },
          { id: 'p2', latitude: 1.2, longitude: 103.2 }
        ],
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z'
      }
    ],
    [ddbTables.plantPathSaves]: []
  });

  const created = await createPlantPath({ userId: 'usr_1', name: 'My Route' });
  assert.equal(created.name, 'My Route');
  assert.equal(created.visibility, PlantPathVisibility.PRIVATE);

  const updated = await updatePlantPath({
    userId: 'usr_1',
    pathId: created.id,
    name: 'My Route Updated',
    visibility: PlantPathVisibility.PUBLIC,
    coordinates: [
      { id: 'x1', latitude: 10.1, longitude: 20.2 },
      { id: 'x2', latitude: 10.2, longitude: 20.3 }
    ]
  });
  assert.ok(updated);
  assert.equal(updated?.coordinates.length, 2);
  assert.equal(updated?.visibility, PlantPathVisibility.PUBLIC);

  const saved = await savePublicPlantPath({ userId: 'usr_1', pathId: 'pp_public' });
  assert.equal(saved, true);
  assert.equal(fake.getTableRows(ddbTables.plantPathSaves).length, 1);

  const unsaved = await unsavePublicPlantPath({ userId: 'usr_1', pathId: 'pp_public' });
  assert.equal(unsaved, true);
  assert.equal(fake.getTableRows(ddbTables.plantPathSaves).length, 0);

  const cloned = await clonePlantPath({ userId: 'usr_1', pathId: 'pp_public' });
  assert.ok(cloned);
  assert.equal(cloned?.visibility, PlantPathVisibility.PRIVATE);
  assert.equal(cloned?.coordinates.length, 2);
  assert.equal(cloned?.sourcePathId, 'pp_public');
});
