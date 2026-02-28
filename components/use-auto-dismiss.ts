'use client';

import { useEffect } from 'react';

export function useAutoDismiss(value: unknown, onDismiss: () => void, delayMs = 2200) {
  useEffect(() => {
    if (!value) {
      return;
    }

    const timer = window.setTimeout(onDismiss, delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, onDismiss, value]);
}
