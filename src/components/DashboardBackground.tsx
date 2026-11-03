import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactNode } from "react";
import { Check, ImagePlus, Link2, Palette, RotateCcw } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

/** kind = "preset": value là id của nền có sẵn · kind = "image": value là link ảnh hoặc dữ liệu ảnh tải từ máy */
export type Wallpaper = { kind: "preset" | "image"; value: string; dim: number };

export const WALLPAPER_PRESETS = [
  {
    id: "aurora",
    vi: "Cực quang",
    en: "Aurora",
    css: "radial-gradient(at 15% 10%, #a78bfa 0, transparent 50%), radial-gradient(at 85% 5%, #fbbf24 0, transparent 45%), radial-gradient(at 70% 90%, #f472b6 0, transparent 50%), radial-gradient(at 5% 85%, #38bdf8 0, transparent 50%), #1e1b4b",
  },
  {
    id: "candy",
    vi: "Kẹo bông",
    en: "Cotton candy",
    css: "radial-gradient(at 20% 15%, #fbcfe8 0, transparent 55%), radial-gradient(at 85% 20%, #bae6fd 0, transparent 50%), radial-gradient(at 60% 90%, #ddd6fe 0, transparent 55%), #fdf2f8",
  },
  {
    id: "sunset",
    vi: "Hoàng hôn",
    en: "Sunset",
    css: "radial-gradient(at 10% 10%, #fb7185 0, transparent 50%), radial-gradient(at 90% 15%, #fbbf24 0, transparent 45%), radial-gradient(at 50% 100%, #7c3aed 0, transparent 55%), #1f1147",
  },
  {
    id: "mint",
    vi: "Bạc hà",
    en: "Mint",
    css: "radial-gradient(at 15% 15%, #6ee7b7 0, transparent 50%), radial-gradient(at 85% 25%, #67e8f9 0, transparent 50%), radial-gradient(at 40% 95%, #a5b4fc 0, transparent 55%), #ecfeff",
  },
  {
    id: "night",
    vi: "Đêm xanh",
    en: "Midnight",
    css: "radial-gradient(at 80% 0%, rgb(255 181 71 / 0.45) 0, transparent 40%), radial-gradient(at 0% 100%, rgb(79 70 229 / 0.65) 0, transparent 55%), #0B1B3A",
  },
  {
    id: "mist",
    vi: "Sương sớm",
    en: "Morning mist",
    css: "radial-gradient(at 0% 0%, #e0e7ff 0, transparent 55%), radial-gradient(at 100% 100%, #fde68a 0, transparent 45%), #f1f5f9",
  },
] as const;

const DEFAULT_WALLPAPER: Wallpaper = { kind: "preset", value: "aurora", dim: 0 };
// Giữ nguyên khóa cũ để hình nền người dùng đã chọn ở trang tổng quan không bị mất
const storageKey = (uid?: string) => `dashboard-wallpaper:${uid || "guest"}`;
const clampDim = (n: number) => Math.min(0.7, Math.max(0, Number.isFinite(n) ? n : 0));

/** Đọc / lưu hình nền (lưu trong trình duyệt, riêng từng tài khoản) */
export function useDashboardWallpaper(userId?: string) {
  const [wallpaper, setWallpaper] = useState<Wallpaper>(DEFAULT_WALLPAPER);
  const [persistFailed, setPersistFailed] = useState(false);
  const key = storageKey(userId);
  const loadedKey = useRef<string | null>(null);

  useEffect(() => {
    let next = DEFAULT_WALLPAPER;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const p = JSON.parse(raw);
        if (p && (p.kind === "preset" || p.kind === "image") && typeof p.value === "string") {
          next = { kind: p.kind, value: p.value, dim: clampDim(Number(p.dim)) };
        }
      }
    } catch {
      /* dữ liệu hỏng hoặc bị chặn: dùng nền mặc định */
    }
    setWallpaper(next);
    loadedKey.current = key;
  }, [key]);

  useEffect(() => {
    if (loadedKey.current !== key) return;
    const id = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(wallpaper));
        setPersistFailed(false);
      } catch {
        setPersistFailed(true); // hết dung lượng: nền vẫn áp dụng nhưng sẽ mất khi tải lại trang
      }
    }, 250);
    return () => clearTimeout(id);
  }, [wallpaper, key]);

  const resetWallpaper = useCallback(() => setWallpaper(DEFAULT_WALLPAPER), []);
  return { wallpaper, setWallpaper, resetWallpaper, persistFailed };
}

/* ---------------- DÙNG CHUNG TOÀN ỨNG DỤNG ---------------- */

type WallpaperState = ReturnType<typeof useDashboardWallpaper>;
const WallpaperContext = createContext<WallpaperState | null>(null);

