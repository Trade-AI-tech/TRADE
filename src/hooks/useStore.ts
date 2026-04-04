import { create } from 'zustand';
import type { Campaign, DashboardStats, AIInsight, DateRange } from '@/types';

interface AppStore {
  // Date range
  dateRange: DateRange;
  setDateRange: (range: DateRange) => void;

  // Campaigns
  campaigns: Campaign[];
  setCampaigns: (campaigns: Campaign[]) => void;
  selectedCampaignId: string | null;
  setSelectedCampaignId: (id: string | null) => void;

  // Dashboard
  stats: DashboardStats | null;
  setStats: (stats: DashboardStats) => void;

  // AI Insights
  insights: AIInsight[];
  setInsights: (insights: AIInsight[]) => void;
  unreadInsights: number;

  // UI State
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  isAnalyzing: boolean;
  setIsAnalyzing: (v: boolean) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  dateRange: {
    start: new Date('2025-06-01'),
    end: new Date('2025-06-30'),
    label: '30 วัน',
  },
  setDateRange: (range) => set({ dateRange: range }),

  campaigns: [],
  setCampaigns: (campaigns) => set({ campaigns }),
  selectedCampaignId: null,
  setSelectedCampaignId: (id) => set({ selectedCampaignId: id }),

  stats: null,
  setStats: (stats) => set({ stats }),

  insights: [],
  setInsights: (insights) =>
    set({ insights, unreadInsights: insights.filter(i => !i.is_read).length }),
  unreadInsights: 0,

  sidebarOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  isAnalyzing: false,
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
}));
