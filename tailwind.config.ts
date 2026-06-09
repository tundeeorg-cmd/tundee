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
        primary: {
          DEFAULT: '#2E6BE6',
          hover:   '#1E57CC',
          light:   '#EFF4FF',
          tint:    '#DDEAFF',
          dark:    '#1B3A6B',
        },
        surface: {
          light: '#F7F9FC',
          dark:  '#0D1117',
        },
        // Legacy aliases kept for backward compat
        saffron:       "#2E6BE6",
        "apple-black": "#0F1C33",
        "apple-white": "#F7F9FC",
        "apple-gray":  "#4A5568",
      },
      fontFamily: {
        display:    ["var(--font-display)", "Cormorant Garamond", "Georgia", "serif"],
        sarabun:    ["Sarabun", "system-ui", "sans-serif"],
        inter:      ["Inter", "system-ui", "sans-serif"],
        dm:         ["DM Sans", "sans-serif"],
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
