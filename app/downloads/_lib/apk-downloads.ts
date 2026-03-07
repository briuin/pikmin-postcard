export type ApkManifest = {
  app?: string;
  version?: string;
  fileName?: string;
  downloadUrl?: string;
  versionedUrl?: string;
  verifiedUrl?: string;
  sizeBytes?: number;
  builtAt?: string;
  commitSha?: string;
  runNumber?: string | number;
  verified?: boolean;
  channel?: string;
};

type ApkHistoryManifest = {
  app?: string;
  generatedAt?: string;
  items?: ApkManifest[];
};

export function formatFileSize(sizeBytes?: number) {
  if (!sizeBytes || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return 'Unknown size';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  let value = sizeBytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatBuiltAt(value?: string) {
  if (!value) {
    return 'Unknown publish time';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Unknown publish time';
  }

  return new Intl.DateTimeFormat('en-SG', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Singapore'
  }).format(parsed);
}

async function loadJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate }
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function deriveHistoryUrlFromMetadata(metadataUrl: string) {
  if (metadataUrl.endsWith('/latest.json')) {
    return `${metadataUrl.slice(0, -'/latest.json'.length)}/history.json`;
  }
  if (metadataUrl.endsWith('latest.json')) {
    return metadataUrl.replace(/latest\.json$/, 'history.json');
  }
  return '';
}

export async function loadVerifiedApkManifest(revalidate: number): Promise<ApkManifest | null> {
  const metadataUrl = process.env.APK_DOWNLOAD_METADATA_URL?.trim();
  if (!metadataUrl) {
    return null;
  }

  return loadJson<ApkManifest>(metadataUrl, revalidate);
}

export async function loadApkHistory(revalidate: number): Promise<ApkManifest[]> {
  const explicitHistoryUrl = process.env.APK_DOWNLOAD_HISTORY_URL?.trim();
  const metadataUrl = process.env.APK_DOWNLOAD_METADATA_URL?.trim() || '';
  const historyUrl = explicitHistoryUrl || (metadataUrl ? deriveHistoryUrlFromMetadata(metadataUrl) : '');

  if (!historyUrl) {
    return [];
  }

  const payload = await loadJson<ApkHistoryManifest>(historyUrl, revalidate);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.filter((item): item is ApkManifest => Boolean(item && typeof item === 'object'));
}
