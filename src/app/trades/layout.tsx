'use client';

import Sidebar from '@/components/ui/Sidebar';
import Header from '@/components/ui/Header';
import { useAppStore } from '@/hooks/useStore';
import { cn } from '@/lib/utils';

export default function TradesLayout({ children }: { children: React.ReactNode }) {
  const { sidebarOpen } = useAppStore();
  return (
    <div className="min-h-screen">
      <Sidebar />
      <main className={cn('transition-all duration-300', sidebarOpen ? 'ml-64' : 'ml-[72px]')}>
        <Header />
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
