import { BookOpen } from 'lucide-react';
import Image from 'next/image';

type CourseThumbnailProps = {
  src?: string | null;
  alt: string;
};

export function CourseThumbnail({ src, alt }: CourseThumbnailProps) {
  if (src) {
    return <Image src={src} alt={alt} fill unoptimized className="object-cover" />;
  }

  return (
    <div
      role="img"
      aria-label={`${alt} — chưa có ảnh đại diện`}
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-700 to-rose-800 text-white"
    >
      <BookOpen aria-hidden="true" size={42} strokeWidth={1.7} />
    </div>
  );
}
