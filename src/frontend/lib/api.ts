import { resolveBrowserApiBaseUrl } from "./api-base-url.mjs";

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export const API_BASE_URL = resolveBrowserApiBaseUrl(
  CONFIGURED_API_BASE_URL,
  typeof window === "undefined" ? undefined : window.location.hostname,
);

export interface AuthUser {
  name: string;
  email: string;
  role: "student" | "admin" | "teacher";
}

export interface LoginResponse {
  role: "student" | "admin" | "teacher";
  user: AuthUser;
}

export interface SessionUser {
  id: string;
  email: string;
  full_name?: string;
  role: "student" | "admin" | "teacher";
}

export type LectureEventType =
  | "QUESTION"
  | "ANSWER"
  | "EXAMPLE"
  | "TOPIC_CHANGE"
  | "IMPORTANT"
  | "ACTION"
  | "DEADLINE"
  | "EXAM_CUE";

export type LectureReviewStatus =
  | "UNREVIEWED"
  | "CONFIRMED"
  | "CORRECTED"
  | "REJECTED";

export interface LectureEvent {
  id: string;
  video_id: string;
  event_type: LectureEventType;
  start_time: number;
  end_time: number;
  title: string;
  description: string;
  confidence: number;
  inference_type: "EXPLICIT" | "INFERRED";
  source_segment_ids: number[];
  created_by: "AI" | "HUMAN";
  review_status: LectureReviewStatus;
  created_at: string;
  updated_at: string;
}

