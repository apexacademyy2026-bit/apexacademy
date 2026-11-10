import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Plus, Trash2, BookOpen, Palette, Clock, Wallet, Video, MapPin, Link2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useClassSchedules } from "@/hooks/useData";
import { colorOf } from "@/components/Colorpickerbutton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLORS = [
  "#93c5fd", "#bfdbfe", "#a7f3d0", "#fef08a", "#fbcfe8",
  "#ddd6fe", "#fecaca", "#c7d2fe", "#bbf7d0", "#fed7aa"
];

type Category = "math" | "english" | "none";
type Mode = "online" | "offline";

// Môn học được suy ra từ dropdown phân loại (lưu vào cột `subject` để các trang khác vẫn dùng được)
const SUBJECT_LABEL: Record<Category, string> = {
  math: "Toán",
  english: "Tiếng Anh",
  none: "",
};

// 1 tháng = 4 tuần (ví dụ 2 buổi/tuần → 8 buổi/tháng)
const WEEKS_PER_MONTH = 4;

const calcMonthly = (perSession: string, perWeek: string) => {
  const s = Number(perSession);
  const w = Number(perWeek);
  return s > 0 && w > 0 ? String(s * w * WEEKS_PER_MONTH) : "";
};

const fmt = (n: number) => n.toLocaleString("vi-VN");

/* Design tokens: lấy y hệt trang Classes (navy #0B1B3A · nền trắng · viền zinc mảnh · màu lớp nổi bật) */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const FIELD =
  "h-10 rounded-xl border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const AREA =
  "min-h-[90px] rounded-xl border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const PRIMARY = "h-10 shrink-0 gap-2 rounded-xl bg-[#0B1B3A] px-5 text-sm font-semibold text-white shadow-none hover:bg-[#13285a]";
const LABEL = "mb-1.5 block text-sm font-medium text-zinc-700";
const EMPTY = "rounded-xl border border-dashed border-zinc-300 bg-zinc-50 py-5 text-center text-sm text-zinc-500";

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#0B1B3A" : "#ffffff";
};
// Ô màu đặc, có quầng sáng cùng màu
const solid = (c: string): CSSProperties => ({
  background: c,
  color: inkOn(c),
  boxShadow: `0 8px 18px -8px ${c}`,
});
// Phủ một lớp màu rất nhạt lên nền trắng
const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;

/* ---------- Chọn màu tự do (HSL) ---------- */
const HEX_RE = /^#[0-9a-f]{6}$/i;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const hexToHsl = (hex: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return [213, 94, 78];
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
};

const hslToHex = (h: number, s: number, l: number) => {
  const S = s / 100;
  const L = l / 100;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return L - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  const hex = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
};

const HUE_GRADIENT =
  "linear-gradient(to right, hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%), hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%))";

// Thanh kéo chọn giá trị trên dải màu (tự vẽ bằng div để tạo kiểu đồng bộ với giao diện)
function GradientBar({
  label, value, min, max, gradient, thumb, onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  gradient: string;
  thumb: string;
  onChange: (v: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = clamp((clientX - r.left) / r.width, 0, 1);
    onChange(Math.round(min + ratio * (max - min)));
  };
  const pct = ((clamp(value, min, max) - min) / (max - min)) * 100;

  return (
    <div className="px-2.5">
      <div
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        className="relative h-3 cursor-pointer touch-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/40 focus-visible:ring-offset-2"
        style={{ background: gradient }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e.clientX);
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") {
            e.preventDefault();
            onChange(clamp(value + step, min, max));
          } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
            e.preventDefault();
            onChange(clamp(value - step, min, max));
          }
        }}
      >
        <span
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow-md ring-1 ring-black/15"
          style={{ left: `${pct}%`, background: thumb }}
        />
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <h4 className="flex items-center gap-2.5 text-sm font-semibold text-zinc-900">
      <span className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
        <Icon className="h-3.5 w-3.5" />
      </span>
      {children}
    </h4>
  );
}

