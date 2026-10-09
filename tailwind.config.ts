import type { Config } from "tailwindcss";

// Light and dark themes in the clean dashboard style. Every color reads a CSS variable set in
// app/theme.css, so switching <html data-theme="dark"> recolors the whole app. The components were
// first written for a dark look, so the shared names are remapped per theme: "slate-100" is the main
// text color, "slate-500" muted text, "white/10" subtle lines, "black/30" subtle fills, and the accent
// families use shades that read well on that theme's background. Semantic tokens (bg-card, text-ink,
// border-line, ...) cover the newer parts.
const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        white: v("--c-white"),
        black: v("--c-black"),
        slate: { 50: v("--c-slate-50"), 100: v("--c-slate-100"), 200: v("--c-slate-200"), 300: v("--c-slate-300"), 400: v("--c-slate-400"), 500: v("--c-slate-500"), 600: v("--c-slate-600"), 700: v("--c-slate-700"), 800: v("--c-slate-800"), 900: v("--c-slate-900"), 950: v("--c-slate-950") },
        cyan: { 50: v("--c-cyan-50"), 100: v("--c-cyan-100"), 200: v("--c-cyan-200"), 300: v("--c-cyan-300"), 400: v("--c-cyan-400"), 500: v("--c-cyan-500"), 600: v("--c-cyan-600"), 700: v("--c-cyan-700"), 800: v("--c-cyan-800"), 900: v("--c-cyan-900") },
        lime: { 50: v("--c-lime-50"), 100: v("--c-lime-100"), 200: v("--c-lime-200"), 300: v("--c-lime-300"), 400: v("--c-lime-400"), 500: v("--c-lime-500"), 600: v("--c-lime-600"), 700: v("--c-lime-700"), 800: v("--c-lime-800"), 900: v("--c-lime-900") },
        emerald: { 50: v("--c-emerald-50"), 100: v("--c-emerald-100"), 200: v("--c-emerald-200"), 300: v("--c-emerald-300"), 400: v("--c-emerald-400"), 500: v("--c-emerald-500"), 600: v("--c-emerald-600"), 700: v("--c-emerald-700"), 800: v("--c-emerald-800"), 900: v("--c-emerald-900") },
        rose: { 50: v("--c-rose-50"), 100: v("--c-rose-100"), 200: v("--c-rose-200"), 300: v("--c-rose-300"), 400: v("--c-rose-400"), 500: v("--c-rose-500"), 600: v("--c-rose-600"), 700: v("--c-rose-700"), 800: v("--c-rose-800"), 900: v("--c-rose-900") },
        amber: { 50: v("--c-amber-50"), 100: v("--c-amber-100"), 200: v("--c-amber-200"), 300: v("--c-amber-300"), 400: v("--c-amber-400"), 500: v("--c-amber-500"), 600: v("--c-amber-600"), 700: v("--c-amber-700"), 800: v("--c-amber-800"), 900: v("--c-amber-900") },
        fuchsia: { 50: v("--c-fuchsia-50"), 100: v("--c-fuchsia-100"), 200: v("--c-fuchsia-200"), 300: v("--c-fuchsia-300"), 400: v("--c-fuchsia-400"), 500: v("--c-fuchsia-500"), 600: v("--c-fuchsia-600"), 700: v("--c-fuchsia-700"), 800: v("--c-fuchsia-800"), 900: v("--c-fuchsia-900") },
        violet: { 50: v("--c-violet-50"), 100: v("--c-violet-100"), 200: v("--c-violet-200"), 300: v("--c-violet-300"), 400: v("--c-violet-400"), 500: v("--c-violet-500"), 600: v("--c-violet-600"), 700: v("--c-violet-700"), 800: v("--c-violet-800"), 900: v("--c-violet-900") },
        page: v("--t-page"),
        card: v("--t-card"),
        sunken: v("--t-sunken"),
        hover: v("--t-hover"),
        line: v("--t-line"),
        linesoft: v("--t-linesoft"),
        linestrong: v("--t-linestrong"),
        ink: v("--t-ink"),
        ink2: v("--t-ink2"),
        muted: v("--t-muted"),
        faint: v("--t-faint"),
        nav: v("--t-nav"),
        navhover: v("--t-navhover"),
        navactive: v("--t-navactive"),
        navtext: v("--t-navtext"),
        accent: v("--t-accent"),
        accentstrong: v("--t-accentstrong"),
        accenttint: v("--t-accenttint"),
        accenttint2: v("--t-accenttint2"),
        good: v("--t-good"),
        goodtint: v("--t-goodtint"),
        warn: v("--t-warn"),
        warntint: v("--t-warntint"),
        bad: v("--t-bad"),
        purple: v("--t-purple"),
        purplestrong: v("--t-purplestrong"),
        purpletint: v("--t-purpletint"),
        purpletint2: v("--t-purpletint2"),
        purpleline: v("--t-purpleline"),
        track: v("--t-track"),
        thumb: v("--t-thumb"),
        overlay: "var(--overlay)",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 3px rgb(var(--t-accent) / 0.18)",
        "glow-violet": "0 0 0 3px rgb(var(--t-purple) / 0.18)",
        card: "var(--shadow-card)",
      },
      keyframes: { pulseGlow: { "0%,100%": { opacity: "0.6" }, "50%": { opacity: "1" } } },
      animation: { pulseGlow: "pulseGlow 2.4s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
