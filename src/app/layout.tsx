import type { Metadata, Viewport } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Trading AI — Pro Signals',
  description: 'ระบบสัญญาณเทรดทอง Forex หุ้นไทยและหุ้นต่างประเทศ วิเคราะห์เทคนิคอัตโนมัติ พร้อมแจ้งเตือนบนเครื่อง',
  // manifest จำเป็นต่อ "เพิ่มไปยังหน้าจอโฮม" บน iOS — ซึ่งเป็นเงื่อนไขบังคับก่อนใช้ Web Push
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Trading AI',
  },
};

export const viewport: Viewport = {
  // ค่านี้คือสีของธีมสว่างซึ่งเป็นค่าเริ่มต้นของระบบ — ถ้าผู้ใช้เลือกธีมมืดไว้
  // สคริปต์ด้านล่างกับ setTheme ใน useStore จะแก้ meta ตัวนี้เป็น #0f1520 ให้เอง
  themeColor: '#f7f8fa',
  width: 'device-width',
  initialScale: 1,
  // ให้เนื้อหากินพื้นที่ถึงขอบจอ iPhone (แถบ notch) — ฝั่ง component กันขอบด้วย safe-area-inset เอง
  viewportFit: 'cover',
};

/**
 * สคริปต์เติมคลาส 'dark' ให้ <html> ก่อนเบราว์เซอร์วาดเฟรมแรก
 *
 * ทำใน useEffect อย่างเดียวไม่ได้: effect ทำงานหลังวาดครั้งแรกเสมอ
 * ผู้ใช้ที่เลือกธีมมืดไว้จะเห็นจอขาวแวบหนึ่งทุกครั้งที่โหลดหน้า
 * และ HTML ที่ server ส่งมา (ไม่มีคลาส dark) จะไม่ตรงกับที่ client คิดว่าควรเป็น
 *
 * ครอบ try/catch เพราะ localStorage ถูกบล็อกได้จริง (Safari โหมดส่วนตัว, ปิดคุกกี้ของเว็บ)
 * อ่านไม่ได้ = ตกไปใช้ธีมสว่างซึ่งเป็นค่าเริ่มต้น ไม่ใช่หน้าพัง
 *
 * คีย์ 'trading-ai-theme' ต้องตรงกับ THEME_STORAGE_KEY ใน src/hooks/useStore.ts
 * (เขียนซ้ำตรงนี้เพราะ layout เป็น server component จะ import โมดูลของ zustand เข้ามาไม่ได้)
 */
const themeInitScript = `
(function () {
  try {
    var dark = localStorage.getItem('trading-ai-theme') === 'dark';
    if (dark) document.documentElement.classList.add('dark');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0f1520' : '#f7f8fa');
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: สคริปต์ข้างบนแก้ class ของ <html> ก่อน React จะ hydrate
    // ถ้าไม่ปิดคำเตือน React จะรายงานว่า markup ไม่ตรงกันทั้งที่เป็นความตั้งใจ
    <html lang="th" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="noise-bg min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
