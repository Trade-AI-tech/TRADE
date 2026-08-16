'use client';

import Sidebar from '@/components/ui/Sidebar';
import Header from '@/components/ui/Header';
import { useAppStore } from '@/hooks/useStore';
import { cn } from '@/lib/utils';

/*
 * โครงหน้าร่วมของทุก section — เดิม layout 7 ไฟล์ก๊อปโค้ดชุดนี้ซ้ำกันเป๊ะ
 *
 * จุดตายของบั๊กมือถือเดิมอยู่ที่ ml-64/ml-[72px] แบบไม่มีเงื่อนไข:
 * จอ 375px โดนบังคับเว้นซ้ายให้ sidebar ตลอดเวลา เนื้อหาเลยกว้างเกินจอ
 * เบราว์เซอร์มือถือจึงซูมออกทั้งหน้า (innerWidth รายงาน 523px ทั้งที่จอ 375px)
 *
 * ทางแก้: มือถือ ml-0 เต็มจอ (sidebar เป็น drawer ทับหน้าแทน ไม่กินที่ layout)
 * เดสก์ท็อป (lg+) เว้นซ้ายตาม rail เหมือนพฤติกรรมเดิมทุกอย่าง
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);

  return (
    <div className="min-h-screen">
      <Sidebar />
      <main
        className={cn(
          'transition-all duration-300',
          'ml-0',
          sidebarOpen ? 'lg:ml-64' : 'lg:ml-[72px]'
        )}
      >
        <Header />
        <div className="p-4 sm:p-6">{children}</div>
      </main>
    </div>
  );
}
