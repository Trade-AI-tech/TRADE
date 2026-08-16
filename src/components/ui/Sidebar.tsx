'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Zap,
  LineChart,
  Briefcase,
  FlaskConical,
  Newspaper,
  Settings,
  ChevronLeft,
  TrendingUp,
  X,
} from 'lucide-react';
import { useAppStore } from '@/hooks/useStore';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/signals', label: 'สัญญาณ AI', icon: Zap },
  { href: '/markets', label: 'ตลาด', icon: LineChart },
  { href: '/trades', label: 'พอร์ตเทรด', icon: Briefcase },
  { href: '/backtest', label: 'Backtest', icon: FlaskConical },
  { href: '/news', label: 'ข่าวสาร', icon: Newspaper },
];

const bottomItems = [
  { href: '/settings', label: 'ตั้งค่า', icon: Settings },
];

/* โลโก้ใช้ร่วมกันทั้ง rail และ drawer — แก้ที่เดียวเห็นผลสองที่ */
function Brand({ showText }: { showText: boolean }) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-accent-glow to-accent-hot flex items-center justify-center flex-shrink-0">
        <TrendingUp className="w-5 h-5 text-white" />
        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-surface-1" />
      </div>
      {showText && (
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
  );
}

/*
 * เนื้อเมนูชุดเดียว ใช้ทั้ง rail เดสก์ท็อปและ drawer มือถือ
 * แยกออกมาเพื่อไม่ต้องก๊อปรายการเมนูซ้ำสองก้อน — เพิ่ม/แก้เมนูแล้วเห็นผลทั้งสองโหมด
 * footer ใช้เสียบปุ่มเฉพาะโหมด (rail มีปุ่ม "ย่อเมนู" ซึ่ง drawer ไม่ต้องมี)
 */
function NavLinks({
  showLabels,
  footer,
  onNavigate,
}: {
  showLabels: boolean;
  footer?: React.ReactNode;
  /** drawer ส่ง closeMobileNav มา — ปิดทันทีที่แตะลิงก์ แม้เป็นหน้าเดิม
      (useEffect ตาม pathname ปิดไม่ได้ในเคสหน้าเดิม เพราะ pathname ไม่เปลี่ยน) */
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const unreadSignals = useAppStore((s) => s.unreadSignals);

  return (
    <>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const showBadge = item.href === '/signals' && unreadSignals > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-accent-glow/10 text-accent-glow border border-accent-glow/20'
                  : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              )}
            >
              <item.icon className={cn('w-5 h-5 flex-shrink-0', isActive && 'drop-shadow-[0_0_6px_rgba(37,244,238,0.5)]')} />
              {showLabels && <span className="flex-1">{item.label}</span>}
              {showBadge && showLabels && (
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
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            <item.icon className="w-5 h-5 flex-shrink-0" />
            {showLabels && <span>{item.label}</span>}
          </Link>
        ))}
        {footer}
      </div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarOpen, toggleSidebar, mobileNavOpen, closeMobileNav } = useAppStore();
  const drawerRef = useRef<HTMLElement>(null);

  // inert ต้องตั้งผ่าน DOM ตรง ๆ — React 18 ไม่เรนเดอร์ inert แบบ boolean prop
  // (attribute หายเงียบ ตรวจพบจากการอ่าน DOM จริง) React 19 ค่อยรองรับ
  useEffect(() => {
    const el = drawerRef.current;
    if (!el) return;
    if (mobileNavOpen) el.removeAttribute('inert');
    else el.setAttribute('inert', '');
  }, [mobileNavOpen]);

  // กดเมนูแล้วเปลี่ยนหน้า → ปิด drawer อัตโนมัติ ไม่งั้น drawer ค้างบังหน้าใหม่
  useEffect(() => {
    closeMobileNav();
  }, [pathname, closeMobileNav]);

  // ขณะ drawer เปิด: ล็อกสกรอลพื้นหลัง (ไม่งั้นบน iOS นิ้วลากแล้วหน้าข้างหลังเลื่อนตาม)
  // + ปิดด้วยปุ่ม Escape + ปิดอัตโนมัติถ้าจอถูกขยายถึง breakpoint เดสก์ท็อป
  // (เช่นหมุนแท็บเล็ต) ไม่งั้น body ค้าง overflow:hidden ทั้งที่ drawer มองไม่เห็นแล้ว
  useEffect(() => {
    if (!mobileNavOpen) return;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMobileNav();
    };
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMqChange = (e: MediaQueryListEvent) => {
      if (e.matches) closeMobileNav();
    };
    window.addEventListener('keydown', onKeyDown);
    mq.addEventListener('change', onMqChange);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
      mq.removeEventListener('change', onMqChange);
    };
  }, [mobileNavOpen, closeMobileNav]);

  return (
    <>
      {/* ===== เดสก์ท็อป (lg+): rail แบบ fixed เหมือนเดิมทุกอย่าง — มือถือไม่เห็นเลย ===== */}
      <aside
        className={cn(
          'hidden lg:flex fixed left-0 top-0 z-40 h-screen flex-col',
          'bg-surface-1/95 backdrop-blur-xl border-r border-white/5',
          'transition-all duration-300 ease-out',
          sidebarOpen ? 'w-64' : 'w-[72px]'
        )}
      >
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/5">
          <Brand showText={sidebarOpen} />
        </div>
        <NavLinks
          showLabels={sidebarOpen}
          footer={
            <button
              onClick={toggleSidebar}
              aria-label={sidebarOpen ? 'ย่อเมนู' : 'ขยายเมนู'}
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
          }
        />
      </aside>

      {/* ===== มือถือ: backdrop ดำโปร่ง กดแล้วปิด drawer ===== */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/60 lg:hidden transition-opacity duration-300',
          mobileNavOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={closeMobileNav}
        aria-hidden="true"
      />

      {/* ===== มือถือ: drawer ทับจากซ้าย — ไม่กินที่ layout เพราะจอแคบไม่มีที่ให้เสีย ===== */}
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="เมนูหลัก"
        className={cn(
          'fixed left-0 top-0 z-50 h-full w-[280px] max-w-[85vw] flex flex-col lg:hidden',
          'bg-surface-1/95 backdrop-blur-xl border-r border-white/5',
          'transition-transform duration-300 ease-out',
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* paddingTop กันหัว drawer มุดใต้ notch/status bar ของ iPhone */}
        <div
          className="flex items-center justify-between gap-3 px-5 min-h-[4rem] border-b border-white/5 flex-shrink-0"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <Brand showText />
          <button
            onClick={closeMobileNav}
            aria-label="ปิดเมนู"
            className="w-10 h-10 flex items-center justify-center rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <NavLinks showLabels onNavigate={closeMobileNav} />
      </aside>
    </>
  );
}
