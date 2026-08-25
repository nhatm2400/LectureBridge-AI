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
import { type Translate, useI18n } from '@/lib/i18n';
import { localizeLectureContent } from '@/lib/lecture-content-i18n';

interface LectureGroundingPanelProps {
  videoId: string;
  currentTime: number;
  outputLanguage: 'vi' | 'en';
  onSeek: (seconds: number) => void;
}

const MIN_RECOVERY_MINUTES = 2;
const MAX_RECOVERY_MINUTES = 10;

function formatTime(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;
  return hours
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`
    : `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

function eventLabel(type: string, t: Translate) {
  const labels: Record<string, string> = {
    QUESTION: t('Câu hỏi', 'Question'),
    ANSWER: t('Trả lời', 'Answer'),
    QUESTION_ANSWER: t('Câu hỏi → trả lời', 'Question → answer'),
    EXAMPLE: t('Ví dụ', 'Example'),
    TOPIC_CHANGE: t('Chuyển chủ đề', 'Topic shift'),
    IMPORTANT: t('Quan trọng', 'Important'),
    ACTION: t('Việc cần làm', 'Action'),
    DEADLINE: t('Hạn chót', 'Deadline'),
    EXAM_CUE: t('Gợi ý ôn tập', 'Study cue'),
    TRANSCRIPT: 'Transcript',
  };
  return labels[type] || type.replaceAll('_', ' ');
}

export function LectureGroundingPanel({ videoId, currentTime, outputLanguage, onSeek }: LectureGroundingPanelProps) {
  const { locale, t } = useI18n();
  const [windowMinutes, setWindowMinutes] = useState('5');
  const [recoveredWindowMinutes, setRecoveredWindowMinutes] = useState(5);
  const [windowTouched, setWindowTouched] = useState(false);
  const [recovery, setRecovery] = useState<ContextRecoveryResponse | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AskLectureResponse | null>(null);
  const [isAsking, setIsAsking] = useState(false);
  const [askError, setAskError] = useState('');

  const parsedWindowMinutes = Number(windowMinutes);
  const isWindowValid =
    windowMinutes.trim() !== ''
    && Number.isInteger(parsedWindowMinutes)
    && parsedWindowMinutes >= MIN_RECOVERY_MINUTES
    && parsedWindowMinutes <= MAX_RECOVERY_MINUTES;

  const recover = async () => {
    setWindowTouched(true);
    if (!isWindowValid) return;

    const requestedWindowMinutes = parsedWindowMinutes;
    setIsRecovering(true);
    setRecoveryError('');
    setRecovery(null);
    try {
      const result = await api.videos.recoverContext(videoId, {
        current_time: currentTime,
        window_seconds: requestedWindowMinutes * 60,
        output_language: outputLanguage,
      });
      setRecoveredWindowMinutes(requestedWindowMinutes);
      setRecovery(result);
    } catch (error) {
      setRecoveryError(error instanceof Error ? error.message : t('Không thể phục hồi ngữ cảnh.', 'Could not recover context.'));
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
      setAskError(error instanceof Error ? error.message : t('Không thể hỏi bài giảng.', 'Could not ask the lecture.'));
    } finally {
      setIsAsking(false);
    }
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]" aria-label={t('Trợ lý theo ngữ cảnh bài giảng', 'Lecture context assistant')}>
      <Surface className="overflow-hidden" aria-labelledby="recovery-heading">
        <div className="border-b border-[var(--lb-border)] p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" aria-hidden="true"><RotateCcw size={21} /></span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-accent)]">{t('Phục hồi ngữ cảnh', 'Context recovery')}</p>
              <h2 id="recovery-heading" className="mt-1 text-xl">{t('Tôi đã bỏ lỡ gì?', 'What did I miss?')}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">{t('Dựng lại phần vừa qua từ sự kiện ngữ nghĩa và transcript đã được xác thực.', 'Rebuild the missed window from validated semantic events and transcript evidence.')}</p>
            </div>
          </div>

          <div className="mt-5">
            <label htmlFor="recovery-window" className="block text-sm font-semibold text-[var(--lb-ink)]">
              {t('Khoảng vừa bỏ lỡ', 'Missed window')}
            </label>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 sm:w-48">
                <input
                  id="recovery-window"
                  type="number"
                  inputMode="numeric"
                  min={MIN_RECOVERY_MINUTES}
                  max={MAX_RECOVERY_MINUTES}
                  step={1}
                  value={windowMinutes}
                  onChange={(event) => setWindowMinutes(event.target.value)}
                  onBlur={() => setWindowTouched(true)}
                  aria-invalid={windowTouched && !isWindowValid}
                  aria-describedby="recovery-window-help"
                  aria-label={t('Khoảng thời gian bỏ lỡ, tính bằng phút', 'Missed window in minutes')}
                  className="lb-field min-w-0 flex-1"
                />
                <span className="shrink-0 text-sm font-semibold text-[var(--lb-muted)]">
                  {t('phút', 'minutes')}
                </span>
              </div>
              <Button onClick={recover} disabled={isRecovering || !isWindowValid}>
              {isRecovering ? <LoaderCircle className="animate-spin" size={18} /> : <Clock3 size={18} />}
              {isRecovering ? t('Đang phục hồi…', 'Recovering…') : t('Phục hồi ngữ cảnh', 'Recover context')}
              </Button>
            </div>
            <p
              id="recovery-window-help"
              aria-live="polite"
              className={`mt-2 text-xs ${windowTouched && !isWindowValid ? 'font-semibold text-[var(--lb-danger)]' : 'text-[var(--lb-muted)]'}`}
            >
              {windowTouched && !isWindowValid
                ? t('Nhập số nguyên từ 2 đến 10.', 'Enter a whole number from 2 to 10.')
                : t('Chọn từ 2 đến 10 phút.', 'Choose 2 to 10 minutes.')}
            </p>
          </div>
        </div>

        <div className="p-5 sm:p-6" aria-live="polite" aria-atomic="true">
          {recoveryError && <p role="alert" className="rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] p-3 text-sm font-semibold text-[var(--lb-danger)]">{recoveryError}</p>}
          {!recovery && !recoveryError && !isRecovering && (
            <p className="text-sm leading-6 text-[var(--lb-muted)]">{t('Đặt video tại vị trí hiện tại rồi chọn khoảng thời gian để xem mạch nội dung vừa bị lỡ.', 'Pause at your current position, then choose a time window to recover the missed learning thread.')}</p>
          )}
          {recovery && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-base">{t(`Trong ${recoveredWindowMinutes} phút vừa qua`, `In the last ${recoveredWindowMinutes} minutes`)}</h3>
                <span className="rounded-full bg-[var(--lb-success-soft)] px-3 py-1 text-xs font-semibold text-[var(--lb-success)]">
                  {recovery.metrics.validated_item_count} {t('mục đã xác thực', 'validated items')}
                </span>
              </div>
              <p className="mt-3 text-sm font-medium leading-7 text-[var(--lb-ink)]">{localizeLectureContent(recovery.summary, locale)}</p>
              {recovery.items.length > 0 && (
                <ol className="mt-5 divide-y divide-[var(--lb-border)] border-y border-[var(--lb-border)]">
                  {recovery.items.map((item, index) => (
                    <li key={`${item.type}-${item.timestamp}-${index}`} className="grid gap-3 py-4 sm:grid-cols-[7.5rem_1fr]">
                      <div>
                        <p className="text-xs font-bold text-[var(--lb-muted)]">{eventLabel(item.type, t)}</p>
                        <button type="button" onClick={() => onSeek(item.timestamp)} aria-label={t(`Mở nguồn tại ${formatTime(item.timestamp)}`, `Open source at ${formatTime(item.timestamp)}`)} className="mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md pr-3 text-sm font-bold text-[var(--lb-accent)] hover:underline">
                          <Link2 size={15} aria-hidden="true" /> {formatTime(item.timestamp)}
                        </button>
                      </div>
                      <p className="text-sm leading-6 text-[var(--lb-ink)]">{localizeLectureContent(item.text, locale)}</p>
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
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-accent)]">{t('Hỏi có căn cứ', 'Grounded Ask')}</p>
              <h2 id="ask-heading" className="mt-1 text-xl">{t('Hỏi bài giảng', 'Ask the lecture')}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">{t('Chỉ trả lời bằng bằng chứng có trong bài giảng hiện tại.', 'Answers use only evidence from the current lecture.')}</p>
            </div>
          </div>

          <form className="mt-5 space-y-3" onSubmit={submitQuestion}>
            <label htmlFor="lecture-question" className="block text-sm font-semibold text-[var(--lb-ink)]">{t('Câu hỏi của bạn', 'Your question')}</label>
            <textarea id="lecture-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} rows={4} placeholder={t('Ví dụ: Giảng viên giải thích khái niệm này như thế nào?', 'Example: How did the lecturer explain this concept?')} className="lb-field resize-y" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-[var(--lb-muted)]">{question.length}/500</span>
              <Button type="submit" disabled={isAsking || !question.trim()}>
                {isAsking && <LoaderCircle className="animate-spin" size={18} />}
                {isAsking ? t('Đang tìm nguồn…', 'Finding evidence…') : t('Hỏi bài giảng', 'Ask lecture')}
              </Button>
            </div>
          </form>
        </div>

        <div className="p-5 sm:p-6" aria-live="polite" aria-atomic="true">
          {askError && <p role="alert" className="rounded-md border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] p-3 text-sm font-semibold text-[var(--lb-danger)]">{askError}</p>}
          {!answer && !askError && !isAsking && <p className="text-sm leading-6 text-[var(--lb-muted)]">{t('Câu trả lời có căn cứ sẽ kèm liên kết về đúng timestamp. Nếu không đủ bằng chứng, LectureBridge sẽ dừng lại.', 'Grounded answers include links to the exact timestamp. If evidence is insufficient, LectureBridge stops.')}</p>}
          {answer && (
            <div>
              <div className="flex items-center gap-2">
                {answer.supported ? <CheckCircle2 size={18} className="text-[var(--lb-success)]" /> : <ShieldAlert size={18} className="text-[var(--lb-warning)]" />}
                <h3 className="text-base">{answer.supported ? t('Câu trả lời có căn cứ', 'Grounded answer') : t('Không đủ bằng chứng', 'Insufficient evidence')}</h3>
              </div>
              <p className="mt-3 text-sm leading-7 text-[var(--lb-ink)]">{answer.answer}</p>
              {answer.supported && answer.citations.length > 0 && (
                <div className="mt-5 border-t border-[var(--lb-border)] pt-4">
                  <h4 className="text-sm font-bold text-[var(--lb-ink)]">{t('Nguồn trong bài giảng', 'Lecture sources')}</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {answer.citations.map((citation, index) => (
                      <button key={citation.evidence_id} type="button" onClick={() => onSeek(citation.timestamp)} aria-label={t(`Mở nguồn ${index + 1} tại ${formatTime(citation.timestamp)}`, `Open source ${index + 1} at ${formatTime(citation.timestamp)}`)} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--lb-border-strong)] bg-[var(--lb-elevated)] px-3 text-sm font-bold text-[var(--lb-accent)] hover:bg-[var(--lb-accent-soft)]">
                        <Link2 size={15} aria-hidden="true" /> {t('Nguồn', 'Source')} {index + 1} · {formatTime(citation.timestamp)}
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
