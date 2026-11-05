import { useEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENTS, inkOn, useStudentTheme, type ThemeMode } from "@/lib/StudentTheme";

const MODES: { key: ThemeMode; label: string; icon: LucideIcon }[] = [
  { key: "light", label: "Sáng", icon: Sun },
  { key: "dark", label: "Tối", icon: Moon },
  { key: "system", label: "Tự động", icon: Monitor },
];

/* Nút "Giao diện" mở bảng chọn chế độ sáng/tối và màu chủ đạo.
   variant="onAccent": nút trong suốt, đặt trên nền màu (dải hero).
   variant="plain": nút nền trắng, đặt trên thanh tiêu đề thường. */
export default function StudentThemeMenu({
  variant = "plain",
  className,
}: {
  variant?: "plain" | "onAccent";
  className?: string;
}) {
  const { mode, accent, vars, setMode, setAccent } = useStudentTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc nhấn Esc thì đóng
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const triggerStyle =
    variant === "onAccent"
      ? { background: "color-mix(in srgb, var(--sh-on-accent) 16%, transparent)", color: "var(--sh-on-accent)" }
      : { background: "var(--sh-surface)", color: "var(--sh-ink)", borderColor: "var(--sh-border)" };

  return (
    <div ref={root} className={cn("relative", className)} style={vars}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sh-on-accent)]",
          variant === "plain" && "border"
        )}
        style={triggerStyle}
      >
        <Palette className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">Giao diện</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Tùy chỉnh giao diện"
          className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] space-y-5 rounded-2xl border p-4 shadow-[0_24px_48px_-20px_rgb(0_0_0/0.45)]"
          style={{ background: "var(--sh-surface)", borderColor: "var(--sh-border)", color: "var(--sh-ink)" }}
        >
          <div className="space-y-2">
            <p className="text-xs font-medium" style={{ color: "var(--sh-muted)" }}>
              Chế độ
            </p>
            <div className="grid grid-cols-3 gap-1 rounded-full p-1" style={{ background: "var(--sh-surface-2)" }}>
              {MODES.map(({ key, label, icon: Icon }) => {
                const active = mode === key;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setMode(key)}
                    className="flex h-8 items-center justify-center gap-1.5 rounded-full text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sh-accent)]"
                    style={
                      active
                        ? { background: "var(--sh-surface)", color: "var(--sh-ink)", boxShadow: "0 1px 3px rgb(0 0 0 / 0.18)" }
                        : { color: "var(--sh-muted)" }
                    }
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium" style={{ color: "var(--sh-muted)" }}>
              Màu chủ đạo
            </p>
            <div className="grid grid-cols-6 gap-2">
              {ACCENTS.map((a) => {
                const active = a.key === accent.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    aria-label={a.label}
                    aria-pressed={active}
                    title={a.label}
                    onClick={() => setAccent(a.key)}
                    className="grid aspect-square place-items-center rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--sh-ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--sh-surface)]"
                    style={{
                      background: a.hex,
                      color: inkOn(a.hex),
                      boxShadow: active ? `0 0 0 2px var(--sh-surface), 0 0 0 4px ${a.hex}` : undefined,
                    }}
                  >
                    {active && <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>

          <p className="text-xs" style={{ color: "var(--sh-faint)" }}>
            Lựa chọn được lưu trên thiết bị này.
          </p>
        </div>
      )}
    </div>
  );
}