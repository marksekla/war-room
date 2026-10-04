import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        void: "#05060b",
        panel: "rgba(14, 18, 32, 0.72)",
        neon: { cyan: "#22e4ff", violet: "#a855f7", pink: "#ff3df0", lime: "#a3ff12", amber: "#ffb020", red: "#ff4d6d" },
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(34,228,255,0.25), 0 0 24px rgba(34,228,255,0.15)",
        "glow-violet": "0 0 0 1px rgba(168,85,247,0.35), 0 0 24px rgba(168,85,247,0.2)",
      },
      keyframes: {
        scan: { "0%": { transform: "translateY(-100%)" }, "100%": { transform: "translateY(100vh)" } },
        pulseGlow: { "0%,100%": { opacity: "0.55" }, "50%": { opacity: "1" } },
      },
      animation: { scan: "scan 7s linear infinite", pulseGlow: "pulseGlow 2.4s ease-in-out infinite" },
    },
  },
  plugins: [],
};
export default config;
