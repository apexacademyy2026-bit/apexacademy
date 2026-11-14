import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  Trash2,
  Users,
  Clock,
  BookOpen,
  MoreVertical,
  Search,
  ArrowUpDown,
  ArrowUpRight,
  Video,
  ExternalLink,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/contexts/AppContext";
import { useClasses, useEnrollments, useClassSchedules, qk } from "@/hooks/useData";
import { fmtDate } from "@/lib/format";
import ClassDialog from "@/components/ClassDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import ColorPickerButton, { colorOf, useColorDraft } from "@/components/Colorpickerbutton";

/* ---------------- KIỂU GIAO DIỆN ----------------
   Cùng ngôn ngữ thiết kế "Aurora + Bento" với trang Dashboard và trang Học sinh:
   - Phần chào là khối mận đậm có ba quầng sáng aurora trôi chậm, kèm thẻ kính mờ thống kê nhanh.
   - Thẻ lớp bo tròn lớn, có ánh sáng đi theo con trỏ chuột (spotlight) mang màu riêng của từng lớp.
   - Thẻ và khối xuất hiện lần lượt từng cái; mọi chuyển động tắt khi người dùng bật "giảm chuyển động".
   Bảng màu: mận đậm #3B1553 · hổ phách #FFB547 · tím hồng cho aurora.
   Màu của từng lớp (do người dùng chọn) vẫn là điểm nhấn chính: vạch màu trên thẻ, ô icon đặc, nền thẻ phủ sắc rất nhạt. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
// Số đếm dùng chữ đơn cách (mono) cho cảm giác "bảng điều khiển"
const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const CARD =
  "rounded-[28px] border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(59,21,83,0.04),0_18px_44px_-22px_rgba(59,21,83,0.22)]";
// Kính mờ đặt trên nền mận đậm / aurora
const GLASS = "border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl";
// Chip trong phần chào (nền mận đậm)
const HERO_CHIP = "inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 text-sm font-medium text-white backdrop-blur-md";
// Chip ca học trên thẻ lớp (nền sáng), màu được phủ theo màu lớp
const SLOT_CHIP = "inline-flex items-center gap-1 rounded-full border border-zinc-200 px-2.5 py-0.5 text-xs font-medium text-zinc-600";
const FIELD =
  "h-10 rounded-full border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#3B1553] focus-visible:ring-2 focus-visible:ring-[#3B1553]/10";
const ICON_BTN = "relative z-20 h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900";
const PRIMARY = "h-10 shrink-0 gap-2 rounded-xl bg-[#3B1553] px-4 text-sm font-semibold text-white shadow-md shadow-[#3B1553]/25 hover:bg-[#521F70]";
const SEG = "flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-3xl bg-zinc-100 p-1";
const segBtn = (active: boolean) =>
  cn(
    "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30",
    active ? "bg-[#3B1553] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900",
  );

// Nền gradient mận đậm (phần chào)
const HERO_BG: CSSProperties = {
  backgroundImage: "linear-gradient(140deg, #1F0A30 0%, #3B1553 52%, #5A2179 100%)",
};
const ICON_TILE_BG: CSSProperties = { backgroundImage: "linear-gradient(145deg, #3B1553 0%, #6B2A8F 100%)" };
// Lưới chấm mờ phủ lên nền mận đậm, mờ dần về phía góc trái dưới
const DOT_BG: CSSProperties = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
  WebkitMaskImage: "radial-gradient(80% 110% at 100% 0%, #000 0%, transparent 70%)",
  maskImage: "radial-gradient(80% 110% at 100% 0%, #000 0%, transparent 70%)",
};

// CSS dùng chung với Dashboard: chữ, chuyển động aurora, hiệu ứng xuất hiện, spotlight
const DASH_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');
@keyframes dash-drift-a { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(9%,10%,0) scale(1.14); } }
@keyframes dash-drift-b { 0%,100% { transform: translate3d(0,0,0) scale(1.05); } 50% { transform: translate3d(-10%,12%,0) scale(0.92); } }
@keyframes dash-drift-c { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(12%,-9%,0) scale(1.18); } }
@keyframes dash-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes dash-sheen { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
.dash-aurora-a { animation: dash-drift-a 20s ease-in-out infinite; }
.dash-aurora-b { animation: dash-drift-b 24s ease-in-out infinite; }
.dash-aurora-c { animation: dash-drift-c 28s ease-in-out infinite; }
.dash-rise { animation: dash-rise .6s cubic-bezier(.2,.7,.2,1) backwards; animation-delay: var(--d, 0ms); }
.dash-sheen { background-size: 200% 100%; animation: dash-sheen 7s linear infinite; }
.dash-spot .dash-spot-glow { opacity: 0; transition: opacity .25s ease; }
.dash-spot:hover .dash-spot-glow { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .dash-aurora-a, .dash-aurora-b, .dash-aurora-c, .dash-rise, .dash-sheen { animation: none !important; }
  .dash-spot .dash-spot-glow { transition: none; }
}
`;

const rise = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

// Chọn chữ mận đậm hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#3B1553" : "#ffffff";
};
// Ô màu đặc, có quầng sáng cùng màu để nổi bật
const solid = (c: string): CSSProperties => ({
  background: c,
  color: inkOn(c),
  boxShadow: `0 8px 18px -8px ${c}`,
});
// Phủ một lớp màu rất nhạt lên nền trắng, và chữ đậm cùng tông
const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
const deep = (c: string) => `color-mix(in srgb, ${c} 62%, black)`;

// Link học online của lớp: có link nghĩa là lớp học online
const LINK_KEYS = ["link", "online_link", "meeting_link", "meeting_url", "meet_link", "zoom_link", "class_link", "url"];
// Lớp online: cột định dạng (Format) có giá trị "online", hoặc cờ is_online = true
const isOnline = (c: any): boolean => {
  if (c?.is_online === true || c?.online === true) return true;
  return Object.entries(c ?? {}).some(
    ([k, v]) => k !== "name" && k !== "notes" && typeof v === "string" && v.trim().toLowerCase() === "online"
  );
};
const linkOf = (c: any): string => {
  if (!isOnline(c)) return ""; // lớp offline thì không hiện link
  let raw = "";
  for (const k of LINK_KEYS) {
    if (c?.[k]) {
      raw = String(c[k]).trim();
      break;
    }
  }
  // Dự phòng tạm: chưa biết tên cột thì lấy trường đầu tiên chứa địa chỉ http(s)
  if (!raw) {
    const found = Object.values(c ?? {}).find((v) => typeof v === "string" && /^https?:\/\//i.test(v.trim()));
    raw = String(found ?? "").trim();
  }
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
};
const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

// Số chạy lên từ giá trị đang hiển thị tới giá trị mới (tắt khi người dùng bật "giảm chuyển động")
function useCountUp(target: number, duration = 600) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const safe = Number.isFinite(target) ? target : 0;
    const reduce = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = safe;
      setVal(safe);
      return;
    }
    const from = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (safe - from) * eased;
      fromRef.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}
function CountNum({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{Math.round(v)}</>;
}

// Thẻ có ánh sáng đi theo con trỏ chuột (chỉ trang trí, không chặn thao tác)
function Spot({
  className,
  children,
  tint = "rgba(139,63,208,0.10)",
  style,
}: {
  className?: string;
  children: ReactNode;
  tint?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("dash-spot relative", className)}
      style={style}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
      <div
        aria-hidden
        className="dash-spot-glow pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: `radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), ${tint}, transparent 65%)` }}
      />
    </div>
  );
}

// Vòng tiến độ có gradient hổ phách (dùng cho tỉ lệ lớp đã xếp ca học)
function ProgressRing({ pct, size = 56, stroke = 5, id = "cls-ring" }: { pct: number; size?: number; stroke?: number; id?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD27A" />
          <stop offset="100%" stopColor="#FF8A5B" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * safe) / 100}
        className="transition-all duration-700 motion-reduce:transition-none"
      />
    </svg>
  );
}

export default function Classes() {
  const { t, lang } = useApp();
  const classes = useClasses();
  const enrollments = useEnrollments();
  const schedules = useClassSchedules();
  const qc = useQueryClient();
  const confirm = useConfirm();
  // Màu đang kéo dở của từng lớp (xem trước ngay, chưa lưu)
  const colors = useColorDraft();

  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [cat, setCat] = useState<"all" | "math" | "english" | "none">("all");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "created-desc" | "created-asc" | "students-desc" | "students-asc">("name-asc");

  const catLabels: Record<string, string> =
    lang === "vi"
      ? { all: "Tất cả", math: "Toán", english: "Tiếng Anh", none: "Chưa phân loại" }
      : { all: "All", math: "Math", english: "English", none: "Unsorted" };

  const studentCount = (cid: string) => (enrollments.data || []).filter((e: any) => e.class_id === cid).length;

  const slots = (cid: string) => (schedules.data || []).filter((s: any) => s.class_id === cid);

  // Logic Tìm kiếm & Sắp xếp danh sách lớp
  const visible = useMemo(() => {
    let list = (classes.data || []).filter((c: any) => {
      const matchCat = cat === "all" ? true : cat === "none" ? !c.category : c.category === cat;
      const q = search.toLowerCase();
      const matchSearch =
        (c.name || "").toLowerCase().includes(q) ||
        (c.subject || "").toLowerCase().includes(q) ||
        (c.grade || "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    return list.sort((a: any, b: any) => {
      if (sortBy === "name-asc") return (a.name || "").localeCompare(b.name || "", "vi", { sensitivity: "base" });
      if (sortBy === "name-desc") return (b.name || "").localeCompare(a.name || "", "vi", { sensitivity: "base" });
      if (sortBy === "created-desc") return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (sortBy === "created-asc") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortBy === "students-desc") return studentCount(b.id) - studentCount(a.id);
      if (sortBy === "students-asc") return studentCount(a.id) - studentCount(b.id);
      return 0;
    });
  }, [classes.data, cat, search, sortBy, enrollments.data]);

  useEffect(() => {
    document.title = `${t.classes} — ${t.appName}`;
  }, [t]);

  const totalStudentsAll = (classes.data || []).reduce((sum: number, c: any) => sum + studentCount(c.id), 0);

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: t.confirmDelete, destructive: true }))) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: qk.classes });
      toast.success(t.delete);
    }
  };

  // Lưu màu tự chọn của lớp (mã #rrggbb) vào cột color
  const commitColor = async (c: any, hex: string) => {
    const { error } = await supabase.from("classes").update({ color: hex } as any).eq("id", c.id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: qk.classes });
    colors.clear(c.id); // bỏ màu xem trước: lưu được thì dữ liệu mới đã có màu này, lỗi thì quay về màu cũ
  };

  const classColor = (c: any) => colors.draft[c.id] ?? colorOf(c.color, c.id);

  const colorPicker = (c: any) => (
    <ColorPickerButton
      value={classColor(c)}
      label="Chọn màu lớp"
      onPreview={(hex) => colors.set(c.id, hex)}
      onCommit={(hex) => commitColor(c, hex)}
    />
  );

  // Nút vào lớp online. z-20 để nằm trên lớp Link phủ kín thẻ (z-10), bấm vào sẽ mở link thay vì sang trang chi tiết lớp
  const joinLink = (c: any) => {
    const url = linkOf(c);
    if (!url) return null;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        title={url}
        className="relative z-20 inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/40"
        style={solid(classColor(c))}
      >
        <Video className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">Vào lớp online</span>
        <ExternalLink className="h-3 w-3 shrink-0 opacity-70" />
      </a>
    );
  };

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const vi = lang === "vi";

  // Số liệu nhanh cho phần chào (tính trên toàn bộ lớp, không phụ thuộc bộ lọc / ô tìm kiếm)
  const allClasses: any[] = classes.data || [];
  const totalClasses = allClasses.length;
  const weeklySlots = (schedules.data || []).length;
  const onlineCount = allClasses.filter((c: any) => isOnline(c)).length;
  const scheduledCount = allClasses.filter((c: any) => slots(c.id).length > 0).length;
  const unscheduledCount = totalClasses - scheduledCount;
  const scheduledPct = totalClasses > 0 ? Math.round((scheduledCount / totalClasses) * 100) : 0;
  const previewClasses = allClasses.slice(0, 5);

  const heroTiles = [
    { label: vi ? "Lượt học sinh" : "Enrollments", value: totalStudentsAll, warn: false },
    { label: vi ? "Ca học mỗi tuần" : "Weekly slots", value: weeklySlots, warn: false },
    { label: vi ? "Lớp online" : "Online classes", value: onlineCount, warn: false },
  ];

  const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

  const rowMenu = (c: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Tùy chọn" className={cn(ICON_BTN, "grid place-items-center")}>
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-2xl p-1.5">
        <DropdownMenuItem
          onClick={() => {
            setEditing(c);
            setOpen(true);
          }}
          className="cursor-pointer gap-2 rounded-lg py-2 text-sm font-medium"
        >
          <Pencil className="h-4 w-4 text-zinc-500" /> {t.edit || "Chỉnh sửa"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDelete(c.id)}
          className="cursor-pointer gap-2 rounded-lg py-2 text-sm font-medium text-rose-600 focus:bg-rose-50 focus:text-rose-600"
        >
          <Trash2 className="h-4 w-4" /> {t.delete || "Xóa lớp"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", FONT)}>
      <style>{DASH_CSS}</style>

      {/* ========== PHẦN CHÀO (aurora) + THỐNG KÊ NHANH ========== */}
      <section
        className="dash-rise relative isolate overflow-hidden rounded-[36px] p-6 text-white shadow-[0_30px_60px_-30px_rgba(59,21,83,0.85)] sm:p-9"
        style={HERO_BG}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="dash-aurora-a absolute -left-24 -top-32 h-96 w-96 rounded-full bg-fuchsia-500/60 blur-[90px]" />
          <div className="dash-aurora-b absolute -right-16 -top-10 h-[26rem] w-[26rem] rounded-full bg-[#FFB547]/40 blur-[100px]" />
          <div className="dash-aurora-c absolute -bottom-44 left-1/3 h-96 w-96 rounded-full bg-pink-400/30 blur-[100px]" />
          <div className="absolute inset-0" style={DOT_BG} />
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="space-y-5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#FFB547] ring-1 ring-white/10">
                <Sparkles className="h-3.5 w-3.5" />
                {vi ? "Quản lý lớp học" : "Class management"}
              </span>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
                <span className="dash-sheen bg-gradient-to-r from-[#FFD27A] via-[#FF9A6B] to-[#FFD27A] bg-clip-text text-transparent">{t.classes}</span>
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-white/65">
                {vi ? "Quản lý lớp học, sĩ số và ca học trong tuần." : "Manage classes, enrolled students and weekly schedules."}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={openCreate}
                className="h-10 gap-2 rounded-full bg-[#FFB547] px-5 text-sm font-semibold text-[#3B1553] shadow-sm shadow-[#FFB547]/40 hover:bg-[#ffa726] focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} /> {t.addClass}
              </Button>
              {unscheduledCount > 0 && (
                <span className={cn(HERO_CHIP, "border-[#FFB547]/40 bg-[#FFB547]/15 text-[#FFD9A0]")}>
                  <CalendarClock className="h-4 w-4 text-[#FFB547]" />
                  <span className="tabular-nums">{unscheduledCount}</span> {vi ? "lớp chưa xếp ca" : "unscheduled"}
                </span>
              )}
              {onlineCount > 0 && (
                <span className={HERO_CHIP}>
                  <Video className="h-4 w-4 text-[#FFB547]" />
                  <span className="tabular-nums">{onlineCount}</span> {vi ? "lớp online" : "online"}
                </span>
              )}
            </div>
          </div>

          {/* Thẻ kính mờ: tổng số lớp + cơ cấu + tỉ lệ lớp đã xếp ca */}
          <div className={cn(GLASS, "relative flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[28px] p-5 sm:p-6")}>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
                <BookOpen className="h-3.5 w-3.5" />
                {vi ? "Tổng quan" : "Overview"}
              </span>
              {previewClasses.length > 0 && (
                <div className="flex -space-x-2">
                  {previewClasses.map((c: any) => (
                    <span
                      key={c.id}
                      title={c.name}
                      className="grid h-8 w-8 place-items-center rounded-full ring-2 ring-[#3B1553]"
                      style={solid(classColor(c))}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                    </span>
                  ))}
                  {totalClasses > previewClasses.length && (
                    <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white/15 px-1.5 text-[11px] font-semibold ring-2 ring-[#3B1553]">
                      +{totalClasses - previewClasses.length}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className={cn(MONO, "text-5xl font-bold tabular-nums tracking-tight text-[#FFD27A]")}>
                <CountNum value={totalClasses} />
              </span>
              <span className="text-sm font-medium text-white/55">{vi ? "lớp học" : "classes"}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {heroTiles.map((tile) => (
                <div key={tile.label} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-sm">
                  <div className="text-[11px] font-medium leading-snug text-white/60">{tile.label}</div>
                  <div className={cn("text-lg font-bold tabular-nums", tile.warn ? "text-[#FFB547]" : "text-white")}>{tile.value}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-white/10 pt-4">
              <div className="relative grid shrink-0 place-items-center">
                <ProgressRing pct={scheduledPct} />
                <span className="absolute text-xs font-bold tabular-nums">{scheduledPct}%</span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white/60">{vi ? "Đã xếp ca học" : "Scheduled"}</div>
                <div className="text-lg font-bold tabular-nums">
                  {scheduledCount}
                  <span className="text-sm font-medium text-white/50">
                    /{totalClasses} {vi ? "lớp" : "classes"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== THANH CÔNG CỤ ========== */}
      <section className={cn(CARD, "dash-rise flex flex-col gap-3 p-3.5 sm:p-4 lg:flex-row lg:items-center lg:justify-between")} style={rise(80)}>
        <div className={SEG}>
          {(["all", "math", "english", "none"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={segBtn(cat === k)}>
              {catLabels[k]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder={vi ? "Tìm theo tên lớp, môn học..." : "Search class name, subject..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(FIELD, "pl-10")}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 sm:w-52 sm:flex-none">
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className={cn(FIELD, "w-full font-medium text-zinc-700")}>
                  <div className="flex items-center gap-2 truncate">
                    <ArrowUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
                    <SelectValue placeholder="Sắp xếp" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-2xl text-sm">
                  <SelectItem value="name-asc">Tên lớp (A → Z)</SelectItem>
                  <SelectItem value="name-desc">Tên lớp (Z → A)</SelectItem>
                  <SelectItem value="created-desc">Mới nhất</SelectItem>
                  <SelectItem value="created-asc">Cũ nhất</SelectItem>
                  <SelectItem value="students-desc">Sĩ số (cao → thấp)</SelectItem>
                  <SelectItem value="students-asc">Sĩ số (thấp → cao)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className="hidden shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium tabular-nums text-zinc-600 xl:inline-block">
              {visible.length}
              {visible.length !== totalClasses ? ` / ${totalClasses}` : ""} {vi ? "lớp" : "classes"}
            </span>
            <div className={cn(SEG, "shrink-0")}>
              {([["grid", LayoutGrid, "Lưới"], ["list", ListIcon, "Bảng"]] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  aria-label={label}
                  onClick={() => setView(mode)}
                  className={cn(segBtn(view === mode), "flex items-center gap-1.5")}
                >
                  <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ========== DANH SÁCH LỚP ========== */}
      {visible.length === 0 ? (
        <div className={cn(CARD, "dash-rise flex flex-col items-center gap-4 border-dashed border-zinc-300 p-12 text-center")} style={rise(120)}>
          <div className="grid h-14 w-14 place-items-center rounded-2xl text-[#FFB547] shadow-lg shadow-[#3B1553]/20" style={ICON_TILE_BG}>
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900">{t.nothingHere}</h3>
            <p className="text-sm text-zinc-500">
              {vi ? "Không tìm thấy lớp học phù hợp với từ khóa hoặc bộ lọc." : "No classes found matching search or filter criteria."}
            </p>
          </div>
          <Button onClick={openCreate} className={PRIMARY}>
            {t.addClass}
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((c: any, i: number) => {
            const color = classColor(c);
            const cs = slots(c.id);
            return (
              <div key={c.id} className="dash-rise group relative" style={rise(120 + Math.min(i, 11) * 40)}>
                <Spot
                  tint={`color-mix(in srgb, ${color} 22%, transparent)`}
                  className="flex h-full flex-col gap-5 overflow-hidden rounded-[28px] border p-5 pt-6 transition-shadow duration-200 group-hover:shadow-[0_2px_4px_rgba(59,21,83,0.05),0_22px_44px_-18px_rgba(59,21,83,0.3)]"
                  style={{ background: wash(color, 6), borderColor: wash(color, 38) }}
                >
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-30 blur-3xl"
                    style={{ background: color }}
                  />
                  <Link
                    to={`/classes/${c.id}`}
                    aria-label={`Xem lớp ${c.name}`}
                    className={cn("absolute inset-0 z-10 rounded-[28px]", focusRing)}
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={solid(color)}>
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold text-zinc-900">{c.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-500">
                          <span className="truncate">{c.subject}</span>
                          {c.grade && <span className="shrink-0 rounded-full px-2 py-0.5 font-medium" style={{ background: wash(color, 18), color: deep(color) }}>{c.grade}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {colorPicker(c)}
                      {rowMenu(c)}
                    </div>
                  </div>

                  <div className="relative flex flex-wrap gap-1.5">
                    {cs.length === 0 ? (
                      <span className="text-xs text-zinc-400">Chưa xếp ca học</span>
                    ) : (
                      cs.map((s: any) => (
                        <span key={s.id} className={SLOT_CHIP} style={{ background: wash(color, 14), borderColor: wash(color, 45), color: deep(color) }}>
                          <Clock className="h-3 w-3 opacity-60" />
                          {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                        </span>
                      ))
                    )}
                  </div>

                  {linkOf(c) && (
                    <div className="relative flex min-w-0 items-center gap-2 rounded-2xl bg-white/75 p-2.5 ring-1 ring-zinc-200/60">
                      {joinLink(c)}
                      <span className="truncate text-xs text-zinc-400">{hostOf(linkOf(c))}</span>
                    </div>
                  )}

                  <div className="relative mt-auto flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <Users className="h-4 w-4 text-zinc-400" />
                      <span className="tabular-nums">{studentCount(c.id)}</span> {t.students.toLowerCase()}
                    </div>
                    <div className="flex items-center gap-2">
                      {(c.start_date || c.end_date) && (
                        <span className="text-xs tabular-nums text-zinc-400">
                          {c.start_date && fmtDate(c.start_date)} {c.end_date && `– ${fmtDate(c.end_date)}`}
                        </span>
                      )}
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-zinc-400 ring-1 ring-zinc-200/70 transition-colors duration-200 group-hover:bg-[#3B1553] group-hover:text-[#FFB547] group-hover:ring-transparent">
                        <ArrowUpRight className="h-4 w-4" />
                      </span>
                    </div>
                  </div>
                </Spot>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={cn(CARD, "dash-rise overflow-hidden")} style={rise(120)}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                <tr>
                  <th className="px-6 py-3.5">{t.className}</th>
                  <th className="px-4 py-3.5">{t.students}</th>
                  <th className="px-4 py-3.5">{t.weeklySchedule}</th>
                  <th className="px-4 py-3.5">Link học</th>
                  <th className="px-6 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visible.map((c: any) => {
                  const color = classColor(c);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-zinc-50/70">
                      <td className="px-6 py-3">
                        <Link to={`/classes/${c.id}`} className={cn("group flex items-center gap-3 rounded-lg", focusRing)}>
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={solid(color)}>
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-900">{c.name}</p>
                            <p className="text-xs text-zinc-500">
                              {c.subject} {c.grade && `· ${c.grade}`}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-zinc-900">{studentCount(c.id)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {slots(c.id).map((s: any) => (
                            <span key={s.id} className={SLOT_CHIP} style={{ background: wash(color, 14), borderColor: wash(color, 45), color: deep(color) }}>
                              {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {linkOf(c) ? joinLink(c) : <span className="text-xs text-zinc-300">—</span>}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {colorPicker(c)}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Sửa"
                            onClick={() => {
                              setEditing(c);
                              setOpen(true);
                            }}
                            className={ICON_BTN}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Xóa" onClick={() => handleDelete(c.id)} className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ClassDialog open={open} onOpenChange={setOpen} cls={editing} />
    </div>
  );
}