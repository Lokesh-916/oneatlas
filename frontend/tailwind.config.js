/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans:    ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "Fira Code", "Consolas", "monospace"],
        pacifico: ["Pacifico", "cursive"],
      },
      colors: {
        canvas: {
          50:  "#f7f6f3",
          100: "#edeae3",
          200: "#d8d2c7",
          300: "#bfb5a5",
          400: "#9e9080",
          500: "#7d6e5e",
          600: "#5e5145",
          700: "#433a30",
          800: "#2a2520",
          900: "#1c1814",
          950: "#110f0c",
        },
        terra: {
          300: "#f4a87c",
          400: "#ef8a52",
          500: "#e86d2a",
          600: "#c9561a",
          700: "#a34213",
        },
        sage: {
          300: "#9ec4a0",
          400: "#74a878",
          500: "#4e8c53",
          600: "#3a6e3f",
        },
        rose: {
          300: "#e8a5a5",
          400: "#d97878",
          500: "#c45050",
          600: "#a33838",
        },
        ink: {
          300: "#9ab0cc",
          400: "#6e90b5",
          500: "#4a729e",
          600: "#355880",
        },
      },
      animation: {
        "pulse-slow": "pulse 3s ease-in-out infinite",
        "fade-up":    "fadeUp 0.35s ease-out forwards",
        "spin-slow":  "spin 2s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%":   { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
}
