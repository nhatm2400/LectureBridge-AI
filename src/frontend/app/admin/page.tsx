'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  Clock,
  Database,
  FileVideo,
  Plus,
  ShieldCheck,
  UploadCloud,
  Users,
  Zap,
  Trash2,
  Edit2,
  Eye,
  EyeOff,
  Settings,
  UserX,
  AlertCircle,
  History,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { StatusBadge, type Status } from '@/components/ui/StatusBadge';
import { CustomSelect } from '@/components/ui/Select';
import { api, type AdminCourseWorkspace, type AdminDashboard, type AdminRecentJob, type AdminUser, type AdminDeletionAudit } from '@/lib/api';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

function toBadgeStatus(status: string): Status {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'ready') return 'ready';
  if (normalized === 'failed' || normalized === 'error') return 'error';
  if (normalized === 'live') return 'live';
  if (normalized === 'ended') return 'ended';
  return 'processing';
}

function normalizeCourseDescription(description?: string | null): string {
  const raw = (description || '').trim();
  if (!raw) return 'Chưa có mô tả';
  if (raw.toLowerCase().includes('khu tự học cá nhân cho video học sinh tự tải lên')) {
    return 'Không gian tự học cá nhân cho các video bạn tự tải lên.';
  }
  return raw;
}

function decodeUtf8FromLatin1(text: string): string {
  try {
    const bytes = Uint8Array.from(Array.from(text).map((ch) => ch.charCodeAt(0) & 0xff));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return text;
  }
}

function displayText(value?: string | null): string {
  const raw = (value || '').replace(/\u0000/g, '').trim();
  if (!raw) return '';
  // Keep valid Vietnamese text unchanged.
  if (/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(raw)) {
    return raw;
  }
  // Only try mojibake repair when text has suspicious markers.
  const suspicious = raw.includes('Ã') || raw.includes('Ä') || raw.includes('�') || raw.includes('¦');
  if (!suspicious) return raw;
  const candidates = [raw, decodeUtf8FromLatin1(raw), decodeUtf8FromLatin1(decodeUtf8FromLatin1(raw))];
  const viRegex = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
  const score = (s: string) => {
    const viCount = (s.match(viRegex) || []).length;
    const badCount = (s.match(/[�]/g) || []).length;
    const weirdSep = (s.match(/[|]/g) || []).length;
    return viCount * 4 - badCount * 5 - weirdSep * 2;
  };
  const best = candidates.sort((a, b) => score(b) - score(a))[0] || raw;
  const cleaned = best.replace(/\s{2,}/g, ' ').trim();
  const normalizedSlug = cleaned
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalizedSlug === 'bi ging' || normalizedSlug === 'bai giang') {
    return 'Bài giảng';
  }

  // Nếu dữ liệu đã vỡ encoding nặng, hiển thị text fallback dễ đọc.
  const hasCorruption = /[�]/.test(cleaned) || cleaned.includes('|');
  if (hasCorruption) {
    const lowered = cleaned.toLowerCase();
    if (lowered.includes('gi') || lowered.includes('lecture')) return 'Bài giảng';
    if (lowered.includes('khoa') || lowered.includes('course')) return 'Khóa học';
    return 'Nội dung đang được cập nhật';
  }

  return cleaned;
}

function normalizeCourseDescriptionSafe(description?: string | null): string {
  const raw = displayText(description);
  if (!raw) return 'Chưa có mô tả';
  if (raw.toLowerCase().includes('khu tự học cá nhân cho video học sinh tự tải lên')) {
    return 'Không gian tự học cá nhân cho các video bạn tự tải lên.';
  }
  return raw;
}

