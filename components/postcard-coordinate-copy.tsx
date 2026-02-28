'use client';

import { useState } from 'react';
import { useAutoDismiss } from '@/components/use-auto-dismiss';

type PostcardCoordinateCopyProps = {
  coordinates: string | null;
};

export function PostcardCoordinateCopy({ coordinates }: PostcardCoordinateCopyProps) {
  const [toast, setToast] = useState<{ message: string; tone: 'success' | 'error' } | null>(null);
  const safeCoordinates = coordinates ?? '';
  useAutoDismiss(toast, () => setToast(null));

  if (!coordinates) {
    return null;
  }

  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(safeCoordinates);
      setToast({ message: 'Coordinates copied.', tone: 'success' });
    } catch {
      setToast({ message: 'Failed to copy coordinates.', tone: 'error' });
    }
  }

  return (
    <div className="ml-auto flex items-center gap-1.5 max-[560px]:ml-0">
      <button
        type="button"
        onClick={() => void copyCoordinates()}
        aria-label="Copy coordinates"
        title="Copy coordinates"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[#cde5cf] bg-[linear-gradient(135deg,#58b96d,#369d5a)] text-[1rem] font-bold text-white shadow-[0_6px_14px_rgba(53,156,89,0.22)] transition hover:enabled:-translate-y-px"
      >
        ⧉
      </button>
      {toast ? (
        <div className="pointer-events-none fixed bottom-4 left-1/2 z-[1300] -translate-x-1/2 px-3 max-[780px]:bottom-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div
            className={
              toast.tone === 'success'
                ? 'rounded-full border border-[#9ad6ac] bg-[linear-gradient(145deg,#f4fff6,#e8fbef)] px-3.5 py-1.5 text-[0.83rem] font-semibold text-[#24543a] shadow-[0_10px_20px_rgba(36,84,58,0.18)]'
                : 'rounded-full border border-[#e5c596] bg-[linear-gradient(145deg,#fff7e8,#ffefd6)] px-3.5 py-1.5 text-[0.83rem] font-semibold text-[#704f1f] shadow-[0_10px_20px_rgba(112,79,31,0.16)]'
            }
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </div>
  );
}
