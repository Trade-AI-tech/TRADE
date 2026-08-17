'use client';

import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore, type ThemeMode } from '@/hooks/useStore';
import { cn } from '@/lib/utils';

const OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'สว่าง', icon: Sun },
  { value: 'dark', label: 'มืด', icon: Moon },
];

/**
 * สวิตช์สลับธีมสว่าง/มืด — จำค่าไว้ใน localStorage ของเครื่องนี้
 *
 * ปุ่มเป็นสองช่องให้เลือกแทนสวิตช์เปิด/ปิด เพราะสวิตช์ไม่ได้บอกว่า "เปิด" แปลว่าธีมไหน
 *
 * เรื่อง hydration: ธีมจริงอยู่ใน localStorage ซึ่ง server อ่านไม่ได้ ตอน render แรก
 * จึงต้องวาดให้ตรงกับที่ server ส่งมาเป๊ะ ๆ ก่อน (store ตั้งต้นเป็น 'light' เหมือนกัน)
 * แล้วค่อยดึงค่าจริงเข้ามาหลัง mount — ระหว่างนั้นซ่อนไว้ด้วย opacity-0 ไม่ให้ผู้ใช้
 * ธีมมืดเห็นแวบว่า "สว่าง" ถูกเลือกอยู่ (ใช้ opacity แทนการไม่ render เพื่อให้กล่องกว้างเท่าเดิม
 * หน้าจะได้ไม่กระตุกตอนของจริงโผล่)
 */
export default function ThemeToggle() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const syncThemeFromDocument = useAppStore((s) => s.syncThemeFromDocument);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    syncThemeFromDocument();
    setMounted(true);
  }, [syncThemeFromDocument]);

  return (
    <div
      role="group"
      aria-label="เลือกธีมของแอป"
      aria-hidden={!mounted}
      className={cn(
        'inline-flex items-center gap-1 p-1 rounded-xl bg-surface-2 border border-white/10',
        !mounted && 'opacity-0 pointer-events-none'
      )}
    >
      {OPTIONS.map((opt) => {
        const active = theme === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTheme(opt.value)}
            aria-pressed={active}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              active
                ? 'bg-surface-1 text-accent-glow shadow-sm'
                : 'text-gray-400 hover:text-white'
            )}
          >
            <opt.icon className="w-3.5 h-3.5" />
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
