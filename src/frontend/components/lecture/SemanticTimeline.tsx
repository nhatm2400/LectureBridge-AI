'use client';

import {
  ArrowRight,
  ArrowRightLeft,
  BookOpenText,
  CalendarClock,
  Check,
  CircleHelp,
  FlaskConical,
  GraduationCap,
  Link2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Star,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { StatePanel } from '@/components/ui/StatePanel';
import { Surface } from '@/components/ui/Surface';
import {
  api,
  type LectureEvent,
  type LectureEventRelation,
  type LectureEventType,
} from '@/lib/api';
import { type Translate, useI18n } from '@/lib/i18n';
import { localizeLectureContent } from '@/lib/lecture-content-i18n';
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

const getEventMeta = (t: Translate): Record<LectureEventType, EventMeta> => ({
  QUESTION: { label: t('Câu hỏi', 'Question'), icon: CircleHelp, tone: 'bg-[var(--lb-info-soft)] text-[var(--lb-info)]' },
  ANSWER: { label: t('Trả lời', 'Answer'), icon: MessageCircle, tone: 'bg-[var(--lb-success-soft)] text-[var(--lb-success)]' },
  EXAMPLE: { label: t('Ví dụ', 'Example'), icon: FlaskConical, tone: 'bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]' },
  TOPIC_CHANGE: { label: t('Chuyển chủ đề', 'Topic shift'), icon: ArrowRightLeft, tone: 'bg-[var(--lb-info-soft)] text-[var(--lb-info)]' },
  IMPORTANT: { label: t('Quan trọng', 'Important'), icon: Star, tone: 'bg-[var(--lb-warning-soft)] text-[var(--lb-warning)]' },
  ACTION: { label: t('Việc cần làm', 'Action'), icon: Check, tone: 'bg-[var(--lb-success-soft)] text-[var(--lb-success)]' },
  DEADLINE: { label: t('Hạn chót', 'Deadline'), icon: CalendarClock, tone: 'bg-[var(--lb-danger-soft)] text-[var(--lb-danger)]' },
  EXAM_CUE: { label: t('Gợi ý ôn tập', 'Study cue'), icon: GraduationCap, tone: 'bg-[var(--lb-warning-soft)] text-[var(--lb-warning)]' },
});

const getReviewLabels = (t: Translate): Record<string, string> => ({
  UNREVIEWED: t('Chưa duyệt', 'Unreviewed'),
  CONFIRMED: t('Đã xác nhận', 'Confirmed'),
  CORRECTED: t('Đã hiệu chỉnh', 'Corrected'),
  REJECTED: t('Đã từ chối', 'Rejected'),
});

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const remainingSeconds = safeSeconds % 60;
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`
    : `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function spokenTime(seconds: number, t: Translate): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return t(
    `${Math.floor(safeSeconds / 60)} phút ${safeSeconds % 60} giây`,
    `${Math.floor(safeSeconds / 60)} minutes ${safeSeconds % 60} seconds`,
  );
}

function confidenceLabel(confidence: number, t: Translate): string {
  if (confidence >= 0.85) return t('Cao', 'High');
  if (confidence >= 0.7) return t('Trung bình', 'Medium');
  return t('Thấp', 'Low');
}

