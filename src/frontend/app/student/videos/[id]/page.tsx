'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Captions,
  FileText,
  Clock,
  Zap,
  ClipboardCheck,
  BookOpen,
  List,
  Film,
  CheckCircle,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, type UserProgress } from '@/lib/api';
import { SemanticTimeline } from '@/components/lecture/SemanticTimeline';
import { LectureGroundingPanel } from '@/components/lecture/LectureGroundingPanel';
import { useI18n } from '@/lib/i18n';
import { localizeLectureContent } from '@/lib/lecture-content-i18n';

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

type TranscriptByLanguage = Record<string, TranscriptSegment[]>;

interface HighlightItem {
  time: string;
  reason: string;
  context: string;
}

interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  hint?: string | null;
}

interface QuizOptionItem {
  id: string;
  option_text: string;
}

interface QuizQuestionItem {
  id: string;
  question_text: string;
  explanation?: string;
  options: QuizOptionItem[];
}

interface LessonQuizItem {
  id: string;
  title: string;
  passing_score: number;
  questions: QuizQuestionItem[];
}

interface ModuleLessonItem {
  id: string;
  title: string;
  duration: string;
  thumb: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const captionPositionClass = {
  low: 'bottom-12',
  middle: 'bottom-1/3',
  high: 'top-16',
};

const captionPositionWithControlsClass = {
  low: 'bottom-24',
  middle: 'bottom-1/3',
  high: 'top-16',
};

function naturalTitleCompare(aTitle?: string, bTitle?: string): number {
  return (aTitle || '').localeCompare((bTitle || ''), 'vi', {
    sensitivity: 'base',
    numeric: true,
  });
}

export default function VideoLessonPage() {
  const { locale, t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptPanelRef = useRef<HTMLDivElement>(null);
  const transcriptItemRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [activeTab, setActiveTab] = useState('summary');
  const [currentTime, setCurrentTime] = useState(0);

  // Data state
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [language, setLanguage] = useState('vi');
  const [segmentsByLanguage, setSegmentsByLanguage] = useState<TranscriptByLanguage>({});
  const [highlights, setHighlights] = useState<HighlightItem[]>([]);
  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);

  const [isLoadingTranscript, setIsLoadingTranscript] = useState(true);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [metadataError, setMetadataError] = useState('');
  const [summaryPoints, setSummaryPoints] = useState<string[]>([]);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);
  const [isLoadingQuizzes, setIsLoadingQuizzes] = useState(false);
  const [quizzes, setQuizzes] = useState<LessonQuizItem[]>([]);
  const [selectedQuizIdx, setSelectedQuizIdx] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizSubmitResult, setQuizSubmitResult] = useState<{ score: number; status: string; correct: number; total: number } | null>(null);
  const [isSubmittingQuiz, setIsSubmittingQuiz] = useState(false);

  // Custom Video Controls State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showCaptions, setShowCaptions] = useState(true);
  const [captionBackground, setCaptionBackground] = useState(false);
  const [captionSize] = useState(18);
  const [captionLineHeight] = useState(1.45);
  const [captionPosition] = useState<'low' | 'middle' | 'high'>('low');
  const [reducedMotion, setReducedMotion] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProgressSaveSecondRef = useRef(0);
  const hasRestoredProgressRef = useRef(false);
  const lastScrolledIndexRef = useRef<number>(-1);
  const [rightPanelTab, setRightPanelTab] = useState('transcript');
  const [currentFlashcardIndex, setCurrentFlashcardIndex] = useState(0);
  const [isFlashcardFlipped, setIsFlashcardFlipped] = useState(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const [savedProgress, setSavedProgress] = useState<UserProgress | null>(null);
  const [moduleLessons, setModuleLessons] = useState<ModuleLessonItem[]>([]);
  const [isLoadingModuleLessons, setIsLoadingModuleLessons] = useState(false);
  const [lessonTitle, setLessonTitle] = useState('');

  const currentIndex = useMemo(() => moduleLessons.findIndex((l) => l.id === videoId), [moduleLessons, videoId]);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < moduleLessons.length - 1;

  const handlePrevVideo = useCallback(() => {
    if (hasPrev) {
      router.push(`/student/videos/${moduleLessons[currentIndex - 1].id}`);
    }
  }, [hasPrev, currentIndex, moduleLessons, router]);

  const handleNextVideo = useCallback(() => {
    if (hasNext) {
      router.push(`/student/videos/${moduleLessons[currentIndex + 1].id}`);
    }
  }, [hasNext, currentIndex, moduleLessons, router]);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const videoSrc = `/api/video/${encodeURIComponent(videoId)}`;

  const buildLessonPreview = useCallback(async (lessonId: string, initialDuration?: string): Promise<{ duration: string; thumb: string }> => {
    const thumbUrl = `${backendBaseUrl}/api/videos/${lessonId}/thumbnail`;

    if (typeof window === 'undefined') {
      return { duration: initialDuration || '--:--', thumb: thumbUrl };
    }

    if (initialDuration && initialDuration !== '--:--') {
      return { duration: initialDuration, thumb: thumbUrl };
    }

    return await new Promise((resolve) => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;
      video.src = `/api/video/${encodeURIComponent(lessonId)}`;

      let resolved = false;
      const timeout = window.setTimeout(() => {
        cleanup();
        resolve({ duration: '--:--', thumb: thumbUrl });
      }, 6000);

      const cleanup = () => {
        if (resolved) return;
        resolved = true;
        window.clearTimeout(timeout);
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
        video.src = '';
      };

      const onError = () => {
        cleanup();
        resolve({ duration: '--:--', thumb: thumbUrl });
      };

      const onLoadedMetadata = () => {
        cleanup();
        const finalDuration = formatDuration(video.duration);
        resolve({ duration: finalDuration, thumb: thumbUrl });
      };

      video.addEventListener('loadedmetadata', onLoadedMetadata);
      video.addEventListener('error', onError);
    });
  }, [backendBaseUrl]);

  useEffect(() => {
    const fetchTranscript = async () => {
      try {
        const data = await api.videos.getTranscript(videoId);
        const fromApi = (data.segments_by_language || {}) as TranscriptByLanguage;
        const normalized: TranscriptByLanguage = {};

        for (const lang of ['vi', 'en']) {
          const langSegments = fromApi[lang];
          if (Array.isArray(langSegments) && langSegments.length > 0) {
            normalized[lang] = langSegments;
          }
        }

        if (Object.keys(normalized).length === 0 && Array.isArray(data.segments)) {
          const transcriptLang = String(data.language || data.source_language || 'vi').toLowerCase().startsWith('en') ? 'en' : 'vi';
          normalized[transcriptLang] = data.segments;
        }

        const availableLangs = Object.keys(normalized).filter(
          (k) => Array.isArray(normalized[k]) && normalized[k].length > 0
        );
        const sourceLang = String(data.source_language || '').toLowerCase();
        const defaultLang = availableLangs.includes(sourceLang)
          ? sourceLang
          : (availableLangs.includes('vi') ? 'vi' : (availableLangs[0] || data.language || 'vi'));

        setSegmentsByLanguage(normalized);
        setLanguage(defaultLang);
        setSegments(normalized[defaultLang] || data.segments || []);
        if (!data.segments && availableLangs.length === 0) {
          setSegments([]);
        }
      } catch (err) {
        console.error('Transcript fetch error:', err);
      } finally {
        setIsLoadingTranscript(false);
      }
    };

    fetchTranscript();
  }, [videoId]);

  useEffect(() => {
    if (!language) return;
    const next = segmentsByLanguage[language];
    if (Array.isArray(next)) {
      setSegments(next);
    }
  }, [language, segmentsByLanguage]);

  useEffect(() => {
    setVideoBroken(false);
    setSavedProgress(null);
    lastProgressSaveSecondRef.current = 0;
    hasRestoredProgressRef.current = false;
  }, [videoId]);

  useEffect(() => {
    const loadSavedProgress = async () => {
      try {
        const progress = await api.student.getProgress(videoId);
        setSavedProgress(progress);
      } catch (err) {
        console.error('Failed to load lesson progress', err);
      }
    };
    loadSavedProgress();
  }, [videoId]);

  useEffect(() => {
    const fetchModuleLessons = async () => {
      setIsLoadingModuleLessons(true);
      setLessonTitle('');
      try {
        const currentLesson = await api.courses.getLesson(videoId);
        setLessonTitle(currentLesson.title || '');
        const lessons = await api.courses.listLessons(currentLesson.module_id);
        const sortedByTitle = [...lessons].sort((a, b) => {
          const byOrder = (a.sort_order ?? 0) - (b.sort_order ?? 0);
          if (byOrder !== 0) return byOrder;
          return naturalTitleCompare(a.title, b.title);
        });
        const hydrated = await Promise.all(
          sortedByTitle.map(async (lesson) => {
            const durationFromDb = lesson.duration_minutes && lesson.duration_minutes > 0 ? formatDuration(lesson.duration_minutes * 60) : '--:--';
            const preview = await buildLessonPreview(lesson.id, durationFromDb);
            return {
              id: lesson.id,
              title: lesson.title,
              duration: preview.duration,
              thumb: preview.thumb,
            };
          })
        );
        setModuleLessons(hydrated);
      } catch (err) {
        console.error('Failed to fetch module lessons', err);
        setModuleLessons([]);
      } finally {
        setIsLoadingModuleLessons(false);
      }
    };
    fetchModuleLessons();
  }, [videoId, buildLessonPreview]);

  useEffect(() => {
    const fetchQuizzes = async () => {
      setIsLoadingQuizzes(true);
      setQuizSubmitResult(null);
      setQuizAnswers({});
      try {
        const data = await api.student.listLessonQuizzes(videoId);
        const raw = Array.isArray(data?.quizzes) ? data.quizzes : [];
        setQuizzes(raw as LessonQuizItem[]);
        setSelectedQuizIdx(0);
      } catch (err) {
        console.error('Failed to fetch lesson quizzes', err);
        setQuizzes([]);
      } finally {
        setIsLoadingQuizzes(false);
      }
    };
    fetchQuizzes();
  }, [videoId]);

  useEffect(() => {
    if (moduleLessons.length === 0) return;
    const unresolved = moduleLessons.filter(
      (item) => item.duration === '--:--'
    );
    if (unresolved.length === 0) return;

    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      const latest = await Promise.all(
        unresolved.map(async (item) => {
          const preview = await buildLessonPreview(item.id, item.duration);
          return { id: item.id, duration: preview.duration, thumb: preview.thumb };
        })
      );
      const map = new Map(latest.map((x) => [x.id, x]));
      setModuleLessons((prev) =>
        prev.map((item) => {
          const next = map.get(item.id);
          if (!next) return item;
          return {
            ...item,
            duration: next.duration || item.duration,
            thumb: next.thumb || item.thumb,
          };
        })
      );

      const stillUnresolved = latest.some(
        (item) => item.duration === '--:--'
      );
      if (!stillUnresolved || attempts >= 6) {
        window.clearInterval(timer);
      }
    }, 5000);

    return () => window.clearInterval(timer);
  }, [moduleLessons, buildLessonPreview]);

  // Robust duration detection
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const updateDuration = () => {
      if (vid.duration && vid.duration !== Infinity && vid.duration > 0) {
        setDuration(vid.duration);
        const resumeAt = savedProgress?.last_position_seconds || 0;
        if (!hasRestoredProgressRef.current && resumeAt > 5 && resumeAt < vid.duration - 5) {
          vid.currentTime = resumeAt;
          setCurrentTime(resumeAt);
          hasRestoredProgressRef.current = true;
        }
      }
    };

    vid.addEventListener('loadedmetadata', updateDuration);
    vid.addEventListener('durationchange', updateDuration);

    // Poll every 500ms for 5 seconds as fallback
    let attempts = 0;
    const poll = setInterval(() => {
      if (vid.duration && vid.duration !== Infinity && vid.duration > 0) {
        setDuration(vid.duration);
        clearInterval(poll);
      }
      attempts++;
      if (attempts > 10) clearInterval(poll);
    }, 500);

    return () => {
      vid.removeEventListener('loadedmetadata', updateDuration);
      vid.removeEventListener('durationchange', updateDuration);
      clearInterval(poll);
    };
  }, [savedProgress?.last_position_seconds, videoSrc]);

  useEffect(() => {
    const closeMenu = () => setShowSpeedMenu(false);
    if (showSpeedMenu) {
      window.addEventListener('click', closeMenu);
    }
    return () => window.removeEventListener('click', closeMenu);
  }, [showSpeedMenu]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReducedMotion(mediaQuery.matches);
    updateMotion();
    mediaQuery.addEventListener('change', updateMotion);
    return () => mediaQuery.removeEventListener('change', updateMotion);
  }, []);

  // Video Control Handlers
  const playVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video || videoBroken) return;

    void video.play().catch(() => {
      setIsPlaying(false);
      if (video.error) setVideoBroken(true);
    });
  }, [videoBroken]);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      playVideo();
    }
  }, [isPlaying, playVideo]);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    const newMuted = !isMuted;
    videoRef.current.muted = newMuted;
    setIsMuted(newMuted);
  }, [isMuted]);

  const handleVolumeChange = (val: number) => {
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      const muted = val === 0;
      videoRef.current.muted = muted;
      setIsMuted(muted);
    }
  };

  const handleSeek = (val: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;
    const container = videoRef.current.closest('.video-container-premium');
    if (!container) return;

    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      container.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    }
  };

  const handlePlaybackSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
    setShowSpeedMenu(false);
  };

  const skip = (seconds: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  const switchCaptionLanguage = useCallback(() => {
    const available = ['vi', 'en'].filter(
      (lang) => Array.isArray(segmentsByLanguage[lang]) && segmentsByLanguage[lang].length > 0
    );
    if (available.length <= 1) return;
    const currentIndex = available.indexOf(language);
    const nextLanguage = available[(currentIndex + 1) % available.length];
    setLanguage(nextLanguage);
  }, [language, segmentsByLanguage]);

  const focusActiveTranscript = useCallback(() => {
    setRightPanelTab('transcript');
    const activeIndex = segments.findIndex((s) => currentTime >= s.start && currentTime <= s.end);
    if (activeIndex >= 0) {
      requestAnimationFrame(() => {
        transcriptItemRefs.current[activeIndex]?.focus();
      });
    }
  }, [currentTime, segments]);

  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 2500);
    }
  }, [isPlaying]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || target instanceof HTMLButtonElement
        || target instanceof HTMLAnchorElement
        || (target instanceof HTMLElement && target.isContentEditable)
      ) return;
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowRight') {
        skip(e.shiftKey ? 10 : 5);
      } else if (e.code === 'ArrowLeft') {
        skip(e.shiftKey ? -10 : -5);
      } else if (e.key.toLowerCase() === 'c') {
        setShowCaptions((value) => !value);
      } else if (e.key.toLowerCase() === 'l') {
        switchCaptionLanguage();
      } else if (e.key.toLowerCase() === 't') {
        focusActiveTranscript();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusActiveTranscript, switchCaptionLanguage, togglePlay]);

  const fetchAllMetadata = useCallback(async () => {
    setIsLoadingMetadata(true);
    setMetadataError('');
    try {
      const [highlightsRes, flashcardsRes] = await Promise.allSettled([
        api.videos.getHighlights(videoId),
        api.videos.getFlashcards(videoId),
      ]);

      const v = <T,>(r: PromiseSettledResult<T>) => r.status === 'fulfilled' ? r.value : null;

      setHighlights(v(highlightsRes)?.highlights || []);
      setFlashcards(v(flashcardsRes)?.flashcards || []);
    } catch (err) {
      console.error('Metadata fetch error:', err);
      setMetadataError(t('Tài nguyên học tập chưa sẵn sàng. Vui lòng tải lại sau khi xử lý hoàn tất.', 'Learning resources are not ready yet. Reload after processing completes.'));
    } finally {
      setIsLoadingMetadata(false);
    }
  }, [t, videoId]);

  useEffect(() => {
    if (!isLoadingTranscript && segments.length > 0) {
      fetchAllMetadata();
    }
  }, [fetchAllMetadata, isLoadingTranscript, segments]);

  // Auto-scroll transcript when video plays
  useEffect(() => {
    if (rightPanelTab === 'transcript' && segments.length > 0) {
      const activeIndex = segments.findIndex(
        (s) => currentTime >= s.start && currentTime <= s.end
      );

      if (activeIndex >= 0 && activeIndex !== lastScrolledIndexRef.current) {
        lastScrolledIndexRef.current = activeIndex;
        const container = transcriptPanelRef.current;
        const target = transcriptItemRefs.current[activeIndex];

        if (container && target) {
          const targetOffset = target.offsetTop;
          const containerHeight = container.offsetHeight;
          const targetHeight = target.offsetHeight;

          container.scrollTo({
            top: targetOffset - containerHeight / 2 + targetHeight / 2,
            behavior: 'smooth'
          });
        }
      }
    }
  }, [currentTime, segments, rightPanelTab]);

  useEffect(() => {
    setCurrentFlashcardIndex(0);
    setIsFlashcardFlipped(false);
  }, [videoId, flashcards.length]);

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      const second = Math.floor(time);
      if (second - lastProgressSaveSecondRef.current >= 10) {
        lastProgressSaveSecondRef.current = second;
        saveProgress(time);
      }
    }
  };

  const saveProgress = async (time: number, status = "in_progress") => {
    if (!duration) return;
    const percent = Math.round((time / duration) * 100);
    try {
      const progress = await api.student.updateProgress(videoId, percent, status, {
        watchedSeconds: time,
        lastPositionSeconds: time,
        durationSeconds: duration,
      });
      setSavedProgress(progress);
    } catch (err) {
      console.error("Failed to save progress", err);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    saveProgress(duration, "completed");
    if (hasNext) {
      handleNextVideo();
    }
  };



  const seekTo = (timeStr: string) => {
    const [m, s] = timeStr.split(':').map(Number);
    const totalSeconds = m * 60 + s;
    if (videoRef.current) {
      videoRef.current.currentTime = totalSeconds;
      playVideo();
    }
  };

  const handleGetSummary = async () => {
    if (summaryPoints.length > 0) return;
    setIsLoadingSummary(true);
    try {
      const data = await api.videos.getSummary(videoId);
      setSummaryPoints(data.summary || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const activeQuiz = quizzes[selectedQuizIdx] || null;

  const handleSelectQuizAnswer = (questionId: string, optionId: string) => {
    setQuizAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz || isSubmittingQuiz) return;
    if (quizSubmitResult?.status === 'passed') return;
    if ((activeQuiz.questions || []).length === 0) return;

    setIsSubmittingQuiz(true);
    try {
      const result = await api.student.submitQuiz(activeQuiz.id, quizAnswers);
      setQuizSubmitResult({
        score: Number(result?.score || 0),
        status: String(result?.status || 'unknown'),
        correct: Number(result?.correct || 0),
        total: Number(result?.total || 0),
      });
    } catch (err) {
      console.error('Failed to submit quiz', err);
    } finally {
      setIsSubmittingQuiz(false);
    }
  };

  const activeSegment = useMemo(
    () => segments.find((s) => currentTime >= s.start && currentTime <= s.end),
    [segments, currentTime]
  );

  const currentLessonTitle = useMemo(
    () => lessonTitle || moduleLessons.find((lesson) => lesson.id === videoId)?.title || t('Bài giảng đang học', 'Current lecture'),
    [lessonTitle, moduleLessons, t, videoId]
  );





  const renderPanelState = (message: string) => (
    <div className="rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-8 text-center text-sm font-semibold leading-relaxed text-[var(--lb-muted)]">
      {message}
    </div>
  );

  return (
    <div className="min-h-screen overflow-hidden bg-[var(--lb-canvas)]">
      <div className="mx-auto max-w-[1440px] space-y-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">

        {/* Header - Inclusive Title */}
        <div className="flex flex-col justify-between gap-5 border-b border-[var(--lb-border)] pb-6 md:flex-row md:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-accent)]">{t('Bài giảng đang học', 'Current lecture')}</p>
            <h1 className="mt-2 text-3xl leading-tight text-[var(--lb-ink)] md:text-4xl">
              {currentLessonTitle}
            </h1>
            <p className="mt-2 text-sm text-[var(--lb-muted)]">{t('Phát video, theo dõi transcript và khôi phục phần nội dung vừa bỏ lỡ.', 'Play the video, follow the transcript, and recover the content you missed.')}</p>
          </div>
          <span className="w-fit rounded-full border border-[var(--lb-border)] bg-[var(--lb-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--lb-muted)]">{language.toUpperCase()} · {formatTime(currentTime)} / {formatTime(duration)}</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
          {/* Left Column: Player & Smart Content (Wider) */}
          <div className="space-y-5 lg:col-span-8">

            <div
              className={cn(
                "video-container-premium group relative aspect-video cursor-pointer overflow-hidden rounded-[14px] border border-[var(--lb-border-strong)] bg-black",
                reducedMotion && "motion-reduce"
              )}
              onMouseMove={handleUserActivity}
              onMouseEnter={() => setShowControls(true)}
              onMouseLeave={() => isPlaying && setShowControls(false)}
              onClick={togglePlay}
              role="region"
              aria-label={t('Trình phát video bài học', 'Lesson video player')}
            >
              <video
                key={videoId}
                ref={videoRef}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={(e) => {
                  const nextDuration = e.currentTarget.duration;
                  setDuration(nextDuration);
                  const resumeAt = savedProgress?.last_position_seconds || 0;
                  if (!hasRestoredProgressRef.current && resumeAt > 5 && resumeAt < nextDuration - 5) {
                    e.currentTarget.currentTime = resumeAt;
                    setCurrentTime(resumeAt);
                    hasRestoredProgressRef.current = true;
                  }
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => {
                  setIsPlaying(false);
                  saveProgress(currentTime);
                }}
                onEnded={handleVideoEnded}
                className={cn('h-full w-full object-cover transition-opacity duration-150', videoBroken && 'hidden', isPlaying ? 'opacity-100' : 'opacity-80')}
                src={videoSrc}
                preload="metadata"
                playsInline
                aria-label={t('Video bài học', 'Lesson video')}
                onCanPlay={() => setVideoBroken(false)}
                onError={() => {
                  setIsPlaying(false);
                  setVideoBroken(true);
                }}
              />

              {/* Big Center Play Button (only when paused or hovering) */}
              <div className={cn(
                "pointer-events-none absolute inset-0 z-20 flex items-center justify-center transition-opacity duration-150",
                (!isPlaying || showControls) ? "opacity-100" : "opacity-0"
              )}>
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/40 bg-black/65">
                  {isPlaying ? <Pause size={28} className="fill-white text-white" /> : <Play size={28} className="ml-1 fill-white text-white" />}
                </div>
              </div>

              {/* Custom Controls Bar */}
              <div className={cn(
                "absolute bottom-0 left-0 right-0 z-40 bg-black/80 p-3 transition-all duration-150 sm:p-4",
                showControls ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0 pointer-events-none"
              )}>
                {/* Progress Bar */}
                <div className="relative group/progress mb-4">
                  <input
                    type="range"
                    aria-label="Tua video"
                    min="0"
                    max={duration || 0}
                    step="0.1"
                    value={currentTime}
                    onChange={(e) => handleSeek(parseFloat(e.target.value))}
                    className="absolute inset-0 w-full h-1.5 opacity-0 cursor-pointer z-10"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                    <div
                      className="relative h-full bg-[var(--lb-accent)]"
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    >
                      <div className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 transition-opacity group-hover/progress:opacity-100" />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-1 sm:gap-2">
                    <button
                      onClick={handlePrevVideo}
                      disabled={!hasPrev}
                      className="hidden h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30 sm:flex"
                      aria-label={t('Bài trước', 'Previous lesson')}
                    >
                      <SkipBack size={20} fill="currentColor" />
                    </button>

                    <button onClick={togglePlay} className="flex h-11 w-11 items-center justify-center rounded-md text-white hover:bg-white/10" aria-label={isPlaying ? t('Tạm dừng video', 'Pause video') : t('Phát video', 'Play video')}>
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>

                    <button
                      onClick={handleNextVideo}
                      disabled={!hasNext}
                      className="hidden h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-30 sm:flex"
                      aria-label={t('Bài tiếp theo', 'Next lesson')}
                    >
                      <SkipForward size={20} fill="currentColor" />
                    </button>

                    <div className="flex items-center gap-1">
                      <button onClick={toggleMute} className="flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white" aria-label={isMuted ? t('Bật âm thanh', 'Unmute') : t('Tắt âm thanh', 'Mute')}>
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        aria-label={t('Âm lượng', 'Volume')}
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="hidden h-1 w-16 cursor-pointer appearance-none rounded-full bg-white/20 accent-[var(--lb-accent)] sm:block"
                      />
                    </div>

                    <div className="hidden text-xs font-bold text-white/75 sm:block">
                      {formatTime(currentTime)} <span className="mx-1 opacity-30">/</span> {formatTime(duration)}
                    </div>
                  </div>

                  <div className="relative flex items-center gap-1">
                    {/* Settings Group: Captions, Lang, Speed, Fullscreen */}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCaptions(!showCaptions);
                      }}
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-md transition-colors",
                        showCaptions ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
                      )}
                      aria-label={showCaptions ? t('Tắt phụ đề', 'Turn captions off') : t('Bật phụ đề', 'Turn captions on')}
                    >
                      <Captions size={20} />
                    </button>

                    <div className="flex items-center gap-1 rounded-md border border-white/20 bg-black/35 p-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCaptionBackground(!captionBackground);
                        }}
                        className={cn(
                          "hidden min-h-9 rounded-md px-2 text-[10px] font-bold uppercase transition-colors sm:block",
                          captionBackground ? "bg-white/20 text-white shadow-sm" : "text-white/40 hover:text-white/70"
                        )}
                        title={t('Nền phụ đề', 'Caption background')}
                      >
                        BG
                      </button>
                      <div className="hidden h-3 w-px bg-white/10 sm:block" />
                      {['vi', 'en'].map((l) => {
                        const isEnabled = Array.isArray(segmentsByLanguage[l]) && segmentsByLanguage[l].length > 0;
                        return (
                          <button
                            key={l}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isEnabled) setLanguage(l);
                            }}
                            disabled={!isEnabled}
                            className={cn(
                              "min-h-9 rounded-md px-2 text-[10px] font-bold uppercase transition-colors",
                              language === l ? "bg-white text-black" : "text-white/60 hover:bg-white/10 hover:text-white",
                              !isEnabled && "opacity-20 cursor-not-allowed"
                            )}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>

                    <div className="relative">
                      {showSpeedMenu && (
                        <div className="absolute bottom-full right-0 z-[60] mb-3 flex min-w-[112px] flex-col gap-1 overflow-hidden rounded-[10px] border border-white/20 bg-black/95 p-2">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                            <button
                              key={speed}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlaybackSpeedChange(speed);
                              }}
                              className={cn(
                                "min-h-10 rounded-md px-3 py-2 text-left text-xs font-bold transition-colors",
                                playbackSpeed === speed
                                  ? "bg-white text-black"
                                  : "text-white/60 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              {speed === 1 ? t('Chuẩn', 'Normal') : `${speed}x`}
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSpeedMenu(!showSpeedMenu);
                        }}
                        className="flex h-11 min-w-11 items-center justify-center rounded-md border border-white/20 bg-black/35 px-2 text-xs font-bold text-white/90 transition-colors hover:bg-white/10"
                        aria-label={t('Chọn tốc độ phát', 'Choose playback speed')}
                      >
                        {playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`}
                      </button>
                    </div>

                    <button onClick={toggleFullscreen} className="flex h-11 w-11 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white" aria-label={t('Mở toàn màn hình', 'Enter fullscreen')}>
                      <Maximize size={20} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Subtitle Overlay - moved up slightly to avoid overlapping controls */}
              {showCaptions && activeSegment && (
                <div
                  key={`${activeSegment.start}-${activeSegment.end}`}
                  className={cn(
                    "pointer-events-none absolute left-1/2 z-30 w-[92%] -translate-x-1/2 transition-all duration-150 md:w-[86%]",
                    showControls ? captionPositionWithControlsClass[captionPosition] : captionPositionClass[captionPosition]
                  )}
                >
                  <div className="px-1 md:px-2 py-1">
                    <div className="flex items-center gap-2 justify-center">
                      <p
                        aria-live="polite"
                        className={cn(
                          "text-center font-extrabold tracking-tight text-white",
                          captionBackground && "rounded-md bg-black/75 px-4 py-2"
                        )}
                        style={{ fontSize: captionSize, lineHeight: captionLineHeight }}
                      >
                        {activeSegment.text.split(' ').map((word, idx, arr) => {
                          const duration = activeSegment.end - activeSegment.start;
                          const wordStartTime = activeSegment.start + (idx / arr.length) * duration;
                          const isWordActive = currentTime >= wordStartTime;
                          return (
                            <span
                              key={idx}
                              className={cn(
                                "transition-colors duration-150",
                                isWordActive ? "text-white" : "text-white/45"
                              )}
                            >
                              {word}{' '}
                            </span>
                          );
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Fallback if cả proxy và demo đều lỗi */}
              <div
                id="video-fallback"
                className={cn(
                  'absolute inset-0 flex flex-col items-center justify-center text-white/50 z-10',
                  !videoBroken && 'hidden'
                )}
              >
                <Film size={64} className="mb-6 opacity-30" />
                <p className="font-extrabold tracking-[0.2em] uppercase text-sm">{t('Không thể phát video', 'Unable to play video')}</p>
                <p className="text-[11px] mt-3 max-w-xs text-center opacity-60 font-bold">{t('Không tải được nguồn video đã xác thực. Hãy đăng nhập lại hoặc kiểm tra tệp video.', 'The authenticated video source could not be loaded. Sign in again or check the video file.')}</p>
              </div>

              {/* Visual Sound Pulse REMOVED per user request */}
            </div>
          </div>

          {/* Right Column: Dynamic Panel (Transcript or Lessons) */}
          <div className="relative lg:col-span-4">
            <div className="flex h-[32rem] flex-col overflow-hidden rounded-[14px] border border-[var(--lb-border)] bg-[var(--lb-surface)] lg:sticky lg:top-20 lg:h-[calc(100vh-96px)]">

              {/* Panel Tabs */}
              <div className="flex border-b border-[var(--lb-border)]" role="tablist" aria-label={t('Bảng nội dung bên phải', 'Right content panel')}>
                <button
                  onClick={() => setRightPanelTab('transcript')}
                  role="tab"
                  aria-selected={rightPanelTab === 'transcript'}
                  className={cn(
                    "flex min-h-14 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-sm font-bold transition-colors",
                    rightPanelTab === 'transcript' ? "border-[var(--lb-accent)] bg-[var(--lb-elevated)] text-[var(--lb-ink)]" : "border-transparent text-[var(--lb-muted)] hover:bg-[var(--lb-elevated)]"
                  )}
                >
                  <FileText size={18} className={rightPanelTab === 'transcript' ? 'text-[var(--lb-accent)]' : ''} />
                  <span>{t('Bản chép lời', 'Transcript')}</span>
                </button>
                <button
                  onClick={() => setRightPanelTab('lessons')}
                  role="tab"
                  aria-selected={rightPanelTab === 'lessons'}
                  className={cn(
                    "flex min-h-14 flex-1 items-center justify-center gap-2 border-b-2 px-3 text-sm font-bold transition-colors",
                    rightPanelTab === 'lessons' ? "border-[var(--lb-accent)] bg-[var(--lb-elevated)] text-[var(--lb-ink)]" : "border-transparent text-[var(--lb-muted)] hover:bg-[var(--lb-elevated)]"
                  )}
                >
                  <List size={18} className={rightPanelTab === 'lessons' ? 'text-[var(--lb-accent)]' : ''} />
                  <span>{t('Bài học', 'Lessons')}</span>
                </button>
              </div>


              <div ref={transcriptPanelRef} className="custom-scrollbar flex-1 space-y-2 overflow-y-auto p-3 sm:p-4">
                {rightPanelTab === 'transcript' ? (
                  <>
                    {isLoadingTranscript && renderPanelState(t('Đang tải phụ đề...', 'Loading captions...'))}
                    {!isLoadingTranscript && segments.length === 0 && renderPanelState(t('Chưa có phụ đề.', 'No captions available.'))}
                    {segments.map((s, i) => {
                      const isActive = currentTime >= s.start && currentTime <= s.end;
                      return (
                        <button
                          type="button"
                          ref={(node) => {
                            transcriptItemRefs.current[i] = node;
                          }}
                          key={i}
                          onClick={() => seekTo(formatTime(s.start))}
                          aria-current={isActive ? 'true' : undefined}
                          className={cn(
                            "group relative block min-h-16 w-full rounded-md border p-4 text-left transition-colors",
                            isActive ? "border-[var(--lb-accent)] bg-[var(--lb-accent-soft)] text-[var(--lb-ink)]" : "border-transparent text-[var(--lb-muted)] hover:border-[var(--lb-border)] hover:bg-[var(--lb-elevated)]"
                          )}
                        >
                          <span className={cn(
                            "mb-2 block font-mono text-xs font-bold",
                            isActive ? "text-[var(--lb-accent)]" : "text-[var(--lb-subtle)]"
                          )}>
                            {formatTime(s.start)}
                          </span>
                          <p className={cn(
                            "text-sm leading-6",
                            isActive ? "font-semibold text-[var(--lb-ink)]" : "font-medium"
                          )}>
                            {s.text}
                          </p>
                          {isActive && <span className="absolute right-3 top-3 rounded-full bg-[var(--lb-accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--lb-on-accent)]">{t('Đang phát', 'Playing')}</span>}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="space-y-2">
                    {isLoadingModuleLessons && renderPanelState(t('Đang tải danh sách bài học...', 'Loading lesson list...'))}
                    {!isLoadingModuleLessons && moduleLessons.length === 0 && renderPanelState(t('Chưa có video trong chương này.', 'No videos in this module.'))}
                    {!isLoadingModuleLessons && moduleLessons.map((lesson, idx) => (
                      <button
                        type="button"
                        key={lesson.id}
                        onClick={() => {
                          router.push(`/student/videos/${lesson.id}`);
                        }}
                        className={cn(
                          "flex min-h-20 w-full items-center gap-3 rounded-md border p-3 text-left transition-colors",
                          videoId === lesson.id && "cursor-default",
                          videoId === lesson.id ? "border-[var(--lb-accent)] bg-[var(--lb-accent-soft)]" : "border-transparent hover:border-[var(--lb-border)] hover:bg-[var(--lb-elevated)]"
                        )}
                      >
                        <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-md">
                          <Image src={lesson.thumb} alt={lesson.title} fill className="object-cover" unoptimized={true} />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play size={16} className="text-white" fill="currentColor" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h4 className={cn("text-xs font-semibold leading-tight", videoId === lesson.id ? "text-[var(--lb-ink)]" : "text-[var(--lb-muted)]")}>
                            {idx + 1}. {lesson.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] text-[var(--lb-subtle)]">
                            <Clock size={10} />
                            {lesson.duration}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--lb-border)] bg-[var(--lb-elevated)] p-3 text-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--lb-border)] px-3 py-1.5 text-xs font-semibold text-[var(--lb-muted)]">
                  <Captions size={14} aria-hidden="true" /> {t('Đồng bộ', 'Synced')} · {language.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

        </div>

        <section aria-label={t('Khôi phục và hỏi theo ngữ cảnh', 'Context recovery and grounded questions')}>
          <LectureGroundingPanel
            videoId={videoId}
            currentTime={currentTime}
            outputLanguage={locale}
            onSeek={handleSeek}
          />
        </section>

        <section className="rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] p-5 sm:p-6" aria-label={t('Cấu trúc bài giảng', 'Lecture structure')}>
          <SemanticTimeline videoId={videoId} currentTime={currentTime} onSeek={handleSeek} />
        </section>

            {/* Smart Content Section - Expanded Layout */}
            <div className="space-y-5 border-t border-[var(--lb-border)] pt-8">

              {/* Visual Tabs Section */}
              <div className="rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] p-5 sm:p-6">
                <div className="mb-6">
                  <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-muted)]">{t('Công cụ học tập', 'Study tools')}</p>
                  <h2 className="mt-1 text-xl">{t('Ôn tập sau khi đã khôi phục mạch bài', 'Review after recovering the learning thread')}</h2>
                </div>
                <div className="mb-6 flex flex-wrap gap-2 border-b border-[var(--lb-border)] pb-4" role="tablist" aria-label={t('Công cụ học tập', 'Study tools')}>
                  {[
                    { id: 'summary', label: t('Tóm tắt', 'Summary'), icon: FileText },
                    { id: 'highlights', label: t('Điểm nhấn', 'Highlights'), icon: Zap },
                    { id: 'quiz', label: 'Quiz', icon: ClipboardCheck },
                    { id: 'flashcards', label: t('Thẻ ghi nhớ', 'Flashcards'), icon: BookOpen },
                  ].map((tab) => (
                    <button
                      type="button"
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      role="tab"
                      aria-selected={activeTab === tab.id}
                      className={cn(
                        "flex min-h-11 shrink-0 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition-colors",
                        activeTab === tab.id ? "border-[var(--lb-accent)] bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" : "border-[var(--lb-border)] bg-[var(--lb-elevated)] text-[var(--lb-muted)] hover:text-[var(--lb-ink)]"
                      )}
                    >
                      <tab.icon size={18} />
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="min-h-[350px]">
                  {activeTab === 'summary' && (
                    <div>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-lg">{t('Tóm tắt bài học', 'Lesson summary')}</h3>
                          <p className="mt-1 text-sm text-[var(--lb-muted)]">{t('Tạo bản tóm tắt ngắn sau khi đã xem nguồn và timeline.', 'Create a concise summary after reviewing the sources and timeline.')}</p>
                        </div>
                        <button type="button" onClick={handleGetSummary} disabled={isLoadingSummary || summaryPoints.length > 0} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-[var(--lb-accent)] px-4 text-sm font-bold text-[var(--lb-on-accent)] hover:bg-[var(--lb-accent-hover)] disabled:opacity-55">
                          {isLoadingSummary ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <FileText size={17} />}
                          {isLoadingSummary ? t('Đang tạo tóm tắt…', 'Creating summary…') : summaryPoints.length > 0 ? t('Đã tạo tóm tắt', 'Summary created') : t('Tạo tóm tắt bài học', 'Create lesson summary')}
                        </button>
                      </div>
                      {summaryPoints.length > 0 && (
                        <ul className="mt-5 divide-y divide-[var(--lb-border)] border-y border-[var(--lb-border)]">
                          {summaryPoints.map((point, index) => <li key={index} className="flex gap-3 py-4 text-sm leading-6 text-[var(--lb-ink)]"><CheckCircle size={18} className="mt-0.5 shrink-0 text-[var(--lb-success)]" />{localizeLectureContent(point, locale)}</li>)}
                        </ul>
                      )}
                    </div>
                  )}

                  {activeTab === 'highlights' && (
                    isLoadingMetadata ? renderPanelState(t('Đang tải điểm nhấn...', 'Loading highlights...')) : metadataError ? renderPanelState(metadataError) : highlights.length === 0 ? renderPanelState(t('Chưa có dữ liệu điểm nhấn.', 'No highlight data yet.')) : (
                      <div className="divide-y divide-[var(--lb-border)] border-y border-[var(--lb-border)]">
                        {highlights.map((item, i) => (
                          <div key={i} className="grid gap-4 py-5 sm:grid-cols-[7rem_1fr]">
                            <div>
                              <span className="text-xs font-bold text-[var(--lb-muted)]">{t('Trọng tâm', 'Key point')}</span>
                              <span className="mt-1 block font-mono text-lg font-bold text-[var(--lb-accent)]">{item.time}</span>
                            </div>
                            <div>
                              <h4 className="text-lg leading-tight">{localizeLectureContent(item.reason, locale)}</h4>
                              <p className="mt-2 text-sm leading-6 text-[var(--lb-muted)]">&ldquo;{localizeLectureContent(item.context, locale)}&rdquo;</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {activeTab === 'quiz' && (
                    <div className="space-y-6">
                      {isLoadingQuizzes && renderPanelState(t('Đang tải quiz...', 'Loading quiz...'))}
                      {!isLoadingQuizzes && quizzes.length === 0 && renderPanelState(t('Bài học này chưa có quiz.', 'This lesson has no quiz yet.'))}
                      {!isLoadingQuizzes && quizzes.length > 0 && (
                        <div className="space-y-6">
                          <div className="flex flex-wrap gap-2">
                            {quizzes.map((quiz, idx) => (
                              <button
                                key={quiz.id}
                                onClick={() => {
                                  setSelectedQuizIdx(idx);
                                  setQuizAnswers({});
                                  setQuizSubmitResult(null);
                                }}
                                className={cn(
                                  "min-h-11 rounded-md border px-4 text-xs font-bold transition-colors",
                                  selectedQuizIdx === idx ? "border-[var(--lb-accent)] bg-[var(--lb-accent-soft)] text-[var(--lb-accent)]" : "border-[var(--lb-border)] bg-[var(--lb-elevated)] text-[var(--lb-muted)] hover:text-[var(--lb-ink)]"
                                )}
                              >
                                Quiz {idx + 1}
                              </button>
                            ))}
                          </div>

                          {activeQuiz && (
                            <div className="space-y-5">
                              <div className="rounded-md border border-[var(--lb-border)] bg-[var(--lb-elevated)] p-5">
                                <p className="text-sm font-bold text-[var(--lb-ink)]">{localizeLectureContent(activeQuiz.title, locale)}</p>
                                <p className="mt-1 text-xs text-[var(--lb-muted)]">{t('Điểm đạt', 'Passing score')}: {activeQuiz.passing_score}%</p>
                              </div>

                              {(activeQuiz.questions ?? []).map((question, qIdx) => (
                                <div key={question.id} className="rounded-[10px] border border-[var(--lb-border)] bg-[var(--lb-surface)] p-5">
                                  <p className="mb-4 text-sm font-bold text-[var(--lb-ink)]">{qIdx + 1}. {localizeLectureContent(question.question_text, locale)}</p>
                                  <div className="space-y-2">
                                    {(question.options ?? []).map((opt) => (
                                      <label key={opt.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-[var(--lb-border)] p-3 hover:bg-[var(--lb-elevated)]">
                                        <input
                                          type="radio"
                                          name={`quiz-${question.id}`}
                                          checked={quizAnswers[question.id] === opt.id}
                                          onChange={() => handleSelectQuizAnswer(question.id, opt.id)}
                                          disabled={!!quizSubmitResult}
                                        />
                                        <span className="text-sm font-medium text-[var(--lb-ink)]">{localizeLectureContent(opt.option_text, locale)}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              ))}

                              <div className="flex flex-col gap-4">
                                {!quizSubmitResult ? (
                                  <button
                                    onClick={handleSubmitQuiz}
                                    disabled={isSubmittingQuiz}
                                    className="min-h-11 w-full rounded-md bg-[var(--lb-accent)] px-6 text-sm font-bold text-[var(--lb-on-accent)] transition-colors hover:bg-[var(--lb-accent-hover)] disabled:opacity-50 md:w-auto"
                                  >
                                    {isSubmittingQuiz ? (
                                      <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        {t('ĐANG NỘP BÀI...', 'SUBMITTING...')}
                                      </div>
                                    ) : t('NỘP BÀI', 'SUBMIT')}
                                  </button>
                                ) : quizSubmitResult.status === 'passed' ? (
                                  <div className="flex flex-col items-center gap-5 rounded-[10px] border border-[var(--lb-success)] bg-[var(--lb-success-soft)] p-6 md:flex-row">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[var(--lb-success)] text-white">
                                      <CheckCircle size={32} />
                                    </div>
                                    <div className="text-center md:text-left flex-1">
                                      <h4 className="text-xl text-[var(--lb-ink)]">{t('Hoàn thành', 'Completed')}</h4>
                                      <p className="mt-1 text-sm font-semibold text-[var(--lb-success)]">
                                        {t('Bạn đã vượt qua bài kiểm tra với', 'You passed the quiz with')} {quizSubmitResult.score}%
                                      </p>
                                      <p className="mt-2 text-xs text-[var(--lb-muted)]">
                                        {t('Đúng', 'Correct')}: {quizSubmitResult.correct}/{quizSubmitResult.total} {t('câu hỏi.', 'questions.')}
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-5 rounded-[10px] border border-[var(--lb-danger)] bg-[var(--lb-danger-soft)] p-6">
                                    <div className="flex items-center gap-6">
                                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-[var(--lb-danger)] text-white">
                                        <Zap size={32} fill="currentColor" />
                                      </div>
                                      <div>
                                        <h4 className="text-xl text-[var(--lb-ink)]">{t('Kết quả chưa đạt', 'Not passed yet')}</h4>
                                        <p className="mt-1 text-sm font-semibold text-[var(--lb-danger)]">
                                          {t('Điểm của bạn', 'Your score')}: {quizSubmitResult.score}% ({t('Cần', 'Required')} {activeQuiz?.passing_score}%)
                                        </p>
                                      </div>
                                    </div>
                                    <div className="h-px w-full bg-[var(--lb-border)]" />
                                    <p className="text-sm leading-relaxed text-[var(--lb-muted)]">
                                      {t('Đừng bỏ cuộc! Hãy xem lại nội dung bài giảng và thử sức lại một lần nữa để củng cố kiến thức nhé.', 'Keep going. Review the lecture and try again to reinforce what you learned.')}
                                    </p>
                                    <button
                                      onClick={() => {
                                        setQuizSubmitResult(null);
                                        setQuizAnswers({});
                                      }}
                                      className="min-h-11 w-full rounded-md border border-[var(--lb-danger)] bg-[var(--lb-elevated)] px-4 text-sm font-bold text-[var(--lb-danger)] hover:bg-[var(--lb-danger-soft)]"
                                    >
                                      {t('Làm lại', 'Try again')}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'flashcards' && (
                    <div className="space-y-5">
                      {isLoadingMetadata && renderPanelState(t('Đang tải thẻ ghi nhớ...', 'Loading flashcards...'))}
                      {!isLoadingMetadata && metadataError && renderPanelState(metadataError)}
                      {!isLoadingMetadata && !metadataError && flashcards.length === 0 && renderPanelState(t('Chưa có thẻ ghi nhớ.', 'No flashcards yet.'))}
                      {!isLoadingMetadata && !metadataError && flashcards.length > 0 && (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <button type="button" aria-label={t('Thẻ trước', 'Previous card')} onClick={() => { setIsFlashcardFlipped(false); setCurrentFlashcardIndex((current) => (current - 1 + flashcards.length) % flashcards.length); }} className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--lb-border)] text-[var(--lb-muted)] hover:bg-[var(--lb-accent-soft)]"><ChevronLeft size={19} /></button>
                            <p className="text-sm font-semibold text-[var(--lb-muted)]">{t('Thẻ', 'Card')} {currentFlashcardIndex + 1} / {flashcards.length}</p>
                            <button type="button" aria-label={t('Thẻ tiếp theo', 'Next card')} onClick={() => { setIsFlashcardFlipped(false); setCurrentFlashcardIndex((current) => (current + 1) % flashcards.length); }} className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--lb-border)] text-[var(--lb-muted)] hover:bg-[var(--lb-accent-soft)]"><ChevronRight size={19} /></button>
                          </div>
                          <button type="button" onClick={() => setIsFlashcardFlipped((current) => !current)} className="mx-auto flex min-h-[320px] w-full max-w-xl flex-col items-center justify-center rounded-[10px] border border-[var(--lb-border-strong)] bg-[var(--lb-elevated)] p-8 text-center hover:border-[var(--lb-accent)]" aria-label={isFlashcardFlipped ? t('Hiện mặt câu hỏi', 'Show question side') : t('Hiện mặt đáp án', 'Show answer side')}>
                            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--lb-accent)]">{isFlashcardFlipped ? t('Đáp án', 'Answer') : t('Câu hỏi', 'Question')}</span>
                            <span className="mt-5 text-xl font-semibold leading-8 text-[var(--lb-ink)]">{localizeLectureContent(isFlashcardFlipped ? flashcards[currentFlashcardIndex].back : flashcards[currentFlashcardIndex].front, locale)}</span>
                            {!isFlashcardFlipped && flashcards[currentFlashcardIndex].hint && <span className="mt-8 text-sm text-[var(--lb-muted)]">{t('Gợi ý', 'Hint')}: {localizeLectureContent(flashcards[currentFlashcardIndex].hint, locale)}</span>}
                            <span className="mt-8 text-xs font-semibold text-[var(--lb-muted)]">{t('Nhấn để lật thẻ', 'Press to flip the card')}</span>
                          </button>

                        </>
                      )}
                    </div>
                  )}
                </div>
                </div>
              </div>

      </div>

    </div>
  );
}
