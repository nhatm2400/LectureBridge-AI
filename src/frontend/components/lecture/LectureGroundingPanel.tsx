'use client';

import { Clock3, LoaderCircle, MessageCircleQuestion, RotateCcw } from 'lucide-react';
import { FormEvent, useState } from 'react';

import {
  api,
  type AskLectureResponse,
  type ContextRecoveryResponse,
} from '@/lib/api';


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

export function LectureGroundingPanel({
  videoId,
  currentTime,
  outputLanguage,
  onSeek,
}: LectureGroundingPanelProps) {
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
    <div className="mt-8 grid gap-6 lg:grid-cols-2" aria-label="Trợ lý theo ngữ cảnh bài giảng">
      <section className="rounded-3xl border border-indigo-100 bg-indigo-50/50 p-6" aria-labelledby="recovery-heading">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-indigo-100 p-3 text-indigo-700" aria-hidden="true">
            <RotateCcw size={22} />
          </span>
          <div>
            <h2 id="recovery-heading" className="text-lg font-extrabold text-slate-900">Tôi đã bỏ lỡ gì?</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Phục hồi đúng đoạn vừa qua từ sự kiện và transcript của bài giảng.</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <label className="text-sm font-bold text-slate-700">
            Khoảng thời gian
            <select
              value={windowSeconds}
              onChange={(event) => setWindowSeconds(Number(event.target.value))}
              className="mt-2 block rounded-xl border border-indigo-200 bg-white px-3 py-2 text-sm font-bold text-slate-800"
            >
              <option value={120}>2 phút</option>
              <option value={300}>5 phút</option>
              <option value={600}>10 phút</option>
            </select>
          </label>
          <button
            type="button"
            onClick={recover}
            disabled={isRecovering}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-indigo-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 disabled:opacity-60"
          >
            {isRecovering ? <LoaderCircle className="animate-spin" size={18} /> : <Clock3 size={18} />}
            {isRecovering ? 'Đang phục hồi…' : 'Phục hồi ngữ cảnh'}
          </button>
        </div>

        <div className="mt-5" role="status" aria-live="polite" aria-atomic="true">
          {recoveryError && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{recoveryError}</p>}
          {recovery && (
            <div className="space-y-4">
              <h3 className="font-extrabold text-slate-900">Trong {windowSeconds / 60} phút vừa qua</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700">{recovery.summary}</p>
              {recovery.items.length > 0 && (
                <ul className="space-y-3">
                  {recovery.items.map((item, index) => (
                    <li key={`${item.type}-${item.timestamp}-${index}`} className="rounded-2xl border border-indigo-100 bg-white p-4">
                      <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-700">{item.type.replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">{item.text}</p>
                      <button
                        type="button"
                        onClick={() => onSeek(item.timestamp)}
                        aria-label={`Chuyển video đến ${formatTime(item.timestamp)}`}
                        className="mt-2 rounded-lg bg-indigo-50 px-3 py-1.5 text-sm font-extrabold text-indigo-800 hover:bg-indigo-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200"
                      >
                        {formatTime(item.timestamp)}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-6" aria-labelledby="ask-heading">
        <div className="flex items-start gap-3">
          <span className="rounded-2xl bg-emerald-100 p-3 text-emerald-700" aria-hidden="true">
            <MessageCircleQuestion size={22} />
          </span>
          <div>
            <h2 id="ask-heading" className="text-lg font-extrabold text-slate-900">Hỏi bài giảng</h2>
            <p className="mt-1 text-sm font-semibold text-slate-600">Câu trả lời chỉ dùng bằng chứng trong bài giảng hiện tại.</p>
          </div>
        </div>

        <form className="mt-5 space-y-3" onSubmit={submitQuestion}>
          <label htmlFor="lecture-question" className="block text-sm font-bold text-slate-700">Câu hỏi của bạn</label>
          <textarea
            id="lecture-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Ví dụ: Giảng viên giải thích Batch Normalization như thế nào?"
            className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold text-slate-500">{question.length}/500</span>
            <button
              type="submit"
              disabled={isAsking || !question.trim()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-emerald-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-300 disabled:opacity-60"
            >
              {isAsking && <LoaderCircle className="animate-spin" size={18} />}
              {isAsking ? 'Đang tìm bằng chứng…' : 'Hỏi bài giảng'}
            </button>
          </div>
        </form>

        <div className="mt-5" role="status" aria-live="polite" aria-atomic="true">
          {askError && <p className="rounded-xl bg-red-50 p-3 text-sm font-bold text-red-800">{askError}</p>}
          {answer && (
            <div className="space-y-4 rounded-2xl border border-emerald-100 bg-white p-4">
              <h3 className="font-extrabold text-slate-900">Câu trả lời</h3>
              <p className="text-sm font-semibold leading-6 text-slate-700">{answer.answer}</p>
              {answer.supported && answer.citations.length > 0 && (
                <div>
                  <h4 className="text-sm font-extrabold text-slate-800">Nguồn trong bài giảng</h4>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {answer.citations.map((citation, index) => (
                      <button
                        key={citation.evidence_id}
                        type="button"
                        onClick={() => onSeek(citation.timestamp)}
                        aria-label={`Mở nguồn ${index + 1} tại ${formatTime(citation.timestamp)}`}
                        className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-emerald-200"
                      >
                        Nguồn {index + 1} · {formatTime(citation.timestamp)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