export interface LectureEventRelation {
  id: string;
  video_id: string;
  source_event_id: string;
  target_event_id: string;
  relation_type: "QUESTION_ANSWER";
  confidence: number;
  created_by: "AI" | "HUMAN";
  review_status: LectureReviewStatus;
  reviewed_by_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LectureProcessingMetrics {
  processed_chunks: number;
  failed_chunks: number;
  events_created: number;
}

export interface ContextRecoveryItem {
  type: LectureEventType | "QUESTION_ANSWER" | "TRANSCRIPT";
  text: string;
  source_event_ids: string[];
  source_segment_ids: number[];
  timestamp: number;
}

export interface ContextRecoveryResponse {
  video_id: string;
  summary: string;
  items: ContextRecoveryItem[];
  supported: boolean;
  metrics: {
    evidence_count: number;
    validated_item_count: number;
    latency_ms: number;
  };
}

export interface LectureCitation {
  evidence_id: string;
  timestamp: number;
  end_time: number;
  source_event_ids: string[];
  source_segment_ids: number[];
}

export interface AskLectureResponse {
  video_id: string;
  answer: string;
  supported: boolean;
  citations: LectureCitation[];
  evidence_count: number;
}

export interface QuestionAnswerProcessingMetrics {
  questions_considered: number;
  candidate_pairs: number;
  processed_questions: number;
  failed_questions: number;
  relations_created: number;
  relations_preserved: number;
  relations_rejected: number;
}



export interface Profile {
  bio?: string;
  learning_goals?: string;
  certifications?: {
    cert_id: string;
    course_id?: string;
    course_title: string;
    issue_date: string;
  }[];
}

export interface StudentProfileData {
  profile: Profile;
  stats: {
    total_enrollments: number;
    completed_lessons: number;
    total_hours: number;
    certificates_count: number;
  };
}

export interface Course {
  id: string;
  category_id: string;
  instructor_id: string;
  title: string;
  description?: string;
  cover_image_url?: string;
  thumbnail_url?: string;
  desc?: string;
  cat?: string;
  thumb?: string;
}

export interface Module {
  id: string;
  course_id: string;
  title: string;
  description?: string;
  sort_order: number;
}

export interface Lesson {
  id: string;
  module_id: string;
  title: string;
  content_type: "video" | "article" | "quiz";
  status: string;
  sort_order: number;
  duration_minutes?: number;
}

export interface Enrollment {
  id: string;
  user_id: string;
  course_id: string;
  enrollment_status: string;
}

export interface UserProgress {
  id: string;
  lesson_id: string;
  progress_percent: number;
  completion_status: string;
  watched_seconds?: number;
  last_position_seconds?: number;
  duration_seconds?: number;
  last_accessed_at?: string;
}

export interface StudentDashboard {
  stats: {
    active_courses: number;
    completed_lessons: number;
    total_watch_seconds: number;
    learned_flashcards: number;
    average_quiz_score: number;
  };
  courses: {
    course_id: string;
    title: string;
    thumbnail_url?: string | null;
    enrollment_status: string;
    total_lessons: number;
    completed_lessons: number;
    progress_percent: number;
  }[];
  incomplete_lessons: {
    lesson_id: string;
    title: string;
    progress_percent: number;
    last_position_seconds: number;
    last_accessed_at: string;
  }[];
  quiz_scores: {
    quiz_id: string;
    title: string;
    score: number;
    status: string;
    created_at: string;
  }[];
  recent_activity: {
    type: string;
    lesson_id: string;
    progress_percent: number;
    last_accessed_at: string;
  }[];
}

export interface AdminDashboard {
  stats: {
    student_count: number;
    active_courses: number;
    lesson_count: number;
    failed_video_jobs: number;
    processing_video_jobs: number;
    completion_rate: number;
  };
  failed_jobs: {
    lesson_id: string;
    status: string;
    error_message?: string | null;
    attempts: number;
    updated_at: string;
  }[];
  popular_lessons: {
    lesson_id: string;
    title: string;
    views: number;
  }[];
  recent_progress: {
    user_id: string;
    lesson_id: string;
    progress_percent: number;
    completion_status: string;
    last_accessed_at: string;
  }[];
}

export interface StudentCourseDetailLesson {
  id: string;
  title: string;
  content_type: string;
  status: string;
  sort_order: number;
  duration_minutes: number;
  progress_percent: number;
  completion_status: string;
  is_completed: boolean;
}

export interface StudentCourseDetailModule {
  id: string;
  title: string;
  description?: string | null;
  sort_order: number;
  lessons: StudentCourseDetailLesson[];
}

export interface StudentCourseDetail {
  course: {
    id: string;
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
    language?: string | null;
    level?: string | null;
    is_published: boolean;
    instructor_id?: string | null;
  };
  stats: {
    students_enrolled: number;
    total_modules: number;
    total_lessons: number;
    total_duration_minutes: number;
    rating_avg: number;
    rating_count: number;
    rating_distribution: Record<number, number>;
    transcript_ready_lessons: number;
    processing_lessons: number;
  };
  user_context: {
    is_enrolled: boolean;
    enrollment_status: string;
    progress_percent: number;
    completed_lessons: number;
    is_course_completed: boolean;
    first_lesson_id?: string | null;
    next_lesson_id?: string | null;
  };
  modules: StudentCourseDetailModule[];
}

export interface CourseReview {
  id: string;
  course_id: string;
  user_id: string;
  user_name: string;
  rating: number;
  comment: string;
  created_at: string;
  updated_at: string;
}

export interface MyReviewItem {
  id: string;
  course_id: string;
  course_title: string;
  rating: number;
  comment: string;
  updated_at: string;
}

export interface AdminCourseWorkspace {
  id: string;
  title: string;
  description?: string | null;
  is_published: boolean;
  created_at: string;
  modules: {
    id: string;
    title: string;
    description?: string | null;
    sort_order: number;
    created_at: string;
    lessons: {
      id: string;
      title: string;
      status: string;
      content_type: string;
      sort_order: number;
      created_at: string;
    }[];
  }[];
}

export interface AdminRecentJob {
  job_id: string;
  lesson_id: string;
  lesson_title: string;
  module_id?: string | null;
  module_title?: string | null;
  course_id?: string | null;
  course_title?: string | null;
  job_type: string;
  status: string;
  progress: number;
  attempts: number;
  error_message?: string | null;
  updated_at: string;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  full_name?: string | null;
  role: "student" | "teacher" | "admin";
  created_at: string;
  updated_at: string;
}

export interface AdminDeletionAudit {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_display_name: string | null;
  deleted_by_user_id: string | null;
  deleted_by_email: string;
  reason: string;
  created_at: string;
}

export interface MyVideo {
  id: string;
  title: string;
  status: string;
  created_at: string;
  video_url?: string | null;
  progress_percent: number;
  completion_status: string;
}

export interface BatchUploadItem {
  ok: boolean;
  filename: string;
  video_id?: string;
  status?: string;
  queue_mode?: string;
  message?: string;
  error?: string;
}

export interface BatchUploadResponse {
  status: string;
  total: number;
  success_count: number;
  failed_count: number;
  items: BatchUploadItem[];
}

export interface UploadCapabilities {
  upload_mode: "direct_object_storage" | "local_filesystem" | "unavailable";
  direct_object_upload_available: boolean;
  local_upload_available: boolean;
}

export interface UploadStartResponse {
  video_id: string;
  status: string;
  queue_mode: string;
  message: string;
  filename: string;
}

const buildHeaders = (isMultipart = false): HeadersInit => {
  const headers: HeadersInit = {};
  if (!isMultipart) headers["Content-Type"] = "application/json";
  return headers;
};

async function apiFetch(path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
  });
  return res;
}

