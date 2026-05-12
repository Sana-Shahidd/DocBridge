// ─────────────────────────────────────────────────────────────────────────────
// Tailwind CSS Configuration – MediShield AI
// Extends the default palette with MediShield's primary blue brand colors.
// ─────────────────────────────────────────────────────────────────────────────
/** @type {import('tailwindcss').Config} */
export default {
  // Tell Tailwind which files to scan so unused classes are tree-shaken
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],

  theme: {
    extend: {
      colors: {
        // MediShield AI brand palette – trust-inspiring medical blue
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
      },
      fontFamily: {
        // Inter gives a clean, legible appearance suitable for a medical product
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      // Clamp utility for truncating bio text inside profile cards
      lineClamp: {
        3: '3',
      },
    },
  },

  plugins: [],
};
