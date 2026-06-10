import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#07111F',
          900: '#0A2342',
          800: '#0D1F35',
          700: '#1A2E4A',
          600: '#1B3A6B',
          500: '#2E5FA3',
          400: '#4A7FD4',
          100: '#EBF2FF',
          50:  '#F5F7FA',
        },
        // keep legacy aliases for backward compat
        primary: {
          DEFAULT: '#1B3A6B',
          hover:   '#2E5FA3',
          light:   '#EBF2FF',
          tint:    '#EBF2FF',
          dark:    '#0A2342',
        },
      },
      fontFamily: {
        lato:    ['var(--font-lato)', 'Lato', 'system-ui', 'sans-serif'],
        sarabun: ['Sarabun', 'system-ui', 'sans-serif'],
        // legacy aliases
        display: ['var(--font-lato)', 'Lato', 'system-ui', 'sans-serif'],
        inter:   ['var(--font-lato)', 'Lato', 'system-ui', 'sans-serif'],
        dm:      ['var(--font-lato)', 'Lato', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        content: "1200px",
      },
      borderRadius: {
        card: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
