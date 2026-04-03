/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
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
        tiktok: {
          red: '#FE2C55',
          cyan: '#25F4EE',
          dark: '#161823',
          gray: '#2F3239',
        },
        surface: {
          0: '#0a0b0f',
          1: '#12131a',
          2: '#1a1b24',
          3: '#22232e',
          4: '#2a2b38',
        },
        accent: {
          glow: '#25F4EE',
          hot: '#FE2C55',
          gold: '#FFD700',
          purple: '#7B61FF',
        },
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(37, 244, 238, 0.15)' },
          '50%': { boxShadow: '0 0 40px rgba(37, 244, 238, 0.3)' },
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
        'mesh-gradient': 'linear-gradient(135deg, #0a0b0f 0%, #161823 50%, #0d9479 150%)',
      },
    },
  },
  plugins: [],
};
