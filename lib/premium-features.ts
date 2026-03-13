import { UserRole } from '@/lib/domain/enums';

export const PremiumFeatureKey = {
  PLANT_PATHS: 'plantPaths'
} as const;

export type PremiumFeatureKey = (typeof PremiumFeatureKey)[keyof typeof PremiumFeatureKey];

export const premiumFeatureCatalog = [PremiumFeatureKey.PLANT_PATHS] as const;

export const defaultPremiumFeatureIds: PremiumFeatureKey[] = [PremiumFeatureKey.PLANT_PATHS];

export function normalizePremiumFeatureId(value: unknown): PremiumFeatureKey | null {
  const normalized = String(value || '').trim();
  return premiumFeatureCatalog.find((featureId) => featureId === normalized) ?? null;
}

export function normalizePremiumFeatureIds(values: Array<unknown> | null | undefined): PremiumFeatureKey[] {
  const requested = new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizePremiumFeatureId(value))
      .filter((value): value is PremiumFeatureKey => Boolean(value))
  );

  return premiumFeatureCatalog.filter((featureId) => requested.has(featureId));
}

export function isPremiumFeatureEnabled(
  premiumFeatureIds: Array<PremiumFeatureKey | null | undefined>,
  featureId: PremiumFeatureKey
): boolean {
  return premiumFeatureIds.includes(featureId);
}

export function isPremiumRoleBypass(role: UserRole | null | undefined): boolean {
  return role === UserRole.ADMIN || role === UserRole.MANAGER;
}

export function hasPremiumFeatureAccess(params: {
  role: UserRole | null | undefined;
  hasPremiumAccess: boolean | null | undefined;
  premiumFeatureIds: Array<PremiumFeatureKey | null | undefined>;
  featureId: PremiumFeatureKey;
}): boolean {
  if (isPremiumRoleBypass(params.role)) {
    return true;
  }

  if (!isPremiumFeatureEnabled(params.premiumFeatureIds, params.featureId)) {
    return true;
  }

  return params.hasPremiumAccess === true;
}
