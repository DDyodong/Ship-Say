/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class', 
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: '#050811', panel: '#0b101a', edge: '#1a2336', edgeLight: '#263350',
        cyan: '#00d2ff', emerald: '#00e676', amber: '#ffb300', danger: '#ff3b5c',
        brand: '#FF5C00', dark: '#0A0C10',   // ← 이 줄 추가

      }
    }
  },
  plugins: [],
}