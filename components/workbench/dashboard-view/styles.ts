export {
  panelClassName,
  sectionHeadClassName,
  chipRowClassName,
  chipClassName,
  inlineFieldClassName,
  postcardItemClassName,
  postcardItemHeadClassName,
  smallMutedClassName
} from '@/components/workbench/shared-panel-styles';
export const actionButtonClassName =
  'rounded-[10px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-2.5 py-1.5 text-[0.83rem] font-bold text-white shadow-[0_4px_10px_rgba(47,158,88,0.18)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';
export const authCalloutClassName =
  'grid gap-2 rounded-[14px] border border-[#dce8d7] bg-[linear-gradient(145deg,rgba(243,251,226,0.8),rgba(241,255,251,0.8))] p-3';
export const dashboardToolbarClassName =
  'flex flex-wrap items-center justify-between gap-2 rounded-[14px] border border-[#deead9] bg-[linear-gradient(140deg,rgba(244,255,245,0.95),rgba(247,254,255,0.92))] px-2.5 py-2';
export const categoryTabButtonClassName = 'rounded-full px-3 py-1.5 text-[0.82rem] font-bold transition border';
export const cropEditorClassName = 'grid gap-2 rounded-xl border border-dashed border-[#c9dfc7] bg-[#f6fff6] p-2.5';
export const cropPreviewClassName = 'w-full overflow-hidden rounded-[10px] border border-[#d8e7d8] bg-[#edf4ed]';
export const cropImageClassName = 'block h-auto max-h-[420px] w-full bg-[#edf4ed] object-contain';
export const inputClassName =
  'w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)] disabled:opacity-60';
export const primaryButtonClassName =
  'rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white shadow-[0_8px_16px_rgba(47,158,88,0.23)] transition hover:enabled:-translate-y-px hover:enabled:shadow-[0_11px_18px_rgba(47,158,88,0.27)] disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none';

export function getDashboardListClassName(dashboardViewMode: 'grid' | 'list') {
  return dashboardViewMode === 'grid'
    ? 'mt-2 grid grid-cols-1 gap-2 min-[760px]:grid-cols-2 min-[1220px]:grid-cols-3'
    : 'mt-2 grid grid-cols-1 gap-2';
}
