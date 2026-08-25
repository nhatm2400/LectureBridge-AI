'use client';

import { BookOpen } from 'lucide-react';
import Image from 'next/image';
import { useI18n } from '@/lib/i18n';

type CourseThumbnailProps = {
  src?: string | null;
  alt: string;
};

export function CourseThumbnail({ src, alt }: CourseThumbnailProps) {
  const { t } = useI18n();
  if (src) {
    return <Image src={src} alt={alt} fill unoptimized className="object-cover" />;
  }

  return (
    <div
      role="img"
      aria-label={`${alt} — ${t('chưa có ảnh đại diện', 'no thumbnail available')}`}
      className="absolute inset-0 flex items-center justify-center bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]"
    >
      <BookOpen aria-hidden="true" size={42} strokeWidth={1.7} />
    </div>
  );
}