export const api = {
  auth: {
    async getRegistrationConfig(): Promise<{ allow_role_registration: boolean; roles: Array<"student" | "admin" | "teacher"> }> {
      const res = await apiFetch("/api/auth/registration-config", { headers: buildHeaders() });
      if (!res.ok) return { allow_role_registration: false, roles: ["student"] };
      return res.json();
    },

    async me(): Promise<SessionUser> {
      const res = await apiFetch("/api/auth/me", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Unauthenticated");
      return res.json();
    },

    async register(data: {
      email: string;
      password: string;
      confirm_password: string;
      full_name?: string;
      role?: string;
    }) {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Registration failed.");
      }
      return res.json();
    },

    async login(credentials: { email: string; password: string }): Promise<LoginResponse> {
      const formData = new URLSearchParams();
      formData.append("username", credentials.email);
      formData.append("password", credentials.password);

      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Login failed.");
      }
      const data = await res.json();
      let fullName = "";
      let email = credentials.email;
      let role = data.role || "student";
      try {
        const meRes = await apiFetch("/api/auth/me", {
          headers: { "Content-Type": "application/json" },
        });
        if (meRes.ok) {
          const me = (await meRes.json()) as SessionUser;
          fullName = (me.full_name || "").trim();
          email = me.email || email;
          role = me.role || role;
        }
      } catch {
        // ignore and fallback to email prefix
      }

      const fallbackName = email.split("@")[0] || "User";
      return {
        ...data,
        user: {
          name: fullName || fallbackName,
          email,
          role,
        },
      };
    },

    async logout() {
      const res = await apiFetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("Logout failed.");
      return res.json();
    },
  },

  videos: {
    async getStatus(videoId: string) {
      const res = await apiFetch(`/api/videos/${videoId}/status`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch status.");
      return res.json();
    },

    async getTranscript(videoId: string) {
      const res = await apiFetch(`/api/videos/${videoId}/transcript`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch transcript.");
      return res.json();
    },

    async getSummary(videoId: string) {
      const res = await apiFetch(`/api/videos/${videoId}/summary`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch summary.");
      return res.json();
    },

    async getLectureEvents(videoId: string): Promise<LectureEvent[]> {
      const res = await apiFetch(`/api/videos/${videoId}/events`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Không thể tải dòng thời gian ngữ nghĩa.");
      return res.json();
    },

    async getLectureReviewAccess(videoId: string): Promise<{ can_review: boolean }> {
      const res = await apiFetch(`/api/videos/${videoId}/events/review-access`, { headers: buildHeaders() });
      if (!res.ok) return { can_review: false };
      return res.json();
    },

    async getLectureEventRelations(videoId: string): Promise<LectureEventRelation[]> {
      const res = await apiFetch(`/api/videos/${videoId}/event-relations`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Không thể tải liên kết câu hỏi và câu trả lời.");
      return res.json();
    },

    async reprocessLectureEvents(videoId: string): Promise<LectureProcessingMetrics> {
      const res = await apiFetch(`/api/videos/${videoId}/events/reprocess`, {
        method: "POST",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Không thể phân tích lại dòng thời gian lúc này.");
      return res.json();
    },

    async reprocessLectureEventRelations(videoId: string): Promise<QuestionAnswerProcessingMetrics> {
      const res = await apiFetch(`/api/videos/${videoId}/event-relations/reprocess`, {
        method: "POST",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Không thể phân tích lại liên kết hỏi đáp lúc này.");
      return res.json();
    },

    async reviewLectureEvent(
      videoId: string,
      eventId: string,
      payload: {
        review_status: "CONFIRMED" | "CORRECTED" | "REJECTED";
        event_type?: LectureEventType;
        title?: string;
        description?: string;
      }
    ): Promise<LectureEvent> {
      const res = await apiFetch(`/api/videos/${videoId}/events/${eventId}`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Không thể lưu đánh giá sự kiện.");
      return res.json();
    },

    async createLectureEventRelation(
      videoId: string,
      sourceEventId: string,
      targetEventId: string
    ): Promise<LectureEventRelation> {
      const res = await apiFetch(`/api/videos/${videoId}/event-relations`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          source_event_id: sourceEventId,
          target_event_id: targetEventId,
          relation_type: "QUESTION_ANSWER",
        }),
      });
      if (!res.ok) throw new Error("Không thể tạo liên kết hỏi đáp.");
      return res.json();
    },

    async reviewLectureEventRelation(
      videoId: string,
      relationId: string,
      payload: {
        review_status: "CONFIRMED" | "CORRECTED" | "REJECTED";
        target_event_id?: string;
      }
    ): Promise<LectureEventRelation> {
      const res = await apiFetch(`/api/videos/${videoId}/event-relations/${relationId}`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Không thể lưu đánh giá liên kết.");
      return res.json();
    },

    async getHighlights(videoId: string) {
      const res = await apiFetch(`/api/videos/${videoId}/highlights`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch highlights.");
      return res.json();
    },

    async recoverContext(
      videoId: string,
      payload: { current_time: number; window_seconds: number; output_language: "vi" | "en" }
    ): Promise<ContextRecoveryResponse> {
      const res = await apiFetch(`/api/videos/${videoId}/context-recovery`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Không thể phục hồi ngữ cảnh lúc này.");
      }
      return res.json();
    },

    async askLecture(
      videoId: string,
      payload: { question: string; output_language: "vi" | "en" }
    ): Promise<AskLectureResponse> {
      const res = await apiFetch(`/api/videos/${videoId}/ask`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Không thể hỏi bài giảng lúc này.");
      }
      return res.json();
    },

    async getFlashcards(videoId: string) {
      const res = await apiFetch(`/api/videos/${videoId}/flashcards`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch flashcards.");
      return res.json();
    },

    async listMyVideos(): Promise<MyVideo[]> {
      const res = await apiFetch("/api/videos/me", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch my videos.");
      return res.json();
    },
    async delete(videoId: string, reason: string) {
      const q = encodeURIComponent(reason.trim());
      const res = await apiFetch(`/api/videos/${videoId}?reason=${q}`, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete video.");
      return res.json();
    },
    async getUploadCapabilities(): Promise<UploadCapabilities> {
      const res = await apiFetch("/api/videos/upload-capabilities", {
        headers: buildHeaders(),
      });
      if (!res.ok) {
        throw new Error("Unable to determine the configured video storage mode.");
      }
      return res.json();
    },
    async uploadLocal(
      file: File,
      params: {
        video_title?: string;
        module_id?: string;
        onProgress?: (percent: number) => void;
      } = {},
    ): Promise<UploadStartResponse> {
      const formData = new FormData();
      formData.append("file", file);
      if (params.video_title) formData.append("video_title", params.video_title);
      if (params.module_id) formData.append("module_id", params.module_id);

      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.withCredentials = true;
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable && params.onProgress) {
            params.onProgress((event.loaded / event.total) * 100);
          }
        };
        xhr.onload = () => {
          let body: Record<string, unknown> = {};
          try {
            body = JSON.parse(xhr.responseText || "{}");
          } catch {
            // The status-specific fallback below remains safe for non-JSON errors.
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(body as unknown as UploadStartResponse);
            return;
          }
          const detail = typeof body.detail === "string" ? body.detail : null;
          reject(new Error(detail || `Local video upload failed (HTTP ${xhr.status}).`));
        };
        xhr.onerror = () => reject(new Error("Local video upload failed because the backend is unreachable."));
        xhr.open("POST", `${API_BASE_URL}/api/videos/upload`);
        xhr.send(formData);
      });
    },
    async presignUpload(params: {
      filename: string;
      content_type: string;
      video_title?: string;
      module_id?: string;
    }): Promise<{ video_id: string; upload_url: string; s3_key: string; expires_in: number }> {
      const res = await apiFetch("/api/videos/presign-upload", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Failed to get upload URL.");
      }
      return res.json();
    },

    async confirmUpload(videoId: string, s3Key: string) {
      const res = await apiFetch(`/api/videos/${videoId}/confirm-upload`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ s3_key: s3Key }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Failed to confirm upload.");
      }
      return res.json();
    },
    async uploadBatch(files: File[], moduleId?: string): Promise<BatchUploadResponse> {
      const formData = new FormData();
      for (const file of files) {
        formData.append("files", file);
      }
      if (moduleId) formData.append("module_id", moduleId);
      const res = await apiFetch("/api/videos/upload-batch", {
        method: "POST",
        headers: buildHeaders(true),
        body: formData,
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Batch video upload failed.");
      }
      return res.json();
    },
  },

  courses: {
    async listCourses(categoryId?: string): Promise<Course[]> {
      const path = categoryId ? `/api/courses/?category_id=${categoryId}` : "/api/courses/";
      const res = await apiFetch(path, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch courses.");
      return res.json();
    },
    async listLessons(moduleId: string): Promise<Lesson[]> {
      const res = await apiFetch(`/api/courses/modules/${moduleId}/lessons`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch lessons.");
      return res.json();
    },
    async getLesson(lessonId: string): Promise<Lesson> {
      const res = await apiFetch(`/api/courses/lessons/${lessonId}`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch lesson details.");
      return res.json();
    },
    async createCourse(data: { title: string; description?: string; is_published?: boolean }) {
      const res = await apiFetch("/api/courses/", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create course.");
      return res.json();
    },
    async createModule(courseId: string, data: { title: string; description?: string; sort_order?: number }) {
      const res = await apiFetch(`/api/courses/${courseId}/modules`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create module.");
      return res.json();
    },
    async updateModule(moduleId: string, data: { title: string; description?: string; sort_order?: number }) {
      const res = await apiFetch(`/api/courses/modules/${moduleId}`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update module.");
      return res.json();
    },
  },

  student: {
    async enroll(courseId: string): Promise<Enrollment> {
      const res = await apiFetch(`/api/student/enroll/${courseId}`, {
        method: "POST",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Enrollment failed.");
      return res.json();
    },
    async updateProgress(
      lessonId: string,
      progressPercent: number,
      status = "in_progress",
      details?: { watchedSeconds?: number; lastPositionSeconds?: number; durationSeconds?: number }
    ) {
      const params = new URLSearchParams({
        progress_percent: String(progressPercent),
        status,
      });
      if (details?.watchedSeconds !== undefined) params.set("watched_seconds", String(Math.round(details.watchedSeconds)));
      if (details?.lastPositionSeconds !== undefined) params.set("last_position_seconds", String(Math.round(details.lastPositionSeconds)));
      if (details?.durationSeconds !== undefined) params.set("duration_seconds", String(Math.round(details.durationSeconds)));
      const res = await apiFetch(`/api/student/lessons/${lessonId}/progress?${params.toString()}`, {
        method: "POST",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to update progress.");
      return res.json();
    },
    async getProgress(lessonId: string): Promise<UserProgress | null> {
      const res = await apiFetch(`/api/student/lessons/${lessonId}/progress`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch progress.");
      return res.json();
    },
    async getDashboard(): Promise<StudentDashboard> {
      const res = await apiFetch("/api/student/dashboard", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch student dashboard.");
      return res.json();
    },
    async getCourseDetail(courseId: string): Promise<StudentCourseDetail> {
      const res = await apiFetch(`/api/student/courses/${courseId}/detail`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch course detail.");
      return res.json();
    },
    async listCourseReviews(courseId: string, limit = 20, offset = 0): Promise<{ items: CourseReview[]; limit: number; offset: number }> {
      const res = await apiFetch(`/api/student/courses/${courseId}/reviews?limit=${limit}&offset=${offset}`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch course reviews.");
      return res.json();
    },
    async saveCourseReview(courseId: string, payload: { rating: number; comment?: string }): Promise<CourseReview> {
      const res = await apiFetch(`/api/student/courses/${courseId}/reviews`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save course review.");
      return res.json();
    },
    async listMyReviews(): Promise<{ items: MyReviewItem[] }> {
      const res = await apiFetch("/api/student/reviews/me", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch my reviews.");
      return res.json();
    },
    async listLessonQuizzes(lessonId: string) {
      const res = await apiFetch(`/api/student/lessons/${lessonId}/quizzes`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch lesson quizzes.");
      return res.json();
    },
    async submitQuiz(quizId: string, answers: Record<string, string>) {
      const res = await apiFetch(`/api/student/quizzes/${quizId}/submit`, {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) throw new Error("Failed to submit quiz.");
      return res.json();
    },
    async getProfile(): Promise<StudentProfileData> {
      const res = await apiFetch("/api/student/profile", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch profile.");
      return res.json();
    },
    async updateProfile(data: Partial<Profile>): Promise<Profile> {
      const res = await apiFetch("/api/student/profile", {
        method: "PUT",
        headers: buildHeaders(),
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("Failed to update profile.");
      return res.json();
    },
  },

  admin: {
    async getDashboard(): Promise<AdminDashboard> {
      const res = await apiFetch("/api/admin/dashboard", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch admin dashboard.");
      return res.json();
    },
    async listRecentJobs(limit = 10): Promise<AdminRecentJob[]> {
      const res = await apiFetch(`/api/admin/jobs/recent?limit=${limit}`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch recent jobs.");
      return res.json();
    },
    async listCourses(): Promise<AdminCourseWorkspace[]> {
      const res = await apiFetch("/api/admin/courses", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch admin courses.");
      return res.json();
    },
    async listUsers(): Promise<AdminUser[]> {
      const res = await apiFetch("/api/admin/users", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch users.");
      return res.json();
    },
    async getSettings(): Promise<{ allow_public_role_registration: boolean }> {
      const res = await apiFetch("/api/admin/settings", { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch settings.");
      return res.json();
    },
    async updateSettings(settings: { allow_public_role_registration: boolean }) {
      const res = await apiFetch("/api/admin/settings", {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(settings),
      });
      if (!res.ok) throw new Error("Failed to update settings.");
      return res.json();
    },
    async updateUserRole(userId: string, role: "student" | "teacher" | "admin") {
      const res = await apiFetch(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error("Failed to update user role.");
      return res.json();
    },
    async listDeletionAudits(limit = 50): Promise<AdminDeletionAudit[]> {
      const res = await apiFetch(`/api/admin/deletion-audits?limit=${limit}`, { headers: buildHeaders() });
      if (!res.ok) throw new Error("Failed to fetch deletion audits.");
      return res.json();
    },
    async deleteUser(userId: string, reason: string) {
      const q = encodeURIComponent(reason.trim());
      const res = await apiFetch(`/api/admin/users/${userId}?reason=${q}`, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete user.");
      return res.json();
    },
    async updateCourse(courseId: string, data: { title?: string; description?: string; is_published?: boolean }) {
      const res = await apiFetch(`/api/admin/courses/${courseId}`, {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update course.");
      return res.json();
    },
    async deleteCourse(courseId: string, reason: string) {
      const q = encodeURIComponent(reason.trim());
      const res = await apiFetch(`/api/admin/courses/${courseId}?reason=${q}`, {
        method: "DELETE",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete course.");
      return res.json();
    }
  }
};
