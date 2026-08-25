'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Role = 'teacher' | 'student' | 'admin';
type FontSize = 'S' | 'M' | 'L' | 'XL';
type Theme = 'light' | 'dark';
export type Locale = 'vi' | 'en';

interface User {
  name: string;
  email: string;
  role: Role;
}

interface AppState {
  // Auth State
  user: User | null;
  isAuthenticated: boolean;
  login: (user: User) => void;
  logout: () => void;

  currentRole: Role;
  setRole: (role: Role) => void;
  
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  
  theme: Theme;
  setTheme: (theme: Theme) => void;

  locale: Locale;
  setLocale: (locale: Locale) => void;
  
  highContrast: boolean;
  setHighContrast: (val: boolean) => void;
  
  autoScroll: boolean;
  setAutoScroll: (val: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Auth
      user: null,
      isAuthenticated: false,
      login: (user) => {
        set({
          user,
          isAuthenticated: true,
          currentRole: user.role
        });
      },
      logout: () => {
        set({ user: null, isAuthenticated: false });
      },

      currentRole: 'student',
      setRole: (role) => set({ currentRole: role }),
      
      fontSize: 'L',
      setFontSize: (size) => set({ fontSize: size }),
      
      theme: 'light',
      setTheme: (theme) => set({ theme }),

      locale: 'vi',
      setLocale: (locale) => set({ locale }),
      
      highContrast: true,
      setHighContrast: (highContrast) => set({ highContrast }),
      
      autoScroll: true,
      setAutoScroll: (autoScroll) => set({ autoScroll }),
    }),
    {
      name: 'udl-app-storage',
      version: 3,
      migrate: (persistedState: unknown) => {
        const state = (persistedState || {}) as Partial<AppState>;
        return {
          ...state,
          locale: state.locale === 'en' ? 'en' : 'vi',
        } as AppState;
      },
    }
  )
);
