'use client';

import React, { useEffect, useState, useRef } from 'react';
import { 
  UploadCloud, 
  FileVideo, 
  CheckCircle2, 
  Sparkles,
  Zap,
  Play
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, type MyVideo } from '@/lib/api';
import { type Translate, useI18n } from '@/lib/i18n';
import { selectUploadStrategy } from '@/lib/upload-strategy.mjs';

function getVideoDisplayState(video: MyVideo, t: Translate) {
  const status = (video.status || '').toLowerCase();
  const completion = (video.completion_status || '').toLowerCase();

  if (status === 'completed') {
    return {
      label: t('Hoàn thành', 'Completed'),
      percent: 100,
      badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      barClass: 'bg-emerald-500',
    };
  }

  if (status.includes('failed')) {
    return {
      label: t('Xử lý lỗi', 'Processing failed'),
      percent: Math.max(0, Math.min(100, video.progress_percent || 0)),
      badgeClass: 'bg-red-50 text-red-600 border border-red-100',
      barClass: 'bg-red-500',
    };
  }

  if (status === 'queued' || status === 'pending_upload') {
    return {
      label: t('Đang chờ xử lý', 'Queued'),
      percent: Math.max(5, Math.min(100, video.progress_percent || 5)),
      badgeClass: 'bg-amber-50 text-amber-600 border border-amber-100',
      barClass: 'bg-amber-500',
    };
  }

  if (status && status !== 'completed') {
    return {
      label: t('AI đang xử lý', 'AI processing'),
      percent: Math.max(10, Math.min(95, video.progress_percent || 10)),
      badgeClass: 'bg-rose-50 text-[#FF4F6E] border border-rose-100',
      barClass: 'bg-[#FF4F6E]',
    };
  }

  if (completion === 'completed') {
    return {
      label: t('Hoàn thành', 'Completed'),
      percent: 100,
      badgeClass: 'bg-emerald-50 text-emerald-600 border border-emerald-100',
      barClass: 'bg-emerald-500',
    };
  }

  return {
    label: t('Chưa học', 'Not started'),
    percent: Math.max(0, Math.min(100, video.progress_percent || 0)),
    badgeClass: 'bg-slate-100 text-slate-500 border border-slate-100',
    barClass: 'bg-slate-300',
  };
}

