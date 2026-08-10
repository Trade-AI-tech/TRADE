import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'Trading AI — Pro Signals',
  description: 'ระบบสัญญาณเทรดทอง Forex หุ้นไทยและหุ้นต่างประเทศ วิเคราะห์เทคนิคอัตโนมัติ พร้อมแจ้งเตือนผ่าน Telegram',
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
