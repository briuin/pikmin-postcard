'use client';

import type { WorkbenchText } from '@/lib/i18n';
import { authCalloutClassName, primaryButtonClassName, smallMutedClassName } from '@/components/workbench/dashboard-view/styles';

type DashboardAuthCalloutProps = {
  text: WorkbenchText;
  body?: string;
  onSignIn: () => void;
};

export function DashboardAuthCallout({ text, body, onSignIn }: DashboardAuthCalloutProps) {
  return (
    <div className={authCalloutClassName}>
      <strong>{text.loginRequiredTitle}</strong>
      <small className={smallMutedClassName}>{body ?? text.loginRequiredDashboardBody}</small>
      <button type="button" className={primaryButtonClassName} onClick={onSignIn}>
        {text.buttonSignInGoogle}
      </button>
    </div>
  );
}
