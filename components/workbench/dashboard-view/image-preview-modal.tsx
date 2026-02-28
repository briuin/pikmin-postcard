'use client';

import Image from 'next/image';
import type { WorkbenchText } from '@/lib/i18n';
import type { PreviewImage } from '@/components/workbench/dashboard-view/types';

type DashboardImagePreviewModalProps = {
  text: WorkbenchText;
  previewImage: PreviewImage | null;
  onClose: () => void;
};

export function DashboardImagePreviewModal({
  text,
  previewImage,
  onClose
}: DashboardImagePreviewModalProps) {
  if (!previewImage) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1400] grid place-items-center bg-[rgba(16,24,20,0.84)] p-3 max-[780px]:p-2"
      onClick={onClose}
    >
      <div
        className="relative grid max-h-[96vh] w-full max-w-[1200px] place-items-center"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/40 bg-black/45 text-[1.25rem] font-bold leading-none text-white"
          onClick={onClose}
          aria-label={text.buttonCancel}
          title={text.buttonCancel}
        >
          ×
        </button>
        <Image
          src={previewImage.src}
          alt={previewImage.alt}
          width={1600}
          height={1200}
          className="h-auto max-h-[92vh] w-auto max-w-[96vw] rounded-[12px] object-contain"
        />
      </div>
    </div>
  );
}
