import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Grid2X2,
  List as ListIcon,
  GraduationCap,
  ArrowUpRight,
  Trash2,
  ArrowUpDown,
  Pencil,
  FileText,
  Phone,
  Users,
  CalendarClock,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEnrollments, useClasses } from "@/hooks/useData";
import StudentDialog from "@/components/StudentDialog";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import ColorPickerButton, { colorOf, useColorDraft } from "@/components/Colorpickerbutton";

/* ---------------- KIỂU GIAO DIỆN ----------------
   Cùng ngôn ngữ thiết kế "Aurora + Bento" với trang Dashboard:
   - Phần chào là khối mận đậm có ba quầng sáng aurora trôi chậm, kèm thẻ kính mờ thống kê nhanh.
   - Thẻ học sinh bo tròn lớn, có ánh sáng đi theo con trỏ chuột (spotlight) mang màu riêng của từng học sinh.
   - Thẻ và khối xuất hiện lần lượt từng cái; mọi chuyển động tắt khi người dùng bật "giảm chuyển động".
   Bảng màu: mận đậm #3B1553 · hổ phách #FFB547 · tím hồng cho aurora.
   Màu của từng học sinh (do người dùng chọn) vẫn là điểm nhấn chính: vạch màu trên thẻ, avatar đặc, nền thẻ phủ sắc rất nhạt. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
// Số đếm dùng chữ đơn cách (mono) cho cảm giác "bảng điều khiển"
const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const CARD =
  "rounded-[28px] border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(59,21,83,0.04),0_18px_44px_-22px_rgba(59,21,83,0.22)]";
// Kính mờ đặt trên nền mận đậm / aurora
const GLASS = "border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl";
const CHIP = "inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 text-sm font-medium text-white backdrop-blur-md";
const PILL = "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700";
const FIELD =
  "h-10 rounded-full border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#3B1553] focus-visible:ring-2 focus-visible:ring-[#3B1553]/10";
const ICON_BTN = "relative z-20 h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900";
const PRIMARY = "h-10 shrink-0 gap-2 rounded-xl bg-[#3B1553] px-4 text-sm font-semibold text-white shadow-md shadow-[#3B1553]/25 hover:bg-[#521F70]";
const SEG = "flex w-fit max-w-full flex-wrap gap-0.5 rounded-3xl bg-zinc-100 p-1";
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

const cleanName = (val: any) => {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (["game", "vi", "en"].includes(trimmed.toLowerCase())) return "";
  return trimmed;
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

// Vòng tiến độ có gradient hổ phách (dùng cho tỉ lệ học sinh đã vào lớp)
function ProgressRing({ pct, size = 56, stroke = 5, id = "stu-ring" }: { pct: number; size?: number; stroke?: number; id?: string }) {
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

export default function Students() {
  const { t, user } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const enrollmentsQuery = useEnrollments();
  const classesQuery = useClasses();
  // Màu đang kéo dở của từng học sinh (xem trước ngay, chưa lưu)
  const colors = useColorDraft();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "created-desc" | "created-asc" | "grade-asc">("name-asc");

  const { data: students = [] } = useQuery({
    queryKey: ["students-list", user?.id],
    enabled: !!user?.id,
    // Luôn tải lại khi mở trang, để các chỉnh sửa trong hồ sơ học sinh (như ngày thu học phí) hiện ngay ở đây
    staleTime: 0,
    refetchOnMount: "always",
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("user_id", user.id).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const enrichedStudents = useMemo(() => {
    const enrollmentsList = Array.isArray(enrollmentsQuery?.data) ? enrollmentsQuery.data : Array.isArray(enrollmentsQuery) ? enrollmentsQuery : [];
    const classesList = Array.isArray(classesQuery?.data) ? classesQuery.data : Array.isArray(classesQuery) ? classesQuery : [];

    return students.map((st: any) => {
      const cleaned = cleanName(st.name);
      const rawParentName = cleanName(st.parent_name);
      const rawParentPhone = st.parent_phone?.trim();
      const cids = enrollmentsList.filter((e: any) => e.student_id === st.id).map((e: any) => e.class_id);

      // Ngày thu học phí hằng tháng (cột billing_day), chưa đặt thì để trống
      const billingDayNum = Number(st.billing_day);
      const billingDay = billingDayNum >= 1 && billingDayNum <= 31 ? billingDayNum : null;

      return {
        ...st,
        displayName: cleaned || "Chưa đặt tên",
        initial: cleaned ? cleaned.charAt(0).toUpperCase() : "?",
        displayPhone: st.phone || "—",
        displayGrade: st.grade || "—",
        displayParentName: rawParentName !== "" ? rawParentName : null,
        displayParentPhone: rawParentPhone ? rawParentPhone : null,
        accent: colorOf(st.color, st.id ?? cleaned),
        studentClasses: classesList.filter((c: any) => cids.includes(c.id)),
        billingDay,
      };
    });
  }, [students, enrollmentsQuery, classesQuery]);

  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase();
    const list = enrichedStudents.filter(
      (st: any) =>
        st.displayName.toLowerCase().includes(q) ||
        String(st.displayPhone).toLowerCase().includes(q) ||
        (st.displayParentName && st.displayParentName.toLowerCase().includes(q)) ||
        (st.displayParentPhone && st.displayParentPhone.toLowerCase().includes(q))
    );
    return list.sort((a: any, b: any) => {
      if (sortBy === "name-asc") return a.displayName.localeCompare(b.displayName, "vi", { sensitivity: "base" });
      if (sortBy === "name-desc") return b.displayName.localeCompare(a.displayName, "vi", { sensitivity: "base" });
      if (sortBy === "created-desc") return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (sortBy === "created-asc") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortBy === "grade-asc") return (parseInt(a.displayGrade) || 0) - (parseInt(b.displayGrade) || 0);
      return 0;
    });
  }, [enrichedStudents, search, sortBy]);

  // Số liệu nhanh cho phần chào (tính trên toàn bộ học sinh, không phụ thuộc ô tìm kiếm)
  const stats = useMemo(() => {
    const total = enrichedStudents.length;
    const enrolled = enrichedStudents.filter((s: any) => s.studentClasses.length > 0).length;
    const monthly = enrichedStudents.filter((s: any) => s.payment_mode === "monthly").length;
    const noBilling = enrichedStudents.filter((s: any) => !s.billingDay).length;
    return {
      total,
      enrolled,
      monthly,
      session: total - monthly,
      noBilling,
      pct: total > 0 ? Math.round((enrolled / total) * 100) : 0,
    };
  }, [enrichedStudents]);

  const openCreate = () => {
    setSelectedStudent(null);
    setDialogOpen(true);
  };
  const openEdit = (e: React.MouseEvent, st: any) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedStudent(st);
    setDialogOpen(true);
  };
  const handleDelete = async (e: React.MouseEvent, st: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirm({ description: t.confirmDelete, destructive: true }))) return;
    const { error } = await supabase.from("students").delete().eq("id", st.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t.save);
    qc.invalidateQueries({ queryKey: ["students-list"] });
  };

  // Màu hiển thị của học sinh: màu đang kéo dở nếu có, không thì màu đã lưu
  const accentOf = (st: any): string => colors.draft[st.id] ?? st.accent;

  // Lưu màu tự chọn của học sinh (mã #rrggbb) vào cột color
  const commitColor = async (st: any, hex: string) => {
    const { error } = await supabase.from("students").update({ color: hex } as any).eq("id", st.id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["student", st.id] });
      await qc.invalidateQueries({ queryKey: ["students-list"] });
    }
    colors.clear(st.id); // bỏ màu xem trước: lưu được thì dữ liệu mới đã có màu này, lỗi thì quay về màu cũ
  };

  const colorPicker = (st: any) => (
    <ColorPickerButton
      value={accentOf(st)}
      label="Chọn màu học sinh"
      onPreview={(hex) => colors.set(st.id, hex)}
      onCommit={(hex) => commitColor(st, hex)}
    />
  );

  // Dùng hàm render thay vì component lồng nhau để tránh bị mount lại mỗi lần render
  const renderAvatar = (st: any, size: string) => (
    <div className={cn("grid shrink-0 place-items-center rounded-full font-semibold", size)} style={solid(accentOf(st))}>
      {st.initial}
    </div>
  );

  const gradePill = (st: any) => (
    <span className={PILL} style={{ background: wash(accentOf(st), 18), color: deep(accentOf(st)) }}>
      <GraduationCap className="h-3.5 w-3.5 opacity-60" /> Lớp {st.displayGrade}
    </span>
  );
  const paymentPill = (st: any) => (
    <span className={PILL} style={{ background: wash(accentOf(st), 18), color: deep(accentOf(st)) }}>{st.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}</span>
  );
  const classChips = (st: any, max = 3) => {
    const shown = st.studentClasses.slice(0, max);
    const rest = st.studentClasses.length - shown.length;
    return (
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c: any) => (
          <span key={c.id} className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-600">{c.name}</span>
        ))}
        {rest > 0 && <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-400">+{rest}</span>}
      </div>
    );
  };

  const title = t.students || "Danh sách học sinh";
  const previewStudents = enrichedStudents.slice(0, 5);
  const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

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
                Quản lý học sinh
              </span>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
                <span className="dash-sheen bg-gradient-to-r from-[#FFD27A] via-[#FF9A6B] to-[#FFD27A] bg-clip-text text-transparent">{title}</span>
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-white/65">
                Quản lý thông tin, lớp học và học phí của <span className="font-semibold tabular-nums text-white">{students.length}</span> học sinh.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={openCreate}
                className="h-10 gap-2 rounded-full bg-[#FFB547] px-5 text-sm font-semibold text-[#3B1553] shadow-sm shadow-[#FFB547]/40 hover:bg-[#ffa726] focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} /> {t.addStudent || "Thêm học sinh"}
              </Button>
              {stats.total > 0 &&
                (stats.noBilling > 0 ? (
                  <span className={cn(CHIP, "border-[#FFB547]/40 bg-[#FFB547]/15 text-[#FFD9A0]")}>
                    <CalendarClock className="h-4 w-4 text-[#FFB547]" />
                    <span className="tabular-nums">{stats.noBilling}</span> chưa đặt ngày thu
                  </span>
                ) : (
                  <span className={CHIP}>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    Đã đặt ngày thu cho tất cả
                  </span>
                ))}
            </div>
          </div>

          {/* Thẻ kính mờ: tổng số học sinh + cơ cấu + tỉ lệ đã vào lớp */}
          <div className={cn(GLASS, "relative flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[28px] p-5 sm:p-6")}>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
                <Users className="h-3.5 w-3.5" />
                Tổng quan
              </span>
              {previewStudents.length > 0 && (
                <div className="flex -space-x-2">
                  {previewStudents.map((s: any) => (
                    <span
                      key={s.id}
                      title={s.displayName}
                      className="grid h-8 w-8 place-items-center rounded-full text-[11px] font-semibold ring-2 ring-[#3B1553]"
                      style={solid(accentOf(s))}
                    >
                      {s.initial}
                    </span>
                  ))}
                  {stats.total > previewStudents.length && (
                    <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white/15 px-1.5 text-[11px] font-semibold ring-2 ring-[#3B1553]">
                      +{stats.total - previewStudents.length}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-baseline gap-2">
              <span className={cn(MONO, "text-5xl font-bold tabular-nums tracking-tight text-[#FFD27A]")}>
                <CountNum value={stats.total} />
              </span>
              <span className="text-sm font-medium text-white/55">học sinh</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Theo tháng", value: stats.monthly, warn: false },
                { label: "Theo buổi", value: stats.session, warn: false },
                { label: "Chưa đặt ngày thu", value: stats.noBilling, warn: stats.noBilling > 0 },
              ].map((tile) => (
                <div key={tile.label} className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-sm">
                  <div className="text-[11px] font-medium leading-snug text-white/60">{tile.label}</div>
                  <div className={cn("text-lg font-bold tabular-nums", tile.warn ? "text-[#FFB547]" : "text-white")}>{tile.value}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 border-t border-white/10 pt-4">
              <div className="relative grid shrink-0 place-items-center">
                <ProgressRing pct={stats.pct} />
                <span className="absolute text-xs font-bold tabular-nums">{stats.pct}%</span>
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white/60">Đã tham gia lớp</div>
                <div className="text-lg font-bold tabular-nums">
                  {stats.enrolled}
                  <span className="text-sm font-medium text-white/50">/{stats.total} học sinh</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ========== THANH CÔNG CỤ ========== */}
      <section className={cn(CARD, "dash-rise flex flex-col gap-3 p-3.5 sm:p-4 lg:flex-row lg:items-center")} style={rise(80)}>
        <div className="relative w-full lg:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Tìm theo tên học sinh, SĐT..." value={search} onChange={(e) => setSearch(e.target.value)} className={cn(FIELD, "pl-10")} />
        </div>

        <div className="w-full lg:w-[13rem]">
          <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
            <SelectTrigger className={cn(FIELD, "w-full font-medium text-zinc-700")}>
              <div className="flex items-center gap-2 truncate">
                <ArrowUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
                <SelectValue placeholder="Sắp xếp" />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-2xl text-sm">
              <SelectItem value="name-asc">Tên (A → Z)</SelectItem>
              <SelectItem value="name-desc">Tên (Z → A)</SelectItem>
              <SelectItem value="created-desc">Mới nhất</SelectItem>
              <SelectItem value="created-asc">Cũ nhất</SelectItem>
              <SelectItem value="grade-asc">Khối lớp (tăng dần)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-3 lg:ml-auto">
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium tabular-nums text-zinc-600">
            {filteredStudents.length}
            {filteredStudents.length !== stats.total ? ` / ${stats.total}` : ""} học sinh
          </span>
          <div className={SEG}>
            {([["grid", Grid2X2, "Lưới"], ["list", ListIcon, "Bảng"]] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                aria-label={label}
                onClick={() => setViewMode(mode)}
                className={cn(segBtn(viewMode === mode), "flex items-center gap-1.5")}
              >
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ========== NỘI DUNG ========== */}
      {filteredStudents.length === 0 ? (
        <div className={cn(CARD, "dash-rise flex flex-col items-center gap-4 border-dashed border-zinc-300 p-12 text-center")} style={rise(120)}>
          <div className="grid h-14 w-14 place-items-center rounded-2xl text-[#FFB547] shadow-lg shadow-[#3B1553]/20" style={ICON_TILE_BG}>
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-900">{search ? "Không có học sinh nào khớp" : "Chưa có học sinh nào"}</h3>
            <p className="text-sm text-zinc-500">{search ? "Thử đổi từ khóa hoặc xóa ô tìm kiếm." : "Thêm học sinh đầu tiên để bắt đầu."}</p>
          </div>
          <Button onClick={search ? () => setSearch("") : openCreate} className={PRIMARY}>
            {search ? "Xóa tìm kiếm" : t.addStudent || "Thêm học sinh"}
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStudents.map((st: any, i: number) => {
            const accent = accentOf(st);
            return (
              <div key={st.id} className="dash-rise group relative" style={rise(120 + Math.min(i, 11) * 40)}>
                <Spot
                  tint={`color-mix(in srgb, ${accent} 22%, transparent)`}
                  className="flex h-full flex-col gap-5 overflow-hidden rounded-[28px] border p-5 pt-6 transition-shadow duration-200 group-hover:shadow-[0_2px_4px_rgba(59,21,83,0.05),0_22px_44px_-18px_rgba(59,21,83,0.3)]"
                  style={{ background: wash(accent, 6), borderColor: wash(accent, 38) }}
                >
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full opacity-30 blur-3xl"
                    style={{ background: accent }}
                  />
                  <Link
                    to={`/students/${st.id}`}
                    aria-label={`Xem hồ sơ ${st.displayName}`}
                    className={cn("absolute inset-0 z-10 rounded-[28px]", focusRing)}
                  />

                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {renderAvatar(st, "h-12 w-12 text-lg")}
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-bold text-zinc-900">{st.displayName}</h3>
                        <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500">{st.displayPhone}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-0.5 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                      {colorPicker(st)}
                      <Button variant="ghost" size="icon" aria-label="Sửa" onClick={(e) => openEdit(e, st)} className={ICON_BTN}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" aria-label="Xóa" onClick={(e) => handleDelete(e, st)} className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600")}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="relative flex flex-wrap gap-1.5">
                    {gradePill(st)}
                    {paymentPill(st)}
                  </div>

                  <dl className="relative grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-white/75 p-3.5 ring-1 ring-zinc-200/60">
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1.5 text-xs text-zinc-500"><Users className="h-3.5 w-3.5" /> Phụ huynh</dt>
                      <dd className={cn("mt-1 truncate text-sm", st.displayParentName ? "font-medium text-zinc-900" : "text-zinc-400")}>
                        {st.displayParentName ?? "Chưa có"}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="flex items-center gap-1.5 text-xs text-zinc-500"><Phone className="h-3.5 w-3.5" /> SĐT phụ huynh</dt>
                      <dd className={cn("mt-1 truncate text-sm tabular-nums", st.displayParentPhone ? "font-medium text-zinc-900" : "text-zinc-400")}>
                        {st.displayParentPhone ?? "Chưa có"}
                      </dd>
                    </div>

                    {/* Ngày đóng học phí */}
                    <div className="col-span-2 flex items-center justify-between gap-3 border-t border-zinc-100 pt-3">
                      <dt className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                        <CalendarClock className="h-3.5 w-3.5" /> Ngày đóng học phí
                      </dt>
                      <dd className={cn("whitespace-nowrap text-sm", st.billingDay ? "font-semibold tabular-nums text-zinc-900" : "text-zinc-400")}>
                        {st.billingDay ? `Ngày ${st.billingDay}` : "Chưa đặt"}
                      </dd>
                    </div>
                  </dl>

                  <div className="relative mt-auto flex items-end justify-between gap-3">
                    {st.studentClasses.length === 0 ? <span className="text-xs text-zinc-400">Chưa tham gia lớp nào</span> : classChips(st)}
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/80 text-zinc-400 ring-1 ring-zinc-200/70 transition-colors duration-200 group-hover:bg-[#3B1553] group-hover:text-[#FFB547] group-hover:ring-transparent">
                      <ArrowUpRight className="h-4 w-4" />
                    </span>
                  </div>
                </Spot>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={cn(CARD, "dash-rise overflow-hidden")} style={rise(120)}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/70 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-400">
                <tr>
                  <th className="px-6 py-3.5">Học sinh</th>
                  <th className="px-4 py-3.5">Khối lớp</th>
                  <th className="px-4 py-3.5">Phụ huynh & SĐT</th>
                  <th className="px-4 py-3.5">Lớp tham gia</th>
                  <th className="px-4 py-3.5">Hình thức</th>
                  <th className="px-4 py-3.5">Ngày đóng học phí</th>
                  <th className="px-6 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredStudents.map((st: any) => (
                  <tr key={st.id} className="transition-colors hover:bg-zinc-50/70">
                    <td className="px-6 py-3">
                      <Link to={`/students/${st.id}`} className={cn("group flex items-center gap-3 rounded-lg", focusRing)}>
                        {renderAvatar(st, "h-10 w-10 text-sm")}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900">{st.displayName}</p>
                          <p className="text-xs tabular-nums text-zinc-500">{st.displayPhone}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{gradePill(st)}</td>
                    <td className="px-4 py-3">
                      <p className={cn(st.displayParentName ? "font-medium text-zinc-900" : "text-zinc-400")}>{st.displayParentName ?? "Chưa có"}</p>
                      <p className="text-xs tabular-nums text-zinc-500">{st.displayParentPhone ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">{st.studentClasses.length === 0 ? <span className="text-zinc-300">—</span> : classChips(st, 4)}</td>
                    <td className="px-4 py-3">{paymentPill(st)}</td>
                    <td className="px-4 py-3">
                      {st.billingDay ? (
                        <p className="font-semibold tabular-nums text-zinc-900">Ngày {st.billingDay}</p>
                      ) : (
                        <span className="text-zinc-400">Chưa đặt</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {colorPicker(st)}
                        <Button asChild variant="ghost" size="icon" aria-label="Xem hồ sơ" className={ICON_BTN}>
                          <Link to={`/students/${st.id}`}><FileText className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Sửa" onClick={(e) => openEdit(e, st)} className={ICON_BTN}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Xóa" onClick={(e) => handleDelete(e, st)} className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <StudentDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            setSelectedStudent(null);
            qc.invalidateQueries({ queryKey: ["students-list"] });
          }
        }}
        student={selectedStudent}
      />
    </div>
  );
}