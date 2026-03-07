import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Downloads | Pikmin Postcard',
  description: 'Download the latest Flypik Android APK.'
};

export const revalidate = 300;

type ApkManifest = {
  app?: string;
  version?: string;
  fileName?: string;
  downloadUrl?: string;
  versionedUrl?: string;
  sizeBytes?: number;
  builtAt?: string;
  commitSha?: string;
  runNumber?: string | number;
};

function formatFileSize(sizeBytes?: number) {
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

function formatBuiltAt(value?: string) {
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

async function loadApkManifest(): Promise<ApkManifest | null> {
  const metadataUrl = process.env.APK_DOWNLOAD_METADATA_URL?.trim();
  if (!metadataUrl) {
    return null;
  }

  try {
    const response = await fetch(metadataUrl, {
      next: { revalidate }
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as ApkManifest;
  } catch {
    return null;
  }
}

export default async function DownloadsPage() {
  const manifest = await loadApkManifest();
  const fallbackUrl = process.env.APK_DOWNLOAD_FALLBACK_URL?.trim() || '';
  const downloadUrl = manifest?.downloadUrl?.trim() || fallbackUrl;
  const version = manifest?.version?.trim() || 'Unpublished';
  const commitSha = manifest?.commitSha?.trim();
  const fileName = manifest?.fileName?.trim() || 'flypik-android.apk';

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '2rem 1rem 3rem'
      }}
    >
      <section
        style={{
          width: 'min(760px, 100%)',
          display: 'grid',
          gap: '1.2rem',
          padding: '1.4rem',
          borderRadius: '28px',
          border: '1px solid var(--line)',
          background:
            'linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,255,252,0.94))',
          boxShadow: '0 18px 48px rgba(48, 98, 74, 0.12)'
        }}
      >
        <div style={{ display: 'grid', gap: '0.55rem' }}>
          <small
            style={{
              fontWeight: 800,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--pikmin-leaf)'
            }}
          >
            Android Download
          </small>
          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.8rem)', lineHeight: 0.95 }}>
            Flypik APK
          </h1>
          <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--muted)' }}>
            Download the latest Android build for mock flying, postcard browsing, and map-based coordinate jumps.
          </p>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.9rem',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))'
          }}
        >
          <div
            style={{
              padding: '1rem',
              borderRadius: '20px',
              background: '#f7fff7',
              border: '1px solid #d3ead6'
            }}
          >
            <small>Latest version</small>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{version}</div>
          </div>
          <div
            style={{
              padding: '1rem',
              borderRadius: '20px',
              background: '#fffdf5',
              border: '1px solid #f0e2a8'
            }}
          >
            <small>APK size</small>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              {formatFileSize(manifest?.sizeBytes)}
            </div>
          </div>
          <div
            style={{
              padding: '1rem',
              borderRadius: '20px',
              background: '#f5fbff',
              border: '1px solid #cfe0f3'
            }}
          >
            <small>Published</small>
            <div style={{ fontSize: '1.05rem', fontWeight: 800 }}>
              {formatBuiltAt(manifest?.builtAt)}
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.9rem',
            padding: '1rem 1.1rem',
            borderRadius: '22px',
            background: 'rgba(86, 179, 106, 0.08)',
            border: '1px solid rgba(86, 179, 106, 0.24)'
          }}
        >
          {downloadUrl ? (
            <>
              <a
                href={downloadUrl}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 'fit-content',
                  minWidth: '220px',
                  padding: '0.95rem 1.2rem',
                  borderRadius: '999px',
                  background: 'linear-gradient(135deg, #2b9a4d, #1d6f62)',
                  color: '#fff',
                  textDecoration: 'none',
                  fontWeight: 800
                }}
              >
                Download APK
              </a>
              <div style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                File: <strong>{fileName}</strong>
                {commitSha ? (
                  <>
                    <br />
                    Build commit: <code>{commitSha.slice(0, 7)}</code>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div style={{ color: '#8a4b37', lineHeight: 1.6 }}>
              No APK is published yet. Set <code>APK_DOWNLOAD_METADATA_URL</code> or{' '}
              <code>APK_DOWNLOAD_FALLBACK_URL</code> in the web deployment environment after the first S3 upload.
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gap: '0.65rem',
            padding: '1rem 1.1rem',
            borderRadius: '22px',
            background: 'rgba(255,255,255,0.85)',
            border: '1px solid var(--line)'
          }}
        >
          <h2 style={{ fontSize: '1.5rem' }}>Install notes</h2>
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
            1. Download the APK on Android and allow installation from your browser or file manager.
          </p>
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
            2. Sign in with Google if you want your server-backed session; guest mode keeps only device-local data.
          </p>
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
            3. To use the Fly button, open Android Developer options and select Flypik as the mock-location app.
          </p>
        </div>
      </section>
    </main>
  );
}
