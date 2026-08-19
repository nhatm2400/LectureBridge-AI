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
  Sparkles,
  Clock,
  Zap,
  ClipboardCheck,
  BookOpen,
  List,
  Film,
  CheckCircle,
  Sparkle,
  Brain,
  Lightbulb,
  Rocket,
  SkipBack,
  SkipForward
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, type UserProgress } from '@/lib/api';
import { SemanticTimeline } from '@/components/lecture/SemanticTimeline';
import { LectureGroundingPanel } from '@/components/lecture/LectureGroundingPanel';

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
  const params = useParams();
  const router = useRouter();
  const videoId = params.id as string;
  const videoRef = useRef<HTMLVideoElement>(null);
  const transcriptPanelRef = useRef<HTMLDivElement>(null);
  const transcriptItemRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  const [activeTab, setActiveTab] = useState('transcript');
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
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const [videoBroken, setVideoBroken] = useState(false);
  const [savedProgress, setSavedProgress] = useState<UserProgress | null>(null);
  const [moduleLessons, setModuleLessons] = useState<ModuleLessonItem[]>([]);
  const [isLoadingModuleLessons, setIsLoadingModuleLessons] = useState(false);

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
      try {
        const currentLesson = await api.courses.getLesson(videoId);
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
  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  }, [isPlaying]);

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
      setMetadataError('Tài nguyên học tập chưa sẵn sàng. Vui lòng tải lại sau khi xử lý hoàn tất.');
    } finally {
      setIsLoadingMetadata(false);
    }
  }, [videoId]);

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
    setDragOffsetX(0);
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
      videoRef.current.play();
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





  const renderPanelState = (message: string) => (
    <div className="p-8 rounded-3xl bg-slate-50 text-slate-500 font-bold text-center leading-relaxed">
      {message}
    </div>
  );

  return (
    <div className="min-h-screen bg-transparent relative overflow-hidden">
      {/* Subtle Overlay to ensure readability */}
      <div className="absolute inset-0 bg-slate-900/40 pointer-events-none" />

      <div className="p-6 md:p-10 max-w-[1600px] mx-auto space-y-8 relative z-10">

        {/* Header - Inclusive Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-3xl md:text-5xl font-extrabold text-white tracking-tight">
              BÀI HỌC <span className="text-[#FF4F6E]">TRỰC QUAN</span> NÂNG CAO
            </h1>
          </div>
          {/* Sign Language toggle removed per user request */}
        </div>

        <div className="grid lg:grid-cols-12 gap-10">
          {/* Left Column: Player & Smart Content (Wider) */}
          <div className="lg:col-span-7 space-y-8">

            <div
              className={cn(
                "video-container-premium bg-black rounded-[40px] overflow-hidden shadow-2xl border-4 border-white relative aspect-video group cursor-pointer",
                reducedMotion && "motion-reduce"
              )}
              onMouseMove={handleUserActivity}
              onMouseEnter={() => setShowControls(true)}
              onMouseLeave={() => isPlaying && setShowControls(false)}
              onClick={togglePlay}
              role="region"
              aria-label="Trình phát video bài học"
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
                className={cn('w-full h-full object-cover transition-opacity duration-500', videoBroken && 'hidden', isPlaying ? 'opacity-100' : 'opacity-80')}
                src={videoSrc}
                preload="metadata"
                playsInline
                aria-label="Video bài học"
                onError={() => setVideoBroken(true)}
              />

              {/* Big Center Play Button (only when paused or hovering) */}
              <div className={cn(
                "absolute inset-0 flex items-center justify-center z-20 transition-all duration-300 pointer-events-none",
                (!isPlaying || showControls) ? "opacity-100 scale-100" : "opacity-0 scale-90"
              )}>
                <div className="w-20 h-20 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 shadow-2xl">
                  {isPlaying ? <Pause size={32} className="text-white fill-white" /> : <Play size={32} className="text-white fill-white ml-1" />}
                </div>
              </div>

              {/* Custom Controls Bar */}
              <div className={cn(
                "absolute bottom-0 left-0 right-0 z-40 p-6 pt-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent transition-all duration-500",
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
                      className="h-full bg-gradient-to-r from-[#FF4F6E] to-[#FF8C94] relative"
                      style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg scale-0 group-hover/progress:scale-100 transition-transform" />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center gap-6">
                    <button
                      onClick={handlePrevVideo}
                      disabled={!hasPrev}
                      className="text-white/80 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none hover:scale-110 transition-transform"
                      aria-label="Bài trước"
                    >
                      <SkipBack size={20} fill="currentColor" />
                    </button>

                    <button onClick={togglePlay} className="text-white hover:scale-110 transition-transform" aria-label={isPlaying ? 'Tạm dừng video' : 'Phát video'}>
                      {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" />}
                    </button>

                    <button
                      onClick={handleNextVideo}
                      disabled={!hasNext}
                      className="text-white/80 hover:text-white transition-colors disabled:opacity-30 disabled:pointer-events-none hover:scale-110 transition-transform"
                      aria-label="Bài tiếp theo"
                    >
                      <SkipForward size={20} fill="currentColor" />
                    </button>

                    <div className="flex items-center gap-2">
                      <button onClick={toggleMute} className="text-white/80 hover:text-white transition-colors" aria-label={isMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}>
                        {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                      </button>
                      <input
                        type="range"
                        aria-label="Âm lượng"
                        min="0"
                        max="1"
                        step="0.1"
                        value={isMuted ? 0 : volume}
                        onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                        className="w-16 h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-[#FF4F6E]"
                      />
                    </div>

                    <div className="text-[12px] font-extrabold text-white/70 tracking-widest font-heading">
                      {formatTime(currentTime)} <span className="mx-1 opacity-30">/</span> {formatTime(duration)}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 relative">
                    {/* Settings Group: Captions, Lang, Speed, Fullscreen */}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCaptions(!showCaptions);
                      }}
                      className={cn(
                        "p-2 rounded-xl transition-all",
                        showCaptions ? "text-[#FF4F6E] bg-[#FF4F6E]/10" : "text-white/60 hover:text-white"
                      )}
                      aria-label={showCaptions ? 'Tắt phụ đề' : 'Bật phụ đề'}
                    >
                      <Captions size={20} />
                    </button>

                    <div className="flex bg-white/10 backdrop-blur-md rounded-xl p-1 border border-white/10 items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCaptionBackground(!captionBackground);
                        }}
                        className={cn(
                          "px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all",
                          captionBackground ? "bg-white/20 text-white shadow-sm" : "text-white/40 hover:text-white/70"
                        )}
                        title="Nền phụ đề"
                      >
                        BG
                      </button>
                      <div className="w-[1px] h-3 bg-white/10" />
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
                              "px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition-all",
                              language === l ? "bg-[#FF4F6E] text-white shadow-lg" : "text-white/40 hover:text-white/70",
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
                        <div className="absolute bottom-full mb-4 right-0 bg-slate-900/95 backdrop-blur-md rounded-2xl p-2 border border-white/10 shadow-2xl min-w-[100px] z-[60] flex flex-col gap-1 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                            <button
                              key={speed}
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePlaybackSpeedChange(speed);
                              }}
                              className={cn(
                                "px-4 py-2 text-[11px] font-extrabold rounded-xl transition-all text-left",
                                playbackSpeed === speed
                                  ? "bg-[#FF4F6E] text-white"
                                  : "text-white/60 hover:bg-white/10 hover:text-white"
                              )}
                            >
                              {speed === 1 ? 'Chuẩn' : `${speed}x`}
                            </button>
                          ))}
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowSpeedMenu(!showSpeedMenu);
                        }}
                        className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-extrabold text-white/90 transition-all font-heading border border-white/5"
                        aria-label="Chọn tốc độ phát"
                      >
                        {playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`}
                      </button>
                    </div>

                    <button onClick={toggleFullscreen} className="p-2 text-white/80 hover:text-white hover:scale-110 transition-all" aria-label="Mở toàn màn hình">
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
                    "absolute left-1/2 -translate-x-1/2 w-[92%] md:w-[86%] pointer-events-none z-30 transition-all duration-500",
                    showControls ? captionPositionWithControlsClass[captionPosition] : captionPositionClass[captionPosition]
                  )}
                >
                  <div className="px-1 md:px-2 py-1">
                    <div className="flex items-center gap-2 justify-center">
                      <p
                        aria-live="polite"
                        className={cn(
                          "text-center font-extrabold tracking-tight text-white",
                          captionBackground && "rounded-xl bg-black/45 px-4 py-2 backdrop-blur-sm"
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
                                "transition-all duration-300",
                                isWordActive ? "text-white" : "text-white/25 blur-[0.5px]"
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
                <p className="font-extrabold tracking-[0.2em] uppercase text-sm">Không thể phát video</p>
                <p className="text-[11px] mt-3 max-w-xs text-center opacity-60 font-bold">Tệp video có thể bị lỗi hoặc không tồn tại.</p>
              </div>

              {/* Visual Sound Pulse REMOVED per user request */}
            </div>



            {/* AI Smart Analysis Panel - High Accessibility for Deaf Users */}
            <div className="bg-white/95 backdrop-blur-md rounded-[40px] p-10 border border-white/20 shadow-xl relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Sparkles size={120} className="text-[#FF4F6E]" />
              </div>

              <div className="flex flex-col md:flex-row items-center justify-between gap-8 relative z-10">
                <div className="flex items-center gap-6">
                  <div className="w-16 h-16 bg-[#FF4F6E]/10 rounded-[28px] flex items-center justify-center text-[#FF4F6E] animate-pulse">
                    <Sparkles size={32} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl md:text-xl lg:text-2xl font-extrabold text-slate-900 tracking-tight">TRÍ TUỆ TRỰC QUAN</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide max-w-[200px] md:max-w-none leading-tight scale-75 origin-left">Tóm tắt AI tức thì cho người học trực quan</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-4 w-full md:w-auto md:pr-4">
                  <button
                    onClick={handleGetSummary}
                    disabled={isLoadingSummary}
                    className="flex-1 md:flex-none px-8 py-5 bg-[#FF4F6E] text-white rounded-[24px] font-extrabold text-sm uppercase tracking-widest shadow-2xl shadow-[#FF4F6E]/40 hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isLoadingSummary ? (
                      <>
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Đang phân tích...
                      </>
                    ) : (
                      <>
                        <Zap size={20} fill="currentColor" />
                        TẠO TÓM TẮT BẰNG AI
                      </>
                    )}
                  </button>


                </div>
              </div>



              {summaryPoints.length > 0 && (
                <div className="mt-10 grid md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-4 duration-700">
                  {summaryPoints.map((pt, i) => (
                    <div key={i} className="flex items-start gap-4 p-6 bg-slate-50 rounded-[28px] border border-slate-100/50 hover:bg-white hover:shadow-xl transition-all group/card">
                      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-[#FF4F6E] shadow-sm shrink-0 group-hover/card:scale-110 transition-transform">
                        <CheckCircle size={18} />
                      </div>
                      <p className="text-sm font-bold text-slate-700 leading-relaxed">{pt}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Right Column: Dynamic Panel (Transcript or Lessons) */}
          <div className="lg:col-span-5 relative">
            <div className="sticky top-28 bg-white/95 backdrop-blur-md border border-white/20 rounded-[40px] shadow-2xl shadow-slate-200/40 h-[calc(100vh-140px)] flex flex-col overflow-hidden">

              {/* Panel Tabs */}
              <div className="flex border-b border-slate-50" role="tablist" aria-label="Bảng nội dung bên phải">
                <button
                  onClick={() => setRightPanelTab('transcript')}
                  role="tab"
                  aria-selected={rightPanelTab === 'transcript'}
                  className={cn(
                    "flex-1 py-8 flex items-center justify-center gap-3 transition-all",
                    rightPanelTab === 'transcript' ? "bg-white text-slate-900" : "bg-slate-50 text-slate-400 hover:text-slate-600"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all", rightPanelTab === 'transcript' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-200 text-slate-500")}>
                    <FileText size={20} />
                  </div>
                  <span className="text-sm font-extrabold uppercase tracking-widest">Phụ đề</span>
                </button>
                <button
                  onClick={() => setRightPanelTab('lessons')}
                  role="tab"
                  aria-selected={rightPanelTab === 'lessons'}
                  className={cn(
                    "flex-1 py-8 flex items-center justify-center gap-3 transition-all",
                    rightPanelTab === 'lessons' ? "bg-white text-slate-900" : "bg-slate-50 text-slate-400 hover:text-slate-600"
                  )}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all", rightPanelTab === 'lessons' ? "bg-slate-900 text-white shadow-lg" : "bg-slate-200 text-slate-500")}>
                    <List size={20} />
                  </div>
                  <span className="text-sm font-extrabold uppercase tracking-widest">Bài học</span>
                </button>
              </div>


              <div ref={transcriptPanelRef} className="flex-1 overflow-y-auto p-10 space-y-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
                {rightPanelTab === 'transcript' ? (
                  <>
                    {isLoadingTranscript && renderPanelState('Đang tải phụ đề...')}
                    {!isLoadingTranscript && segments.length === 0 && renderPanelState('Chưa có phụ đề.')}
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
                            "block w-full p-6 rounded-[32px] transition-all cursor-pointer group relative text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF4F6E]/35",
                            isActive ? "bg-[#FF4F6E] text-white shadow-2xl shadow-[#FF4F6E]/30 scale-[1.02]" : "hover:bg-slate-50 border border-transparent hover:border-slate-100 text-slate-600"
                          )}
                        >
                          <span className={cn(
                            "text-[10px] font-extrabold uppercase tracking-[0.2em] mb-3 block",
                            isActive ? "text-white/70" : "text-[#FF4F6E]"
                          )}>
                            {formatTime(s.start)}
                          </span>
                          <p className={cn(
                            "text-base leading-relaxed",
                            isActive ? "font-extrabold" : "font-bold"
                          )}>
                            {s.text}
                          </p>
                          {isActive && !reducedMotion && (
                            <div className="absolute top-8 right-8 animate-ping w-3 h-3 bg-white rounded-full" />
                          )}
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="space-y-4">
                    {isLoadingModuleLessons && renderPanelState('Đang tải danh sách bài học...')}
                    {!isLoadingModuleLessons && moduleLessons.length === 0 && renderPanelState('Chưa có video trong chương này.')}
                    {!isLoadingModuleLessons && moduleLessons.map((lesson, idx) => (
                      <button
                        type="button"
                        key={lesson.id}
                        onClick={() => {
                          router.push(`/student/videos/${lesson.id}`);
                        }}
                        className={cn(
                          "flex w-full items-center gap-4 p-4 rounded-3xl cursor-pointer text-left transition-all border-2 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF4F6E]/35",
                          videoId === lesson.id && "cursor-default",
                          videoId === lesson.id ? "border-[#FF4F6E] bg-white shadow-lg" : "border-transparent hover:bg-slate-50"
                        )}
                      >
                        <div className="relative w-24 h-14 rounded-xl overflow-hidden shrink-0 shadow-sm">
                          <Image src={lesson.thumb} alt={lesson.title} fill className="object-cover" unoptimized={true} />
                          <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <Play size={16} className="text-white" fill="currentColor" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <h4 className={cn("text-xs font-extrabold leading-tight", videoId === lesson.id ? "text-slate-900" : "text-slate-500")}>
                            {idx + 1}. {lesson.title}
                          </h4>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
                            <Clock size={10} />
                            {lesson.duration}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="p-8 bg-slate-50 border-t border-slate-100 text-center">
                <div className="inline-flex items-center gap-3 px-6 py-2 bg-white rounded-full border border-slate-200 text-[10px] font-extrabold text-slate-400 uppercase tracking-[0.2em] shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Đồng bộ trực tiếp: {language.toUpperCase()}
                </div>
              </div>
            </div>
          </div>

        </div>

            {/* Smart Content Section - Expanded Layout */}
            <div className="space-y-6 mt-10 lg:mt-16">

              {/* Visual Tabs Section */}
              <div className="bg-white/95 backdrop-blur-md rounded-[40px] p-8 md:p-10 border border-white/20 shadow-xl shadow-slate-200/20">
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b border-slate-100 mb-10 pb-2">
                  {[
                    { id: 'timeline', label: 'Cấu trúc thời gian', icon: Clock },
                    { id: 'highlights', label: 'Điểm nhấn chính', icon: Zap },
                    { id: 'quiz', label: 'Làm bài quiz', icon: ClipboardCheck },
                    { id: 'flashcards', label: 'Thẻ ghi nhớ', icon: BookOpen },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={cn(
                        "pb-6 text-[12px] font-extrabold uppercase tracking-[0.15em] transition-all relative flex items-center gap-3 shrink-0",
                        activeTab === tab.id ? "text-[#FF4F6E]" : "text-slate-400 hover:text-slate-600"
                      )}
                    >
                      <tab.icon size={18} />
                      {tab.label}
                      {activeTab === tab.id && <div className="absolute bottom-0 left-0 w-full h-1.5 bg-[#FF4F6E] rounded-t-full" />}
                    </button>
                  ))}
                </div>

                <div className="min-h-[350px]">
                  {activeTab === 'timeline' && (
                    <>
                      <SemanticTimeline
                        videoId={videoId}
                        currentTime={currentTime}
                        onSeek={handleSeek}
                      />
                      <LectureGroundingPanel
                        videoId={videoId}
                        currentTime={currentTime}
                        outputLanguage={language === 'en' ? 'en' : 'vi'}
                        onSeek={handleSeek}
                      />
                    </>
                  )}

                  {activeTab === 'highlights' && (
                    isLoadingMetadata ? renderPanelState('Đang tải điểm nhấn...') : metadataError ? renderPanelState(metadataError) : highlights.length === 0 ? renderPanelState('Chưa có dữ liệu điểm nhấn.') : (
                      <div className="space-y-6">
                        {highlights.map((item, i) => (
                          <div key={i} className="bg-[#FF4F6E]/5 rounded-[32px] p-8 md:p-10 border border-[#FF4F6E]/10 relative group overflow-hidden transition-all hover:bg-[#FF4F6E]/10">
                            <div className="absolute top-0 right-0 p-10 opacity-5 group-hover:scale-125 transition-transform duration-700">
                              <Zap size={150} fill="currentColor" className="text-[#FF4F6E]" />
                            </div>
                            <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
                              <div className="w-24 h-24 bg-white rounded-[28px] shadow-xl shadow-[#FF4F6E]/10 flex flex-col items-center justify-center shrink-0 border border-[#FF4F6E]/20">
                                <span className="text-[10px] font-extrabold text-[#FF4F6E] uppercase tracking-widest mb-1">Trọng tâm</span>
                                <span className="text-xl font-extrabold text-slate-900">{item.time}</span>
                              </div>
                              <div className="space-y-3">
                                <h4 className="text-2xl font-extrabold text-slate-900 leading-tight">{item.reason}</h4>
                                <p className="text-base font-bold text-slate-500 italic">&ldquo;{item.context}&rdquo;</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {activeTab === 'quiz' && (
                    <div className="space-y-6">
                      {isLoadingQuizzes && renderPanelState('Đang tải quiz...')}
                      {!isLoadingQuizzes && quizzes.length === 0 && renderPanelState('Bài học này chưa có quiz.')}
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
                                  "px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wider border transition-all",
                                  selectedQuizIdx === idx ? "bg-[#FF4F6E] text-white border-[#FF4F6E]" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                                )}
                              >
                                Quiz {idx + 1}
                              </button>
                            ))}
                          </div>

                          {activeQuiz && (
                            <div className="space-y-5">
                              <div className="rounded-2xl bg-slate-50 border border-slate-100 p-5">
                                <p className="text-sm font-extrabold text-slate-900">{activeQuiz.title}</p>
                                <p className="text-xs font-bold text-slate-500 mt-1">Điểm đạt: {activeQuiz.passing_score}%</p>
                              </div>

                              {(activeQuiz.questions ?? []).map((question, qIdx) => (
                                <div key={question.id} className="rounded-2xl border border-slate-100 p-5 bg-white">
                                  <p className="text-sm font-extrabold text-slate-900 mb-4">{qIdx + 1}. {question.question_text}</p>
                                  <div className="space-y-2">
                                    {(question.options ?? []).map((opt) => (
                                      <label key={opt.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`quiz-${question.id}`}
                                          checked={quizAnswers[question.id] === opt.id}
                                          onChange={() => handleSelectQuizAnswer(question.id, opt.id)}
                                          disabled={!!quizSubmitResult}
                                        />
                                        <span className="text-sm font-bold text-slate-600">{opt.option_text}</span>
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
                                    className="w-full md:w-auto px-10 py-4 rounded-2xl bg-[#FF4F6E] text-white text-sm font-extrabold uppercase tracking-widest shadow-xl shadow-[#FF4F6E]/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:hover:scale-100"
                                  >
                                    {isSubmittingQuiz ? (
                                      <div className="flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        ĐANG NỘP BÀI...
                                      </div>
                                    ) : 'NỘP BÀI'}
                                  </button>
                                ) : quizSubmitResult.status === 'passed' ? (
                                  <div className="bg-emerald-50 border-2 border-emerald-100 p-8 rounded-[32px] flex flex-col md:flex-row items-center gap-6 animate-in fade-in zoom-in-95 duration-500">
                                    <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
                                      <CheckCircle size={32} />
                                    </div>
                                    <div className="text-center md:text-left flex-1">
                                      <h4 className="text-xl font-extrabold text-emerald-900 tracking-tight">HOÀN THÀNH</h4>
                                      <p className="text-sm font-bold text-emerald-600 uppercase tracking-widest mt-1">
                                        Bạn đã vượt qua bài kiểm tra với {quizSubmitResult.score}% điểm
                                      </p>
                                      <p className="text-xs font-bold text-emerald-500 mt-2">
                                        Đúng {quizSubmitResult.correct} trên tổng số {quizSubmitResult.total} câu hỏi.
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="bg-red-50 border-2 border-red-100 p-8 rounded-[32px] flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <div className="flex items-center gap-6">
                                      <div className="w-16 h-16 bg-red-500 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-red-200 shrink-0">
                                        <Zap size={32} fill="currentColor" />
                                      </div>
                                      <div>
                                        <h4 className="text-xl font-extrabold text-red-900 tracking-tight">KẾT QUẢ CHƯA ĐẠT</h4>
                                        <p className="text-sm font-bold text-red-600 uppercase tracking-widest mt-1">
                                          Điểm của bạn: {quizSubmitResult.score}% (Cần {activeQuiz?.passing_score}%)
                                        </p>
                                      </div>
                                    </div>
                                    <div className="h-[1px] bg-red-100 w-full" />
                                    <p className="text-sm font-bold text-slate-500 leading-relaxed">
                                      Đừng bỏ cuộc! Hãy xem lại nội dung bài giảng và thử sức lại một lần nữa để củng cố kiến thức nhé.
                                    </p>
                                    <button
                                      onClick={() => {
                                        setQuizSubmitResult(null);
                                        setQuizAnswers({});
                                      }}
                                      className="w-full py-4 bg-white border-2 border-red-200 rounded-2xl text-red-600 text-sm font-extrabold uppercase tracking-widest hover:bg-red-50 hover:border-red-300 transition-all shadow-sm"
                                    >
                                      LÀM LẠI
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
                    <div className="space-y-6">
                      {isLoadingMetadata && renderPanelState('Đang tải thẻ ghi nhớ...')}
                      {!isLoadingMetadata && metadataError && renderPanelState(metadataError)}
                      {!isLoadingMetadata && !metadataError && flashcards.length === 0 && renderPanelState('Chưa có thẻ ghi nhớ.')}
                      {!isLoadingMetadata && !metadataError && flashcards.length > 0 && (
                        <>
                          <div className="flex items-center justify-center">
                            <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400 font-extrabold">
                              Thẻ {currentFlashcardIndex + 1} / {flashcards.length}
                            </p>
                          </div>

                          <div className="relative [perspective:1200px] flex justify-center">
                            <Sparkle className="absolute -top-5 left-[16%] w-5 h-5 text-[#FF4F6E]/65 dark:text-pink-300/70" />
                            <Brain className="absolute top-[18%] -left-2 w-5 h-5 text-indigo-500/55 dark:text-indigo-300/70" />
                            <Lightbulb className="absolute top-[20%] -right-2 w-5 h-5 text-amber-500/60 dark:text-amber-300/75" />
                            <Rocket className="absolute -bottom-5 right-[14%] w-5 h-5 text-emerald-500/60 dark:text-emerald-300/70" />
                            <button
                              key={flashcards[currentFlashcardIndex].id || currentFlashcardIndex}
                              onPointerDown={(e) => {
                                dragStartXRef.current = e.clientX;
                                dragMovedRef.current = false;
                                (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
                              }}
                              onPointerMove={(e) => {
                                if (dragStartXRef.current === null) return;
                                const delta = e.clientX - dragStartXRef.current;
                                if (Math.abs(delta) > 4) dragMovedRef.current = true;
                                setDragOffsetX(delta);
                              }}
                              onPointerUp={() => {
                                const threshold = 70;
                                if (dragOffsetX <= -threshold) {
                                  setIsFlashcardFlipped(false);
                                  setCurrentFlashcardIndex((prev) => (prev + 1) % flashcards.length);
                                } else if (dragOffsetX >= threshold) {
                                  setIsFlashcardFlipped(false);
                                  setCurrentFlashcardIndex((prev) => (prev - 1 + flashcards.length) % flashcards.length);
                                } else if (!dragMovedRef.current) {
                                  setIsFlashcardFlipped((prev) => !prev);
                                }
                                dragStartXRef.current = null;
                                dragMovedRef.current = false;
                                setDragOffsetX(0);
                              }}
                              onPointerCancel={() => {
                                dragStartXRef.current = null;
                                dragMovedRef.current = false;
                                setDragOffsetX(0);
                              }}
                              className="block w-full max-w-[380px] mx-auto aspect-[3/4] rounded-[32px] text-left focus:outline-none focus:ring-2 focus:ring-[#FF4F6E]/40 animate-in fade-in slide-in-from-bottom-4 duration-300 touch-pan-y select-none"
                              aria-label="Flip flashcard"
                              style={{
                                transform: `translateX(${dragOffsetX}px) rotate(${dragOffsetX * 0.03}deg)`,
                                transition: dragStartXRef.current === null ? 'transform 180ms ease-out' : 'none',
                              }}
                            >
                              <div
                                className={cn(
                                  "relative w-full h-full [transform-style:preserve-3d] transition-transform duration-500",
                                  isFlashcardFlipped ? "[transform:rotateY(180deg)]" : "[transform:rotateY(0deg)]"
                                )}
                              >
                                <div className="absolute inset-0 rounded-[32px] border border-slate-200 shadow-lg [backface-visibility:hidden] overflow-hidden">
                                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-rose-100 via-white to-amber-100 dark:from-slate-800 dark:via-slate-900 dark:to-rose-950" />
                                  <div className="absolute inset-0 bg-white/52 dark:bg-slate-900/50" />
                                  <div className="absolute inset-0 p-8 flex flex-col items-center justify-center text-center">
                                    <div className="absolute top-4 right-4 rounded-full bg-white/55 dark:bg-slate-900/45 p-1.5 border border-white/50 dark:border-slate-400/30">
                                      <Sparkle size={14} className="text-[#FF4F6E] dark:text-pink-300" />
                                    </div>
                                    <div className="absolute bottom-4 left-4 rounded-full bg-white/50 dark:bg-slate-900/45 p-1.5 border border-white/50 dark:border-slate-400/30">
                                      <Lightbulb size={14} className="text-amber-500 dark:text-amber-300" />
                                    </div>
                                    <p className="text-xs uppercase tracking-[0.15em] text-slate-500 dark:text-slate-300 font-extrabold mb-3">Câu hỏi</p>
                                    <p className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-slate-50 leading-snug">
                                      {flashcards[currentFlashcardIndex].front}
                                    </p>
                                    {flashcards[currentFlashcardIndex].hint ? (
                                      <p className="absolute bottom-8 left-8 right-8 text-[11px] md:text-xs font-bold text-slate-600 dark:text-slate-200 text-center">
                                        Gợi ý: {flashcards[currentFlashcardIndex].hint}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>

                                <div className="absolute inset-0 rounded-[32px] border border-slate-800 shadow-lg [transform:rotateY(180deg)] [backface-visibility:hidden] overflow-hidden">
                                  <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-rose-950 dark:from-slate-900 dark:via-slate-950 dark:to-black" />
                                  <div className="absolute inset-0 bg-slate-900/58 dark:bg-slate-950/64" />
                                  <div className="absolute inset-0 p-8 flex flex-col items-center justify-center text-center">
                                    <div className="absolute top-4 right-4 rounded-full bg-black/35 dark:bg-white/10 p-1.5 border border-white/25">
                                      <Brain size={14} className="text-cyan-200 dark:text-cyan-300" />
                                    </div>
                                    <div className="absolute bottom-4 left-4 rounded-full bg-black/30 dark:bg-white/10 p-1.5 border border-white/25">
                                      <Rocket size={14} className="text-emerald-200 dark:text-emerald-300" />
                                    </div>
                                    <p className="text-xs uppercase tracking-[0.15em] text-slate-300 font-extrabold mb-3">Đáp án</p>
                                    <p className="text-base md:text-lg font-extrabold text-white dark:text-slate-50 leading-snug">
                                      {flashcards[currentFlashcardIndex].back}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </button>
                          </div>
                          <p className="text-center text-[11px] text-slate-400 font-bold">
                            Kéo trái/phải để chuyển thẻ. Chạm để lật thẻ.
                          </p>

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
