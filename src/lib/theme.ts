// Theme handling: light / dark / system, persisted in localStorage and applied
// as the `dark` class on <html> (Tailwind's dark variant). `applyTheme` runs at
// startup (before render, in main.tsx) so there's no flash.
export type Theme = "light" | "dark" | "system";

const KEY = "opengit.theme";

export function getTheme(): Theme {
  const t = localStorage.getItem(KEY);
  return t === "light" || t === "dark" || t === "system" ? t : "system";
}

function resolve(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

export function applyTheme(theme: Theme = getTheme()) {
  document.documentElement.classList.toggle("dark", resolve(theme) === "dark");
}

export function setTheme(theme: Theme) {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

// Keep "system" in sync with OS changes while the app is open.
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (getTheme() === "system") applyTheme("system");
  });