/** Đặt một lần ở AppLayout: hình nền, trang Cài đặt và trang Tổng quan dùng chung một trạng thái nên đổi ở đâu cũng áp dụng ngay */
export function WallpaperProvider({ userId, children }: { userId?: string; children: ReactNode }) {
  const { wallpaper, setWallpaper, resetWallpaper, persistFailed } = useDashboardWallpaper(userId);
  const value = useMemo(
    () => ({ wallpaper, setWallpaper, resetWallpaper, persistFailed }),
    [wallpaper, setWallpaper, resetWallpaper, persistFailed],
  );
  return <WallpaperContext.Provider value={value}>{children}</WallpaperContext.Provider>;
}

export function useWallpaper() {
  const ctx = useContext(WallpaperContext);
  if (!ctx) throw new Error("useWallpaper phải được dùng bên trong <WallpaperProvider>");
  return ctx;
}

function WallpaperLayers({ wallpaper }: { wallpaper: Wallpaper }) {
  const preset = WALLPAPER_PRESETS.find((p) => p.id === wallpaper.value) || WALLPAPER_PRESETS[0];
  const style: CSSProperties =
    wallpaper.kind === "image"
      ? { backgroundImage: `url("${wallpaper.value.replace(/"/g, "%22")}")`, backgroundSize: "cover", backgroundPosition: "center" }
      : { background: preset.css };
  return (
    <>
      <div className="absolute inset-0" style={style} />
      <div className="absolute inset-0 bg-[#0B1B3A]" style={{ opacity: wallpaper.dim }} />
    </>
  );
}

/** Nền của một khối nhỏ (ví dụ ô xem trước): đặt trong khối `relative isolate overflow-hidden` */
export function DashboardBackdrop({ wallpaper }: { wallpaper: Wallpaper }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <WallpaperLayers wallpaper={wallpaper} />
    </div>
  );
}

/** Nền của toàn bộ ứng dụng: cố định theo khung nhìn, nằm sau mọi nội dung. Đặt trong khối `relative isolate` ở AppLayout */
export function WallpaperBackdrop() {
  const { wallpaper } = useWallpaper();
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden print:hidden">
      <WallpaperLayers wallpaper={wallpaper} />
    </div>
  );
}

// Thu nhỏ ảnh tải từ máy (tối đa 1600px) để lưu gọn trong trình duyệt
const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

