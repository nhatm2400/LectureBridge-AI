export function Footer() {
  return (
    <footer className="border-t border-[var(--lb-border)] bg-[var(--lb-surface)]">
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-6 py-7 text-sm text-[var(--lb-muted)] sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span>© 2026 LectureBridge</span>
        <span>Evidence-grounded learning continuity</span>
      </div>
    </footer>
  );
}
