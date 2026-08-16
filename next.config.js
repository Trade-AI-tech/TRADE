/** @type {import('next').NextConfig} */
const nextConfig = {
  // แยกโฟลเดอร์ build ได้ด้วย env — จำเป็นเมื่อรัน dev server สองตัวพร้อมกัน
  // (ตัวจริงพอร์ต 3100 + ตัว demo พอร์ต 3200) ถ้าใช้ .next ร่วมกันมันเขียนทับกันเอง
  // จนพังทั้งคู่ด้วย "Cannot find module './NNN.js'" — เจอมาแล้วหลายรอบ
  distDir: process.env.NEXT_DIST_DIR || '.next',
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.tiktokcdn.com' },
      { protocol: 'https', hostname: '*.tiktok.com' },
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: '2mb' },
  },
};

module.exports = nextConfig;