export default function UploadVideo() {
  const router = useRouter();
  const { locale, t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadStatusText, setUploadStatusText] = useState('');
  const [myVideos, setMyVideos] = useState<MyVideo[]>([]);
  const [videoTitle, setVideoTitle] = useState('');

  const loadMyVideos = async () => {
    try {
      setMyVideos(await api.videos.listMyVideos());
    } catch (err) {
      console.error('Failed to load uploaded videos', err);
    }
  };

  useEffect(() => {
    let cancelled = false;
    api.videos.listMyVideos()
      .then((videos) => {
        if (!cancelled) setMyVideos(videos);
      })
      .catch((err) => console.error('Failed to load uploaded videos', err));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      const filename = e.target.files[0].name.replace(/\.[^/.]+$/, '');
      if (!videoTitle.trim()) {
        setVideoTitle(filename);
      }
      setErrorMsg('');
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const uploadToObjectStorage = (url: string, file: File, contentType: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setUploadProgress((e.loaded / e.total) * 85);
        }
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(t(`Tải video lên kho lưu trữ thất bại (HTTP ${xhr.status}). Liên hệ quản trị viên.`, `Uploading to storage failed (HTTP ${xhr.status}). Contact an administrator.`)));
        }
      };
      xhr.onerror = () => reject(new Error(t('Không thể kết nối tới kho lưu trữ video. Vui lòng kiểm tra mạng hoặc liên hệ quản trị viên.', 'Could not connect to video storage. Check your network or contact an administrator.')));
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.send(file);
    });
  };

  const handleStartProcessing = async () => {
    if (!selectedFile) return;
    const outputLanguage = locale;

    setIsUploading(true);
    setErrorMsg('');
    setUploadProgress(0);
    setUploadStatusText(t('Đang kiểm tra cấu hình lưu trữ...', 'Checking storage configuration...'));

    try {
      const capabilities = await api.videos.getUploadCapabilities();
      const strategy = selectUploadStrategy(capabilities);
      let video_id: string;

      if (strategy === 'direct_object_storage') {
        setUploadStatusText(t('Đang tải video trực tiếp lên kho lưu trữ...', 'Uploading video directly to storage...'));
        const contentType = selectedFile.type || 'video/mp4';
        const presigned = await api.videos.presignUpload({
          filename: selectedFile.name,
          content_type: contentType,
          video_title: videoTitle,
          output_language: outputLanguage,
        });
        video_id = presigned.video_id;
        await uploadToObjectStorage(presigned.upload_url, selectedFile, contentType);
        setUploadProgress(85);
        setUploadStatusText(t('Đang đăng ký video và khởi tạo xử lý...', 'Registering the video and starting processing...'));
        await api.videos.confirmUpload(video_id, presigned.s3_key);
      } else {
        setUploadStatusText(t('Đang tải video lên máy chủ cục bộ...', 'Uploading video to the local server...'));
        const uploaded = await api.videos.uploadLocal(selectedFile, {
          video_title: videoTitle,
          output_language: outputLanguage,
          onProgress: (percent) => setUploadProgress(Math.min(90, percent * 0.9)),
        });
        video_id = uploaded.video_id;
      }

      setUploadProgress(100);
      setUploadStatusText(t('Đã tải lên và chuyển sang hàng đợi xử lý!', 'Uploaded and added to the processing queue!'));

      await loadMyVideos();
      setSelectedFile(null);
      setVideoTitle('');
      setTimeout(() => {
        router.push(`/student/videos/${video_id}/processing`);
      }, 800);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('Upload thất bại. Vui lòng thử lại.', 'Upload failed. Please try again.');
      setErrorMsg(message);
      setIsUploading(false);
      setUploadProgress(0);
      setUploadStatusText('');
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFEFE]">
      <div className="px-8 md:px-12 py-12 max-w-5xl mx-auto space-y-10">
        
        {/* Header Title */}
        <div className="space-y-2">
           <h1 className="text-4xl font-extrabold uppercase text-slate-900 tracking-tight">
             {t('CHIA SẺ', 'SHARE YOUR')} <span className="text-[#FF4F6E]">{t('BÀI GIẢNG', 'LECTURE')}</span>{t(' CỦA BẠN', '')}
           </h1>
           <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px]">
             {t('Tải bài giảng để tạo phân tích AI và tính năng trợ năng', 'Upload a lecture to create AI analysis and accessibility resources')}
           </p>
        </div>

        <div className="relative bg-white rounded-[40px] p-12 shadow-sm border border-slate-50 overflow-hidden group">
          <div className="absolute top-0 right-0 w-[300px] h-full bg-[#FF4F6E]/5 rounded-l-[100px] -z-0" />
          
          <div className="relative z-10 grid lg:grid-cols-2 gap-16 items-center">
            
            {/* Left Column: Form & DragDrop */}
            <div className="space-y-8">
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska" 
                className="hidden" 
              />

              {errorMsg && (
                <div className="p-4 bg-red-50 border border-red-100 text-red-600 rounded-2xl text-xs font-extrabold animate-in fade-in slide-in-from-top-2">
                  {t('Lỗi', 'Error')}: {errorMsg}
                </div>
              )}

              {!isUploading ? (
                <div className="space-y-4">
                  <div
                    onClick={handleUploadClick}
                    className={`relative group border-4 border-dashed rounded-[32px] p-12 flex flex-col items-center justify-center transition-all cursor-pointer ${
                      selectedFile
                        ? 'border-emerald-500 bg-emerald-50/30'
                        : 'border-slate-100 bg-slate-50 hover:bg-white hover:border-[#FF4F6E]/30 hover:shadow-2xl hover:shadow-[#FF4F6E]/10'
                    }`}
                  >
                    <div className={`w-20 h-20 rounded-[24px] shadow-lg flex items-center justify-center mb-8 transition-all group-hover:scale-110 group-hover:rotate-3 ${
                      selectedFile ? 'bg-emerald-500 text-white shadow-emerald-200' : 'bg-white text-slate-300 group-hover:text-[#FF4F6E]'
                    }`}>
                      {selectedFile ? <CheckCircle2 size={40} /> : <UploadCloud size={40} />}
                    </div>
                    <h3 className="text-xl font-extrabold text-slate-900 mb-2">
                      {selectedFile ? t('Sẵn sàng xử lý!', 'Ready to process!') : t('Kéo & thả video', 'Drag and drop a video')}
                    </h3>
                    <p className="text-sm font-bold text-slate-400 text-center max-w-[240px]">
                      {selectedFile ? selectedFile.name : t('Hỗ trợ MP4, MOV, AVI. Dung lượng tối đa 500MB.', 'Supports MP4, MOV, and AVI up to 500 MB.')}
                    </p>

                    {selectedFile && (
                      <div className="mt-4 px-4 py-1.5 bg-emerald-500/10 text-emerald-600 text-[10px] font-extrabold rounded-full uppercase tracking-widest">
                        {(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • {t('Hợp lệ', 'Valid')}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-extrabold uppercase tracking-widest text-slate-500">{t('Tên video', 'Video title')}</label>
                    <input
                      type="text"
                      value={videoTitle}
                      onChange={(e) => setVideoTitle(e.target.value)}
                      placeholder={t('Nhập tên video hiển thị', 'Enter a display title')}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-[#FF4F6E]/40 focus:ring-2 focus:ring-[#FF4F6E]/10"
                    />
                  </div>
                </div>
              ) : (
                <div className="border-4 border-slate-50 rounded-[32px] p-12 flex flex-col items-center justify-center bg-white shadow-inner">
                  <div className="relative w-24 h-24 mb-8">
                     <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
                     <div 
                       className="absolute inset-0 border-4 border-[#FF4F6E] rounded-full border-t-transparent animate-spin" 
                     />
                     <div className="absolute inset-0 flex items-center justify-center text-[#FF4F6E]">
                        <Zap size={32} fill="currentColor" />
                     </div>
                  </div>
                  
                  <h3 className="text-xl font-extrabold text-slate-900 mb-2">
                    {uploadStatusText || t('Hệ thống đang xử lý...', 'The system is processing...')}
                  </h3>
                  
                  <div className="w-full max-w-xs bg-slate-100 rounded-full h-3 mb-4 overflow-hidden">
                    <div 
                      className="bg-[#FF4F6E] h-full rounded-full transition-all duration-500 shadow-lg shadow-[#FF4F6E]/30" 
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <span className="text-sm font-extrabold text-[#FF4F6E] italic">{Math.round(uploadProgress)}%</span>
                </div>
              )}

              <div className="flex flex-col gap-4">
                 <button 
                   onClick={handleStartProcessing}
                   disabled={isUploading || !selectedFile || !videoTitle.trim()}
                   className={`w-full py-5 rounded-2xl font-extrabold text-sm uppercase tracking-widest transition-all ${
                     isUploading || !selectedFile 
                       ? 'bg-slate-100 text-slate-300 cursor-not-allowed' 
                       : 'bg-[#FF4F6E] text-white shadow-xl shadow-[#FF4F6E]/20 hover:bg-[#e64663] hover:scale-[1.02] active:scale-95'
                   }`}
                 >
                   {isUploading ? t('Hệ thống đang xử lý...', 'The system is processing...') : t('Bắt đầu trích xuất AI', 'Start AI extraction')}
                 </button>
                 
                 <div className="flex items-center gap-4 p-4 bg-[#FF4F6E]/5 rounded-2xl border border-[#FF4F6E]/10">
                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-[#FF4F6E] shadow-sm">
                       <Sparkles size={20} fill="currentColor" />
                    </div>
                    <div className="text-[11px] font-bold text-slate-500 leading-tight">
                       {t('Đang chép lời âm thanh và tạo ', 'Transcribing audio and creating ')}<span className="text-[#FF4F6E]">{t('tóm tắt trực quan', 'visual notes')}</span>{t(' cho học tập toàn diện.', ' for an accessible learning experience.')}
                    </div>
                 </div>
              </div>
            </div>

            {/* Right Column: Illustration & Info */}
            <div className="hidden lg:block space-y-10 animate-in fade-in slide-in-from-right-8 duration-1000">
               <div className="relative aspect-square w-full max-w-[340px] mx-auto group grid place-items-center">
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-rose-100 via-white to-indigo-100 shadow-inner" />
                  <div className="relative z-10 grid h-40 w-40 place-items-center rounded-[44px] border border-white bg-white/80 text-[#FF4F6E] shadow-2xl backdrop-blur transition-transform group-hover:-translate-y-2">
                    <UploadCloud size={72} strokeWidth={1.5} aria-hidden="true" />
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: t('Phụ đề tự động', 'Automatic captions'), icon: FileVideo },
                    { label: t('Ghi chú trực quan', 'Visual notes'), icon: Sparkles },
                    { label: t('Đồng bộ nhanh', 'Fast sync'), icon: Zap },
                    { label: t('Chất lượng HD', 'HD quality'), icon: Play },
                  ].map((item, i) => (
                    <div key={i} className="p-4 bg-slate-50/50 border border-slate-100 rounded-2xl flex items-center gap-3">
                       <item.icon size={16} className="text-[#FF4F6E]" />
                       <span className="text-[11px] font-extrabold text-slate-600 uppercase tracking-widest">{item.label}</span>
                    </div>
                  ))}
               </div>
            </div>

          </div>
        </div>

        <section className="bg-white rounded-[32px] border border-slate-100 p-8 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{t('Video tự học đã tải lên', 'Uploaded study videos')}</h2>
              <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                 {t('Truy xuất lại các video bạn đã upload để học tiếp', 'Return to your uploaded videos and continue learning')}
              </p>
            </div>
            <button
              type="button"
              onClick={loadMyVideos}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-extrabold uppercase tracking-widest text-slate-600 hover:bg-slate-50"
            >
               {t('Tải lại', 'Reload')}
            </button>
          </div>
          {myVideos.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm font-bold text-slate-400">
               {t('Chưa có video tự học nào.', 'No study videos have been uploaded yet.')}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {myVideos.map((video) => {
                 const display = getVideoDisplayState(video, t);
                return (
                  <Link
                    key={video.id}
                    href={video.status === 'completed' ? `/student/videos/${video.id}` : `/student/videos/${video.id}/processing`}
                    className="rounded-2xl border border-slate-100 p-5 transition-colors hover:border-[#FF4F6E]/30 hover:bg-rose-50/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-extrabold text-slate-900">{video.title}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {display.label} • {display.percent}%
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest ${display.badgeClass}`}>
                        {display.label}
                      </span>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${display.barClass}`}
                        style={{ width: `${display.percent}%` }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
