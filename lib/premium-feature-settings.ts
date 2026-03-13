import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  defaultPremiumFeatureIds,
  normalizePremiumFeatureIds,
  type PremiumFeatureKey
} from '@/lib/premium-features';
import {
  ddbDoc,
  ddbTables,
  isDynamoResourceNotFoundError,
  nowIso
} from '@/lib/repos/dynamodb/shared';

const PREMIUM_FEATURE_SETTINGS_ID = 'premium-features';

type DynamoPremiumFeatureSettingsRow = {
  id: string;
  premiumFeatureIds?: string[];
  updatedAt?: string | null;
};

export type PremiumFeatureSettings = {
  premiumFeatureIds: PremiumFeatureKey[];
  updatedAt: string | null;
};

function defaultSettings(): PremiumFeatureSettings {
  return {
    premiumFeatureIds: [...defaultPremiumFeatureIds],
    updatedAt: null
  };
}

export async function getPremiumFeatureSettings(): Promise<PremiumFeatureSettings> {
  try {
    const result = await ddbDoc.send(
      new GetCommand({
        TableName: ddbTables.appSettings,
        Key: { id: PREMIUM_FEATURE_SETTINGS_ID }
      })
    );

    const row = (result.Item as DynamoPremiumFeatureSettingsRow | undefined) ?? null;
    if (!row) {
      return defaultSettings();
    }

    return {
      premiumFeatureIds: normalizePremiumFeatureIds(row.premiumFeatureIds),
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : null
    };
  } catch (error) {
    if (isDynamoResourceNotFoundError(error)) {
      console.warn(
        `App settings table ${ddbTables.appSettings} is missing. Falling back to default premium features.`
      );
      return defaultSettings();
    }
    throw error;
  }
}

export async function listPremiumFeatureIds(): Promise<PremiumFeatureKey[]> {
  const settings = await getPremiumFeatureSettings();
  return settings.premiumFeatureIds;
}

export async function updatePremiumFeatureIds(
  premiumFeatureIds: Array<PremiumFeatureKey | null | undefined>
): Promise<PremiumFeatureSettings> {
  const normalized = normalizePremiumFeatureIds(premiumFeatureIds);
  const updatedAt = nowIso();
  await ddbDoc.send(
    new PutCommand({
      TableName: ddbTables.appSettings,
      Item: {
        id: PREMIUM_FEATURE_SETTINGS_ID,
        premiumFeatureIds: normalized,
        updatedAt
      }
    })
  );

  return {
    premiumFeatureIds: normalized,
    updatedAt
  };
}
