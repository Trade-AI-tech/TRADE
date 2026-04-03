import type { Metadata } from 'next';
import '@/styles/globals.css';

export const metadata: Metadata = {
  title: 'TikTok Ads AI Manager',
  description: 'ระบบจัดการโฆษณา TikTok อัจฉริยะ พร้อม AI วิเคราะห์งบประมาณและประสิทธิภาพ',
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
