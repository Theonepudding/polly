import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // Polly brand
        'p-bg':        '#0a0a10',
        'p-surface':   '#13131c',
        'p-surface-2': '#1c1c2a',
        'p-border':    '#2a2a3e',
        'p-border-2':  '#3a3a52',
        // Primary — indigo/violet
        'p-primary':   '#818cf8',
        'p-primary-d': '#6366f1',
        'p-primary-b': 'rgba(99,102,241,0.15)',
        // Accent — cyan
        'p-accent':    '#22d3ee',
        'p-accent-b':  'rgba(34,211,238,0.12)',
        // Text
        'p-text':      '#f0f0ff',
        'p-muted':     '#8888aa',
        'p-subtle':    '#44445a',
        // States
        'p-success':   '#4ade80',
        'p-warning':   '#fbbf24',
        'p-danger':    '#f87171',
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'system-ui', 'sans-serif'],
        display: ['var(--font-plus-jakarta)', 'var(--font-inter)', 'sans-serif'],
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%':   { boxShadow: '0 0 0 0 rgba(99,102,241,0.4)' },
          '70%':  { boxShadow: '0 0 0 8px rgba(99,102,241,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(99,102,241,0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition:  '200% 0' },
        },
      },
      animation: {
        'fade-in':    'fade-in 0.3s ease-out',
        'slide-up':   'slide-up 0.4s ease-out',
        'pulse-ring': 'pulse-ring 1.5s ease-out infinite',
        shimmer:      'shimmer 2s linear infinite',
      },
    },
  },
  plugins: [],
}

export default config
