'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Zap,
  LineChart,
  Briefcase,
  Newspaper,
  Settings,
  Bell,
  ChevronLeft,
  TrendingUp,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useStore';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/signals', label: 'สัญญาณ AI', icon: Zap },
  { href: '/markets', label: 'ตลาด', icon: LineChart },
  { href: '/trades', label: 'พอร์ตเทรด', icon: Briefcase },
  { href: '/news', label: 'ข่าวสาร', icon: Newspaper },
];

const bottomItems = [
  { href: '/settings', label: 'ตั้งค่า', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, unreadSignals } = useAppStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen flex flex-col',
        'bg-surface-1/95 backdrop-blur-xl border-r border-white/5',
        'transition-all duration-300 ease-out',
        sidebarOpen ? 'w-64' : 'w-[72px]'
      )}
    >
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
        <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-accent-glow to-accent-hot flex items-center justify-center flex-shrink-0">
          <TrendingUp className="w-5 h-5 text-white" />
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-surface-1" />
        </div>
        {sidebarOpen && (
          <div className="overflow-hidden">
            <h1 className="font-display text-lg tracking-tight text-white leading-none">
              Trading AI
            </h1>
            <span className="text-[10px] font-mono text-accent-glow tracking-widest uppercase">
              Pro Signals
            </span>
          </div>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const showBadge = item.href === '/signals' && unreadSignals > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent-glow/10 text-accent-glow border border-accent-glow/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              )}
            >
              <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'drop-shadow-[0_0_6px_rgba(37,244,238,0.5)]')} />
              {sidebarOpen && <span className="flex-1">{item.label}</span>}
              {showBadge && sidebarOpen && (
                <span className="px-1.5 py-0.5 bg-accent-hot text-white text-[10px] rounded-full font-bold">
                  {unreadSignals}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/5 space-y-1">
        {bottomItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {sidebarOpen && <span>{item.label}</span>}
          </Link>
        ))}

        <button
          onClick={toggleSidebar}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-500 hover:text-white hover:bg-white/5 transition-all w-full"
        >
          <ChevronLeft
            className={cn(
              'w-5 h-5 flex-shrink-0 transition-transform duration-300',
              !sidebarOpen && 'rotate-180'
            )}
          />
          {sidebarOpen && <span>ย่อเมนู</span>}
        </button>
      </div>
    </aside>
  );
}
