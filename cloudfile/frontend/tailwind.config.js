import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // 颜色 token 从 CSS 变量读，配合 prefers-color-scheme 自适应深浅
        // 变量值是 "R G B" triplet（无逗号），<alpha-value> 占位由 Tailwind 替换
        bg:     'rgb(var(--bg) / <alpha-value>)',
        fg:     'rgb(var(--fg) / <alpha-value>)',
        muted:  'rgb(var(--muted) / <alpha-value>)',
        accent: 'rgb(var(--accent) / <alpha-value>)',
        border: 'rgb(var(--border) / <alpha-value>)',
        card:   'rgb(var(--card) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', '"Noto Sans SC"', 'sans-serif'],
        serif: ['Newsreader', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      maxWidth: {
        'reading': '46rem',
      },
    },
  },
  plugins: [typography],
};
