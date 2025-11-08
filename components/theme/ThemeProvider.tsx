"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "normal" | "terminal";
type ColorMode = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  colorMode: ColorMode;
  setTheme: (theme: Theme) => void;
  setColorMode: (mode: ColorMode) => void;
  toggleColorMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("normal");
  const [colorMode, setColorModeState] = useState<ColorMode>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load theme and color mode from localStorage
    const savedTheme = localStorage.getItem("appTheme") as Theme;
    const savedColorMode = localStorage.getItem("colorMode") as ColorMode;
    
    if (savedTheme === "terminal" || savedTheme === "normal") {
      setThemeState(savedTheme);
    }
    
    if (savedColorMode === "dark" || savedColorMode === "light") {
      setColorModeState(savedColorMode);
    } else {
      // Check system preference
      if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
        setColorModeState("dark");
      }
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    const root = document.documentElement;
    
    // Apply color mode (dark/light)
    if (colorMode === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    
    // Apply theme (normal/terminal)
    if (theme === "terminal") {
      root.classList.add("terminal-theme");
      document.body.classList.add("font-mono");
      // Terminal theme always uses dark mode
      root.classList.add("dark");
    } else {
      root.classList.remove("terminal-theme");
      document.body.classList.remove("font-mono");
    }
    
    // Save to localStorage
    localStorage.setItem("appTheme", theme);
    localStorage.setItem("colorMode", colorMode);
  }, [theme, colorMode, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const setColorMode = (mode: ColorMode) => {
    setColorModeState(mode);
  };

  const toggleColorMode = () => {
    setColorModeState(prev => prev === "dark" ? "light" : "dark");
  };

  // Always provide context, even before mounting
  return (
    <ThemeContext.Provider value={{ theme, colorMode, setTheme, setColorMode, toggleColorMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