export default function ClassDialog({ open, onOpenChange, cls }: { open: boolean; onOpenChange: (o: boolean) => void; cls?: any }) {
  const { t, user, lang } = useApp();
  const vi = lang === "vi";
  const qc = useQueryClient();
  const schedulesQuery = useClassSchedules();

  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [category, setCategory] = useState<Category>("none");
  const [mode, setMode] = useState<Mode>("offline");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [feePerSession, setFeePerSession] = useState("");
  const [sessionsPerWeek, setSessionsPerWeek] = useState("");
  const [feePerMonth, setFeePerMonth] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [hsl, setHsl] = useState<[number, number, number]>(() => hexToHsl(COLORS[0]));
  const [hexText, setHexText] = useState(COLORS[0]);
  const [notes, setNotes] = useState("");
  const [schedules, setSchedules] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([]);

  // Đặt màu từ mã hex (mở lớp cũ, bấm màu gợi ý)
  const applyHex = (hex: string) => {
    const h = String(hex).toLowerCase();
    setColor(h);
    setHsl(hexToHsl(h));
    setHexText(h);
  };
  // Đặt màu từ thanh kéo; giữ nguyên bộ HSL để thanh không bị nhảy khi màu gần trắng/đen
  const applyHsl = (h: number, s: number, l: number) => {
    const hex = hslToHex(h, s, l);
    setHsl([h, s, l]);
    setColor(hex);
    setHexText(hex);
  };

  useEffect(() => {
    if (cls) {
      setName(cls.name || "");
      setGrade(cls.grade || "");
      setCategory(cls.category || "none");
      setMode(cls.delivery_mode === "online" ? "online" : "offline");
      setMeetingUrl(cls.meeting_url || "");
      setStartDate(cls.start_date || "");
      setEndDate(cls.end_date || "");
      setFeePerMonth(cls.fee_per_month ? String(cls.fee_per_month) : "");
      setFeePerSession(cls.fee_per_session ? String(cls.fee_per_session) : "");
      applyHex(colorOf(cls.color, cls.id)); // cùng màu đang hiển thị trên thẻ lớp
      setNotes(cls.notes || "");

      // Số buổi/tuần không lưu riêng trong DB → suy ngược từ học phí tháng ÷ (học phí buổi × 4)
      const perSession = Number(cls.fee_per_session || 0);
      const perMonth = Number(cls.fee_per_month || 0);
      let spw = "";
      if (perSession > 0 && perMonth > 0) {
        const n = perMonth / (perSession * WEEKS_PER_MONTH);
        if (Number.isInteger(n) && n > 0) spw = String(n);
      }
      setSessionsPerWeek(spw);

      const existing = (schedulesQuery.data || []).filter((s: any) => s.class_id === cls.id);
      setSchedules(existing.map((s: any) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time.slice(0, 5),
        end_time: s.end_time.slice(0, 5),
      })));
    } else {
      setName(""); setGrade(""); setCategory("none"); setMode("offline"); setMeetingUrl("");
      setStartDate(""); setEndDate(""); setFeePerMonth(""); setFeePerSession(""); setSessionsPerWeek("");
      applyHex(COLORS[0]); setNotes(""); setSchedules([]);
    }
  }, [cls, open, schedulesQuery.data]);

  const addSchedule = () => setSchedules([...schedules, { day_of_week: 1, start_time: "18:00", end_time: "19:30" }]);
  const removeSchedule = (i: number) => setSchedules(schedules.filter((_, idx) => idx !== i));
  const updateSchedule = (i: number, k: string, v: any) => {
    const copy = [...schedules];
    (copy[i] as any)[k] = v;
    setSchedules(copy);
  };

  // Đổi học phí/buổi hoặc số buổi/tuần → tự tính lại học phí tháng
  const onFeePerSessionChange = (v: string) => {
    setFeePerSession(v);
    const m = calcMonthly(v, sessionsPerWeek);
    if (m) setFeePerMonth(m);
  };
  const onSessionsPerWeekChange = (v: string) => {
    setSessionsPerWeek(v);
    const m = calcMonthly(feePerSession, v);
    if (m) setFeePerMonth(m);
  };

  const perSessionNum = Number(feePerSession) || 0;
  const perWeekNum = Number(sessionsPerWeek) || 0;
  const showCalc = perSessionNum > 0 && perWeekNum > 0;

  const save = async () => {
    if (!name.trim()) { toast.error(t.className + " required"); return; }
    if (!user) return;

    // Môn học lấy từ phân loại; lớp cũ chưa phân loại thì giữ nguyên môn học đã có
    const subject =
      SUBJECT_LABEL[category] ||
      (cls && (cls.category ?? "none") === "none" ? cls.subject || "" : "");

    // Link học: tự thêm https:// nếu người dùng quên; chỉ lưu khi lớp học online
    let link = meetingUrl.trim();
    if (link && !/^https?:\/\//i.test(link)) link = `https://${link}`;

    // Ép kiểu any vì types.ts của Supabase chưa có 2 cột mới (delivery_mode, meeting_url).
    // Sau khi tạo lại types.ts thì có thể bỏ ": any".
    const payload: any = {
      user_id: user.id,
      name,
      subject,
      grade,
      category,
      delivery_mode: mode,
      meeting_url: mode === "online" && link ? link : null,
      start_date: startDate || null,
      end_date: endDate || null,
      fee_per_month: feePerMonth ? Number(feePerMonth) : null,
      fee_per_session: feePerSession ? Number(feePerSession) : null,
      color,
      notes,
    };

    let cid = cls?.id;
    if (cid) {
      const { error } = await supabase.from("classes").update(payload).eq("id", cid);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("classes").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      cid = data.id;
    }

    if (cid) {
      await supabase.from("class_schedules").delete().eq("class_id", cid);
      if (schedules.length > 0) {
        const rows = schedules.map((s) => ({
          user_id: user.id,
          class_id: cid,
          day_of_week: Number(s.day_of_week),
          start_time: s.start_time,
          end_time: s.end_time,
        }));
        await supabase.from("class_schedules").insert(rows);
      }
    }

    qc.invalidateQueries({ queryKey: qk.classes });
    qc.invalidateQueries({ queryKey: ["class_schedules"] }); // Fix lỗi Type2322 tại đây
    toast.success(t.save);
    onOpenChange(false);
  };

  const catLabels: Record<Category, string> = vi
    ? { math: "Toán", english: "Tiếng Anh", none: "Chưa phân loại" }
    : { math: "Math", english: "English", none: "Unsorted" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[90vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border-zinc-200 bg-white p-0 shadow-xl",
          FONT,
        )}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

        {/* HEADER: giống thẻ lớp — vạch màu trên cùng, nền phủ sắc nhạt, ô icon đặc theo màu đang chọn */}
        <DialogHeader
          className="relative shrink-0 space-y-0 border-b pb-5 pl-6 pr-14 pt-7 text-left transition-colors"
          style={{ background: wash(color, 8), borderColor: wash(color, 38) }}
        >
          <div className="absolute inset-x-0 top-0 h-1.5 transition-colors" style={{ background: color }} />
          <div className="flex items-center gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl transition-colors" style={solid(color)}>
              <BookOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-900 sm:text-xl">
                {cls ? (vi ? "Chỉnh sửa lớp học" : "Edit Class") : (vi ? "Tạo lớp học mới" : "Create New Class")}
              </DialogTitle>
              <p className="mt-0.5 text-sm text-zinc-500">
                {vi ? "Điền thông tin lớp và xếp lịch học cố định hàng tuần." : "Fill in class details and configure weekly slots."}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* NỘI DUNG FORM (cuộn được) */}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">

          {/* 1. THÔNG TIN CHUNG */}
          <section className="space-y-4">
            <SectionTitle icon={BookOpen}>{vi ? "Thông tin chung" : "General Info"}</SectionTitle>

            <div>
              <Label className={LABEL}>{t.className} *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Lớp Toán 12 - Ôn Thi THPT"
                className={FIELD}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className={LABEL}>{t.subject}</Label>
                <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
                  <SelectTrigger className={FIELD}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className={cn("rounded-xl text-sm", FONT)}>
                    <SelectItem value="none">{catLabels.none}</SelectItem>
                    <SelectItem value="math">{catLabels.math}</SelectItem>
                    <SelectItem value="english">{catLabels.english}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className={LABEL}>{t.grade}</Label>
                <Input
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="Lớp 10, Khối 12..."
                  className={FIELD}
                />
              </div>
            </div>

            <div>
              <Label className={LABEL}>{vi ? "Hình thức" : "Format"}</Label>
              <div className="inline-flex w-fit gap-0.5 rounded-full bg-zinc-100 p-1">
                {(["offline", "online"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => setMode(m)}
                    className={cn(
                      "flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                      mode === m ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
                    )}
                  >
                    {m === "online" ? <Video className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
                    {m === "online" ? "Online" : "Offline"}
                  </button>
                ))}
              </div>
            </div>

            {mode === "online" && (
              <div>
                <Label className={LABEL}>{vi ? "Link học" : "Class link"}</Label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <Input
                    type="url"
                    inputMode="url"
                    value={meetingUrl}
                    onChange={(e) => setMeetingUrl(e.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className={cn(FIELD, "pl-10")}
                  />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500">
                  {vi ? "Dán link Google Meet, Zoom, Teams… của lớp (không bắt buộc)." : "Paste the Google Meet, Zoom or Teams link for this class (optional)."}
                </p>
              </div>
            )}
          </section>

          {/* 2. THỜI GIAN & HỌC PHÍ */}
          <section className="space-y-4 border-t border-zinc-100 pt-6">
            <SectionTitle icon={Wallet}>{vi ? "Thời gian & Học phí" : "Duration & Fees"}</SectionTitle>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label className={LABEL}>{t.startDate}</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={FIELD} />
              </div>
              <div>
                <Label className={LABEL}>{t.endDate}</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={FIELD} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label className={LABEL}>{t.feePerSession}</Label>
                <Input
                  type="number"
                  min={0}
                  value={feePerSession}
                  onChange={(e) => onFeePerSessionChange(e.target.value)}
                  placeholder="100000"
                  className={FIELD}
                />
              </div>
              <div>
                <Label className={LABEL}>{vi ? "Số buổi / tuần" : "Sessions / week"}</Label>
                <Input
                  type="number"
                  min={0}
                  max={14}
                  value={sessionsPerWeek}
                  onChange={(e) => onSessionsPerWeekChange(e.target.value)}
                  placeholder="2"
                  className={FIELD}
                />
              </div>
              <div>
                <Label className={LABEL}>{t.feePerMonth}</Label>
                <Input
                  type="number"
                  min={0}
                  value={feePerMonth}
                  onChange={(e) => setFeePerMonth(e.target.value)}
                  placeholder="0"
                  className={cn(FIELD, "bg-zinc-50 font-semibold text-zinc-900")}
                />
              </div>
            </div>

            <div className="rounded-xl border border-[#FFB547]/40 bg-[#FFB547]/10 px-3.5 py-2.5 text-xs leading-relaxed text-zinc-700">
              {showCalc ? (
                <>
                  {fmt(perSessionNum)} ₫ × {perWeekNum} {vi ? "buổi/tuần" : "sessions/week"} × {WEEKS_PER_MONTH} {vi ? "tuần" : "weeks"}
                  {" "}= {perWeekNum * WEEKS_PER_MONTH} {vi ? "buổi/tháng" : "sessions/month"} →{" "}
                  <b className="text-sm font-semibold tabular-nums text-zinc-900">{fmt(perSessionNum * perWeekNum * WEEKS_PER_MONTH)} ₫</b>
                </>
              ) : (
                vi
                  ? `Nhập học phí 1 buổi và số buổi/tuần, học phí tháng sẽ tự tính (1 tháng = ${WEEKS_PER_MONTH} tuần). Vẫn có thể chỉnh tay ô học phí tháng.`
                  : `Enter the per-session fee and sessions per week; the monthly fee is calculated automatically (1 month = ${WEEKS_PER_MONTH} weeks). You can still edit it manually.`
              )}
            </div>
          </section>

          {/* 3. MÀU SẮC & GHI CHÚ */}
          <section className="space-y-4 border-t border-zinc-100 pt-6">
            <SectionTitle icon={Palette}>{vi ? "Màu sắc & Ghi chú" : "Color & Notes"}</SectionTitle>

            <div>
              <Label className={LABEL}>{vi ? "Màu sắc đại diện" : "Class color"}</Label>
              <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
                {/* Xem trước + mã hex + màu gợi ý */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-xl transition-colors" style={solid(color)} />
                  <Input
                    value={hexText}
                    maxLength={7}
                    spellCheck={false}
                    aria-label="Hex"
                    onChange={(e) => {
                      const raw = e.target.value.trim();
                      setHexText(raw);
                      const v = raw.startsWith("#") ? raw : `#${raw}`;
                      if (HEX_RE.test(v)) {
                        setColor(v.toLowerCase());
                        setHsl(hexToHsl(v));
                      }
                    }}
                    onBlur={() => setHexText(color)}
                    className={cn(FIELD, "h-9 w-28 font-mono uppercase")}
                  />
                  <div className="ml-auto flex flex-wrap gap-1.5">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        aria-label={c}
                        onClick={() => applyHex(c)}
                        className={cn(
                          "h-6 w-6 cursor-pointer rounded-full transition-all",
                          color.toLowerCase() === c ? "scale-110 ring-2 ring-[#0B1B3A] ring-offset-2" : "hover:scale-110"
                        )}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                {/* Thanh màu tự chọn */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-zinc-500">{vi ? "Sắc màu" : "Hue"}</span>
                    <div className="flex-1">
                      <GradientBar
                        label={vi ? "Sắc màu" : "Hue"}
                        value={hsl[0]}
                        min={0}
                        max={360}
                        gradient={HUE_GRADIENT}
                        thumb={`hsl(${hsl[0]}, 100%, 50%)`}
                        onChange={(v) => applyHsl(v, hsl[1], hsl[2])}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-zinc-500">{vi ? "Độ đậm" : "Saturation"}</span>
                    <div className="flex-1">
                      <GradientBar
                        label={vi ? "Độ đậm" : "Saturation"}
                        value={hsl[1]}
                        min={15}
                        max={100}
                        gradient={`linear-gradient(to right, hsl(${hsl[0]}, 15%, ${hsl[2]}%), hsl(${hsl[0]}, 100%, ${hsl[2]}%))`}
                        thumb={color}
                        onChange={(v) => applyHsl(hsl[0], v, hsl[2])}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-xs font-medium text-zinc-500">{vi ? "Độ sáng" : "Lightness"}</span>
                    <div className="flex-1">
                      <GradientBar
                        label={vi ? "Độ sáng" : "Lightness"}
                        value={hsl[2]}
                        min={25}
                        max={92}
                        gradient={`linear-gradient(to right, hsl(${hsl[0]}, ${hsl[1]}%, 25%), hsl(${hsl[0]}, ${hsl[1]}%, 58%), hsl(${hsl[0]}, ${hsl[1]}%, 92%))`}
                        thumb={color}
                        onChange={(v) => applyHsl(hsl[0], hsl[1], v)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <Label className={LABEL}>{t.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Thêm ghi chú về giáo trình, yêu cầu… (có thể dán link)"
                className={AREA}
              />
            </div>
          </section>

          {/* 4. LỊCH HỌC CỐ ĐỊNH HÀNG TUẦN */}
          <section className="space-y-4 border-t border-zinc-100 pt-6">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle icon={Clock}>
                {t.weeklySchedule || (vi ? "Lịch học cố định hàng tuần" : "Weekly schedule")}
              </SectionTitle>
              <Button
                type="button"
                variant="outline"
                onClick={addSchedule}
                className="h-9 shrink-0 cursor-pointer gap-1.5 rounded-xl border-zinc-200 px-3 text-sm font-medium text-zinc-700 shadow-none hover:bg-zinc-50"
              >
                <Plus className="h-4 w-4 text-[#FFB547]" strokeWidth={2.5} />
                {vi ? "Thêm ca học" : "Add slot"}
              </Button>
            </div>

            {schedules.length === 0 ? (
              <div className={EMPTY}>
                {vi ? "Chưa có ca học cố định nào. Bấm nút phía trên để thêm." : "No weekly slots yet. Use the button above to add one."}
              </div>
            ) : (
              <div className="space-y-2.5">
                {schedules.map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50/70 p-2.5 sm:flex-row">
                    <Select
                      value={String(s.day_of_week)}
                      onValueChange={(v) => updateSchedule(i, "day_of_week", Number(v))}
                    >
                      <SelectTrigger className={cn(FIELD, "h-9 w-full font-medium sm:w-36")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={cn("rounded-xl text-sm", FONT)}>
                        {t.days.map((d: string, idx: number) => (
                          <SelectItem key={idx} value={String(idx)}>
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex w-full flex-1 items-center gap-2 sm:w-auto">
                      <Input
                        type="time"
                        value={s.start_time}
                        onChange={(e) => updateSchedule(i, "start_time", e.target.value)}
                        className={cn(FIELD, "h-9 font-medium tabular-nums")}
                      />
                      <span className="text-sm font-medium text-zinc-400">–</span>
                      <Input
                        type="time"
                        value={s.end_time}
                        onChange={(e) => updateSchedule(i, "end_time", e.target.value)}
                        className={cn(FIELD, "h-9 font-medium tabular-nums")}
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={vi ? "Xóa ca học" : "Remove slot"}
                      onClick={() => removeSchedule(i)}
                      className="h-8 w-8 shrink-0 cursor-pointer rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* FOOTER */}
        <DialogFooter className="flex shrink-0 flex-row items-center justify-end gap-2 border-t border-zinc-100 bg-white px-6 py-4 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-10 cursor-pointer rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
          >
            {t.cancel}
          </Button>
          <Button type="button" onClick={save} className={cn(PRIMARY, "cursor-pointer")}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}