/** Phần chọn hình nền (xem trước, nền có sẵn, ảnh riêng, độ tối). Dùng trong trang Cài đặt và trong popup ở trang Tổng quan */
export function WallpaperControls({ vi }: { vi: boolean }) {
  const { wallpaper, setWallpaper: onChange, resetWallpaper: onReset, persistFailed } = useWallpaper();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Ảnh mới mặc định được làm tối nhẹ để chữ dễ đọc
  const imageDim = wallpaper.kind === "image" ? wallpaper.dim : 0.25;

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(vi ? "Vui lòng chọn một file ảnh" : "Please choose an image file");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error(vi ? "Ảnh quá lớn, hãy chọn ảnh dưới 20MB" : "Image is too large (max 20MB)");
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      onChange({ kind: "image", value: dataUrl, dim: imageDim });
      toast.success(vi ? "Đã đổi hình nền" : "Wallpaper updated");
    } catch {
      toast.error(vi ? "Không đọc được ảnh này, hãy thử ảnh khác" : "Couldn't read this image");
    } finally {
      setBusy(false);
    }
  };

  const applyUrl = () => {
    const u = url.trim();
    if (!/^https?:\/\//i.test(u)) {
      toast.error(vi ? "Link ảnh cần bắt đầu bằng http:// hoặc https://" : "The link must start with http:// or https://");
      return;
    }
    setBusy(true);
    const img = new Image();
    img.onload = () => {
      setBusy(false);
      onChange({ kind: "image", value: u, dim: imageDim });
      setUrl("");
      toast.success(vi ? "Đã đổi hình nền" : "Wallpaper updated");
    };
    img.onerror = () => {
      setBusy(false);
      toast.error(
        vi
          ? "Không tải được ảnh từ link này. Hãy dùng link trực tiếp tới file ảnh (.jpg, .png, .webp)."
          : "Couldn't load this image. Use a direct link to an image file (.jpg, .png, .webp).",
      );
    };
    img.src = u;
  };

  const soft = "rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30";

  return (
    <div className="space-y-5">
      {/* XEM TRƯỚC */}
      <div className="relative isolate h-36 overflow-hidden rounded-2xl border border-slate-200">
        <DashboardBackdrop wallpaper={wallpaper} />
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl border border-white/60 bg-white/70 p-3 shadow-lg backdrop-blur-xl">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-28 rounded-full bg-slate-900/80" />
            <div className="h-2 w-20 rounded-full bg-slate-900/20" />
          </div>
        </div>
      </div>

      {/* NỀN CÓ SẴN */}
      <div className="space-y-2">
        <div className="text-sm font-bold text-slate-900">{vi ? "Nền có sẵn" : "Presets"}</div>
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
          {WALLPAPER_PRESETS.map((p) => {
            const active = wallpaper.kind === "preset" && wallpaper.value === p.id;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={active}
                onClick={() => onChange({ kind: "preset", value: p.id, dim: 0 })}
                className="group space-y-1.5 text-left focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "relative grid h-14 place-items-center overflow-hidden rounded-xl border-2 transition-all group-focus-visible:ring-2 group-focus-visible:ring-[#0B1B3A]/40",
                    active ? "border-[#0B1B3A] shadow-md" : "border-transparent group-hover:border-slate-300",
                  )}
                  style={{ background: p.css }}
                >
                  {active && (
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-[#0B1B3A] text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs font-semibold text-slate-600">{vi ? p.vi : p.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ẢNH CỦA BẠN */}
      <div className="space-y-2">
        <div className="text-sm font-bold text-slate-900">{vi ? "Ảnh của bạn" : "Your photo"}</div>
        <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} className={cn(soft, "flex h-11 w-full items-center justify-center gap-2 border-dashed disabled:opacity-60")}>
          <ImagePlus className="h-4 w-4" />
          {busy ? (vi ? "Đang xử lý..." : "Working...") : vi ? "Tải ảnh từ máy" : "Upload from device"}
        </button>
        <div className="flex gap-2">
          <label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 focus-within:border-[#0B1B3A] focus-within:ring-2 focus-within:ring-[#0B1B3A]/20">
            <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyUrl()}
              placeholder={vi ? "Dán link ảnh (https://...)" : "Paste image link (https://...)"}
              className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
          </label>
          <button type="button" disabled={busy || !url.trim()} onClick={applyUrl} className="h-11 shrink-0 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white transition-colors hover:bg-[#13285a] disabled:opacity-50">
            {vi ? "Dùng link" : "Use link"}
          </button>
        </div>
      </div>

      {/* ĐỘ TỐI */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <label htmlFor="wallpaper-dim" className="font-bold text-slate-900">
            {vi ? "Làm tối nền" : "Darken wallpaper"}
          </label>
          <span className="font-semibold text-slate-500">{Math.round(wallpaper.dim * 100)}%</span>
        </div>
        <input
          id="wallpaper-dim"
          type="range"
          min={0}
          max={70}
          step={5}
          value={Math.round(wallpaper.dim * 100)}
          onChange={(e) => onChange({ ...wallpaper, dim: Number(e.target.value) / 100 })}
          className="w-full accent-[#0B1B3A]"
        />
      </div>

      {persistFailed && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
          {vi
            ? "Ảnh quá nặng để lưu trong trình duyệt, nền sẽ trở về mặc định khi tải lại trang. Hãy thử ảnh nhẹ hơn hoặc dùng link ảnh."
            : "This image is too large to store in the browser and will reset on reload. Try a smaller image or use a link."}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-xs text-slate-400">{vi ? "Hình nền được lưu trên trình duyệt này." : "Saved in this browser only."}</p>
        <button type="button" onClick={onReset} className={cn(soft, "flex h-9 shrink-0 items-center gap-1.5")}>
          <RotateCcw className="h-3.5 w-3.5" />
          {vi ? "Về mặc định" : "Reset"}
        </button>
      </div>
    </div>
  );
}

/** Nút lối tắt (ở trang Tổng quan) mở popup đổi hình nền; cùng một trạng thái với mục Giao diện trong Cài đặt */
export function BackgroundPicker({ vi, className }: { vi: boolean; className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        <Palette className="h-4 w-4" />
        {vi ? "Đổi hình nền" : "Change wallpaper"}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] gap-0 overflow-y-auto rounded-[28px] border border-white/60 bg-white/95 p-0 font-['Be_Vietnam_Pro',sans-serif] shadow-2xl backdrop-blur-2xl sm:max-w-2xl">
          <DialogHeader className="space-y-1 px-6 pb-3 pt-6 text-left">
            <DialogTitle className="text-lg font-extrabold text-slate-900">{vi ? "Hình nền ứng dụng" : "App wallpaper"}</DialogTitle>
            <DialogDescription className="text-sm text-slate-500">
              {vi ? "Chọn nền có sẵn, tải ảnh của bạn lên hoặc dán link ảnh. Hình nền áp dụng cho toàn bộ ứng dụng." : "Pick a preset, upload your own photo or paste an image link. The wallpaper applies to the whole app."}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6">
            <WallpaperControls vi={vi} />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}