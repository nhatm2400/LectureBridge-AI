import { ReactNode } from 'react';

export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-[var(--lb-ink)]">{label}</label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-sm font-semibold text-[var(--lb-danger)]">{error}</p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-xs leading-5 text-[var(--lb-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
