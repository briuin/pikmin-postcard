'use client';

import type { WorkbenchText } from '@/lib/i18n';
import { authCalloutClassName, primaryButtonClassName, smallMutedClassName } from '@/components/workbench/dashboard-view/styles';

type DashboardAuthCalloutProps = {
  text: WorkbenchText;
  onSignIn: () => void;
};

export function DashboardAuthCallout({ text, onSignIn }: DashboardAuthCalloutProps) {
  return (
    <div className={authCalloutClassName}>
      <strong>{text.loginRequiredTitle}</strong>
      <small className={smallMutedClassName}>{text.loginRequiredDashboardBody}</small>
      <button type="button" className={primaryButtonClassName} onClick={onSignIn}>
        {text.buttonSignInGoogle}
      </button>
    </div>
  );
}
