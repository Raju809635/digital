/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: { extend: { colors: { orbit: { night: '#0B0B0B', lime: '#4AF77E', paper: '#FDFDFD' } }, fontFamily: { sans: ['DM Sans', 'sans-serif'], mono: ['DM Mono', 'monospace'], handwritten: ['Kalam', 'cursive'] } } },
  plugins: [],
};
