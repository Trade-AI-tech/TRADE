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
  selectedSymbol: string | null;
  setSelectedSymbol: (s: string | null) => void;
  unreadSignals: number;
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
  selectedSymbol: null,
  setSelectedSymbol: (s) => set({ selectedSymbol: s }),
  unreadSignals: 0,
}));
