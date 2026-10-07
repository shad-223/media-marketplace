import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: { 50: "#f3f1ff", 100: "#e9e5ff", 200: "#d4cdff", 300: "#b3a5ff", 400: "#8f72ff", 500: "#6d3df5", 600: "#5b21e6", 700: "#4c17c4", 800: "#3f159f", 900: "#341380" },
        ink: { DEFAULT: "#0f1222", soft: "#4a5068", mute: "#8a90a6" },
      },
      fontFamily: { sans: ["var(--font-sans)", "system-ui", "sans-serif"] },
      boxShadow: { card: "0 1px 2px rgba(16,18,40,.05), 0 4px 16px rgba(16,18,40,.06)" },
    },
  },
  plugins: [],
} satisfies Config;
