'use client';

import {
  CheckCircle2,
  Clock3,
  Link2,
  LoaderCircle,
  MessageCircleQuestion,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { FormEvent, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Surface } from '@/components/ui/Surface';
import { api, type AskLectureResponse, type ContextRecoveryResponse } from '@/lib/api';

interface LectureGroundingPanelProps {
  videoId: string;
  currentTime: number;
  outputLanguage: 'vi' | 'en';
  onSeek: (seconds: number) => void;
}

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
    : `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function eventLabel(type: string) {
  const labels: Record<string, string> = {
    QUESTION: 'Câu hỏi',
    ANSWER: 'Trả lời',
    QUESTION_ANSWER: 'Câu hỏi → trả lời',
    EXAMPLE: 'Ví dụ',
    TOPIC_CHANGE: 'Chuyển chủ đề',
    IMPORTANT: 'Quan trọng',
    ACTION: 'Việc cần làm',
    DEADLINE: 'Hạn chót',
    EXAM_CUE: 'Gợi ý ôn tập',
    TRANSCRIPT: 'Transcript',
  };
  return labels[type] || type.replaceAll('_', ' ');
}

export function LectureGroundingPanel({ videoId, currentTime, outputLanguage, onSeek }: LectureGroundingPanelProps) {
  const [windowSeconds, setWindowSeconds] = useState(300);
  const [recovery, setRecovery] = useState<ContextRecoveryResponse | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskLectureResponse | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState('');

  const recover = async () => {
    setIsRecovering(true);
    setRecoveryError('');
    setRecovery(null);
    try {
      setRecovery(await api.videos.recoverContext(videoId, {
        current_time: currentTime,
        window_seconds: windowSeconds,
        output_language: outputLanguage,
      }));
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : 'Không thể phục hồi ngữ cảnh.');
    } finally {
      setIsRecovering(false);
    }
  };

  const submitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = question.trim();
    if (!normalized) return;
    setIsAsking(true);
    setAskError('');
    setAnswer(null);
    try {
      setAnswer(await api.videos.askLecture(videoId, {
        question: normalized,
        output_language: outputLanguage,
      }));
    } catch (error) {
      setAskError(error instanceof Error ? error.message : 'Không thể hỏi bài giảng.');
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]" aria-label="Trợ lý theo ngữ cảnh bài giảng">
      <Surface className="overflow-hidden" aria-labelledby="recovery-heading">
        <div className="border-b border-[var(--lb-border)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" aria-hidden="true"><RotateCcw size={21} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-accent)]">Phục hồi ngữ cảnh</p>
              <h2 id="recovery-heading" className="mt-1 text-xl">Tôi đã bỏ lỡ gì?</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">Dựng lại phần vừa qua từ sự kiện ngữ nghĩa và transcript đã được xác thực.</p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
            <label htmlFor="recovery-window" className="text-sm font-semibold text-[var(--lb-ink)]">
              Khoảng vừa bỏ lỡ
              <select id="recovery-window" value={windowSeconds} onChange={(event) => setWindowSeconds(Number(event.target.value))} className="lb-field mt-2 sm:w-40">
                <option value={120}>2 phút</option>
                <option value={300}>5 phút</option>
                <option value={600}>10 phút</option>
              </select>
            </label>
            <Button onClick={recover} disabled={isRecovering} className="sm:mb-0">
              {isRecovering ? <LoaderCircle className="animate-spin" size={18} /> : <Clock3 size={18} />}
              {isRecovering ? 'Đang phục hồi…' : 'Phục hồi ngữ cảnh'}
            </Button>
          </div>
        </div>

        <div className="p-5 sm:p-6" aria-live="polite" aria-atomic="true">
          {recoveryError && <p role="alert" className="rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] p-3 text-sm font-semibold text-[var(--lb-danger)]">{recoveryError}</p>}
          {!recovery && !recoveryError && !isRecovering && (
            <p className="text-sm leading-6 text-[var(--lb-muted)]">Đặt video tại vị trí hiện tại rồi chọn khoảng thời gian để xem mạch nội dung vừa bị lỡ.</p>
          )}
          {recovery && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base">Trong {windowSeconds / 60} phút vừa qua</h3>
                <span className="rounded-full bg-[var(--lb-success-soft)] px-3 py-1 text-xs font-semibold text-[var(--lb-success)]">
                  {recovery.metrics.validated_item_count} mục đã xác thực
                </span>
              </div>
              <p className="mt-3 text-sm font-medium leading-7 text-[var(--lb-ink)]">{recovery.summary}</p>
              {recovery.items.length > 0 && (
                <ol className="mt-5 divide-y divide-[var(--lb-border)] border-y border-[var(--lb-border)]">
                  {recovery.items.map((item, index) => (
                    <li key={`${item.type}-${item.timestamp}-${index}`} className="grid gap-3 py-4 sm:grid-cols-[7.5rem_1fr]">
                      <div>
                        <p className="text-xs font-bold text-[var(--lb-muted)]">{eventLabel(item.type)}</p>
                        <button type="button" onClick={() => onSeek(item.timestamp)} aria-label={`Mở nguồn tại ${formatTime(item.timestamp)}`} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md pr-3 text-sm font-bold text-[var(--lb-accent)] hover:underline">
                          <Link2 size={15} aria-hidden="true" /> {formatTime(item.timestamp)}
                        </button>
                      </div>
                      <p className="text-sm leading-6 text-[var(--lb-ink)]">{item.text}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      </Surface>

      <Surface className="overflow-hidden" aria-labelledby="ask-heading">
        <div className="border-b border-[var(--lb-border)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" aria-hidden="true"><MessageCircleQuestion size={21} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-accent)]">Grounded Ask</p>
              <h2 id="ask-heading" className="mt-1 text-xl">Hỏi bài giảng</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">Chỉ trả lời bằng bằng chứng có trong bài giảng hiện tại.</p>
            </div>
          </div>

          <form className="mt-5 space-y-3" onSubmit={submitQuestion}>
            <label htmlFor="lecture-question" className="block text-sm font-semibold text-[var(--lb-ink)]">Câu hỏi của bạn</label>
            <textarea id="lecture-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={4} placeholder="Ví dụ: Giảng viên giải thích khái niệm này như thế nào?" className="lb-field resize-y" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--lb-muted)]">{question.length}/500</span>
              <Button type="submit" disabled={isAsking || !question.trim()}>
                {isAsking && <LoaderCircle className="animate-spin" size={18} />}
                {isAsking ? 'Đang tìm nguồn…' : 'Hỏi bài giảng'}
              </Button>
            </div>
          </form>
        </div>

        <div className="p-5 sm:p-6" aria-live="polite" aria-atomic="true">
          {askError && <p role="alert" className="rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] p-3 text-sm font-semibold text-[var(--lb-danger)]">{askError}</p>}
          {!answer && !askError && !isAsking && <p className="text-sm leading-6 text-[var(--lb-muted)]">Câu trả lời có căn cứ sẽ kèm liên kết về đúng timestamp. Nếu không đủ bằng chứng, LectureBridge sẽ dừng lại.</p>}
          {answer && (
            <div>
              <div className="flex items-center gap-2">
                {answer.supported ? <CheckCircle2 size={18} className="text-[var(--lb-success)]" /> : <ShieldAlert size={18} className="text-[var(--lb-warning)]" />}
                <h3 className="text-base">{answer.supported ? 'Câu trả lời có căn cứ' : 'Không đủ bằng chứng'}</h3>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--lb-ink)]">{answer.answer}</p>
              {answer.supported && answer.citations.length > 0 && (
                <div className="mt-5 border-t border-[var(--lb-border)] pt-4">
                  <h4 className="text-sm font-bold text-[var(--lb-ink)]">Nguồn trong bài giảng</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {answer.citations.map((citation, index) => (
                      <button key={citation.evidence_id} type="button" onClick={() => onSeek(citation.timestamp)} aria-label={`Mở nguồn ${index + 1} tại ${formatTime(citation.timestamp)}`} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--lb-border-strong)] bg-[var(--lb-elevated)] px-3 text-sm font-bold text-[var(--lb-accent)] hover:bg-[var(--lb-accent-soft)]">
                        <Link2 size={15} aria-hidden="true" /> Nguồn {index + 1} · {formatTime(citation.timestamp)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}
