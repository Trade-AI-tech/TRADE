/** @type {import('tailwindcss').Config} */

/**
 * สีทุกตัวชี้ไปที่ CSS variable ใน src/styles/globals.css แทนที่จะฮาร์ดโค้ดค่า
 * เพื่อให้คลาสเดิมที่กระจายอยู่ทั้งแอป (bg-surface-1, text-accent-glow, ...)
 * เปลี่ยนตามธีมเองโดยไม่ต้องไล่แก้ทีละหน้า
 *
 * รูปแบบ rgb(var(--x) / <alpha-value>) จำเป็น ไม่ใช่ var(--x) เฉย ๆ:
 * Tailwind แทนที่ <alpha-value> ด้วยเลขจากคลาสที่มี /opacity (เช่น bg-surface-1/95)
 * ถ้าเขียนแค่ var(--x) คลาสที่มี /opacity ทั้งหมดจะไม่ถูกสร้างขึ้นเลยแบบเงียบ ๆ
 * — นั่นคือเหตุผลที่ตัวแปรฝั่ง CSS เก็บเป็นช่อง RGB ("18 19 26") ไม่ใช่ hex
 */
const themed = (name) => `rgb(var(${name}) / <alpha-value>)`;

module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  // ผูกธีมมืดกับคลาส .dark บน <html> ที่สวิตช์ธีมเป็นคนเติม
  // ค่าเริ่มต้นของ Tailwind คือ 'media' ซึ่งจะไปตามการตั้งค่าของเครื่อง ไม่ใช่ที่ผู้ใช้เลือกในแอป
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf9',
          100: '#ccfbee',
          200: '#99f6dc',
          300: '#5eeac8',
          400: '#2dd4ad',
          500: '#14b896',
          600: '#0d9479',
          700: '#0f7663',
          800: '#115e50',
          900: '#134d43',
          950: '#042f29',
        },
        // สีแบรนด์คงที่ ไม่ขึ้นกับธีม (ใช้อ้างอิงสีจริงของ TikTok)
        tiktok: {
          red: '#FE2C55',
          cyan: '#25F4EE',
          dark: '#161823',
          gray: '#2F3239',
        },
        surface: {
          0: themed('--surface-0'),
          1: themed('--surface-1'),
          2: themed('--surface-2'),
          3: themed('--surface-3'),
          4: themed('--surface-4'),
        },
        accent: {
          glow: themed('--accent-glow'),
          hot: themed('--accent-hot'),
          gold: themed('--accent-gold'),
          purple: themed('--accent-purple'),
        },
        // สีที่สื่อความหมายทางการเงิน — ใช้ text-up / text-down แทนการเลือกเฉด emerald/red เอง
        // จะได้ไม่ต้องจำว่าธีมไหนต้องใช้เฉดเข้มแค่ไหนถึงจะอ่านออก
        up: themed('--up'),
        down: themed('--down'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui'],
        body: ['var(--font-body)', 'system-ui'],
        mono: ['var(--font-mono)', 'monospace'],
      },
      animation: {
        'glow-pulse': 'glow-pulse 2s ease-in-out infinite',
        'slide-up': 'slide-up 0.5s ease-out',
        'fade-in': 'fade-in 0.3s ease-out',
        'counter': 'counter 1.5s ease-out forwards',
      },
      keyframes: {
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px rgb(var(--accent-glow) / 0.15)' },
          '50%': { boxShadow: '0 0 40px rgb(var(--accent-glow) / 0.3)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'mesh-gradient':
          'linear-gradient(135deg, rgb(var(--surface-0)) 0%, rgb(var(--surface-1)) 50%, #0d9479 150%)',
      },
    },

    /**
     * ตัวหนังสือ: แทนที่ค่าเดิมของ Tailwind เฉพาะเฉดที่โค้ดใช้จริง
     *
     * ทั้งแอปเขียน text-white / text-gray-400 / text-gray-500 ไว้เกือบสองร้อยจุด
     * ซึ่งบนพื้นสว่างคือขาวบนขาว (อ่านไม่ออกเลย) และเทาอ่อนที่ตกเกณฑ์ AA
     * แทนที่จะไล่แก้ทีละจุด จึงย้ายความหมายของเฉดพวกนี้มาผูกกับตัวแปรธีม
     *
     * ค่าฝั่งธีมมืดถูกตั้งให้ตรงกับค่าเดิมของ Tailwind ทุกตัว (ดู globals.css)
     * ธีมมืดจึงได้สีเดิมเป๊ะ ไม่เพี้ยนแม้แต่เฉดเดียว ส่วนธีมสว่างได้เฉดเข้มที่อ่านออก
     *
     * หมายเหตุ: ใช้ theme (ไม่ใช่ extend) เพื่อคุมลำดับการ merge ให้แน่นอน
     * โดยคัดลอกพฤติกรรมเดิมมาครบ — textColor ปกติคือสำเนาของ colors ทั้งชุด
     */
    textColor: ({ theme }) => ({
      ...theme('colors'),
      white: themed('--text-primary'),
      gray: {
        ...theme('colors.gray'),
        300: themed('--text-strong'),
        400: themed('--text-secondary'),
        500: themed('--text-muted'),
        600: themed('--text-dim'),
        700: themed('--text-faint'),
      },
    }),

    /**
     * เส้นขอบ: border-white/5 และ /10 ถูกใช้เป็นเส้นคั่นจาง ๆ ทั้งแอป (~39 จุด)
     * บนพื้นสว่างเส้นขาวจะหายไปสนิท จึงพลิกฐานสีเป็น --invert
     * (ธีมมืด = ขาว ค่าเดิมเป๊ะ / ธีมสว่าง = ดำจาง) ตัวเลข opacity ท้ายคลาสยังทำงานเหมือนเดิม
     * DEFAULT คงไว้ตามเดิมเพราะ preflight ใช้ค่านี้กับทุก element ที่ใส่ border ลอย ๆ
     */
    borderColor: ({ theme }) => ({
      ...theme('colors'),
      DEFAULT: theme('colors.gray.200', 'currentColor'),
      white: themed('--invert'),
    }),

    /**
     * พื้นหลัง: bg-white/5, /10, /[0.02] ถูกใช้เป็น "พื้นจาง ๆ ทับพื้นการ์ด"
     * (พื้น hover, ชิป, แถบแยกหมวด) ซึ่งบนพื้นสว่างคือขาวทับขาว = หายไปสนิท
     * จึงพลิกฐานสีเป็น --invert เหมือนที่ทำกับ borderColor
     * ธีมมืด --invert = 255 255 255 → rgb(255 255 255 / 0.05) ตรงกับ Tailwind เดิมทุกตัวเลข
     *
     * ⚠ ผลข้างเคียง: คลาส bg-white แบบทึบ (ไม่มี /opacity) ก็โดนพลิกไปด้วย
     * จะกลายเป็นดำสนิทบนธีมสว่าง ทั้งที่จุดพวกนั้น (ลูกบิดสวิตช์) ต้องการขาวจริงทั้งสองธีม
     * แก้ด้วยการทับ .bg-white กลับเป็น #ffffff ใน @layer utilities ที่ globals.css
     * — ทับได้เฉพาะคลาสทึบเพราะ Tailwind สร้าง .bg-white กับ .bg-white\/5 เป็นคนละ selector
     */
    backgroundColor: ({ theme }) => ({
      ...theme('colors'),
      white: themed('--invert'),
    }),
  },
  plugins: [],
};
