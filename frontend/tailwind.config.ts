import type { Config } from "tailwindcss";

// "Premium 3D" theme: deep teal + warm cream, gold accent, tactile pressable surfaces.
// `brand` is the teal scale every page already uses, so swapping it re-themes the whole app.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f0faf7", 100: "#e3f4f0", 200: "#c4e8e0", 300: "#8fd5c6", 400: "#4fb8a6", 500: "#128c7e", 600: "#0f766e", 700: "#0d5f59", 800: "#0b4a45", 900: "#0A2A28" },
        gold: { 50: "#fbf5e6", 100: "#f7ecd2", 300: "#f0cf7a", 400: "#E2B341", 500: "#d4a12a", 600: "#b8861a", 700: "#9c7414", 800: "#8a6512" },
        ink: { DEFAULT: "#0b1f1e", soft: "#4a5b59", mute: "#5f706d" },
        cream: { DEFAULT: "#FBFAF7", sand: "#f7f3ec" },
        mint: "#5eead4",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        bangla: ["var(--font-bangla)", "sans-serif"],
      },
      boxShadow: {
        card: "inset 0 1px #ffffff, inset 0 -4px rgba(11,31,30,0.04), 0 18px 32px -24px rgba(11,31,30,0.45)",
        lift: "inset 0 1px #ffffff, 0 30px 50px -28px rgba(11,31,30,0.6)",
        "press-gold": "inset 0 1px rgba(255,255,255,0.45), 0 4px #9c7414, 0 12px 22px -10px rgba(0,0,0,0.45)",
        "press-teal": "inset 0 1px rgba(255,255,255,0.35), 0 4px #0b4a45, 0 12px 22px -10px rgba(15,118,110,0.8)",
        "press-white": "inset 0 -3px rgba(11,31,30,0.07), 0 3px #d5dedc, 0 10px 18px -12px rgba(11,31,30,0.45)",
        "press-red": "inset 0 1px rgba(255,255,255,0.3), 0 4px #9f1239, 0 12px 22px -10px rgba(159,18,57,0.6)",
        "press-ink": "inset 0 1px rgba(255,255,255,0.15), 0 4px #000000, 0 12px 22px -10px rgba(0,0,0,0.6)",
      },
    },
  },
  plugins: [],
} satisfies Config;
