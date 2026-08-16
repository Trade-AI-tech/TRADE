import { create } from 'zustand';
import type { Signal, Trade, MarketPrice } from '@/types';

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

  // นับขึ้นทีละหนึ่งเมื่อข้อมูลฝั่ง server เปลี่ยน (สแกนเสร็จ, เพิ่ม/ลบ symbol, ปิดออเดอร์)
  // hooks ใน useData ใช้ค่านี้เป็น dependency เพื่อ refetch
  refreshKey: number;
  refresh: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  prices: [],
  setPrices: (prices) => set({ prices }),
  signals: [],
  setSignals: (signals) => set({
    signals,
    unreadSignals: signals.filter(s => s.status === 'active').length,
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
  refreshKey: 0,
  refresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
