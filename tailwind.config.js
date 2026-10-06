/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./frontend/index.html",
    "./public/index.html",
    "./www/index.html",
    "./bundle.js",
    "./frontend/bundle.js",
    "./frontend/src/**/*.{js,html}",
  ],
  safelist: [
    'bg-slate-50', 'bg-slate-100', 'bg-slate-200', 'bg-slate-300', 'bg-slate-400', 'bg-slate-700', 'bg-slate-800', 'bg-slate-900', 'bg-slate-950',
    'text-slate-100', 'text-slate-200', 'text-slate-300', 'text-slate-400', 'text-slate-500', 'text-slate-600', 'text-slate-700', 'text-slate-800', 'text-slate-900',
    'border-slate-200', 'border-slate-300', 'border-slate-600', 'border-slate-700', 'border-slate-800',
    'bg-emerald-50', 'bg-emerald-100', 'bg-emerald-500', 'bg-emerald-600', 'bg-emerald-700',
    'text-emerald-300', 'text-emerald-400', 'text-emerald-500', 'text-emerald-600', 'text-emerald-700', 'text-emerald-800',
    'border-emerald-500', 'border-emerald-600', 'border-emerald-700',
    'bg-amber-50', 'bg-amber-100', 'bg-amber-500', 'bg-amber-600',
    'text-amber-500', 'text-amber-600', 'text-amber-700', 'text-amber-800',
    'border-amber-500', 'border-amber-600',
    'bg-red-50', 'bg-red-100', 'bg-red-500', 'bg-red-600',
    'text-red-500', 'text-red-600', 'text-red-700', 'text-red-800',
    'border-red-500', 'border-red-600',
    'bg-purple-50', 'bg-purple-100', 'bg-purple-500', 'bg-purple-600', 'bg-purple-950',
    'text-purple-100', 'text-purple-300', 'text-purple-400', 'text-purple-500', 'text-purple-600', 'text-purple-700',
    'border-purple-500', 'border-purple-600', 'border-purple-700',
    'bg-blue-50', 'bg-blue-100', 'bg-blue-500', 'bg-blue-600',
    'text-blue-500', 'text-blue-600', 'text-blue-700', 'text-blue-800',
    'border-blue-500', 'border-blue-600'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
