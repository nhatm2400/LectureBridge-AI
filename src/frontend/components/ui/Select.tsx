'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SelectOption {
  id: string;
  title: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Chọn một mục...',
  className,
  disabled = false,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = options.filter((opt) =>
    opt.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className={cn('relative w-full', className)} ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between gap-2 rounded-2xl border border-slate-100 bg-slate-50 px-5 py-4 text-sm font-bold text-slate-700 outline-none transition-all',
          'hover:bg-white hover:border-[#FF4F6E]/40 focus:border-[#FF4F6E]/60 focus:bg-white',
          disabled && 'opacity-50 cursor-not-allowed bg-slate-100',
          isOpen && 'border-[#FF4F6E]/60 bg-white ring-4 ring-[#FF4F6E]/5'
        )}
      >
        <span className={cn('truncate', !selectedOption && 'text-slate-400')}>
          {selectedOption ? selectedOption.title : placeholder}
        </span>
        <ChevronDown
          size={18}
          className={cn('text-slate-400 transition-transform duration-300', isOpen && 'rotate-180 text-[#FF4F6E]')}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 4, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="absolute z-50 w-full bg-white rounded-[24px] border border-slate-100 shadow-2xl overflow-hidden mt-1"
          >
            {options.length > 8 && (
              <div className="p-3 border-b border-slate-50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Tìm kiếm..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#FF4F6E]/20"
                  />
                </div>
              </div>
            )}
            
            <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-2">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => {
                      onChange(option.id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    className={cn(
                      'w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-bold transition-all text-left group',
                      value === option.id 
                        ? 'bg-[#FF4F6E] text-white' 
                        : 'text-slate-600 hover:bg-[#FF4F6E]/5 hover:text-[#FF4F6E]'
                    )}
                  >
                    <span className="truncate">{option.title}</span>
                    {value === option.id && <Check size={16} className="text-white" />}
                  </button>
                ))
              ) : (
                <div className="px-4 py-8 text-center text-xs font-bold text-slate-400">
                  Không tìm thấy kết quả
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
