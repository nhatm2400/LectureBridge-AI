'use client';

import React, { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { 
  User, 
  Settings as SettingsIcon, 
  Pencil, 
  Sun, 
  Moon, 
  Eye, 
  ScrollText,
  Check,
  Award,
  BookOpen,
  Clock,
  LayoutDashboard
} from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { api, StudentProfileData } from '@/lib/api';

function SettingsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = (searchParams.get('tab') as 'dashboard' | 'profile' | 'accessibility') || 'dashboard';
  
  const setActiveTab = (tab: 'dashboard' | 'profile' | 'accessibility') => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    router.push(`/student/settings?${params.toString()}`);
  };

  const [profileData, setProfileData] = React.useState<StudentProfileData | null>(null);
  const [, setLoading] = React.useState(true);

  const [editedBio, setEditedBio] = React.useState('');
  const [editedGoals, setEditedGoals] = React.useState('');

  React.useEffect(() => {
    const fetchProfile = async () => {
      try {
        const data = await api.student.getProfile();
        setProfileData(data);
        setEditedBio(data.profile.bio || '');
        setEditedGoals(data.profile.learning_goals || '');
      } catch (err) {
        console.error("Failed to fetch profile", err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const { 
    theme, setTheme, 
    highContrast, setHighContrast, 
    autoScroll, setAutoScroll,
    user 
  } = useAppStore();

  const [isEditingProfile, setIsEditingProfile] = React.useState(false);
  const [editedName, setEditedName] = React.useState(user?.name || '');
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (user?.name) setEditedName(user.name);
  }, [user]);

  const handleSaveProfile = async () => {
    if (!editedName.trim()) return;
    setIsSaving(true);
    try {
      await api.student.updateProfile({ 
        bio: editedBio.trim(),
        learning_goals: editedGoals.trim(),
        full_name: editedName.trim(),
      } as Parameters<typeof api.student.updateProfile>[0]);
      
      if (user) {
        useAppStore.getState().login({ ...user, name: editedName.trim() });
      }

      // Update local profile data too
      if (profileData) {
        setProfileData({
          ...profileData,
          profile: {
            ...profileData.profile,
            bio: editedBio.trim(),
            learning_goals: editedGoals.trim()
          }
        });
      }

      setIsEditingProfile(false);
    } catch (err) {
      console.error("Save failed", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="px-8 md:px-12 py-8 max-w-6xl mx-auto">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Sidebar Tabs */}
          <div className="w-full md:w-64 space-y-2">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all font-bold text-sm",
                activeTab === 'dashboard' 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-slate-500 hover:bg-white/50"
              )}
            >
              <LayoutDashboard size={18} />
              Dashboard học tập
            </button>
            <button 
              onClick={() => setActiveTab('profile')}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all font-bold text-sm",
                activeTab === 'profile' 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-slate-500 hover:bg-white/50"
              )}
            >
              <User size={18} />
              Hồ sơ của tôi
            </button>
            <button 
              onClick={() => setActiveTab('accessibility')}
              className={cn(
                "w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all font-bold text-sm",
                activeTab === 'accessibility' 
                  ? "bg-white text-primary shadow-sm" 
                  : "text-slate-500 hover:bg-white/50"
              )}
            >
              <SettingsIcon size={18} />
              Cài đặt trợ năng
            </button>
          </div>

          {/* Main Content */}
          <div className="flex-1">
            {activeTab === 'dashboard' && profileData && (
              <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                {/* Stats Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                   {[
                     { label: 'Đã đăng ký', value: profileData.stats.total_enrollments, icon: BookOpen, color: 'bg-blue-500' },
                     { label: 'Hoàn thành', value: profileData.stats.completed_lessons, icon: Check, color: 'bg-emerald-500' },
                     { label: 'Giờ học', value: `${profileData.stats.total_hours}h`, icon: Clock, color: 'bg-amber-500' },
                     { label: 'Chứng chỉ', value: profileData.stats.certificates_count, icon: Award, color: 'bg-rose-500' },
                   ].map((stat, i) => (
                     <div key={i} className="card-premium p-6 bg-white flex flex-col gap-4">
                        <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg", stat.color)}>
                           <stat.icon size={24} />
                        </div>
                        <div>
                           <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest">{stat.label}</p>
                           <p className="text-2xl font-extrabold text-slate-900">{stat.value}</p>
                        </div>
                     </div>
                   ))}
                </div>

                {/* Certificates List */}
                <div className="card-premium p-10 bg-white">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900 mb-8">Chứng chỉ của tôi</h2>
                  {profileData.profile.certifications && profileData.profile.certifications.length > 0 ? (
                    <div className="grid gap-4">
                      {profileData.profile.certifications.map((cert, idx) => (
                        <div key={idx} className="p-6 bg-slate-50 rounded-[28px] border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl transition-all">
                           <div className="flex items-center gap-6">
                              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
                                 <Award size={28} />
                              </div>
                              <div>
                                 <h4 className="font-extrabold text-slate-900">{cert.course_title}</h4>
                                 <p className="text-xs font-bold text-slate-400">ID: {cert.cert_id} • Cấp ngày: {new Date(cert.issue_date).toLocaleDateString('vi-VN')}</p>
                              </div>
                           </div>
                           <button className="px-6 py-3 bg-white text-slate-900 border border-slate-200 rounded-xl font-extrabold text-xs uppercase tracking-widest hover:bg-primary hover:text-white hover:border-primary transition-all">
                              Tải xuống
                           </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                       <Award size={48} className="mx-auto text-slate-200 mb-4" />
                       <p className="text-slate-400 font-bold">Bạn chưa có chứng chỉ nào. Hãy hoàn thành các khóa học để nhận chứng chỉ!</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'profile' ? (
              <div className="card-premium p-10 bg-white animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-100">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Thông tin cá nhân</h2>
                  <button 
                    onClick={() => setIsEditingProfile(true)}
                    className="p-2 bg-slate-50 text-slate-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors border border-slate-200"
                  >
                    <Pencil size={16} />
                  </button>
                </div>

                <div className="grid md:grid-cols-2 gap-y-8 gap-x-10">
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Tên hiển thị</p>
                    {isEditingProfile ? (
                      <input 
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 outline-none focus:border-primary/40 focus:bg-white transition-all"
                        placeholder="Nhập tên hiển thị mới"
                        autoFocus
                      />
                    ) : (
                      <p className="text-[15px] font-bold text-slate-700">{user?.name}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-1.5">Địa chỉ email</p>
                    <p className="text-[15px] font-bold text-slate-700">{user?.email}</p>
                  </div>
                </div>

                <div className="mt-10 pt-8 border-t border-slate-100">
                  <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Giới thiệu</p>
                  {isEditingProfile ? (
                    <textarea 
                      value={editedBio}
                      onChange={(e) => setEditedBio(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-primary/40 focus:bg-white transition-all resize-none"
                      placeholder="Chia sẻ một chút về bản thân bạn..."
                    />
                  ) : (
                    <p className="text-[15px] font-medium text-slate-600 leading-relaxed">
                      {profileData?.profile.bio || "Bạn chưa có thông tin giới thiệu."}
                    </p>
                  )}
                </div>
                
                <div className="mt-8">
                  <p className="text-[11px] font-extrabold text-slate-400 uppercase tracking-widest mb-3">Mục tiêu học tập</p>
                  {isEditingProfile ? (
                    <textarea 
                      value={editedGoals}
                      onChange={(e) => setEditedGoals(e.target.value)}
                      rows={3}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 outline-none focus:border-primary/40 focus:bg-white transition-all resize-none"
                      placeholder="Mục tiêu học tập của bạn là gì?"
                    />
                  ) : (
                    <p className="text-[15px] font-medium text-slate-600 leading-relaxed">
                      {profileData?.profile.learning_goals || "Hãy đặt ra mục tiêu để có động lực hơn nhé!"}
                    </p>
                  )}
                </div>

                {isEditingProfile && (
                  <div className="mt-10 pt-8 border-t border-slate-100 flex justify-end gap-3">
                    <button 
                      onClick={() => setIsEditingProfile(false)}
                      className="px-6 py-3 bg-slate-100 text-slate-500 rounded-xl text-xs font-extrabold uppercase tracking-widest hover:bg-slate-200 transition-all"
                    >
                      Hủy
                    </button>
                    <button 
                      onClick={handleSaveProfile}
                      disabled={isSaving}
                      className="px-8 py-3 bg-primary text-white rounded-xl text-xs font-extrabold uppercase tracking-widest shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
                    >
                      {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                )}
              </div>
            ) : activeTab === 'accessibility' ? (
              <div className="card-premium p-10 bg-white animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between mb-8 pb-5 border-b border-slate-100">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Cấu hình trợ năng</h2>
                </div>

                <div className="space-y-10">
                  {/* Theme Mode */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-slate-800">
                      {theme === 'light' ? <Sun size={18} className="text-primary" /> : <Moon size={18} className="text-primary" />}
                      <h3 className="font-bold">Giao diện hiển thị</h3>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={() => setTheme('light')}
                        className={cn(
                          "flex-1 p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all",
                          theme === 'light' ? "border-primary bg-primary/5" : "border-slate-100 hover:border-slate-200"
                        )}
                      >
                        <div className="w-full h-20 bg-slate-50 rounded-xl border border-slate-200 p-2 flex flex-col gap-2">
                           <div className="h-2 w-3/4 bg-slate-200 rounded-full" />
                           <div className="h-2 w-1/2 bg-slate-200 rounded-full" />
                        </div>
                        <span className={cn("text-sm font-bold", theme === 'light' ? "text-primary" : "text-slate-500")}>Chế độ sáng</span>
                      </button>
                      <button 
                        onClick={() => setTheme('dark')}
                        className={cn(
                          "flex-1 p-4 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all",
                          theme === 'dark' ? "border-primary bg-primary/5" : "border-slate-100 hover:border-slate-200"
                        )}
                      >
                        <div className="w-full h-20 bg-slate-900 rounded-xl border border-slate-800 p-2 flex flex-col gap-2">
                           <div className="h-2 w-3/4 bg-slate-800 rounded-full" />
                           <div className="h-2 w-1/2 bg-slate-800 rounded-full" />
                        </div>
                        <span className={cn("text-sm font-bold", theme === 'dark' ? "text-primary" : "text-slate-500")}>Chế độ tối</span>
                      </button>
                    </div>
                  </div>

                  {/* Contrast Mode */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
                          <Eye size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">Độ tương phản cao</h3>
                          <p className="text-xs text-slate-400 font-medium">Làm nổi bật các thành phần giao diện quan trọng.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setHighContrast(!highContrast)}
                        className={cn(
                          "w-14 h-8 rounded-full transition-all relative p-1",
                          highContrast ? "bg-primary" : "bg-slate-200"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 bg-white rounded-full shadow-md transition-all",
                          highContrast ? "translate-x-6" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>

                  {/* Auto Scroll */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-6 bg-slate-50 rounded-2xl border border-slate-100">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-primary shadow-sm border border-slate-100">
                          <ScrollText size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-slate-900">Tự động cuộn phụ đề</h3>
                          <p className="text-xs text-slate-400 font-medium">Phụ đề sẽ tự động cuộn theo tiến trình video.</p>
                        </div>
                      </div>
                      <button 
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={cn(
                          "w-14 h-8 rounded-full transition-all relative p-1",
                          autoScroll ? "bg-primary" : "bg-slate-200"
                        )}
                      >
                        <div className={cn(
                          "w-6 h-6 bg-white rounded-full shadow-md transition-all",
                          autoScroll ? "translate-x-6" : "translate-x-0"
                        )} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold text-slate-400">Đang tải...</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
