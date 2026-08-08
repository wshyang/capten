/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        court: {
          bg: '#0a0e17',
          surface: '#111827',
          panel: '#182234',
          border: '#24354d',
          grid: '#1c2a3f',
          player: '#3b82f6',
          playerDark: '#1d4ed8',
          playerLight: '#93c5fd',
          ai: '#ef4444',
          aiDark: '#b91c1c',
          aiLight: '#fca5a5',
          ball: '#f59e0b',
          momentum: '#8b5cf6',
          energy: '#10b981',
          gold: '#fbbf24',
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      animation: {
        'pulse-fast': 'pulse 1s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        }
      }
    },
  },
  plugins: [],
}
