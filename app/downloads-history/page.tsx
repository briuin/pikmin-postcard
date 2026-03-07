import Link from 'next/link';
import type { Metadata } from 'next';
import {
  formatBuiltAt,
  formatFileSize,
  loadApkHistory
} from '../downloads/_lib/apk-downloads';

export const metadata: Metadata = {
  title: 'Downloads History | Pikmin Postcard',
  description: 'Browse every Flypik Android APK built from code pushed to main.'
};

export const revalidate = 300;

export default async function DownloadsHistoryPage() {
  const history = await loadApkHistory(revalidate);

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'start center',
        padding: '2rem 1rem 3rem'
      }}
    >
      <section
        style={{
          width: 'min(980px, 100%)',
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
            Android Build History
          </small>
          <h1 style={{ fontSize: 'clamp(2.2rem, 6vw, 3.8rem)', lineHeight: 0.95 }}>
            Flypik downloads history
          </h1>
          <p style={{ margin: 0, fontSize: '1.05rem', lineHeight: 1.6, color: 'var(--muted)' }}>
            Every successful APK built from code pushed to main is listed here. The main downloads page only
            shows the manually verified release.
          </p>
          <Link href="/downloads" style={{ fontWeight: 700, color: 'var(--pikmin-leaf)' }}>
            View verified download
          </Link>
        </div>

        {history.length === 0 ? (
          <div
            style={{
              padding: '1rem 1.1rem',
              borderRadius: '22px',
              background: 'rgba(255,255,255,0.85)',
              border: '1px solid var(--line)',
              color: 'var(--muted)',
              lineHeight: 1.6
            }}
          >
            No build history is published yet. Push a commit to main or configure
            <code> APK_DOWNLOAD_HISTORY_URL</code> in the web deployment environment.
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.9rem' }}>
            {history.map((item) => {
              const downloadUrl = item.downloadUrl?.trim() || item.versionedUrl?.trim() || '';
              const commitSha = item.commitSha?.trim();
              const channelLabel =
                item.channel === 'manual-verified'
                  ? 'Verified manual run'
                  : item.channel === 'main-push'
                    ? 'Main push build'
                    : item.verified
                      ? 'Verified build'
                      : 'Build';

              return (
                <article
                  key={`${item.fileName || 'build'}-${item.runNumber || item.commitSha || item.builtAt || 'unknown'}`}
                  style={{
                    display: 'grid',
                    gap: '0.9rem',
                    padding: '1rem 1.1rem',
                    borderRadius: '22px',
                    background: 'rgba(255,255,255,0.88)',
                    border: '1px solid var(--line)'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.8rem'
                    }}
                  >
                    <div style={{ display: 'grid', gap: '0.3rem' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.55rem', alignItems: 'center' }}>
                        <strong style={{ fontSize: '1.15rem' }}>
                          {item.version?.trim() || 'Unknown version'}
                        </strong>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '0.28rem 0.7rem',
                            borderRadius: '999px',
                            background: item.verified ? '#e7f8ec' : '#eef4fb',
                            border: `1px solid ${item.verified ? '#cfe7d5' : '#d4dfec'}`,
                            fontSize: '0.82rem',
                            fontWeight: 700
                          }}
                        >
                          {channelLabel}
                        </span>
                      </div>
                      <div style={{ color: 'var(--muted)', lineHeight: 1.6 }}>
                        File: <strong>{item.fileName?.trim() || 'flypik-android.apk'}</strong>
                        {commitSha ? (
                          <>
                            <br />
                            Commit: <code>{commitSha.slice(0, 7)}</code>
                          </>
                        ) : null}
                        {item.runNumber ? (
                          <>
                            <br />
                            Run: <code>{String(item.runNumber)}</code>
                          </>
                        ) : null}
                      </div>
                    </div>

                    {downloadUrl ? (
                      <a
                        href={downloadUrl}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minWidth: '180px',
                          padding: '0.9rem 1.15rem',
                          borderRadius: '999px',
                          background: 'linear-gradient(135deg, #2b9a4d, #1d6f62)',
                          color: '#fff',
                          textDecoration: 'none',
                          fontWeight: 800
                        }}
                      >
                        Download APK
                      </a>
                    ) : null}
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
                        padding: '0.9rem',
                        borderRadius: '18px',
                        background: '#f7fff7',
                        border: '1px solid #d3ead6'
                      }}
                    >
                      <small>Built at</small>
                      <div style={{ fontWeight: 800 }}>{formatBuiltAt(item.builtAt)}</div>
                    </div>
                    <div
                      style={{
                        padding: '0.9rem',
                        borderRadius: '18px',
                        background: '#fffdf5',
                        border: '1px solid #f0e2a8'
                      }}
                    >
                      <small>APK size</small>
                      <div style={{ fontWeight: 800 }}>{formatFileSize(item.sizeBytes)}</div>
                    </div>
                    <div
                      style={{
                        padding: '0.9rem',
                        borderRadius: '18px',
                        background: '#f5fbff',
                        border: '1px solid #cfe0f3'
                      }}
                    >
                      <small>Status</small>
                      <div style={{ fontWeight: 800 }}>{item.verified ? 'Verified' : 'Unverified'}</div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
