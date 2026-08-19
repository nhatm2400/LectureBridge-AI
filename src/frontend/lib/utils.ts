import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getFullImageUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Runtime-safe backend base for browser (Docker/local friendly).
  // Avoid relying only on NEXT_PUBLIC_API_URL baked at build time.
  let backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  if (typeof window !== 'undefined') {
    const { protocol, hostname } = window.location;
    backendBaseUrl = `${protocol}//${hostname}:8000`;
  }

  const cleanBase = backendBaseUrl.endsWith('/') ? backendBaseUrl.slice(0, -1) : backendBaseUrl;
  const cleanUrl = url.startsWith('/') ? url : `/${url}`;
  return `${cleanBase}${cleanUrl}`;
}
