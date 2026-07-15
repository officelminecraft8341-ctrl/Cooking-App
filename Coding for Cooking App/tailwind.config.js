/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ember: '#FF7A18',
        emerald: '#2F9E7A',
      },
      boxShadow: {
        soft: '0 20px 60px rgba(15, 23, 42, 0.16)',
      },
    },
  },
  plugins: [],
};
