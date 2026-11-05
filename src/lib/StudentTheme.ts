import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";

/* Theme của học sinh: chế độ sáng/tối + màu chủ đạo.
   Lưu trong localStorage, dùng chung giữa mọi component gọi useStudentTheme() (cùng thay đổi ngay lập tức).
   Giao diện đọc màu qua biến CSS --sh-*, nên đổi theme chỉ là đổi các biến này. */

export type ThemeMode = "light" | "dark" | "system";
export type Accent = { key: string; label: string; hex: string };

// Các màu đều đủ đậm để chữ trắng đọc rõ trên nền màu
export const ACCENTS: Accent[] = [
  { key: "indigo", label: "Chàm", hex: "#4F46E5" },
  { key: "blue", label: "Xanh dương", hex: "#2563EB" },
  { key: "emerald", label: "Xanh ngọc", hex: "#047857" },
  { key: "rose", label: "Hồng", hex: "#E11D48" },
  { key: "orange", label: "Cam", hex: "#C2410C" },
  { key: "violet", label: "Tím", hex: "#7C3AED" },
];

type Stored = { mode: ThemeMode; accent: string };
const KEY = "apex-student-theme";
const DEFAULT: Stored = { mode: "light", accent: "indigo" };

const read = (): Stored => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    if (!raw) return DEFAULT;
    const p = JSON.parse(raw);
    const mode: ThemeMode = p?.mode === "dark" || p?.mode === "system" ? p.mode : "light";
    const accent = ACCENTS.some((a) => a.key === p?.accent) ? p.accent : DEFAULT.accent;
    return { mode, accent };
  } catch {
    return DEFAULT;
  }
};

// ---- Kho nhỏ dùng chung (không cần Context) ----
let state: Stored = read();
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSnapshot = () => state;
const getServerSnapshot = () => DEFAULT;

function update(patch: Partial<Stored>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* trình duyệt chặn lưu: vẫn đổi được trong phiên này */
  }
  listeners.forEach((l) => l());
}
export const setStudentMode = (mode: ThemeMode) => update({ mode });
export const setStudentAccent = (accent: string) => update({ accent });

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền
export const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#0B1B3A" : "#ffffff";
};

// Bảng màu của trang, sinh ra từ màu chủ đạo + chế độ sáng/tối
export function themeVars(hex: string, dark: boolean): CSSProperties {
  const A = hex;
  const v: Record<string, string> = dark
    ? {
        "--sh-bg": `color-mix(in srgb, ${A} 9%, #0a0e1a)`,
        "--sh-surface": `color-mix(in srgb, ${A} 6%, #131a2b)`,
        "--sh-surface-2": `color-mix(in srgb, ${A} 10%, #182036)`,
        "--sh-border": `color-mix(in srgb, ${A} 20%, #263049)`,
        "--sh-ink": "#eef1f8",
        "--sh-muted": "#a1abc0",
        "--sh-faint": "#7a859c",
        "--sh-soft": `color-mix(in srgb, ${A} 26%, #131a2b)`,
        "--sh-strong": `color-mix(in srgb, ${A} 45%, white)`,
      }
    : {
        "--sh-bg": `color-mix(in srgb, ${A} 6%, #f5f6fa)`,
        "--sh-surface": "#ffffff",
        "--sh-surface-2": `color-mix(in srgb, ${A} 5%, #f8f9fc)`,
        "--sh-border": `color-mix(in srgb, ${A} 14%, #e2e6ee)`,
        "--sh-ink": "#0B1B3A",
        "--sh-muted": "#5b6577",
        "--sh-faint": "#8d96a8",
        "--sh-soft": `color-mix(in srgb, ${A} 12%, white)`,
        "--sh-strong": `color-mix(in srgb, ${A} 80%, black)`,
      };
  v["--sh-accent"] = A;
  v["--sh-on-accent"] = inkOn(A);
  return { ...(v as CSSProperties), colorScheme: dark ? "dark" : "light" };
}

function useSystemDark() {
  const query = "(prefers-color-scheme: dark)";
  const [dark, setDark] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    const on = () => setDark(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return dark;
}

export function useStudentTheme() {
  const { mode, accent: key } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const systemDark = useSystemDark();
  const isDark = mode === "dark" || (mode === "system" && systemDark);
  const accent = ACCENTS.find((a) => a.key === key) ?? ACCENTS[0];

  // Cho các component shadcn (Popover, Dialog, Button outline...) cũng đổi sang tối theo
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const vars = useMemo(() => themeVars(accent.hex, isDark), [accent.hex, isDark]);
  return { mode, accent, isDark, vars, setMode: setStudentMode, setAccent: setStudentAccent };
}