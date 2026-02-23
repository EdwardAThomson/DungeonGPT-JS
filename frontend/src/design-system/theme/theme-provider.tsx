/**
 * ThemeProvider — data-theme attribute switching between light-fantasy and dark-fantasy.
 *
 * Ported from src/contexts/SettingsContext.js theme handling.
 * Original logic:
 *   - Default theme: 'dark-fantasy'
 *   - Persisted to localStorage under key 'theme'
 *   - Applied via data-theme attribute on <html> element
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const THEME_STORAGE_KEY = "theme";
const LIGHT_FANTASY = "light-fantasy" as const;
const DARK_FANTASY = "dark-fantasy" as const;

type Theme = typeof LIGHT_FANTASY | typeof DARK_FANTASY;

interface ThemeContextValue {
  readonly theme: Theme;
  readonly setTheme: (theme: Theme) => void;
  readonly toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getStoredTheme(): Theme {
  try {
    const stored = globalThis.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === LIGHT_FANTASY || stored === DARK_FANTASY) {
      return stored;
    }
  } catch {
    // localStorage unavailable (SSR, privacy mode, etc.)
  }
  return DARK_FANTASY;
}

interface ThemeProviderProps {
  readonly children: React.ReactNode;
  readonly defaultTheme?: Theme;
}

export function ThemeProvider({ children, defaultTheme }: ThemeProviderProps) {
  const [theme, setThemeState] = useState<Theme>(
    () => defaultTheme ?? getStoredTheme(),
  );

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      globalThis.localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // localStorage unavailable
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === DARK_FANTASY ? LIGHT_FANTASY : DARK_FANTASY);
  }, [theme, setTheme]);

  // Apply data-theme attribute to <html> element
  useEffect(() => {
    document.documentElement.dataset["theme"] = theme;
  }, [theme]);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme }),
    [theme, setTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
