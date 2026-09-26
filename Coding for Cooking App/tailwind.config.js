/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ember: 'rgb(var(--accent-rgb) / <alpha-value>)',
        'accent-strong': 'rgb(var(--accent-strong-rgb) / <alpha-value>)',
        'accent-ink': 'rgb(var(--accent-ink-rgb) / <alpha-value>)',
        emerald: '#2F9E7A',
      },
      boxShadow: {
        soft: '0 20px 60px rgba(15, 23, 42, 0.16)',
        glass: '0 24px 70px rgba(15, 23, 42, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.55)',
      },
    },
  },
  plugins: [],
};
