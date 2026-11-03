import { useEffect, useMemo, useRef, useState } from "react";
import { Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveStudentColor } from "@/lib/studentColor";

/* Chọn màu tự do cho lớp học / học sinh (dùng ô chọn màu của trình duyệt, giống nút "Màu khác" ở hóa đơn).
   Đặt file này tại: src/components/ColorPickerButton.tsx */

const HEX6 = /^#[0-9a-f]{6}$/i;
const FALLBACK = "#6a9b4e";

/** Màu đang hiển thị: ưu tiên mã màu tự chọn (#rrggbb), không có thì dùng màu tự động như trước đây. */
export const colorOf = (stored: unknown, id: string): string =>
  typeof stored === "string" && HEX6.test(stored.trim())
    ? stored.trim().toLowerCase()
    : String(resolveStudentColor(stored as any, id));

/** Đổi màu CSS bất kỳ (hex, rgb, hsl, tên màu) về #rrggbb, vì ô chọn màu của trình duyệt chỉ nhận dạng này. */
export const toHexColor = (color: string): string => {
  const c = (color || "").trim();
  if (HEX6.test(c)) return c.toLowerCase();
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return FALLBACK;
    ctx.fillStyle = "#000000";
    ctx.fillStyle = c; // màu không hợp lệ thì giữ nguyên #000000
    const v = String(ctx.fillStyle);
    return HEX6.test(v) ? v.toLowerCase() : FALLBACK;
  } catch {
    return FALLBACK;
  }
};

/** Màu đang kéo dở (xem trước ngay trên thẻ, chưa lưu), khoá theo id. */
export function useColorDraft() {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const set = (id: string, hex: string) => setDraft((d) => (d[id] === hex ? d : { ...d, [id]: hex }));
  const clear = (id: string) =>
    setDraft((d) => {
      if (!(id in d)) return d;
      const n = { ...d };
      delete n[id];
      return n;
    });
  return { draft, set, clear };
}

type Props = {
  /** Màu hiện tại (đã gồm màu đang xem trước). Nhận mọi dạng màu CSS. */
  value: string;
  label?: string;
  /** Gọi liên tục khi đang kéo chọn màu, để xem trước. */
  onPreview: (hex: string) => void;
  /** Gọi một lần khi chọn xong (đóng bảng chọn màu), lúc này mới lưu. */
  onCommit: (hex: string) => void | Promise<void>;
  className?: string;
};

export default function ColorPickerButton({ value, label = "Chọn màu", onPreview, onCommit, className }: Props) {
  const hex = useMemo(() => toHexColor(value), [value]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // Sự kiện "change" gốc của trình duyệt chỉ bắn khi chọn xong, còn onChange của React bắn theo từng cú kéo chuột
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const handler = () => {
      void commitRef.current(el.value.toLowerCase());
    };
    el.addEventListener("change", handler);
    return () => el.removeEventListener("change", handler);
  }, []);

  return (
    <label
      title={label}
      className={cn(
        "relative z-20 grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-lg text-slate-400 transition-colors",
        "hover:bg-slate-100 hover:text-slate-900 focus-within:ring-2 focus-within:ring-[#0B1B3A]/30",
        className
      )}
    >
      <Palette className="h-4 w-4" aria-hidden="true" />
      <span
        aria-hidden="true"
        className="absolute bottom-1 right-1 h-2.5 w-2.5 rounded-full ring-2 ring-white"
        style={{ background: hex }}
      />
      <input
        ref={inputRef}
        type="color"
        aria-label={label}
        value={hex}
        onChange={(e) => onPreview(e.target.value.toLowerCase())}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </label>
  );
}