function naturalLessonTitleCompare(aTitle?: string, bTitle?: string): number {
  return (aTitle || '').localeCompare((bTitle || ''), 'vi', {
    sensitivity: 'base',
    numeric: true,
  });
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [authorized, setAuthorized] = useState(false);
  const [currentRole, setCurrentRole] = useState<'admin' | 'teacher' | 'student'>('student');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [recentJobs, setRecentJobs] = useState<AdminRecentJob[]>([]);
  const [adminCourses, setAdminCourses] = useState<AdminCourseWorkspace[]>([]);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [allowPublicRoleRegistration, setAllowPublicRoleRegistration] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [deletingCourseId, setDeletingCourseId] = useState<string | null>(null);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);
  const [updatingCourseId, setUpdatingCourseId] = useState<string | null>(null);
  const [deletionAudits, setDeletionAudits] = useState<AdminDeletionAudit[]>([]);

  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [courseTitle, setCourseTitle] = useState('');
  const [selectedLectureFiles, setSelectedLectureFiles] = useState<File[]>([]);
  const [publishMessage, setPublishMessage] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');
  const [createNewModule, setCreateNewModule] = useState(false);
  const [moduleTitle, setModuleTitle] = useState('');
  const [expandedSections, setExpandedSections] = useState({
    upload: true,
    courses: false,
    settings: false,
    users: false,
    jobs: true,
    deletionHistory: false,
  });
  const [expandedCourseLessons, setExpandedCourseLessons] = useState<Record<string, boolean>>({});

  // Course Edit Modal State
  const [isEditCourseModalOpen, setIsEditCourseModalOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState<{ id: string, title: string, description: string, is_published: boolean } | null>(null);
  // Module Rename Modal State
  const [isRenameModuleModalOpen, setIsRenameModuleModalOpen] = useState(false);
  const [renamingModuleData, setRenamingModuleData] = useState<{ id: string; currentTitle: string; newTitle: string } | null>(null);
  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: (reason: string) => void;
    confirmText?: string;
    type?: 'danger' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { },
    confirmText: 'Xác nhận',
    type: 'danger'
  });

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, isOpen: false }));
    setDeleteReason('');
  };
  const [deleteReason, setDeleteReason] = useState('');
  const lastJobStatusRef = useRef<Record<string, string>>({});
  const READY_NOTIFIED_KEY = 'app_notified_ready_jobs';

  const appendNotification = useCallback((message: string) => {
    if (typeof window === 'undefined') return;
    const key = 'app_notifications';
    const existing = JSON.parse(window.localStorage.getItem(key) || '[]') as Array<{
      id: string;
      message: string;
      created_at: string;
      read: boolean;
    }>;
    const next = [
      {
        id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        message,
        created_at: new Date().toISOString(),
        read: false,
      },
      ...existing,
    ].slice(0, 30);
    window.localStorage.setItem(key, JSON.stringify(next));
    window.dispatchEvent(new Event('app-notification-updated'));
  }, []);

  const hasReadyNotified = useCallback((jobId: string): boolean => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(READY_NOTIFIED_KEY);
      const saved = raw ? (JSON.parse(raw) as string[]) : [];
      return saved.includes(jobId);
    } catch {
      return false;
    }
  }, []);

  const markReadyNotified = useCallback((jobId: string) => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(READY_NOTIFIED_KEY);
      const saved = raw ? (JSON.parse(raw) as string[]) : [];
      if (saved.includes(jobId)) return;
      const next = [...saved, jobId].slice(-500);
      window.localStorage.setItem(READY_NOTIFIED_KEY, JSON.stringify(next));
    } catch {
      // ignore storage issues
    }
  }, []);


  const loadAdminData = useCallback(async (role: 'admin' | 'teacher' | 'student') => {
    try {
      const [dashboardData, jobsData, coursesData, auditsData] = await Promise.all([
        api.admin.getDashboard(),
        api.admin.listRecentJobs(20),
        api.admin.listCourses(),
        api.admin.listDeletionAudits(30),
      ]);
      const sanitizedCourses = coursesData.map((course) => ({
        ...course,
        title: displayText(course.title),
        description: displayText(course.description || ''),
        modules: (course.modules || []).map((module) => ({
          ...module,
          title: displayText(module.title),
          lessons: (module.lessons || []).map((lesson) => ({
            ...lesson,
            title: displayText(lesson.title),
          })),
        })),
      }));

      setDashboard(dashboardData);
      setRecentJobs(jobsData);
      setAdminCourses(sanitizedCourses);
      setDeletionAudits(auditsData);

      if (role === 'admin') {
        const [settingsData, usersData] = await Promise.all([
          api.admin.getSettings(),
          api.admin.listUsers(),
        ]);
        setAllowPublicRoleRegistration(settingsData.allow_public_role_registration);
        setAdminUsers(usersData);
      } else {
        setAllowPublicRoleRegistration(false);
        setAdminUsers([]);
      }

      if (sanitizedCourses.length > 0) {
        setSelectedCourseId((prev) => prev || sanitizedCourses[0].id);
        const currentSelectedCourse = sanitizedCourses.find(c => c.id === (selectedCourseId || sanitizedCourses[0].id));
        if (currentSelectedCourse && currentSelectedCourse.modules.length > 0) {
          const firstModule = currentSelectedCourse.modules[0];
          setSelectedModuleId((prev) => prev || firstModule.id);
        }
      }
    } catch (err) {
      console.error("Failed to load admin data:", err);
    }
  }, [selectedCourseId]);

  useEffect(() => {
    const bootstrap = async () => {
      try {
        const me = await api.auth.me();
        if (!['admin', 'teacher'].includes(me.role)) {
          router.replace('/student/library');
          return;
        }
        setCurrentRole(me.role);
        setAuthorized(true);
        await loadAdminData(me.role);
      } catch {
        router.replace('/auth/login');
      } finally {
        setIsLoading(false);
      }
    };
    bootstrap();
  }, [router, loadAdminData]);

  useEffect(() => {
    if (!authorized) return;
    const timer = window.setInterval(() => {
      loadAdminData(currentRole);
    }, 20000);
    return () => window.clearInterval(timer);
  }, [authorized, currentRole, loadAdminData]);

  useEffect(() => {
    if (!recentJobs.length) return;
    const readyStates = new Set(['ready', 'completed']);
    for (const job of recentJobs) {
      const current = (job.status || '').toLowerCase();
      const previous = (lastJobStatusRef.current[job.job_id] || '').toLowerCase();
      const shouldNotifyTransition = readyStates.has(current) && !readyStates.has(previous);
      const alreadyNotified = hasReadyNotified(job.job_id);
      if (shouldNotifyTransition && !alreadyNotified) {
        const msg = `Video "${job.lesson_title}" đã xử lý xong.`;
        setPublishMessage(msg);
        appendNotification(msg);
        markReadyNotified(job.job_id);
      }
      lastJobStatusRef.current[job.job_id] = job.status || '';
    }
  }, [recentJobs, appendNotification, hasReadyNotified, markReadyNotified]);

  const selectedCourse = useMemo(
    () => adminCourses.find((course) => course.id === selectedCourseId),
    [adminCourses, selectedCourseId]
  );
  const courseOptions = useMemo(
    () =>
      adminCourses.map((course) => ({
        id: course.id,
        title: displayText(course.title),
      })),
    [adminCourses]
  );
  const moduleOptions = useMemo(
    () =>
      (selectedCourse?.modules || []).map((module) => ({
        id: module.id,
        title: displayText(module.title),
      })),
    [selectedCourse]
  );
  const kpis = useMemo(() => {
    const processingCount = recentJobs.filter(
      (job) => toBadgeStatus(job.status) === 'processing'
    ).length;
    const activeUsers = dashboard?.stats.student_count ?? 0;
    const failedJobs = dashboard?.stats.failed_video_jobs ?? 0;
    const courseCount = adminCourses.length;
    const lessonCount = dashboard?.stats.lesson_count ?? 0;
    const completionRate = dashboard?.stats.completion_rate ?? 0;

    return [
      { label: 'Đang xử lý', value: String(processingCount), icon: Activity, color: 'text-amber-600', bg: 'bg-amber-50' },
      { label: 'Khóa học', value: String(courseCount), icon: Database, color: 'text-blue-600', bg: 'bg-blue-50' },
      { label: 'Bài giảng', value: String(lessonCount), icon: FileVideo, color: 'text-indigo-600', bg: 'bg-indigo-50' },
      { label: 'Người dùng', value: String(activeUsers), icon: Users, color: 'text-slate-600', bg: 'bg-slate-50' },
      { label: 'Lỗi xử lý', value: String(failedJobs), icon: AlertCircle, color: 'text-[#FF4F6E]', bg: 'bg-[#FF4F6E]/5' },
      { label: 'Hoàn thành', value: `${completionRate}%`, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    ];
  }, [dashboard, recentJobs, adminCourses]);

  const handleTogglePublicRoleRegistration = async (nextValue: boolean) => {
    setSavingSettings(true);
    try {
      await api.admin.updateSettings({ allow_public_role_registration: nextValue });
      setAllowPublicRoleRegistration(nextValue);
      setPublishMessage(`Đã cập nhật: Đăng ký vai trò = ${nextValue ? 'MỞ' : 'ĐÓNG'}.`);
    } catch {
      setPublishMessage('Không thể cập nhật cài đặt.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleChangeUserRole = async (userId: string, nextRole: 'student' | 'teacher' | 'admin') => {
    setUpdatingRoleUserId(userId);
    try {
      await api.admin.updateUserRole(userId, nextRole);
      setAdminUsers((prev) => prev.map((user) => (user.id === userId ? { ...user, role: nextRole } : user)));
      setPublishMessage('Đã cập nhật vai trò người dùng.');
    } catch {
      setPublishMessage('Lỗi khi cập nhật vai trò.');
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  const handleRenameSelectedModule = async () => {
    if (!selectedCourseId || !selectedModuleId) {
      setPublishMessage('Vui lòng chọn khóa học và chương trước khi đổi tên.');
      return;
    }
    const selectedModule = (selectedCourse?.modules || []).find((item) => item.id === selectedModuleId);
    if (!selectedModule) {
      setPublishMessage('Không tìm thấy chương để đổi tên.');
      return;
    }
    const currentTitle = displayText(selectedModule.title);
    setRenamingModuleData({
      id: selectedModuleId,
      currentTitle: currentTitle,
      newTitle: currentTitle
    });
    setIsRenameModuleModalOpen(true);
  };

  const handleSaveModuleRename = async () => {
    if (!renamingModuleData) return;
    const { id, currentTitle, newTitle } = renamingModuleData;
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      setPublishMessage('Tên chương không được để trống.');
      return;
    }
    if (trimmedTitle === currentTitle) {
      setIsRenameModuleModalOpen(false);
      return;
    }
    const selectedModule = (selectedCourse?.modules || []).find((item) => item.id === id);
    if (!selectedModule) return;

    try {
      await api.courses.updateModule(id, {
        title: trimmedTitle,
        description: selectedModule.description || undefined,
        sort_order: selectedModule.sort_order,
      });
      setPublishMessage('Đã cập nhật tên chương.');
      setIsRenameModuleModalOpen(false);
      await loadAdminData(currentRole);
    } catch {
      setPublishMessage('Lỗi khi cập nhật tên chương.');
    }
  };

  const handleDeleteUser = async (userId: string, email: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa Người Dùng',
      message: `Bạn có chắc muốn XÓA người dùng ${email}?\nMọi dữ liệu liên quan sẽ bị mất.`,
      onConfirm: async (reason: string) => {
        const finalReason = reason.trim();
        if (!finalReason) return;
        setDeletingUserId(userId);
        try {
          await api.admin.deleteUser(userId, finalReason);
          setAdminUsers((prev) => prev.filter(u => u.id !== userId));
          setPublishMessage(`Đã xóa người dùng ${email}.`);
          closeConfirmModal();
        } catch {
          setPublishMessage('Lỗi khi xóa người dùng.');
        } finally {
          setDeletingUserId(null);
        }
      },
      confirmText: 'Xóa',
      type: 'danger'
    });
  };

  const handleDeleteCourse = async (courseId: string, title: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa Khóa Học',
      message: `CẢNH BÁO: Bạn có chắc chắn muốn XÓA khóa học "${title}"? Toàn bộ video và bài giảng bên trong sẽ bị xóa vĩnh viễn.`,
      onConfirm: async (reason: string) => {
        const finalReason = reason.trim();
        if (!finalReason) return;
        setDeletingCourseId(courseId);
        try {
          await api.admin.deleteCourse(courseId, finalReason);
          setAdminCourses((prev) => prev.filter(c => c.id !== courseId));
          if (selectedCourseId === courseId) setSelectedCourseId('');
          closeConfirmModal();
          setPublishMessage(`Đã xóa khóa học "${title}".`);
        } catch {
          setPublishMessage('Lỗi khi xóa khóa học.');
        } finally {
          setDeletingCourseId(null);
        }
      },
      confirmText: 'Xóa',
      type: 'danger'
    });
  };

  const handleToggleCourseVisibility = async (course: AdminCourseWorkspace) => {
    setUpdatingCourseId(course.id);
    try {
      const nextPublished = !course.is_published;
      await api.admin.updateCourse(course.id, { is_published: nextPublished });
      setAdminCourses((prev) => prev.map(c => c.id === course.id ? { ...c, is_published: nextPublished } : c));
      setPublishMessage(`Đã ${nextPublished ? 'hiện' : 'ẩn'} khóa học.`);
    } catch {
      setPublishMessage('Lỗi khi cập nhật trạng thái hiển thị.');
    } finally {
      setUpdatingCourseId(null);
    }
  };

  const handleSaveCourseEdit = async () => {
    if (!editingCourse) return;
    setUpdatingCourseId(editingCourse.id);
    try {
      await api.admin.updateCourse(editingCourse.id, {
        title: editingCourse.title,
        description: editingCourse.description,
        is_published: editingCourse.is_published
      });
      setAdminCourses((prev) => prev.map(c => c.id === editingCourse.id ? {
        ...c,
        title: editingCourse.title,
        description: editingCourse.description,
        is_published: editingCourse.is_published
      } : c));
      setIsEditCourseModalOpen(false);
      setPublishMessage('Đã cập nhật thông tin khóa học.');
    } catch {
      setPublishMessage('Lỗi khi cập nhật khóa học.');
    } finally {
      setUpdatingCourseId(null);
    }
  };

  const handleDeleteVideoFromLog = async (videoId: string, lessonTitle: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa Video',
      message: `Bạn có chắc muốn xóa video "${lessonTitle}"?`,
      onConfirm: async (reason: string) => {
        const finalReason = reason.trim();
        if (!finalReason) return;
        setDeletingVideoId(videoId);
        try {
          await api.videos.delete(videoId, finalReason);
          await loadAdminData(currentRole);
          closeConfirmModal();
          setPublishMessage('Đã xóa video.');
        } catch {
          setPublishMessage('Lỗi khi xóa video.');
        } finally {
          setDeletingVideoId(null);
        }
      },
      confirmText: 'Xóa',
      type: 'danger'
    });
  };

  const handleDeleteLessonFromCourse = async (videoId: string, lessonTitle: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'Xóa Bài Học',
      message: `Bạn có chắc muốn xóa bài học "${lessonTitle}" khỏi khóa học?`,
      onConfirm: async (reason: string) => {
        const finalReason = reason.trim();
        if (!finalReason) return;
        setDeletingVideoId(videoId);
        try {
          await api.videos.delete(videoId, finalReason);
          await loadAdminData(currentRole);
          closeConfirmModal();
          setPublishMessage('Đã xóa bài học khỏi khóa học.');
        } catch {
          setPublishMessage('Lỗi khi xóa bài học.');
        } finally {
          setDeletingVideoId(null);
        }
      },
      confirmText: 'Xóa',
      type: 'danger'
    });
  };

  const resolveUploadTarget = async () => {
    if (mode === 'new') {
      if (!courseTitle.trim()) throw new Error('Nhập tên khóa học mới.');
      const course = await api.courses.createCourse({
        title: courseTitle.trim(),
        description: 'Khóa học được tạo từ quản trị viên.',
        is_published: true,
      });
      const createdModule = await api.courses.createModule(course.id, {
        title: (moduleTitle || 'Bài giảng').trim(),
        sort_order: 1,
      });
      return { moduleId: createdModule.id, messagePrefix: `Đã tạo khóa học "${course.title}"` };
    }

    if (!selectedCourseId) throw new Error('Chọn khóa học trước khi tải lên.');
    if (createNewModule) {
      const createdModule = await api.courses.createModule(selectedCourseId, {
        title: (moduleTitle || 'Bài giảng').trim(),
        sort_order: ((selectedCourse?.modules || []).reduce((maxValue, item) => Math.max(maxValue, item.sort_order || 0), 0) || 0) + 1,
      });
      return { moduleId: createdModule.id, messagePrefix: `Đã thêm chương "${createdModule.title}"` };
    }
    if (!selectedModuleId) throw new Error('Chọn chương để tải video lên.');
    return { moduleId: selectedModuleId, messagePrefix: 'Đã đưa video vào hàng đợi xử lý' };
  };

  const handleUpload = async () => {
    if (selectedLectureFiles.length === 0) {
      setPublishMessage('Chọn video trước khi tải lên.');
      return;
    }
    setIsUploading(true);
    setUploadProgress(15);
    try {
      const target = await resolveUploadTarget();
      setUploadProgress(50);
      const upload = await api.videos.uploadBatch(selectedLectureFiles, target.moduleId);
      setUploadProgress(100);
      setSelectedLectureFiles([]);
      setCourseTitle('');
      setCreateNewModule(false);
      await loadAdminData(currentRole);
      setPublishMessage(`${target.messagePrefix}. Thành công ${upload.success_count}/${upload.total}${upload.failed_count > 0 ? `, thất bại ${upload.failed_count}` : ''}.`);
    } catch (err) {
      setPublishMessage(err instanceof Error ? err.message : 'Lỗi tải lên.');
    } finally {
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
      }, 600);
    }
  };

  const toggleSection = (key: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Đang tải bảng điều khiển...</div>;
  }
  if (!authorized) return null;

  return (
    <div className="space-y-10 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto px-4 sm:px-8">
      {/* Header */}
      <div id="overview" className="scroll-mt-20 relative bg-[#14142B] rounded-[40px] p-10 overflow-hidden shadow-2xl group">
        <div className="absolute top-0 right-0 w-[500px] h-full bg-[#FF4F6E]/10 rounded-l-[100px] -z-0" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[#FF4F6E]/20 text-[#FF4F6E] rounded-full text-xs font-extrabold uppercase tracking-widest">
              <ShieldCheck size={12} fill="currentColor" />
              QUYỀN QUẢN TRỊ VIÊN
            </div>
            <h1 className="text-4xl font-extrabold text-white leading-tight uppercase">
              QUẢN TRỊ <span className="text-[#FF4F6E]">HỆ THỐNG</span>
            </h1>
            <p className="text-white/50 font-bold max-w-md text-sm">
              Quản lý khóa học, người dùng và theo dõi tiến trình xử lý video.
            </p>
          </div>
          <div className="w-16 h-16 rounded-3xl bg-[#FF4F6E] flex items-center justify-center shadow-xl shadow-[#FF4F6E]/20">
            <Zap size={32} className="text-white" fill="currentColor" />
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-white p-6 rounded-[28px] border border-slate-50 shadow-sm group hover:shadow-xl transition-all duration-500">
            <div className={cn('w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-sm transition-transform group-hover:scale-110 group-hover:rotate-3', kpi.bg, kpi.color)}>
              <kpi.icon size={22} />
            </div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400 mb-1">{kpi.label}</p>
            <p className="text-2xl font-extrabold text-slate-900 tracking-tight">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Upload Section */}
      <div id="upload" className="scroll-mt-20 bg-white rounded-[32px] p-8 shadow-sm border border-slate-50">
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#FF4F6E]/10 flex items-center justify-center text-[#FF4F6E]">
            <UploadCloud size={20} />
          </div>
          <div>
            <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">ĐĂNG TẢI BÀI GIẢNG</h2>
            <p className="text-xs font-bold text-slate-400">Thêm video mới vào hệ thống</p>
          </div>
          </div>
          <button
            onClick={() => toggleSection('upload')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            {expandedSections.upload ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expandedSections.upload ? 'Thu gọn' : 'Mở rộng'}
          </button>
        </div>

        {expandedSections.upload && <div className="grid lg:grid-cols-2 gap-10">
          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={cn(
              'relative border-4 border-dashed rounded-[32px] p-12 flex flex-col items-center justify-center transition-all cursor-pointer group',
              isUploading ? 'bg-slate-50 border-slate-100' : 'bg-[#F8F9FB] border-slate-100 hover:bg-white hover:border-[#FF4F6E]/30'
            )}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              multiple
              accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska"
              onChange={(event) => setSelectedLectureFiles(Array.from(event.target.files || []))}
            />
            {isUploading ? (
              <div className="text-center space-y-4">
                <LoaderIcon className="w-12 h-12 text-[#FF4F6E] animate-spin mx-auto" />
                <div className="text-xs font-bold text-slate-900">{uploadProgress}% Đang tải lên...</div>
              </div>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-white shadow-md flex items-center justify-center text-slate-400 group-hover:text-[#FF4F6E] transition-all mb-4">
                  <Plus size={32} />
                </div>
                <p className="text-sm font-bold text-slate-900">Chọn hoặc Kéo thả Video</p>
                {selectedLectureFiles.length > 0 && (
                  <div className="mt-4 px-4 py-2 bg-[#FF4F6E]/10 border border-[#FF4F6E]/20 rounded-full flex items-center gap-2 animate-in zoom-in-95 duration-300">
                    <div className="w-2 h-2 rounded-full bg-[#FF4F6E] animate-pulse" />
                    <p className="text-[12px] font-extrabold text-[#FF4F6E] uppercase tracking-widest">
                      {selectedLectureFiles.length} file đã chọn
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <label className="flex-1 inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input type="radio" checked={mode === 'existing'} onChange={() => setMode('existing')} className="accent-[#FF4F6E]" />
                Khóa học hiện có
              </label>
              <label className="flex-1 inline-flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} className="accent-[#FF4F6E]" />
                Khóa học mới
              </label>
            </div>

            {mode === 'new' ? (
              <div className="space-y-3">
                <input
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="Tên khóa học mới"
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white transition-all"
                />
                <input
                  value={moduleTitle}
                  onChange={(e) => setModuleTitle(e.target.value)}
                  placeholder="Tên chương (Module)"
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white transition-all"
                />
              </div>
            ) : (
              <div className="space-y-3">
                <CustomSelect
                  options={courseOptions}
                  value={selectedCourseId}
                  onChange={(next) => {
                    setSelectedCourseId(next);
                    const course = adminCourses.find((item) => item.id === next);
                    setSelectedModuleId(course?.modules[0]?.id || '');
                  }}
                  placeholder="Chọn khóa học"
                />

                <div className="flex gap-3">
                  <CustomSelect
                    options={moduleOptions}
                    value={selectedModuleId}
                    onChange={(next) => setSelectedModuleId(next)}
                    disabled={!selectedCourseId || createNewModule}
                    placeholder="Chọn chương"
                    className="flex-1"
                  />
                  <button
                    type="button"
                    onClick={handleRenameSelectedModule}
                    disabled={!selectedCourseId || !selectedModuleId || createNewModule}
                    title="Sửa tên chương"
                    className={cn(
                      "px-4 h-[54px] rounded-2xl border transition-all flex items-center justify-center",
                      !selectedCourseId || !selectedModuleId || createNewModule
                        ? "bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed"
                        : "bg-slate-50 border-slate-100 text-slate-500 hover:text-[#FF4F6E] hover:border-[#FF4F6E]/30"
                    )}
                  >
                    <Edit2 size={18} />
                  </button>
                  <button
                    onClick={() => setCreateNewModule(!createNewModule)}
                    className={cn("px-4 h-[54px] rounded-2xl border transition-all flex items-center justify-center", createNewModule ? "bg-[#FF4F6E] border-[#FF4F6E] text-white" : "bg-slate-50 border-slate-100 text-slate-400")}
                  >
                    <Plus size={20} />
                  </button>
                </div>

                {createNewModule && (
                  <input
                    value={moduleTitle}
                    onChange={(e) => setModuleTitle(e.target.value)}
                    placeholder="Tên chương học mới"
                    className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white transition-all animate-in slide-in-from-top-2"
                  />
                )}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={isUploading || selectedLectureFiles.length === 0}
              className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-extrabold text-sm uppercase tracking-widest hover:bg-[#FF4F6E] transition-all disabled:opacity-50 shadow-lg"
            >
              Bắt đầu xử lý video
            </button>
            {publishMessage && <p className="text-center text-xs font-bold text-[#FF4F6E]">{publishMessage}</p>}
          </div>
        </div>}
      </div>

      {/* Course Management Section */}
      <div id="courses" className="scroll-mt-20 bg-white rounded-[32px] border border-slate-50 shadow-sm overflow-hidden">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">QUẢN LÝ KHÓA HỌC</h2>
              <p className="text-xs font-bold text-slate-400">Danh sách tất cả các khóa học trong hệ thống</p>
            </div>
          </div>
          <button
            onClick={() => toggleSection('courses')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            {expandedSections.courses ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expandedSections.courses ? 'Thu gọn' : 'Mở rộng'}
          </button>
        </div>

        {expandedSections.courses && <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Khóa học</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Thống kê</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Trạng thái</th>
                <th className="px-8 py-4 text-right text-xs font-extrabold uppercase tracking-widest text-slate-400">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {adminCourses.map((course) => (
                <React.Fragment key={course.id}>
                <tr className="hover:bg-slate-50/30 transition-colors group">
                  <td className="px-8 py-6">
                    <p className="text-sm font-bold text-slate-900 group-hover:text-[#FF4F6E] transition-colors">{displayText(course.title)}</p>
                    <p className="text-xs font-bold text-slate-400 truncate max-w-xs">{normalizeCourseDescriptionSafe(normalizeCourseDescription(course.description))}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1 rounded-full">
                        {course.modules.length} chương
                      </span>
                      <button
                        onClick={() =>
                          setExpandedCourseLessons((prev) => ({
                            ...prev,
                            [course.id]: !prev[course.id],
                          }))
                        }
                        className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-[#FF4F6E]"
                      >
                        {expandedCourseLessons[course.id] ? 'Ẩn bài học' : 'Xem bài học'}
                      </button>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <button
                      onClick={() => handleToggleCourseVisibility(course)}
                      disabled={updatingCourseId === course.id}
                      className={cn(
                        "flex items-center gap-2 text-xs font-extrabold uppercase tracking-widest px-3 py-1.5 rounded-xl transition-all",
                        course.is_published ? "bg-emerald-50 text-emerald-600 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                      )}
                    >
                      {course.is_published ? <Eye size={12} /> : <EyeOff size={12} />}
                      {course.is_published ? 'Đang hiện' : 'Đang ẩn'}
                    </button>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => {
                          setEditingCourse({ id: course.id, title: course.title, description: course.description || '', is_published: course.is_published });
                          setIsEditCourseModalOpen(true);
                        }}
                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
                      >
                        <Edit2 size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteCourse(course.id, course.title)}
                        disabled={deletingCourseId === course.id}
                        className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
                {expandedCourseLessons[course.id] && (
                  <tr className="bg-slate-50/50">
                    <td colSpan={4} className="px-8 py-5">
                      <div className="space-y-4">
                        {(course.modules || [])
                          .slice()
                          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                          .map((module) => (
                            <div key={module.id} className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
                              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                                <p className="text-xs font-extrabold uppercase tracking-widest text-slate-500">{displayText(module.title)}</p>
                                <span className="text-[10px] font-bold text-slate-400">
                                  {(module.lessons || []).length} bài học
                                </span>
                              </div>
                              <div className="divide-y divide-slate-50">
                                {(module.lessons || [])
                                  .slice()
                                  .sort((a, b) => {
                                    const byOrder = (a.sort_order ?? 0) - (b.sort_order ?? 0);
                                    if (byOrder !== 0) return byOrder;
                                    return naturalLessonTitleCompare(a.title, b.title);
                                  })
                                  .map((lesson) => (
                                    <div key={lesson.id} className="px-4 py-3 flex items-center justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-700 truncate">{displayText(lesson.title)}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{lesson.status}</p>
                                      </div>
                                      <button
                                        onClick={() => handleDeleteLessonFromCourse(lesson.id, lesson.title)}
                                        disabled={deletingVideoId === lesson.id}
                                        className="text-[10px] font-extrabold uppercase tracking-widest text-rose-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                                      >
                                        {deletingVideoId === lesson.id ? 'Đang xóa...' : 'Xóa bài học'}
                                      </button>
                                    </div>
                                  ))}
                                {(module.lessons || []).length === 0 && (
                                  <p className="px-4 py-3 text-xs font-bold text-slate-400">Chưa có bài học trong chương này.</p>
                                )}
                              </div>
                            </div>
                          ))}
                        {(course.modules || []).length === 0 && (
                          <p className="text-xs font-bold text-slate-400">Khóa học chưa có chương.</p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      {/* Role Management Toggle */}
      <div id="settings-top" className="hidden scroll-mt-20 bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF4F6E]/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-[#FF4F6E] border border-white/10">
              <Settings size={28} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide">CÀI ĐẶT ĐĂNG KÝ VAI TRÒ</h2>
              <p className="text-sm font-bold text-white/50">Cho phép người dùng chọn vai trò (Admin/Teacher) khi đăng ký</p>
            </div>
          </div>

          <button
            onClick={() => handleTogglePublicRoleRegistration(!allowPublicRoleRegistration)}
            disabled={savingSettings}
            className={cn(
              "relative w-48 py-4 rounded-2xl font-extrabold text-xs uppercase tracking-widest transition-all shadow-xl",
              allowPublicRoleRegistration ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-white/10 text-white/50 border border-white/10"
            )}
          >
            {savingSettings ? 'Đang lưu...' : allowPublicRoleRegistration ? 'Đang Mở' : 'Đang Đóng'}
            <div className={cn("absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full", allowPublicRoleRegistration ? "bg-white animate-pulse" : "bg-white/20")} />
          </button>
        </div>
      </div>

      {currentRole === 'admin' && (
        <div className="bg-white rounded-[32px] border border-slate-50 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">QUẢN LÝ NGƯỜI DÙNG</h2>
              <p className="text-xs font-bold text-slate-400">Phân quyền và quản lý tài khoản người dùng</p>
            </div>
            </div>
            <button
              onClick={() => toggleSection('users')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
            >
              {expandedSections.users ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {expandedSections.users ? 'Thu gọn' : 'Mở rộng'}
            </button>
          </div>
          {expandedSections.users && <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Người dùng</th>
                  <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Vai trò</th>
                  <th className="px-8 py-4 text-right text-xs font-extrabold uppercase tracking-widest text-slate-400">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {adminUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold uppercase">
                          {user.full_name?.[0] || user.email[0]}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-900">{user.full_name || 'Học viên mới'}</p>
                          <p className="text-xs font-bold text-slate-400">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <CustomSelect
                        options={[
                          { id: 'student', title: 'Học viên' },
                          { id: 'teacher', title: 'Giảng viên' },
                          { id: 'admin', title: 'Admin' },
                        ]}
                        value={user.role}
                        disabled={updatingRoleUserId === user.id}
                        onChange={(next) => handleChangeUserRole(user.id, next as 'student' | 'teacher' | 'admin')}
                        className="w-40"
                      />
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        onClick={() => handleDeleteUser(user.id, user.email)}
                        disabled={deletingUserId === user.id}
                        className="p-3 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all"
                      >
                        <UserX size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        </div>
      )}

      {/* Sync Jobs Section */}
      <div id="jobs" className="scroll-mt-20 bg-white rounded-[32px] border border-slate-50 shadow-sm overflow-hidden">
        <div className="p-8 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Clock size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">TIẾN ĐỘ XỬ LÝ VIDEO</h2>
              <p className="text-xs font-bold text-slate-400">Trạng thái xử lý AI của các bài giảng video</p>
            </div>
          </div>
          <button
            onClick={() => toggleSection('jobs')}
            className="inline-flex items-center gap-2 px-4 py-3 rounded-2xl border border-slate-200 text-xs font-extrabold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            {expandedSections.jobs ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expandedSections.jobs ? 'Thu gọn' : 'Mở rộng'}
          </button>
        </div>
        {expandedSections.jobs && <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">ID</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Video / Bài giảng</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Trạng thái</th>
                <th className="px-8 py-4 text-right text-xs font-extrabold uppercase tracking-widest text-slate-400">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {recentJobs.map((job) => (
                <tr key={job.job_id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-8 py-6">
                    <span className="text-xs font-mono font-bold text-slate-400">#{job.job_id.slice(0, 8)}</span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">
                        <FileVideo size={14} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">{job.lesson_title}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{job.course_title}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={toBadgeStatus(job.status)} />
                      <span className="text-xs font-bold text-slate-400">{job.progress}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <button
                      onClick={() => handleDeleteVideoFromLog(job.lesson_id, job.lesson_title)}
                      disabled={deletingVideoId === job.lesson_id}
                      className="text-[10px] font-extrabold uppercase tracking-widest text-rose-600 hover:underline disabled:opacity-50"
                    >
                      {deletingVideoId === job.lesson_id ? 'Đang xóa...' : 'Xóa'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </div>

      {/* Deletion History Section */}
      <div id="deletion-history" className="scroll-mt-20 bg-white rounded-[32px] border border-slate-50 shadow-sm overflow-hidden">
        <div className="p-8 flex items-center justify-between border-b border-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center text-rose-600">
              <History size={20} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide text-slate-900">NHẬT KÝ XÓA DỮ LIỆU</h2>
              <p className="text-xs font-bold text-slate-400">Lịch sử và lý do thực hiện các thao tác xóa</p>
            </div>
          </div>
          <button
            onClick={() => toggleSection('deletionHistory')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-extrabold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
          >
            {expandedSections.deletionHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {expandedSections.deletionHistory ? 'Thu gọn' : 'Mở rộng'}
          </button>
        </div>
        {expandedSections.deletionHistory && <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50">
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Thời gian</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Đối tượng</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Người xóa</th>
                <th className="px-8 py-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {deletionAudits.map((audit) => (
                <tr key={audit.id} className="hover:bg-slate-50/30 transition-colors">
                  <td className="px-8 py-6 whitespace-nowrap">
                    <p className="text-xs font-bold text-slate-900">{new Date(audit.created_at).toLocaleString('vi-VN')}</p>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-tighter",
                        audit.entity_type === 'user' ? "bg-purple-100 text-purple-600" :
                          audit.entity_type === 'course' ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"
                      )}>
                        {audit.entity_type === 'user' ? 'Người dùng' : audit.entity_type === 'course' ? 'Khóa học' : 'Video'}
                      </span>
                      <p className="text-sm font-bold text-slate-700">{audit.entity_display_name}</p>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs font-bold text-slate-600">{audit.deleted_by_email}</p>
                  </td>
                  <td className="px-8 py-6">
                    <p className="text-xs font-medium text-slate-500 italic">&quot;{audit.reason}&quot;</p>
                  </td>
                </tr>
              ))}
              {deletionAudits.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-8 py-10 text-center text-sm font-bold text-slate-400">Chưa có dữ liệu xóa nào.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>}
      </div>

      {/* Role Management Toggle */}
      <div id="settings" className="scroll-mt-20 bg-slate-900 rounded-[32px] p-8 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#FF4F6E]/10 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center text-[#FF4F6E] border border-white/10">
              <Settings size={28} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold uppercase tracking-wide">CÀI ĐẶT ĐĂNG KÝ VAI TRÒ</h2>
              <p className="text-sm font-bold text-white/50">Cho phép người dùng chọn vai trò (Admin/Teacher) khi đăng ký</p>
            </div>
          </div>
          <button
            onClick={() => handleTogglePublicRoleRegistration(!allowPublicRoleRegistration)}
            disabled={savingSettings}
            className={cn(
              "relative w-48 py-4 rounded-2xl font-extrabold text-xs uppercase tracking-widest transition-all shadow-xl",
              allowPublicRoleRegistration ? "bg-emerald-500 text-white shadow-emerald-500/20" : "bg-white/10 text-white/50 border border-white/10"
            )}
          >
            {savingSettings ? 'Đang lưu...' : allowPublicRoleRegistration ? 'ĐANG MỞ' : 'ĐANG ĐÓNG'}
            <div className={cn("absolute right-4 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full", allowPublicRoleRegistration ? "bg-white animate-pulse" : "bg-white/20")} />
          </button>
        </div>
      </div>

      {/* Edit Course Modal */}
      {isEditCourseModalOpen && editingCourse && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="bg-slate-900 p-8 text-white">
              <h3 className="text-2xl font-extrabold">Chỉnh sửa Khóa học</h3>
              <p className="text-sm font-bold text-white/50">Cập nhật thông tin cơ bản của khóa học</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Tên khóa học</label>
                <input
                  value={editingCourse.title}
                  onChange={(e) => setEditingCourse({ ...editingCourse, title: e.target.value })}
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white transition-all"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Mô tả</label>
                <textarea
                  rows={4}
                  value={editingCourse.description}
                  onChange={(e) => setEditingCourse({ ...editingCourse, description: e.target.value })}
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white transition-all resize-none"
                />
              </div>
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl">
                <span className="text-xs font-bold text-slate-700">Trạng thái công khai</span>
                <button
                  onClick={() => setEditingCourse({ ...editingCourse, is_published: !editingCourse.is_published })}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    editingCourse.is_published ? "bg-emerald-500" : "bg-slate-300"
                  )}
                >
                  <div className={cn("absolute top-1 w-4 h-4 bg-white rounded-full transition-all", editingCourse.is_published ? "right-1" : "left-1")} />
                </button>
              </div>
            </div>
            <div className="p-8 pt-0 flex gap-4">
              <button
                onClick={() => setIsEditCourseModalOpen(false)}
                className="flex-1 py-4 rounded-2xl border border-slate-100 font-extrabold text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveCourseEdit}
                disabled={updatingCourseId === editingCourse.id}
                className="flex-1 py-4 bg-[#FF4F6E] text-white rounded-2xl font-extrabold text-xs uppercase tracking-widest shadow-xl shadow-[#FF4F6E]/20 hover:bg-[#e64663] transition-all"
              >
                {updatingCourseId === editingCourse.id ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Module Modal */}
      {isRenameModuleModalOpen && renamingModuleData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="bg-slate-900 p-8 text-white">
              <h3 className="text-2xl font-extrabold">Đổi tên Chương</h3>
              <p className="text-sm font-bold text-white/50">Cập nhật tên chương bài giảng</p>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Tên chương mới</label>
                <input
                  value={renamingModuleData.newTitle}
                  onChange={(e) => setRenamingModuleData({ ...renamingModuleData, newTitle: e.target.value })}
                  placeholder="Nhập tên chương bài giảng..."
                  className="w-full rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white transition-all"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveModuleRename();
                    if (e.key === 'Escape') setIsRenameModuleModalOpen(false);
                  }}
                />
              </div>
            </div>
            <div className="p-8 pt-0 flex gap-4">
              <button
                onClick={() => setIsRenameModuleModalOpen(false)}
                className="flex-1 py-4 rounded-2xl border border-slate-100 font-extrabold text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Hủy
              </button>
              <button
                onClick={handleSaveModuleRename}
                disabled={!renamingModuleData.newTitle.trim()}
                className="flex-1 py-4 bg-[#FF4F6E] text-white rounded-2xl font-extrabold text-xs uppercase tracking-widest shadow-xl shadow-[#FF4F6E]/20 hover:bg-[#e64663] transition-all disabled:opacity-50"
              >
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[40px] w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300">
            <div className="p-8 text-center space-y-6">
              <div className={cn(
                "w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-lg",
                confirmModal.type === 'danger' ? "bg-rose-50 text-rose-600 shadow-rose-100" : "bg-blue-50 text-blue-600 shadow-blue-100"
              )}>
                <AlertCircle size={40} />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-extrabold text-slate-900">{confirmModal.title}</h3>
                <p className="whitespace-pre-line text-center text-sm font-bold text-slate-500 leading-relaxed">
                  {confirmModal.message}
                </p>
              </div>
            </div>
            <div className="px-8 pb-4">
              <label className="mb-2 block text-[11px] font-extrabold uppercase tracking-widest text-slate-400">
                Lý do xóa
              </label>
              <textarea
                rows={3}
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="Nhập lý do để truy xuất sau này..."
                className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:bg-white"
              />
            </div>
            <div className="p-8 pt-0 flex gap-4">
              <button
                onClick={closeConfirmModal}
                className="flex-1 py-4 rounded-2xl border border-slate-100 font-extrabold text-xs uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all"
              >
                Hủy
              </button>
              <button
                onClick={() => confirmModal.onConfirm(deleteReason)}
                disabled={!deleteReason.trim()}
                className={cn(
                  "flex-1 py-4 text-white rounded-2xl font-extrabold text-xs uppercase tracking-widest shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                  confirmModal.type === 'danger'
                    ? "bg-rose-600 shadow-rose-200 hover:bg-rose-700"
                    : "bg-blue-600 shadow-blue-200 hover:bg-blue-700"
                )}
              >
                {confirmModal.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}
