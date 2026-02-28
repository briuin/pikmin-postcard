'use client';

import { signIn, useSession } from 'next-auth/react';
import { useState } from 'react';
import type { Locale } from '@/lib/i18n';
import { messages } from '@/lib/i18n';

type FeedbackSectionProps = {
  locale: Locale;
};

export function FeedbackSection({ locale }: FeedbackSectionProps) {
  const text = messages[locale].feedback;
  const authText = messages[locale].workbench;
  const { status } = useSession();
  const isAuthenticated = status === 'authenticated';
  const isLoading = status === 'loading';

  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusText, setStatusText] = useState('');

  async function submitFeedback() {
    if (!isAuthenticated) {
      setStatusText(text.authRequired);
      return;
    }

    setIsSubmitting(true);
    setStatusText('');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          message
        })
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? text.failed);
      }

      setSubject('');
      setMessage('');
      setStatusText(text.submitted);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : text.failed);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="grid gap-3 rounded-[22px] border border-white/60 bg-[linear-gradient(165deg,rgba(255,255,255,0.96),rgba(245,255,246,0.92))] p-3 shadow-[0_16px_34px_rgba(57,78,66,0.1),inset_0_1px_0_rgba(255,255,255,0.9)]">
      <div className="grid gap-1">
        <h2>{text.title}</h2>
        <small className="text-[#5f736c]">{text.subtitle}</small>
      </div>

      {!isAuthenticated ? (
        <div className="grid gap-2 rounded-[14px] border border-[#dce8d7] bg-[linear-gradient(145deg,rgba(243,251,226,0.8),rgba(241,255,251,0.8))] p-3">
          <small className="text-[#5f736c]">{isLoading ? messages[locale].session.checking : text.authRequired}</small>
          <button
            type="button"
            className="w-fit rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white"
            onClick={() => signIn('google')}
            disabled={isLoading}
          >
            {authText.buttonSignInGoogle}
          </button>
        </div>
      ) : (
        <div className="grid gap-2">
          <label className="grid gap-1 text-[0.91rem] font-bold text-[#39604f]">
            {text.fieldSubject}
            <input
              className="w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)]"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder={text.subjectPlaceholder}
              maxLength={120}
            />
          </label>

          <label className="grid gap-1 text-[0.91rem] font-bold text-[#39604f]">
            {text.fieldMessage}
            <textarea
              className="w-full rounded-[13px] border border-[#d8e6d5] bg-[#fdfffc] px-3 py-2 text-[#1f2e29] outline-none transition focus:border-[#72b485] focus:ring-4 focus:ring-[rgba(86,179,106,0.18)]"
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={text.messagePlaceholder}
              rows={7}
              maxLength={5000}
            />
          </label>

          <button
            type="button"
            className="w-fit rounded-[13px] bg-[linear-gradient(135deg,#56b36a,#2f9e58)] px-4 py-2.5 font-bold text-white disabled:opacity-60"
            onClick={() => void submitFeedback()}
            disabled={isSubmitting}
          >
            {isSubmitting ? text.submitting : text.submit}
          </button>
        </div>
      )}

      {statusText ? <small className="text-[#5f736c]">{statusText}</small> : null}
    </section>
  );
}
