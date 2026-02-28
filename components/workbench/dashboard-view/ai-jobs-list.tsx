'use client';

import Image from 'next/image';
import type { WorkbenchText } from '@/lib/i18n';
import type { DetectionJobRecord } from '@/components/workbench/types';
import {
  postcardItemClassName,
  postcardItemHeadClassName,
  primaryButtonClassName,
  smallMutedClassName
} from '@/components/workbench/dashboard-view/styles';
import type { PreviewImage } from '@/components/workbench/dashboard-view/types';

type DashboardAiJobsListProps = {
  text: WorkbenchText;
  jobs: DetectionJobRecord[];
  isLoadingJobs: boolean;
  dashboardListClassName: string;
  savingJobId: string | null;
  isJobAlreadySaved: (job: DetectionJobRecord) => boolean;
  onSaveDetectedJob: (job: DetectionJobRecord) => void;
  onPreviewImage: (image: PreviewImage) => void;
};

export function DashboardAiJobsList({
  text,
  jobs,
  isLoadingJobs,
  dashboardListClassName,
  savingJobId,
  isJobAlreadySaved,
  onSaveDetectedJob,
  onPreviewImage
}: DashboardAiJobsListProps) {
  return (
    <>
      <h3 className="mt-1">{text.aiJobsTitle}</h3>
      {isLoadingJobs ? <small className={smallMutedClassName}>{text.aiJobsLoading}</small> : null}
      {!isLoadingJobs && jobs.length === 0 ? <small className={smallMutedClassName}>{text.aiJobsEmpty}</small> : null}
      <div className={dashboardListClassName}>
        {jobs.slice(0, 20).map((job) => (
          <article key={job.id} className={postcardItemClassName}>
            <div className={postcardItemHeadClassName}>
              <strong>{job.status}</strong>
              <small className={smallMutedClassName}>{new Date(job.createdAt).toLocaleString(text.dateLocale)}</small>
            </div>
            {job.imageUrl ? (
              <button
                type="button"
                className="cursor-zoom-in rounded-[10px] border-0 bg-transparent p-0"
                onClick={() => onPreviewImage({ src: job.imageUrl, alt: text.aiJobImageAlt(job.id) })}
              >
                <Image
                  className="h-auto max-h-[180px] w-full rounded-[10px] border border-[#deeadb] bg-[#edf6ef] object-contain"
                  src={job.imageUrl}
                  alt={text.aiJobImageAlt(job.id)}
                  width={640}
                  height={420}
                />
              </button>
            ) : null}
            <small className={smallMutedClassName}>{job.placeGuess ?? text.aiJobNoGuess}</small>
            {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
              <small className={smallMutedClassName}>
                {job.latitude.toFixed(6)}, {job.longitude.toFixed(6)}
                {job.confidence !== null ? ` (${text.aiConfidenceLabel(Math.round(job.confidence * 100))})` : ''}
              </small>
            ) : null}
            {job.status === 'SUCCEEDED' && job.latitude !== null && job.longitude !== null ? (
              <>
                {isJobAlreadySaved(job) ? (
                  <small className={smallMutedClassName}>{text.aiResultAlreadySaved}</small>
                ) : (
                  <button
                    type="button"
                    className={primaryButtonClassName}
                    onClick={() => onSaveDetectedJob(job)}
                    disabled={savingJobId === job.id}
                  >
                    {savingJobId === job.id ? text.buttonSaving : text.saveAsPostcard}
                  </button>
                )}
              </>
            ) : null}
            {job.status === 'FAILED' && job.errorMessage ? (
              <small className={smallMutedClassName}>{job.errorMessage}</small>
            ) : null}
          </article>
        ))}
      </div>
    </>
  );
}
