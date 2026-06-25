/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'background': '#FFFFFF',
        'surface': '#F8F9FA',
        'border': '#DADCE0',
        'text-primary': '#202124',
        'text-secondary': '#5F6368',
        'google-blue': '#4285F4',
        'google-red': '#EA4335',
        'google-yellow': '#FBBC05',
        'google-green': '#34A853',
      },
      fontFamily: {
        'display': ['var(--font-display)'],
        'body': ['var(--font-body)'],
      },
      maxHeight: {
        'timeline': '500px',
        'drawer': '400px',
      },
    },
  },
  plugins: [],
};