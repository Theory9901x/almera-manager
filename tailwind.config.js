/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{js,ts,jsx,tsx}', './index.html'],
  theme: {
    extend: {
      colors: {
        almera: {
          50:  '#f0f4ff',
          100: '#dbe4ff',
          500: '#4c6ef5',
          600: '#3b5bdb',
          700: '#2f4ac2',
          900: '#1a2c8a'
        }
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] }
    }
  },
  plugins: []
}
