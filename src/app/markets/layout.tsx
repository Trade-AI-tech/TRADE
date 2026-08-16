import AppShell from '@/components/ui/AppShell';

// โครงหน้าทั้งหมดอยู่ที่ AppShell ที่เดียว — เดิมโค้ดชุดเดียวกันถูกก๊อปซ้ำทั้ง 7 layout
export default function MarketsLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
