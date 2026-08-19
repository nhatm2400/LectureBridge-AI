'use client';

import {
  ArrowRight,
  ArrowRightLeft,
  CalendarClock,
  Check,
  CircleHelp,
  FlaskConical,
  GraduationCap,
  Link2,
  LoaderCircle,
  MessageCircle,
  Pencil,
  RefreshCw,
  Sparkles,
  Star,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  api,
  type LectureEvent,
  type LectureEventRelation,
  type LectureEventType,
} from '@/lib/api';
import { cn } from '@/lib/utils';


interface SemanticTimelineProps {
  videoId: string;
  currentTime: number;
  onSeek: (seconds: number) => void;
}

interface EventMeta {
  label: string;
  icon: LucideIcon;
  tone: string;
}

const EVENT_META: Record<LectureEventType, EventMeta> = {
  QUESTION: { label: 'Câu hỏi', icon: CircleHelp, tone: 'border-sky-200 bg-sky-50 text-sky-800' },
  ANSWER: { label: 'Trả lời', icon: MessageCircle, tone: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  EXAMPLE: { label: 'Ví dụ', icon: FlaskConical, tone: 'border-violet-200 bg-violet-50 text-violet-800' },
  TOPIC_CHANGE: { label: 'Chuyển chủ đề', icon: ArrowRightLeft, tone: 'border-indigo-200 bg-indigo-50 text-indigo-800' },
  IMPORTANT: { label: 'Quan trọng', icon: Star, tone: 'border-amber-200 bg-amber-50 text-amber-900' },
  ACTION: { label: 'Việc cần làm', icon: Check, tone: 'border-teal-200 bg-teal-50 text-teal-800' },
  DEADLINE: { label: 'Hạn chót', icon: CalendarClock, tone: 'border-rose-200 bg-rose-50 text-rose-800' },
  EXAM_CUE: { label: 'Gợi ý ôn tập', icon: GraduationCap, tone: 'border-orange-200 bg-orange-50 text-orange-900' },
};

const REVIEW_LABELS: Record<string, string> = {
  UNREVIEWED: 'Chưa duyệt',
  CONFIRMED: 'Đã xác nhận',
  CORRECTED: 'Đã hiệu chỉnh',
  REJECTED: 'Đã từ chối',
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function spokenTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;
  return `${minutes} phút ${remainingSeconds} giây`;
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Cao';
  if (confidence >= 0.7) return 'Trung bình';
  return 'Thấp';
}

export function SemanticTimeline({ videoId, currentTime, onSeek }: SemanticTimelineProps) {
  const [events, setEvents] = useState<LectureEvent[]>([]);
  const [relations, setRelations] = useState<LectureEventRelation[]>([]);
  const [canReview, setCanReview] = useState(false);
  const [filter, setFilter] = useState<'ALL' | LectureEventType>('ALL');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [editing, setEditing] = useState(false);
  const [editType, setEditType] = useState<LectureEventType>('EXAMPLE');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [manualAnswerId, setManualAnswerId] = useState('');
  const [relationTargets, setRelationTargets] = useState<Record<string, string>>({});

  const loadTimeline = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const [eventData, relationData, access] = await Promise.all([
        api.videos.getLectureEvents(videoId),
        api.videos.getLectureEventRelations(videoId),
        api.videos.getLectureReviewAccess(videoId),
      ]);
      const sortedEvents = [...eventData].sort(
        (left, right) => left.start_time - right.start_time || left.end_time - right.end_time
      );
      setEvents(sortedEvents);
      setRelations(relationData);
      setCanReview(access.can_review);
      setSelectedEventId((current) => (
        current && sortedEvents.some((event) => event.id === current)
          ? current
          : sortedEvents[0]?.id || null
      ));
    } catch {
      setError('Không thể tải dòng thời gian ngữ nghĩa. Vui lòng thử lại sau.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [videoId]);

  useEffect(() => {
    void loadTimeline();
  }, [loadTimeline]);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );

  useEffect(() => {
    if (!selectedEvent) return;
    setEditType(selectedEvent.event_type);
    setEditTitle(selectedEvent.title);
    setEditDescription(selectedEvent.description);
    setEditing(false);
    setManualAnswerId('');
  }, [selectedEvent]);

  const visibleEvents = useMemo(() => events.filter((event) => (
    (canReview || event.review_status !== 'REJECTED')
    && (filter === 'ALL' || event.event_type === filter)
  )), [canReview, events, filter]);

  const activeEventId = useMemo(() => {
    let active: LectureEvent | null = null;
    for (const event of events) {
      if (event.review_status === 'REJECTED') continue;
      if (event.start_time <= currentTime) active = event;
      else break;
    }
    return active?.id || null;
  }, [currentTime, events]);

  const eventsById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events]
  );

  const visibleRelations = useMemo(
    () => relations.filter((relation) => canReview || relation.review_status !== 'REJECTED'),
    [canReview, relations]
  );

  const activeRelations = useMemo(
    () => relations.filter((relation) => relation.review_status !== 'REJECTED'),
    [relations]
  );

  const linkedFromSelected = useMemo(
    () => selectedEvent
      ? visibleRelations.filter((relation) => relation.source_event_id === selectedEvent.id)
      : [],
    [selectedEvent, visibleRelations]
  );

  const linkedToSelected = useMemo(
    () => selectedEvent
      ? visibleRelations.filter((relation) => relation.target_event_id === selectedEvent.id)
      : [],
    [selectedEvent, visibleRelations]
  );

  const answerOptions = useMemo(() => (
    selectedEvent?.event_type === 'QUESTION'
      ? events.filter((event) => (
          event.event_type === 'ANSWER'
          && event.start_time >= selectedEvent.start_time
          && event.review_status !== 'REJECTED'
        ))
      : []
  ), [events, selectedEvent]);

  const manualAnswerOptions = useMemo(() => {
    const existingTargets = new Set(linkedFromSelected.map((relation) => relation.target_event_id));
    return answerOptions.filter((answer) => !existingTargets.has(answer.id));
  }, [answerOptions, linkedFromSelected]);

  const announce = (message: string) => {
    setStatusMessage(message);
  };

  const handleEventReview = async (reviewStatus: 'CONFIRMED' | 'REJECTED') => {
    if (!selectedEvent || busy) return;
    setBusy(true);
    try {
      const updated = await api.videos.reviewLectureEvent(videoId, selectedEvent.id, {
        review_status: reviewStatus,
      });
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
      announce(reviewStatus === 'CONFIRMED' ? 'Đã xác nhận sự kiện.' : 'Đã từ chối sự kiện.');
    } catch {
      announce('Không thể lưu đánh giá sự kiện lúc này.');
    } finally {
      setBusy(false);
    }
  };

  const handleCorrection = async () => {
    if (!selectedEvent || busy || !editTitle.trim()) return;
    setBusy(true);
    try {
      const updated = await api.videos.reviewLectureEvent(videoId, selectedEvent.id, {
        review_status: 'CORRECTED',
        event_type: editType,
        title: editTitle.trim(),
        description: editDescription.trim(),
      });
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
      setEditing(false);
      announce('Đã lưu nội dung hiệu chỉnh và giữ lại dấu vết AI ban đầu.');
    } catch {
      announce('Không thể lưu nội dung hiệu chỉnh lúc này.');
    } finally {
      setBusy(false);
    }
  };

  const handleRelationReview = async (
    relation: LectureEventRelation,
    reviewStatus: 'CONFIRMED' | 'CORRECTED' | 'REJECTED',
    targetEventId?: string
  ) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api.videos.reviewLectureEventRelation(videoId, relation.id, {
        review_status: reviewStatus,
        ...(targetEventId ? { target_event_id: targetEventId } : {}),
      });
      setRelations((current) => current.map((item) => item.id === updated.id ? updated : item));
      announce('Đã cập nhật đánh giá liên kết hỏi đáp.');
    } catch {
      announce('Không thể cập nhật liên kết hỏi đáp lúc này.');
    } finally {
      setBusy(false);
    }
  };

  const handleManualLink = async () => {
    if (!selectedEvent || !manualAnswerId || busy) return;
    setBusy(true);
    try {
      const relation = await api.videos.createLectureEventRelation(
        videoId,
        selectedEvent.id,
        manualAnswerId
      );
      setRelations((current) => [...current, relation]);
      setManualAnswerId('');
      announce('Đã tạo liên kết hỏi đáp thủ công.');
    } catch {
      announce('Không thể tạo liên kết hỏi đáp này.');
    } finally {
      setBusy(false);
    }
  };

  const handleReprocess = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const eventMetrics = await api.videos.reprocessLectureEvents(videoId);
      const relationMetrics = await api.videos.reprocessLectureEventRelations(videoId);
      await loadTimeline(false);
      announce(
        `Đã tạo ${eventMetrics.events_created} sự kiện và ${relationMetrics.relations_created} liên kết hỏi đáp; ${eventMetrics.failed_chunks} chunk lỗi.`
      );
    } catch {
      announce('Không thể phân tích lại Lecture Intelligence lúc này.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div role="status" className="flex min-h-72 items-center justify-center gap-3 text-sm font-bold text-slate-500">
        <LoaderCircle className="animate-spin motion-reduce:animate-none" size={20} />
        Đang tải dòng thời gian ngữ nghĩa...
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
        <p className="max-w-lg text-sm font-bold text-rose-700">{error}</p>
        <button
          type="button"
          onClick={() => void loadTimeline()}
          className="min-h-11 rounded-xl border border-slate-300 px-5 font-bold text-slate-700 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
        >
          Thử tải lại
        </button>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="flex min-h-72 flex-col items-center justify-center gap-4 text-center">
        <Sparkles size={32} className="text-slate-400" aria-hidden="true" />
        <div>
          <h3 className="font-extrabold text-slate-800">Chưa có sự kiện ngữ nghĩa</h3>
          <p className="mt-1 text-sm text-slate-500">Bài giảng chưa được xử lý bằng Lecture Intelligence.</p>
        </div>
        {canReview && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleReprocess()}
            className="min-h-11 rounded-xl bg-slate-900 px-5 font-bold text-white outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
          >
            Phân tích Lecture Intelligence
          </button>
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="semantic-timeline-heading" className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles size={19} className="text-[#FF4F6E]" aria-hidden="true" />
            <h2 id="semantic-timeline-heading" className="text-lg font-extrabold text-slate-900">
              Dòng thời gian ngữ nghĩa
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">Chọn một sự kiện để chuyển video đến đúng thời điểm.</p>
        </div>
        {canReview && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleReprocess()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-extrabold text-slate-700 outline-none transition hover:border-slate-500 focus-visible:ring-4 focus-visible:ring-sky-200 motion-reduce:transition-none disabled:opacity-50"
          >
            <RefreshCw size={16} className={cn(busy && 'animate-spin motion-reduce:animate-none')} aria-hidden="true" />
            Phân tích lại
          </button>
        )}
      </div>

      <div role="group" aria-label="Lọc dòng thời gian theo loại sự kiện" className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={filter === 'ALL'}
          onClick={() => setFilter('ALL')}
          className={cn(
            'min-h-11 rounded-full border px-4 text-xs font-extrabold outline-none focus-visible:ring-4 focus-visible:ring-sky-200',
            filter === 'ALL' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600'
          )}
        >
          Tất cả ({events.filter((event) => canReview || event.review_status !== 'REJECTED').length})
        </button>
        {(Object.keys(EVENT_META) as LectureEventType[]).map((eventType) => {
          const count = events.filter((event) => (
            event.event_type === eventType && (canReview || event.review_status !== 'REJECTED')
          )).length;
          if (count === 0) return null;
          const meta = EVENT_META[eventType];
          const Icon = meta.icon;
          return (
            <button
              type="button"
              key={eventType}
              aria-pressed={filter === eventType}
              onClick={() => setFilter(eventType)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-extrabold outline-none focus-visible:ring-4 focus-visible:ring-sky-200',
                filter === eventType ? meta.tone : 'border-slate-200 bg-white text-slate-600'
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <ol aria-label="Các sự kiện của bài giảng" className="space-y-3">
          {visibleEvents.length === 0 && (
            <li className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
              Không có sự kiện thuộc bộ lọc này.
            </li>
          )}
          {visibleEvents.map((event) => {
            const meta = EVENT_META[event.event_type];
            const Icon = meta.icon;
            const isActive = event.id === activeEventId;
            const outgoing = activeRelations.filter((relation) => relation.source_event_id === event.id);
            const incoming = activeRelations.filter((relation) => relation.target_event_id === event.id);
            return (
              <li
                key={event.id}
                className={cn(
                  'rounded-2xl border bg-white p-3 transition motion-reduce:transition-none',
                  isActive ? 'border-[#FF4F6E] shadow-md shadow-rose-100' : 'border-slate-200',
                  event.review_status === 'REJECTED' && 'border-dashed opacity-70'
                )}
              >
                <button
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={`${meta.label} tại ${spokenTime(event.start_time)}: ${event.title}`}
                  onClick={() => {
                    setSelectedEventId(event.id);
                    onSeek(event.start_time);
                  }}
                  className="flex min-h-14 w-full items-start gap-3 rounded-xl p-2 text-left outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                >
                  <span className={cn('inline-flex size-11 shrink-0 items-center justify-center rounded-xl border', meta.tone)}>
                    <Icon size={19} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold text-[#D9365C]">{formatTime(event.start_time)}</span>
                      <span className="text-xs font-extrabold text-slate-600">{meta.label}</span>
                      {event.inference_type === 'INFERRED' && (
                        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-extrabold text-indigo-800">AI suy luận</span>
                      )}
                      {isActive && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-extrabold text-rose-800">Đang phát</span>
                      )}
                    </span>
                    <span className="mt-1 block font-bold leading-snug text-slate-800">{event.title}</span>
                  </span>
                </button>

                {event.event_type === 'QUESTION' && (
                  <div className="ml-14 space-y-1 border-l-2 border-slate-100 pl-4">
                    {outgoing.length === 0 ? (
                      <p className="py-1 text-xs font-semibold text-slate-500">Chưa có câu trả lời liên kết đủ tin cậy.</p>
                    ) : outgoing.map((relation) => {
                      const answer = eventsById.get(relation.target_event_id);
                      if (!answer) return null;
                      return (
                        <button
                          type="button"
                          key={relation.id}
                          onClick={() => {
                            setSelectedEventId(answer.id);
                            onSeek(answer.start_time);
                          }}
                          aria-label={`Đi tới câu trả lời tại ${spokenTime(answer.start_time)}: ${answer.title}`}
                          className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-xs font-bold text-emerald-800 outline-none hover:bg-emerald-50 focus-visible:ring-4 focus-visible:ring-sky-200"
                        >
                          <ArrowRight size={14} aria-hidden="true" />
                          Trả lời tại {formatTime(answer.start_time)}: {answer.title}
                        </button>
                      );
                    })}
                  </div>
                )}

                {event.event_type === 'ANSWER' && incoming.length > 0 && (
                  <p className="ml-16 py-1 text-xs font-semibold text-slate-500">
                    Trả lời cho {incoming.length} câu hỏi được liên kết.
                  </p>
                )}
              </li>
            );
          })}
        </ol>

        <aside aria-label="Chi tiết sự kiện" className="h-fit rounded-3xl border border-slate-200 bg-slate-50 p-5 xl:sticky xl:top-24">
          {!selectedEvent ? (
            <p className="text-sm text-slate-500">Chọn một sự kiện để xem chi tiết.</p>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-slate-500">
                  <span>{EVENT_META[selectedEvent.event_type].label}</span>
                  <span aria-hidden="true">•</span>
                  <span>{formatTime(selectedEvent.start_time)}</span>
                </div>
                <h3 className="mt-2 text-lg font-extrabold text-slate-900">{selectedEvent.title}</h3>
                {selectedEvent.description && <p className="mt-2 text-sm leading-6 text-slate-600">{selectedEvent.description}</p>}
              </div>

              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-white p-3">
                  <dt className="font-bold text-slate-500">Nguồn tạo</dt>
                  <dd className="mt-1 font-extrabold text-slate-800">{selectedEvent.created_by === 'AI' ? 'AI' : 'Con người'}</dd>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <dt className="font-bold text-slate-500">Trạng thái</dt>
                  <dd className="mt-1 font-extrabold text-slate-800">{REVIEW_LABELS[selectedEvent.review_status]}</dd>
                </div>
                <div
                  className="col-span-2 rounded-xl bg-white p-3"
                  title="Độ tin cậy do mô hình báo cáo, không phải xác suất sự kiện đúng."
                >
                  <dt className="font-bold text-slate-500">Độ tin cậy AI</dt>
                  <dd className="mt-1 font-extrabold text-slate-800">{confidenceLabel(selectedEvent.confidence)}</dd>
                  <p className="mt-1 text-[11px] text-slate-500">Chỉ là heuristic do mô hình báo cáo, chưa được hiệu chuẩn.</p>
                </div>
              </dl>

              {(linkedFromSelected.length > 0 || linkedToSelected.length > 0) && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <h4 className="flex items-center gap-2 text-sm font-extrabold text-slate-800">
                    <Link2 size={15} aria-hidden="true" /> Liên kết hỏi đáp
                  </h4>
                  {[...linkedFromSelected, ...linkedToSelected].map((relation) => {
                    const counterpartId = relation.source_event_id === selectedEvent.id
                      ? relation.target_event_id
                      : relation.source_event_id;
                    const counterpart = eventsById.get(counterpartId);
                    if (!counterpart) return null;
                    const selectedTarget = relationTargets[relation.id] || relation.target_event_id;
                    return (
                      <div key={relation.id} className="rounded-xl border border-slate-200 bg-white p-3 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEventId(counterpart.id);
                            onSeek(counterpart.start_time);
                          }}
                          className="min-h-11 w-full rounded-lg text-left font-bold text-slate-700 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                        >
                          {EVENT_META[counterpart.event_type].label} · {formatTime(counterpart.start_time)} · {counterpart.title}
                        </button>
                        <p className="mt-1 text-slate-500">{REVIEW_LABELS[relation.review_status]} · {relation.created_by}</p>
                        {canReview && (
                          <div className="mt-3 space-y-2">
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleRelationReview(relation, 'CONFIRMED')}
                                className="min-h-11 rounded-lg bg-emerald-100 px-3 font-bold text-emerald-900 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                              >
                                Xác nhận liên kết
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleRelationReview(relation, 'REJECTED')}
                                className="min-h-11 rounded-lg bg-rose-100 px-3 font-bold text-rose-900 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                              >
                                Từ chối liên kết
                              </button>
                            </div>
                            {relation.source_event_id === selectedEvent.id && answerOptions.length > 0 && (
                              <div className="flex flex-col gap-2">
                                <label htmlFor={`relation-target-${relation.id}`} className="font-bold text-slate-600">Sửa câu trả lời đích</label>
                                <select
                                  id={`relation-target-${relation.id}`}
                                  value={selectedTarget}
                                  onChange={(event) => setRelationTargets((current) => ({ ...current, [relation.id]: event.target.value }))}
                                  className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                                >
                                  {answerOptions.map((answer) => <option key={answer.id} value={answer.id}>{formatTime(answer.start_time)} · {answer.title}</option>)}
                                </select>
                                <button
                                  type="button"
                                  disabled={busy || selectedTarget === relation.target_event_id}
                                  onClick={() => void handleRelationReview(relation, 'CORRECTED', selectedTarget)}
                                  className="min-h-11 rounded-lg border border-slate-300 px-3 font-bold text-slate-700 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                                >
                                  Lưu câu trả lời đích
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {canReview && selectedEvent.event_type === 'QUESTION' && manualAnswerOptions.length > 0 && (
                <div className="space-y-2 border-t border-slate-200 pt-4">
                  <label htmlFor="manual-answer-link" className="text-sm font-extrabold text-slate-800">Tạo liên kết thủ công</label>
                  <select
                    id="manual-answer-link"
                    value={manualAnswerId}
                    onChange={(event) => setManualAnswerId(event.target.value)}
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                  >
                    <option value="">Chọn câu trả lời</option>
                    {manualAnswerOptions.map((answer) => <option key={answer.id} value={answer.id}>{formatTime(answer.start_time)} · {answer.title}</option>)}
                  </select>
                  <button
                    type="button"
                    disabled={!manualAnswerId || busy}
                    onClick={() => void handleManualLink()}
                    className="min-h-11 w-full rounded-xl bg-slate-900 px-4 text-sm font-bold text-white outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                  >
                    Tạo liên kết Q→A
                  </button>
                </div>
              )}

              {canReview && (
                <div className="space-y-3 border-t border-slate-200 pt-4">
                  <h4 className="text-sm font-extrabold text-slate-800">Kiểm duyệt sự kiện</h4>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleEventReview('CONFIRMED')}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-100 px-3 text-xs font-extrabold text-emerald-900 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                    >
                      <Check size={15} aria-hidden="true" /> Xác nhận
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing((current) => !current)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-amber-100 px-3 text-xs font-extrabold text-amber-900 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                    >
                      <Pencil size={15} aria-hidden="true" /> Hiệu chỉnh
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleEventReview('REJECTED')}
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-rose-100 px-3 text-xs font-extrabold text-rose-900 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                    >
                      <X size={15} aria-hidden="true" /> Từ chối
                    </button>
                  </div>

                  {editing && (
                    <div className="space-y-3 rounded-2xl border border-amber-200 bg-white p-4">
                      <p className="text-xs text-slate-500">Timestamp và source evidence do backend quản lý nên không thể sửa trực tiếp.</p>
                      <label className="block text-xs font-bold text-slate-700">
                        Loại sự kiện
                        <select
                          value={editType}
                          onChange={(event) => setEditType(event.target.value as LectureEventType)}
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                        >
                          {(Object.keys(EVENT_META) as LectureEventType[]).map((eventType) => (
                            <option key={eventType} value={eventType}>{EVENT_META[eventType].label}</option>
                          ))}
                        </select>
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        Tiêu đề
                        <input
                          value={editTitle}
                          onChange={(event) => setEditTitle(event.target.value)}
                          className="mt-1 min-h-11 w-full rounded-xl border border-slate-300 px-3 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                        />
                      </label>
                      <label className="block text-xs font-bold text-slate-700">
                        Mô tả
                        <textarea
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          rows={4}
                          className="mt-1 w-full rounded-xl border border-slate-300 p-3 outline-none focus-visible:ring-4 focus-visible:ring-sky-200"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={busy || !editTitle.trim()}
                        onClick={() => void handleCorrection()}
                        className="min-h-11 w-full rounded-xl bg-amber-500 px-4 text-sm font-extrabold text-slate-950 outline-none focus-visible:ring-4 focus-visible:ring-sky-200 disabled:opacity-50"
                      >
                        Lưu hiệu chỉnh
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      <div
        aria-live="polite"
        className="sr-only"
      >
        {statusMessage}
      </div>
    </section>
  );
}