export function SemanticTimeline({ videoId, currentTime, onSeek }: SemanticTimelineProps) {
  const { locale, t } = useI18n();
  const eventMeta = useMemo(() => getEventMeta(t), [t]);
  const reviewLabels = useMemo(() => getReviewLabels(t), [t]);
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
      const sortedEvents = [...eventData].sort((left, right) => left.start_time - right.start_time || left.end_time - right.end_time);
      setEvents(sortedEvents);
      setRelations(relationData);
      setCanReview(access.can_review);
      setSelectedEventId((current) => current && sortedEvents.some((event) => event.id === current) ? current : sortedEvents[0]?.id || null);
    } catch {
      setError(t('Không thể tải dòng thời gian ngữ nghĩa. Vui lòng thử lại sau.', 'Could not load the semantic timeline. Please try again later.'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t, videoId]);

  useEffect(() => { void loadTimeline(); }, [loadTimeline]);

  const selectedEvent = useMemo(() => events.find((event) => event.id === selectedEventId) || null, [events, selectedEventId]);
  const localizedEventText = useCallback(
    (value: string) => localizeLectureContent(value, locale),
    [locale],
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
    (canReview || event.review_status !== 'REJECTED') && (filter === 'ALL' || event.event_type === filter)
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

  const eventsById = useMemo(() => new Map(events.map((event) => [event.id, event])), [events]);
  const visibleRelations = useMemo(() => relations.filter((relation) => canReview || relation.review_status !== 'REJECTED'), [canReview, relations]);
  const activeRelations = useMemo(() => relations.filter((relation) => relation.review_status !== 'REJECTED'), [relations]);
  const linkedFromSelected = useMemo(() => selectedEvent ? visibleRelations.filter((relation) => relation.source_event_id === selectedEvent.id) : [], [selectedEvent, visibleRelations]);
  const linkedToSelected = useMemo(() => selectedEvent ? visibleRelations.filter((relation) => relation.target_event_id === selectedEvent.id) : [], [selectedEvent, visibleRelations]);
  const answerOptions = useMemo(() => selectedEvent?.event_type === 'QUESTION'
    ? events.filter((event) => event.event_type === 'ANSWER' && event.start_time >= selectedEvent.start_time && event.review_status !== 'REJECTED')
    : [], [events, selectedEvent]);
  const manualAnswerOptions = useMemo(() => {
    const existingTargets = new Set(linkedFromSelected.map((relation) => relation.target_event_id));
    return answerOptions.filter((answer) => !existingTargets.has(answer.id));
  }, [answerOptions, linkedFromSelected]);

  const handleEventReview = async (reviewStatus: 'CONFIRMED' | 'REJECTED') => {
    if (!selectedEvent || busy) return;
    setBusy(true);
    try {
      const updated = await api.videos.reviewLectureEvent(videoId, selectedEvent.id, { review_status: reviewStatus });
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
      setStatusMessage(reviewStatus === 'CONFIRMED' ? t('Đã xác nhận sự kiện.', 'Event confirmed.') : t('Đã từ chối sự kiện.', 'Event rejected.'));
    } catch {
      setStatusMessage(t('Không thể lưu đánh giá sự kiện lúc này.', 'Could not save the event review right now.'));
    } finally { setBusy(false); }
  };

  const handleCorrection = async () => {
    if (!selectedEvent || busy || !editTitle.trim()) return;
    setBusy(true);
    try {
      const updated = await api.videos.reviewLectureEvent(videoId, selectedEvent.id, {
        review_status: 'CORRECTED', event_type: editType, title: editTitle.trim(), description: editDescription.trim(),
      });
      setEvents((current) => current.map((event) => event.id === updated.id ? updated : event));
      setEditing(false);
      setStatusMessage(t('Đã lưu nội dung hiệu chỉnh và giữ lại dấu vết AI ban đầu.', 'Correction saved while preserving the original AI provenance.'));
    } catch {
      setStatusMessage(t('Không thể lưu nội dung hiệu chỉnh lúc này.', 'Could not save the correction right now.'));
    } finally { setBusy(false); }
  };

  const handleRelationReview = async (relation: LectureEventRelation, reviewStatus: 'CONFIRMED' | 'CORRECTED' | 'REJECTED', targetEventId?: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const updated = await api.videos.reviewLectureEventRelation(videoId, relation.id, {
        review_status: reviewStatus,
        ...(targetEventId ? { target_event_id: targetEventId } : {}),
      });
      setRelations((current) => current.map((item) => item.id === updated.id ? updated : item));
      setStatusMessage(t('Đã cập nhật đánh giá liên kết hỏi đáp.', 'Q&A link review updated.'));
    } catch {
      setStatusMessage(t('Không thể cập nhật liên kết hỏi đáp lúc này.', 'Could not update the Q&A link right now.'));
    } finally { setBusy(false); }
  };

  const handleManualLink = async () => {
    if (!selectedEvent || !manualAnswerId || busy) return;
    setBusy(true);
    try {
      const relation = await api.videos.createLectureEventRelation(videoId, selectedEvent.id, manualAnswerId);
      setRelations((current) => [...current, relation]);
      setManualAnswerId('');
      setStatusMessage(t('Đã tạo liên kết hỏi đáp thủ công.', 'Manual Q&A link created.'));
    } catch {
      setStatusMessage(t('Không thể tạo liên kết hỏi đáp này.', 'Could not create this Q&A link.'));
    } finally { setBusy(false); }
  };

  const handleReprocess = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const eventMetrics = await api.videos.reprocessLectureEvents(videoId, locale);
      const relationMetrics = await api.videos.reprocessLectureEventRelations(videoId);
      await loadTimeline(false);
      setStatusMessage(t(
        `Đã tạo ${eventMetrics.events_created} sự kiện và ${relationMetrics.relations_created} liên kết hỏi đáp; ${eventMetrics.failed_chunks} chunk lỗi.`,
        `Created ${eventMetrics.events_created} events and ${relationMetrics.relations_created} Q&A links; ${eventMetrics.failed_chunks} failed chunks.`,
      ));
    } catch {
      setStatusMessage(t('Không thể phân tích lại Lecture Intelligence lúc này.', 'Could not reprocess Lecture Intelligence right now.'));
    } finally { setBusy(false); }
  };

  if (loading) return <StatePanel state="loading" title={t('Đang tải dòng thời gian', 'Loading timeline')} description={t('LectureBridge đang sắp xếp sự kiện theo mốc bài giảng.', 'LectureBridge is arranging events along the lecture timeline.')} />;
  if (error) return <StatePanel state="error" title={t('Không thể tải dòng thời gian', 'Could not load timeline')} description={error} action={<Button variant="secondary" onClick={() => void loadTimeline()}>{t('Thử tải lại', 'Try again')}</Button>} />;
  if (events.length === 0) {
    return (
      <StatePanel
        state="empty"
        title={t('Chưa có sự kiện ngữ nghĩa', 'No semantic events yet')}
        description={t('Bài giảng chưa được xử lý thành timeline sự kiện.', 'This lecture has not been processed into an event timeline.')}
        action={canReview ? <Button disabled={busy} onClick={() => void handleReprocess()}>{t('Phân tích bài giảng', 'Analyze lecture')}</Button> : undefined}
      />
    );
  }

  return (
    <section aria-labelledby="semantic-timeline-heading">
      <div className="flex flex-col gap-4 border-b border-[var(--lb-border)] pb-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]"><BookOpenText size={21} aria-hidden="true" /></span>
          <div>
            <h2 id="semantic-timeline-heading" className="text-xl">{t('Dòng thời gian ngữ nghĩa', 'Semantic timeline')}</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--lb-muted)]">{t('Sự kiện, mốc nguồn và quan hệ câu hỏi → trả lời trong bài giảng.', 'Events, source timestamps, and question → answer relationships in the lecture.')}</p>
          </div>
        </div>
        {canReview && (
          <Button variant="secondary" disabled={busy} onClick={() => void handleReprocess()}>
            <RefreshCw size={16} className={cn(busy && 'animate-spin')} aria-hidden="true" /> {t('Phân tích lại', 'Reprocess')}
          </Button>
        )}
      </div>

      <div role="group" aria-label={t('Lọc theo loại sự kiện', 'Filter by event type')} className="my-5 flex flex-wrap gap-2">
        <button type="button" aria-pressed={filter === 'ALL'} onClick={() => setFilter('ALL')} className={cn('min-h-11 rounded-md border px-3 text-xs font-bold', filter === 'ALL' ? 'border-[var(--lb-accent)] bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]' : 'border-[var(--lb-border)] bg-[var(--lb-elevated)] text-[var(--lb-muted)]')}>
          {t('Tất cả', 'All')} ({events.filter((event) => canReview || event.review_status !== 'REJECTED').length})
        </button>
        {(Object.keys(eventMeta) as LectureEventType[]).map((eventType) => {
          const count = events.filter((event) => event.event_type === eventType && (canReview || event.review_status !== 'REJECTED')).length;
          if (count === 0) return null;
          const meta = eventMeta[eventType];
          const Icon = meta.icon;
          return (
            <button key={eventType} type="button" aria-pressed={filter === eventType} onClick={() => setFilter(eventType)} className={cn('inline-flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs font-bold', filter === eventType ? `border-[var(--lb-accent)] ${meta.tone}` : 'border-[var(--lb-border)] bg-[var(--lb-elevated)] text-[var(--lb-muted)]')}>
              <Icon size={15} aria-hidden="true" /> {meta.label} ({count})
            </button>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,.95fr)]">
        <ol aria-label={t('Các sự kiện của bài giảng', 'Lecture events')} className="space-y-2">
          {visibleEvents.length === 0 && <li className="rounded-[10px] border border-dashed border-[var(--lb-border-strong)] p-8 text-center text-sm text-[var(--lb-muted)]">{t('Không có sự kiện thuộc bộ lọc này.', 'No events match this filter.')}</li>}
          {visibleEvents.map((event) => {
            const meta = eventMeta[event.event_type];
            const Icon = meta.icon;
            const isActive = event.id === activeEventId;
            const isSelected = event.id === selectedEventId;
            const outgoing = activeRelations.filter((relation) => relation.source_event_id === event.id);
            return (
              <li key={event.id} className={cn('rounded-[10px] border bg-[var(--lb-surface)] p-2', isSelected ? 'border-[var(--lb-accent)]' : 'border-[var(--lb-border)]', event.review_status === 'REJECTED' && 'border-dashed opacity-70')}>
                <button
                  type="button"
                  aria-current={isActive ? 'true' : undefined}
                  aria-label={t(`${meta.label} tại ${spokenTime(event.start_time, t)}: ${localizedEventText(event.title)}`, `${meta.label} at ${spokenTime(event.start_time, t)}: ${localizedEventText(event.title)}`)}
                  onClick={() => { setSelectedEventId(event.id); onSeek(event.start_time); }}
                  className="flex min-h-16 w-full items-start gap-3 rounded-md p-2 text-left hover:bg-[var(--lb-elevated)]"
                >
                  <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', meta.tone)}><Icon size={18} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--lb-accent)]">{formatTime(event.start_time)}</span>
                      <span className="text-xs font-semibold text-[var(--lb-muted)]">{meta.label}</span>
                      {event.inference_type === 'INFERRED' && <span className="rounded-full border border-[var(--lb-border)] px-2 py-0.5 text-[10px] font-semibold text-[var(--lb-muted)]">{t('AI suy luận', 'AI inferred')}</span>}
                      {isActive && <span className="rounded-full bg-[var(--lb-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--lb-accent)]">{t('Đang phát', 'Playing')}</span>}
                    </span>
                    <span className="mt-1 block text-sm font-semibold leading-5 text-[var(--lb-ink)]">{localizedEventText(event.title)}</span>
                  </span>
                </button>

                {event.event_type === 'QUESTION' && (
                  <div className="ml-[3.75rem] border-l border-[var(--lb-border)] pl-3">
                    {outgoing.length === 0 ? (
                      <p className="py-2 text-xs text-[var(--lb-muted)]">{t('Chưa có câu trả lời liên kết đủ tin cậy.', 'No linked answer is reliable enough yet.')}</p>
                    ) : outgoing.map((relation) => {
                      const answer = eventsById.get(relation.target_event_id);
                      if (!answer) return null;
                      return (
                        <button key={relation.id} type="button" onClick={() => { setSelectedEventId(answer.id); onSeek(answer.start_time); }} aria-label={t(`Đi tới câu trả lời tại ${spokenTime(answer.start_time, t)}: ${localizedEventText(answer.title)}`, `Go to answer at ${spokenTime(answer.start_time, t)}: ${localizedEventText(answer.title)}`)} className="flex min-h-11 w-full items-center gap-2 rounded-md px-2 text-left text-xs font-semibold text-[var(--lb-accent)] hover:bg-[var(--lb-accent-soft)]">
                          <ArrowRight size={15} aria-hidden="true" /> {t('Trả lời tại', 'Answer at')} {formatTime(answer.start_time)} · {localizedEventText(answer.title)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <Surface className="self-start overflow-hidden xl:sticky xl:top-20">
          {selectedEvent ? (
            <>
              <div className="border-b border-[var(--lb-border)] p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-1 text-xs font-bold', eventMeta[selectedEvent.event_type].tone)}>{eventMeta[selectedEvent.event_type].label}</span>
                  <span className="font-mono text-xs font-bold text-[var(--lb-accent)]">{formatTime(selectedEvent.start_time)}–{formatTime(selectedEvent.end_time)}</span>
                  <span className="rounded-full border border-[var(--lb-border)] px-2.5 py-1 text-xs text-[var(--lb-muted)]">{reviewLabels[selectedEvent.review_status]}</span>
                </div>
                <h3 className="mt-4 text-xl leading-snug">{localizedEventText(selectedEvent.title)}</h3>
                <p className="mt-3 text-sm leading-7 text-[var(--lb-muted)]">{localizedEventText(selectedEvent.description)}</p>
                <button type="button" onClick={() => onSeek(selectedEvent.start_time)} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-bold text-[var(--lb-accent)] hover:underline">
                  <Link2 size={16} aria-hidden="true" /> {t('Mở nguồn tại', 'Open source at')} {formatTime(selectedEvent.start_time)}
                </button>
              </div>

              <div className="space-y-5 p-5">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div><dt className="text-[var(--lb-muted)]">{t('Độ tin cậy', 'Confidence')}</dt><dd className="mt-1 font-semibold text-[var(--lb-ink)]">{confidenceLabel(selectedEvent.confidence, t)} · {Math.round(selectedEvent.confidence * 100)}%</dd></div>
                  <div><dt className="text-[var(--lb-muted)]">{t('Nguồn tạo', 'Created by')}</dt><dd className="mt-1 font-semibold text-[var(--lb-ink)]">{selectedEvent.created_by === 'AI' ? t('AI đề xuất', 'AI proposed') : t('Con người', 'Human')}</dd></div>
                </dl>

                {[...linkedFromSelected, ...linkedToSelected].length > 0 && (
                  <section aria-labelledby="relations-heading">
                    <h4 id="relations-heading" className="text-sm font-bold">{t('Quan hệ câu hỏi → trả lời', 'Question → answer relationships')}</h4>
                    <div className="mt-2 space-y-2">
                      {[...linkedFromSelected, ...linkedToSelected].map((relation) => {
                        const counterpartId = relation.source_event_id === selectedEvent.id ? relation.target_event_id : relation.source_event_id;
                        const counterpart = eventsById.get(counterpartId);
                        if (!counterpart) return null;
                        const selectedTarget = relationTargets[relation.id] || relation.target_event_id;
                        return (
                          <div key={relation.id} className="rounded-md border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-3 text-xs">
                            <button type="button" onClick={() => { setSelectedEventId(counterpart.id); onSeek(counterpart.start_time); }} className="min-h-11 text-left font-semibold leading-5 text-[var(--lb-accent)] hover:underline">
                              {eventMeta[counterpart.event_type].label} · {formatTime(counterpart.start_time)} · {localizedEventText(counterpart.title)}
                            </button>
                            <p className="text-[var(--lb-muted)]">{reviewLabels[relation.review_status]} · {relation.created_by}</p>
                            {canReview && (
                              <div className="mt-3 space-y-2 border-t border-[var(--lb-border)] pt-3">
                                <div className="flex flex-wrap gap-2">
                                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleRelationReview(relation, 'CONFIRMED')}>{t('Xác nhận', 'Confirm')}</Button>
                                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleRelationReview(relation, 'REJECTED')}>{t('Từ chối', 'Reject')}</Button>
                                </div>
                                {relation.source_event_id === selectedEvent.id && answerOptions.length > 0 && (
                                  <div className="space-y-2">
                                    <label htmlFor={`relation-target-${relation.id}`} className="font-semibold text-[var(--lb-muted)]">{t('Sửa câu trả lời đích', 'Change target answer')}</label>
                                    <select id={`relation-target-${relation.id}`} value={selectedTarget} onChange={(event) => setRelationTargets((current) => ({ ...current, [relation.id]: event.target.value }))} className="lb-field text-xs">
                                      {answerOptions.map((answer) => <option key={answer.id} value={answer.id}>{formatTime(answer.start_time)} · {localizedEventText(answer.title)}</option>)}
                                    </select>
                                    <Button size="sm" disabled={busy || selectedTarget === relation.target_event_id} onClick={() => void handleRelationReview(relation, 'CORRECTED', selectedTarget)}>{t('Lưu liên kết', 'Save link')}</Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                )}

                {canReview && selectedEvent.event_type === 'QUESTION' && manualAnswerOptions.length > 0 && (
                  <section className="space-y-2 border-t border-[var(--lb-border)] pt-4">
                    <label htmlFor="manual-answer-link" className="text-sm font-bold">{t('Tạo liên kết thủ công', 'Create a manual link')}</label>
                    <select id="manual-answer-link" value={manualAnswerId} onChange={(event) => setManualAnswerId(event.target.value)} className="lb-field text-sm">
                      <option value="">{t('Chọn câu trả lời…', 'Choose an answer…')}</option>
                      {manualAnswerOptions.map((answer) => <option key={answer.id} value={answer.id}>{formatTime(answer.start_time)} · {localizedEventText(answer.title)}</option>)}
                    </select>
                    <Button size="sm" disabled={busy || !manualAnswerId} onClick={() => void handleManualLink()}>{t('Tạo liên kết Q→A', 'Create Q→A link')}</Button>
                  </section>
                )}

                {canReview && (
                  <section className="border-t border-[var(--lb-border)] pt-4" aria-label={t('Kiểm duyệt sự kiện', 'Event review')}>
                    {!editing ? (
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" disabled={busy} onClick={() => void handleEventReview('CONFIRMED')}><Check size={16} /> {t('Xác nhận', 'Confirm')}</Button>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => setEditing(true)}><Pencil size={16} /> {t('Hiệu chỉnh', 'Correct')}</Button>
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void handleEventReview('REJECTED')}><X size={16} /> {t('Từ chối', 'Reject')}</Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <label className="block text-sm font-semibold">{t('Loại sự kiện', 'Event type')}<select value={editType} onChange={(event) => setEditType(event.target.value as LectureEventType)} className="lb-field mt-1">
                          {(Object.keys(eventMeta) as LectureEventType[]).map((eventType) => <option key={eventType} value={eventType}>{eventMeta[eventType].label}</option>)}
                        </select></label>
                        <label className="block text-sm font-semibold">{t('Tiêu đề', 'Title')}<input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} className="lb-field mt-1" /></label>
                        <label className="block text-sm font-semibold">{t('Mô tả', 'Description')}<textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={4} className="lb-field mt-1 resize-y" /></label>
                        <div className="flex gap-2"><Button size="sm" disabled={busy || !editTitle.trim()} onClick={() => void handleCorrection()}>{t('Lưu hiệu chỉnh', 'Save correction')}</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>{t('Hủy', 'Cancel')}</Button></div>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </>
          ) : <p className="p-5 text-sm text-[var(--lb-muted)]">{t('Chọn một sự kiện để xem chi tiết.', 'Select an event to view details.')}</p>}
        </Surface>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{statusMessage}</p>
    </section>
  );
}
