import type { ExploreToast } from '@/components/workbench/explore-view/types';

type ExploreToastBannerProps = {
  toast: ExploreToast | null;
};

export function ExploreToastBanner({ toast }: ExploreToastBannerProps) {
  if (!toast) {
    return null;
  }

  return (
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
  );
}
