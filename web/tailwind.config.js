/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        box1: "#ef4444",
        box2: "#f97316",
        box3: "#eab308",
        box4: "#84cc16",
        box5: "#22c55e",
      },
    },
  },
  plugins: [],
};
