import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        cairo: ["Cairo", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        gold: {
          DEFAULT: "hsl(var(--gold))",
          light: "hsl(var(--gold-light))",
          dark: "hsl(var(--gold-dark))",
        },
        mudrik: {
          DEFAULT: "hsl(var(--mudrik-green))",
          light: "hsl(var(--mudrik-green-light))",
          dark: "hsl(var(--mudrik-green-dark))",
        },
        cream: {
          DEFAULT: "hsl(var(--cream))",
          dark: "hsl(var(--cream-dark))",
        },
        "royal-blue": "hsl(var(--royal-blue))",
        "sky-blue": "hsl(var(--sky-blue))",
        coral: "hsl(var(--coral))",
        teal: "hsl(var(--teal))",
        rose: "hsl(var(--rose))",
        amber: "hsl(var(--amber))",
        indigo: "hsl(var(--indigo))",
        emerald: "hsl(var(--emerald))",
        violet: "hsl(var(--violet))",
        cyan: "hsl(var(--cyan))",
        teacher: {
          shell: "hsl(var(--teacher-shell))",
          surface: "hsl(var(--teacher-sidebar-surface))",
          border: "hsl(var(--teacher-sidebar-border))",
          text: "hsl(var(--teacher-sidebar-text))",
          strong: "hsl(var(--teacher-sidebar-text-strong))",
          soft: "hsl(var(--teacher-sidebar-text-soft))",
          active: "hsl(var(--teacher-sidebar-active-surface))",
          "active-border": "hsl(var(--teacher-sidebar-active-border))",
          home: "hsl(var(--teacher-sidebar-home))",
          subjects: "hsl(var(--teacher-sidebar-subjects))",
          messages: "hsl(var(--teacher-sidebar-messages))",
          wallet: "hsl(var(--teacher-sidebar-wallet))",
          profile: "hsl(var(--teacher-sidebar-profile))",
          notifications: "hsl(var(--teacher-sidebar-notifications))",
          settings: "hsl(var(--teacher-sidebar-settings))",
          logout: "hsl(var(--teacher-sidebar-logout))",
          success: "hsl(var(--teacher-sidebar-success))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulse: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        shimmer: "shimmer 2s linear infinite",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
