import type { Config } from 'tailwindcss';

// billingservice.mn design system — Wave-inspired: deep navy, calm teal
// primary, generous whitespace, soft cards. Matches the product wireframes
// (navy top bar, white sidebar, mint active states, teal CTAs).
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#F4F7FA',
          100: '#E8EEF5',
          200: '#C9D6E4',
          300: '#9FB4CB',
          400: '#6C89A8',
          500: '#476686',
          600: '#2F4D6B',
          700: '#1F3A55',
          800: '#132A42',
          900: '#0B1E33',
          950: '#071523',
        },
        teal: {
          50: '#EBFAF6',
          100: '#D0F3EA',
          200: '#A0E6D6',
          300: '#66D3BC',
          400: '#33BAA0',
          500: '#12A186',
          600: '#0B866F',
          700: '#0B6B5A',
          800: '#0C5548',
          900: '#0B463C',
        },
        surface: '#F7F9FB',
        line: '#E5EAF0',
        ink: '#132A42',
        muted: '#5D7186',
        gold: '#F5A623',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,30,51,0.05), 0 6px 20px -8px rgba(11,30,51,0.08)',
        lift: '0 20px 50px -16px rgba(11,30,51,0.25)',
        cta: '0 8px 24px -8px rgba(18,161,134,0.5)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.25rem',
      },
      maxWidth: {
        content: '72rem',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
