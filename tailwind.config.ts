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
        saffron: "#F0A500",
        "apple-black": "#1D1D1F",
        "apple-white": "#F5F5F7",
        "apple-gray": "#6E6E73",
      },
      fontFamily: {
        sarabun: ["Sarabun", "sans-serif"],
        dm: ["DM Sans", "sans-serif"],
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
