'use client';

import { useState } from 'react';

type PostcardCoordinateCopyProps = {
  coordinates: string | null;
};

export function PostcardCoordinateCopy({ coordinates }: PostcardCoordinateCopyProps) {
  const [status, setStatus] = useState('');

  if (!coordinates) {
    return null;
  }
  const safeCoordinates = coordinates;

  async function copyCoordinates() {
    try {
      await navigator.clipboard.writeText(safeCoordinates);
      setStatus('Copied');
    } catch {
      setStatus('Copy failed');
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
      {status ? <small className="text-[0.78rem] text-[#5f736c]">{status}</small> : null}
    </div>
  );
}
