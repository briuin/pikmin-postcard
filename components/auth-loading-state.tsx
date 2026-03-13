'use client';

type AuthLoadingStateProps = {
  title: string;
  body: string;
  className?: string;
};

export function AuthLoadingState({ title, body, className = '' }: AuthLoadingStateProps) {
  return (
    <section
      className={`grid gap-2 rounded-[18px] border border-[#dbe9d9] bg-[#fbfffb] p-4 shadow-[0_10px_24px_rgba(55,82,66,0.08)] ${className}`.trim()}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex h-8 w-8 animate-spin rounded-full border-2 border-[#cfe3d2] border-t-[#3f9b5b]"
          aria-hidden="true"
        />
        <div className="grid gap-1">
          <strong className="text-[#244535]">{title}</strong>
          <small className="text-[#5f736c]">{body}</small>
        </div>
      </div>
    </section>
  );
}
