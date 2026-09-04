import { create } from 'zustand';
import type { Signal, Trade, MarketPrice } from '@/types';
import { isLiveSignalRow } from '@/lib/signal-flips';

export type ThemeMode = 'light' | 'dark';

/** คีย์ใน localStorage — ต้องตรงกับสคริปต์กันจอกระพริบใน src/app/layout.tsx */
export const THEME_STORAGE_KEY = 'trading-ai-theme';

/**
 * สีแถบสถานะของเบราว์เซอร์/PWA แยกตามธีม
 * สว่างใช้ #f7f8fa ตรงกับ --surface-0 ส่วนมืดคงค่า #0f1520 เดิมของแอปไว้
 * (ไม่ใช่ #0a0b0f ของ --surface-0 — ค่านี้ใช้มาตั้งแต่ก่อนมีระบบธีม ไม่มีเหตุให้เปลี่ยน)
 */
const THEME_COLOR: Record<ThemeMode, string> = {
  light: '#f7f8fa',
  dark: '#0f1520',
};

/**
 * ลงมือเปลี่ยนธีมที่ DOM จริง
 * แหล่งความจริงของธีมคือคลาส 'dark' บน <html> เพราะ CSS ทั้งหมดผูกกับมัน
 * (state ใน store เป็นแค่ตัวสะท้อนไว้ให้ React วาด UI ตาม)
 */
function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  // ต้องแก้ meta ด้วย ไม่งั้นแถบสถานะบนมือถือจะคาสีของธีมเดิมค้างอยู่
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}

interface AppStore {
  // Market data
  prices: MarketPrice[];
  setPrices: (prices: MarketPrice[]) => void;

  // Signals
  signals: Signal[];
  setSignals: (signals: Signal[]) => void;

  // Trades
  trades: Trade[];
  setTrades: (trades: Trade[]) => void;

  // UI
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  // เมนูมือถือ (drawer) — แยกจาก sidebarOpen ของเดสก์ท็อปโดยเจตนา:
  // sidebarOpen คือ "ย่อ/ขยาย rail" ส่วนนี้คือ "เปิด/ปิด drawer ทับจอ" คนละความหมายกัน
  mobileNavOpen: boolean;
  toggleMobileNav: () => void;
  closeMobileNav: () => void;

  selectedSymbol: string | null;
  setSelectedSymbol: (s: string | null) => void;
  unreadSignals: number;

  // ธีมของแอป — ค่าเริ่มต้น 'light' ต้องตรงกับที่ server render ออกมา (ยังไม่มีคลาส dark)
  // ไม่งั้น render แรกฝั่ง client จะไม่ตรงกับ HTML ที่ได้มา = hydration mismatch
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  // ดึงธีมจริงจาก <html> เข้ามาเก็บใน store — ต้องเรียกหลัง mount เท่านั้น
  syncThemeFromDocument: () => void;

  // นับขึ้นทีละหนึ่งเมื่อข้อมูลฝั่ง server เปลี่ยน (สแกนเสร็จ, เพิ่ม/ลบ symbol, ปิดออเดอร์)
  // hooks ใน useData ใช้ค่านี้เป็น dependency เพื่อ refetch
  refreshKey: number;
  refresh: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  prices: [],
  setPrices: (prices) => set({ prices }),
  signals: [],
  // จุดแดงบนเมนูต้องนับเฉพาะใบที่ยังเป็นโอกาสเปิดอยู่จริง — เดิมนับด้วย status === 'active'
  // อย่างเดียว จึงค้างตัวเลขของใบที่ตัวเก็บผลปิดบัญชีไปแล้ว (ดู isLiveSignalRow)
  setSignals: (signals) => set({
    signals,
    unreadSignals: signals.filter(isLiveSignalRow).length,
  }),
  trades: [],
  setTrades: (trades) => set({ trades }),
  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  mobileNavOpen: false,
  toggleMobileNav: () => set((s) => ({ mobileNavOpen: !s.mobileNavOpen })),
  closeMobileNav: () => set({ mobileNavOpen: false }),
  selectedSymbol: null,
  setSelectedSymbol: (s) => set({ selectedSymbol: s }),
  unreadSignals: 0,
  theme: 'light',
  setTheme: (theme) => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // เขียนไม่ได้ (โหมดส่วนตัว/ปิดคุกกี้) → รอบนี้ยังเปลี่ยนธีมได้ แค่เปิดใหม่แล้วจำไม่ได้
    }
    set({ theme });
  },
  syncThemeFromDocument: () => {
    if (typeof document === 'undefined') return;
    set({ theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light' });
  },
  refreshKey: 0,
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
