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
  themeColor: '#0f1520',
  width: 'device-width',
  initialScale: 1,
  // ให้เนื้อหากินพื้นที่ถึงขอบจอ iPhone (แถบ notch) — ฝั่ง component กันขอบด้วย safe-area-inset เอง
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className="dark">
      <body className="noise-bg min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
