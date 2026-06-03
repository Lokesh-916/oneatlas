/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'Consolas', 'monospace'],
      },
      colors: {
        ink: { 50:'#f8f8f7', 100:'#f0efe9', 200:'#dddbd3', 300:'#c2bfb5', 400:'#9e9a8e', 500:'#7a7569', 600:'#5c5750', 700:'#3e3b36', 800:'#272420', 900:'#16140f', 950:'#0d0b08' },
        accent: { 50:'#f0f4f8', 100:'#d9e4ee', 200:'#b3c9dd', 300:'#7fa8c5', 400:'#4e88af', 500:'#2e6d96', 600:'#1f567a', 700:'#163f5c' },
      },
    },
  },
  plugins: [],
}
