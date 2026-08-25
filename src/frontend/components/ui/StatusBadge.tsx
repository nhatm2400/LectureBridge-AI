'use client';

import React from 'react';
import { 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  CircleDot, 
  StopCircle 
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useI18n } from '@/lib/i18n';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type Status = 'queued' | 'processing' | 'ready' | 'error' | 'live' | 'ended';

interface StatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig = {
  queued: {
    icon: <Loader2 className="h-3.5 w-3.5" />,
    className: 'bg-slate-100 text-slate-700 border-slate-200'
  },
  processing: {
    icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
    className: 'bg-amber-50 text-amber-700 border-amber-200'
  },
  ready: {
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
    className: 'bg-green-50 text-green-700 border-green-200'
  },
  error: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    className: 'bg-red-50 text-red-700 border-red-200'
  },
  live: {
    icon: <CircleDot className="h-3.5 w-3.5 animate-pulse" />,
    className: 'bg-red-600 text-white border-transparent'
  },
  ended: {
    icon: <StopCircle className="h-3.5 w-3.5" />,
    className: 'bg-slate-100 text-slate-600 border-slate-200'
  }
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useI18n();
  const config = statusConfig[status];
  const labels: Record<Status, string> = {
    queued: t('Chờ hàng đợi', 'Queued'),
    processing: t('Đang xử lý', 'Processing'),
    ready: t('Sẵn sàng', 'Ready'),
    error: t('Lỗi', 'Error'),
    live: 'LIVE',
    ended: t('Đã kết thúc', 'Ended'),
  };
  
  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border",
      config.className,
      className
    )}>
      {config.icon}
      <span>{labels[status]}</span>
    </div>
  );
}
