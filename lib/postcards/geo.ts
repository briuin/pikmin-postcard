export type GeoBounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

const DEFAULT_GEO_BUCKET_LEVEL_DEGREES = [2, 8, 60] as const;

export type GeoBucketLayer = {
  fieldName: 'geoBucket' | 'geoBucketMedium' | 'geoBucketCoarse';
  indexName:
    | 'geoBucket-createdAt-index'
    | 'geoBucketMedium-createdAt-index'
    | 'geoBucketCoarse-createdAt-index';
  degrees: number;
};

export type GeoBucketFieldValues = {
  geoBucket: string | null;
  geoBucketMedium: string | null;
  geoBucketCoarse: string | null;
};

function toInteger(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 180) {
    return null;
  }
  return parsed;
}

function parseGeoBucketLevelsFromEnv():
  | readonly [number, number, number]
  | null {
  const raw = String(process.env.POSTCARD_GEO_BUCKET_LEVELS || '').trim();
  if (!raw) {
    return null;
  }
  const uniqueSorted = Array.from(
    new Set(
      raw
        .split(',')
        .map((value) => toInteger(value.trim()))
        .filter((value): value is number => typeof value === 'number')
    )
  ).sort((left, right) => left - right);

  if (uniqueSorted.length !== 3) {
    return null;
  }
  return [
    uniqueSorted[0],
    uniqueSorted[1],
    uniqueSorted[2]
  ] as const;
}

export function getGeoBucketLevelDegrees():
  readonly [number, number, number] {
  const parsed = parseGeoBucketLevelsFromEnv();
  return parsed ?? DEFAULT_GEO_BUCKET_LEVEL_DEGREES;
}

export function getGeoBucketLayers(): readonly GeoBucketLayer[] {
  const [fine, medium, coarse] = getGeoBucketLevelDegrees();
  return [
    {
      fieldName: 'geoBucket',
      indexName: 'geoBucket-createdAt-index',
      degrees: fine
    },
    {
      fieldName: 'geoBucketMedium',
      indexName: 'geoBucketMedium-createdAt-index',
      degrees: medium
    },
    {
      fieldName: 'geoBucketCoarse',
      indexName: 'geoBucketCoarse-createdAt-index',
      degrees: coarse
    }
  ];
}

export function getGeoBucketDegrees(): number {
  const parsed = toInteger(
    String(process.env.POSTCARD_GEO_BUCKET_DEGREES || '').trim()
  );
  return parsed ?? getGeoBucketLevelDegrees()[0];
}

export function clampLatitude(value: number): number {
  if (value > 90) {
    return 90;
  }
  if (value < -90) {
    return -90;
  }
  return value;
}

export function normalizeLongitude(value: number): number {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return wrapped === -180 ? 180 : wrapped;
}

function bucketCountForLatitude(bucketDegrees: number): number {
  return Math.ceil(180 / bucketDegrees);
}

function bucketCountForLongitude(bucketDegrees: number): number {
  return Math.ceil(360 / bucketDegrees);
}

function clampBucketIndex(index: number, max: number): number {
  if (index < 0) {
    return 0;
  }
  if (index >= max) {
    return max - 1;
  }
  return index;
}

function latitudeToBucketIndex(latitude: number, bucketDegrees: number): number {
  const normalized = clampLatitude(latitude);
  const rawIndex = Math.floor((normalized + 90) / bucketDegrees);
  return clampBucketIndex(rawIndex, bucketCountForLatitude(bucketDegrees));
}

function longitudeToBucketIndex(longitude: number, bucketDegrees: number): number {
  const normalized = normalizeLongitude(longitude);
  const rawIndex = Math.floor((normalized + 180) / bucketDegrees);
  return clampBucketIndex(rawIndex, bucketCountForLongitude(bucketDegrees));
}

function formatGeoBucketKey(params: {
  bucketDegrees: number;
  latIndex: number;
  lonIndex: number;
}): string {
  return `g${params.bucketDegrees}:${params.latIndex}:${params.lonIndex}`;
}

export function buildGeoBucketFromCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
  bucketDegrees = getGeoBucketDegrees()
): string | null {
  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    return null;
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    return null;
  }

  return formatGeoBucketKey({
    bucketDegrees,
    latIndex: latitudeToBucketIndex(latitude, bucketDegrees),
    lonIndex: longitudeToBucketIndex(longitude, bucketDegrees)
  });
}

export function buildGeoBucketFieldsFromCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): GeoBucketFieldValues {
  const layers = getGeoBucketLayers();
  return {
    geoBucket: buildGeoBucketFromCoordinates(
      latitude,
      longitude,
      layers[0].degrees
    ),
    geoBucketMedium: buildGeoBucketFromCoordinates(
      latitude,
      longitude,
      layers[1].degrees
    ),
    geoBucketCoarse: buildGeoBucketFromCoordinates(
      latitude,
      longitude,
      layers[2].degrees
    )
  };
}

export function isCoordinateInBounds(
  latitude: number,
  longitude: number,
  bounds: GeoBounds
): boolean {
  const lat = clampLatitude(latitude);
  const lon = normalizeLongitude(longitude);
  const north = clampLatitude(bounds.north);
  const south = clampLatitude(bounds.south);
  const maxLat = Math.max(north, south);
  const minLat = Math.min(north, south);
  if (lat < minLat || lat > maxLat) {
    return false;
  }

  const lonSpan = Math.abs(bounds.east - bounds.west);
  if (lonSpan >= 360) {
    return true;
  }

  const west = normalizeLongitude(bounds.west);
  const east = normalizeLongitude(bounds.east);
  if (west <= east) {
    return lon >= west && lon <= east;
  }
  return lon >= west || lon <= east;
}

export function enumerateGeoBucketsForBounds(
  bounds: GeoBounds,
  bucketDegrees = getGeoBucketDegrees()
): string[] {
  const north = clampLatitude(bounds.north);
  const south = clampLatitude(bounds.south);
  const maxLat = Math.max(north, south);
  const minLat = Math.min(north, south);

  const latIndexStart = latitudeToBucketIndex(minLat, bucketDegrees);
  const latIndexEnd = latitudeToBucketIndex(maxLat, bucketDegrees);
  const lonBucketCount = bucketCountForLongitude(bucketDegrees);

  const lonSpan = Math.abs(bounds.east - bounds.west);
  const includeAllLongitude = lonSpan >= 360;
  const west = normalizeLongitude(bounds.west);
  const east = normalizeLongitude(bounds.east);
  const isDatelineCrossing = !includeAllLongitude && west > east;

  const keys = new Set<string>();
  for (let latIndex = latIndexStart; latIndex <= latIndexEnd; latIndex += 1) {
    for (let lonIndex = 0; lonIndex < lonBucketCount; lonIndex += 1) {
      if (!includeAllLongitude) {
        const lonStart = -180 + lonIndex * bucketDegrees;
        const lonEnd = Math.min(180, lonStart + bucketDegrees);
        const overlaps = isDatelineCrossing
          ? lonEnd >= west || lonStart <= east
          : lonEnd >= west && lonStart <= east;
        if (!overlaps) {
          continue;
        }
      }

      keys.add(
        formatGeoBucketKey({
          bucketDegrees,
          latIndex,
          lonIndex
        })
      );
    }
  }

  return Array.from(keys);
}
