import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  EyeOff,
  Info,
  LayoutDashboard,
  MapPin,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import ClassDialog, { type DialogClass } from "./ClassDialog";
import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";

/* =====================================================================
   TRANG "VÀO LỚP HỌC" (công khai)
   - Ai cũng xem được: lịch học trong tuần, học phí từng lớp, giới thiệu, liên hệ.
   - Bấm vào một lớp: popup chi tiết (học phí, sĩ số, lịch học) và form đăng ký.
   - Chỉ chủ tài khoản (đang đăng nhập) mới thấy nút "Chỉnh sửa trang".
   - Nội dung được lưu trong bảng Supabase `public_pages` (xem file public_pages.sql).
   - Đăng ký của học sinh được lưu vào `class_registrations` (xem class_registrations.sql).
   Đặt route NGOÀI layout cần đăng nhập, ví dụ:
     <Route path="/lop-hoc" element={<PublicClasses />} />
   ===================================================================== */

export const SHOWCASE_PATH = "/lop-hoc";
const DASHBOARD_PATH = "/students"; // trang quản lý của giáo viên
const LANDING_PATH = "/auth"; // trang giới thiệu (Auth)
const SLUG = "lop-hoc";
const sb: any = supabase;

// Dự án dùng HashRouter nên link neo "#..." sẽ làm hỏng URL. Cuộn bằng code thay vì dùng href.
const jumpTo = (id: string) => (e: { preventDefault: () => void }) => {
  e.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

/* ---------------- Kiểu dữ liệu ---------------- */

type Session = { day: number; start: string; end: string }; // day: 0 = Chủ nhật … 6 = Thứ 7

type ShowcaseClass = {
  id: string;
  classId: string | null; // liên kết với lớp trong hệ thống (nếu lấy từ hệ thống)
  name: string;
  tag: string; // ví dụ "Online", "Tại lớp"
  description: string;
  note: string; // ví dụ "Tối đa 8 học sinh"
  sessions: Session[];
  feeMonth: number;
  feeSession: number;
  capacity: number; // sĩ số tối đa, 0 = không giới hạn
  enrolled: number; // số học sinh đã tham gia (nhập tay, đăng cùng trang)
  visible: boolean;
  colorIdx?: number;
};

type Content = {
  brand: string;
  heroTitle: string;
  heroText: string;
  feeNote: string;
  aboutTitle: string;
  aboutText: string;
  highlights: string[];
  phone: string;
  zalo: string;
  facebook: string;
  address: string;
  maps: string; // liên kết Google Maps (không bắt buộc)
  classes: ShowcaseClass[];
};

const EMPTY: Content = {
  brand: "Apex Academy",
  heroTitle: "Các lớp đang mở, giờ học và học phí",
  heroText: "Xem giờ học và học phí của từng lớp bên dưới. Muốn đăng ký hoặc hỏi thêm, liên hệ trực tiếp để được tư vấn.",
  feeNote: "",
  aboutTitle: "Giới thiệu",
  aboutText: "",
  highlights: [],
  phone: "",
  zalo: "",
  facebook: "",
  address: "",
  maps: "",
  classes: [],
};

const normalize = (raw: any): Content => {
  const r = raw && typeof raw === "object" ? raw : {};
  const str = (v: any, d: string) => (typeof v === "string" ? v : d);
  return {
    brand: str(r.brand, EMPTY.brand),
    heroTitle: str(r.heroTitle, EMPTY.heroTitle),
    heroText: str(r.heroText, EMPTY.heroText),
    feeNote: str(r.feeNote, ""),
    aboutTitle: str(r.aboutTitle, EMPTY.aboutTitle),
    aboutText: str(r.aboutText, ""),
    highlights: Array.isArray(r.highlights) ? r.highlights.map(String) : [],
    phone: str(r.phone, ""),
    zalo: str(r.zalo, ""),
    facebook: str(r.facebook, ""),
    address: str(r.address, ""),
    maps: str(r.maps, ""),
    classes: (Array.isArray(r.classes) ? r.classes : []).map((c: any, i: number) => ({
      id: String(c?.id || uid()),
      classId: c?.classId ? String(c.classId) : null,
      name: str(c?.name, "Lớp học"),
      tag: str(c?.tag, ""),
      description: str(c?.description, ""),
      note: str(c?.note, ""),
      sessions: (Array.isArray(c?.sessions) ? c.sessions : [])
        .map((s: any) => ({ day: Number(s?.day), start: str(s?.start, ""), end: str(s?.end, "") }))
        .filter((s: Session) => s.day >= 0 && s.day <= 6),
      feeMonth: Number(c?.feeMonth) || 0,
      feeSession: Number(c?.feeSession) || 0,
      capacity: Math.max(0, Math.round(Number(c?.capacity) || 0)),
      enrolled: Math.max(0, Math.round(Number(c?.enrolled) || 0)),
      visible: c?.visible !== false,
      colorIdx: typeof c?.colorIdx === "number" ? c.colorIdx : i,
    })),
  };
};

/* ---------------- Tiện ích ---------------- */

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Thứ 2 → Chủ nhật
const DAY_LONG = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
const dayRank = (d: number) => DAY_ORDER.indexOf(d);
const bySession = (a: Session, b: Session) => dayRank(a.day) - dayRank(b.day) || a.start.localeCompare(b.start);
const uid = () => Math.random().toString(36).slice(2, 10);

const toMin = (hhmm: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm || "");
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

// "Thứ 2, 4, 6" hoặc "Thứ 7, Chủ nhật"
const dayText = (days: number[]) => {
  const sorted = [...days].sort((a, b) => dayRank(a) - dayRank(b));
  const nums = sorted.filter((d) => d !== 0).map((d) => d + 1);
  const parts: string[] = [];
  if (nums.length) parts.push(`Thứ ${nums.join(", ")}`);
  if (sorted.includes(0)) parts.push("Chủ nhật");
  return parts.join(", ");
};

// Gom các ngày có cùng giờ học: [{ days: [1, 3], start: "18:00", end: "19:30" }]
const groupSessions = (sessions: Session[]) => {
  const map = new Map<string, { days: number[]; start: string; end: string }>();
  [...sessions].sort(bySession).forEach((s) => {
    const key = `${s.start}-${s.end}`;
    const g = map.get(key) || { days: [], start: s.start, end: s.end };
    if (!g.days.includes(s.day)) g.days.push(s.day);
    map.set(key, g);
  });
  return Array.from(map.values());
};

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

const digits = (s: string) => s.replace(/[^\d+]/g, "");
const withProtocol = (s: string) => (/^https?:\/\//i.test(s.trim()) ? s.trim() : `https://${s.trim()}`);
const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
// Chuỗi trông giống đường dẫn (có tên miền); "Apex Academy" thì không phải
const looksLikeUrl = (s: string) => /^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i.test(s.trim());
// "0868994242" → "0868 994 242"
const formatPhone = (s: string) => {
  const d = s.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : s.trim();
};
const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const CONTACT_LINK = "inline-flex items-center gap-2.5 rounded transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFB547]";

const isMissingTable = (err: any) =>
  !!err && (err.code === "42P01" || err.code === "PGRST205" || /public_pages/i.test(String(err.message || "")));

// Bảng màu cho từng lớp: dùng chung giữa thời khóa biểu và danh sách học phí
type Palette = { solid: string; tint: string; ink: string };
const PALETTE: Palette[] = [
  { solid: "#4F46E5", tint: "#EEF0FF", ink: "#2E2A9E" },
  { solid: "#0F9D8A", tint: "#E3F6F2", ink: "#0B6B5E" },
  { solid: "#E4572E", tint: "#FDEBE5", ink: "#9E3414" },
  { solid: "#C58A0A", tint: "#FBF1D9", ink: "#7A5200" },
  { solid: "#D63A78", tint: "#FCE7F0", ink: "#8E1C4B" },
  { solid: "#1E8FD6", tint: "#E3F2FC", ink: "#0F5A8C" },
  { solid: "#4C9A2A", tint: "#EAF5E2", ink: "#2E6317" },
  { solid: "#8B5CF6", tint: "#F0EAFE", ink: "#5B34B8" },
];
const paletteFor = (c: ShowcaseClass, i: number) => PALETTE[(((c.colorIdx ?? i) % PALETTE.length) + PALETTE.length) % PALETTE.length];

const inputCls =
  "h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-[#0B1B3A] focus:outline-none focus:ring-2 focus:ring-[#0B1B3A]/20";
const areaCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-[#0B1B3A] focus:outline-none focus:ring-2 focus:ring-[#0B1B3A]/20";
const darkInputCls =
  "w-full rounded-xl border border-white/25 bg-white/10 px-3 text-white placeholder:text-white/40 focus:border-[#FFB547] focus:outline-none focus:ring-2 focus:ring-[#FFB547]/30";
const iconBtn =
  "grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]";

/* ---------------- Lấy lớp học từ hệ thống ---------------- */

const fetchRows = async (table: string, userId: string) => {
  let res = await sb.from(table).select("*").eq("user_id", userId);
  if (res.error) res = await sb.from(table).select("*"); // bảng chưa có cột user_id
  if (res.error) throw res.error;
  return (res.data || []) as any[];
};

// Thêm lớp mới, cập nhật ca học + học phí cho lớp đã có. Giữ nguyên phần mô tả, ghi chú, sĩ số và trạng thái ẩn/hiện bạn đã sửa.
const mergeFromSystem = async (base: Content, userId: string) => {
  const [classRows, scheduleRows] = await Promise.all([fetchRows("classes", userId), fetchRows("class_schedules", userId)]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const live = classRows.filter((c) => !(c.end_date && String(c.end_date).slice(0, 10) < today)); // bỏ lớp đã kết thúc

  const classes = [...base.classes];
  let added = 0;
  let updated = 0;
  live.forEach((lc) => {
    const sessions: Session[] = scheduleRows
      .filter((s) => String(s.class_id) === String(lc.id))
      .map((s) => ({ day: Number(s.day_of_week), start: String(s.start_time || "").slice(0, 5), end: String(s.end_time || "").slice(0, 5) }))
      .filter((s) => s.start && s.end && s.day >= 0 && s.day <= 6)
      .sort(bySession);
    const feeMonth = Number(lc.fee_per_month || 0);
    const feeSession = Number(lc.fee_per_session || 0);
    const idx = classes.findIndex((c) => c.classId === String(lc.id));
    if (idx >= 0) {
      classes[idx] = { ...classes[idx], sessions, feeMonth, feeSession };
      updated += 1;
    } else {
      classes.push({
        id: uid(),
        classId: String(lc.id),
        name: lc.name || "Lớp học",
        tag: "",
        description: "",
        note: "",
        sessions,
        feeMonth,
        feeSession,
        capacity: 0,
        enrolled: 0,
        visible: true,
        colorIdx: classes.length,
      });
      added += 1;
    }
  });
  return { content: { ...base, classes }, added, updated };
};

/* ---------------- Thời khóa biểu tuần ---------------- */

type Slot = { cls: ShowcaseClass; start: number; end: number; lane: number; lanes: number };

// Các ca trùng giờ trong cùng một ngày được chia thành các làn song song
const layoutDay = (items: { cls: ShowcaseClass; start: number; end: number }[]): Slot[] => {
  const sorted = [...items].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Slot[] = [];
  let cluster: Slot[] = [];
  let clusterEnd = -1;
  let laneEnds: number[] = [];
  const flush = () => {
    cluster.forEach((s) => {
      s.lanes = laneEnds.length;
    });
    out.push(...cluster);
    cluster = [];
    laneEnds = [];
    clusterEnd = -1;
  };
  sorted.forEach((it) => {
    if (cluster.length && it.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    cluster.push({ ...it, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, it.end);
  });
  flush();
  return out;
};

const PX_PER_HOUR = 64;
const GAP_PX = 28; // khoảng nén thay cho các giờ không có lớp

function Timetable({
  classes,
  palette,
  onOpen,
}: {
  classes: ShowcaseClass[];
  palette: Map<string, Palette>;
  onOpen: (id: string) => void;
}) {
  const data = useMemo(() => {
    const byDay = new Map<number, { cls: ShowcaseClass; start: number; end: number }[]>();
    classes.forEach((c) =>
      c.sessions.forEach((s) => {
        const start = toMin(s.start);
        let end = toMin(s.end);
        if (Number.isNaN(start)) return;
        if (Number.isNaN(end) || end <= start) end = start + 60;
        byDay.set(s.day, [...(byDay.get(s.day) || []), { cls: c, start, end }]);
      }),
    );
    const days = DAY_ORDER.filter((d) => byDay.has(d));
    const slots = new Map<number, Slot[]>(days.map((d) => [d, layoutDay(byDay.get(d)!)]));
    const all = Array.from(slots.values()).flat();
    if (all.length === 0) return null;
    // Chỉ giữ những giờ có lớp; khoảng trống dài được nén lại để lưới không bị kéo dài
    const covered = new Set<number>();
    all.forEach((s) => {
      for (let h = Math.floor(s.start / 60); h < Math.ceil(s.end / 60); h++) covered.add(h);
    });
    const segments: { from: number; to: number; top: number }[] = [];
    Array.from(covered)
      .sort((a, b) => a - b)
      .forEach((h) => {
        const last = segments[segments.length - 1];
        if (last && h === last.to) last.to = h + 1;
        else segments.push({ from: h, to: h + 1, top: 0 });
      });
    let y = 0;
    segments.forEach((sg, i) => {
      sg.top = y;
      y += (sg.to - sg.from) * PX_PER_HOUR + (i < segments.length - 1 ? GAP_PX : 0);
    });
    const yOf = (minute: number) => {
      const sg = segments.find((x) => minute >= x.from * 60 && minute <= x.to * 60) || segments[0];
      return sg.top + ((minute - sg.from * 60) / 60) * PX_PER_HOUR;
    };
    return { days, slots, segments, height: y, yOf };
  }, [classes]);

  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
        Chưa có ca học nào được đăng.
      </div>
    );
  }

  const { days, slots, segments, height, yOf } = data;
  const timeLabel = (s: Slot) => `${String(Math.floor(s.start / 60)).padStart(2, "0")}:${String(s.start % 60).padStart(2, "0")}–${String(Math.floor(s.end / 60)).padStart(2, "0")}:${String(s.end % 60).padStart(2, "0")}`;
  const pal = (c: ShowcaseClass) => palette.get(c.id) || PALETTE[0];

  return (
    <>
      {/* Màn hình rộng: lưới giờ × ngày */}
      <div className="hidden pt-2 md:block">
        <div className="grid" style={{ gridTemplateColumns: `3.25rem repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => (
            <div key={d} className="pb-3 text-center text-sm font-bold text-slate-900">
              {DAY_LONG[d]}
            </div>
          ))}
          <div className="relative" style={{ height }}>
            {segments.map((sg) =>
              Array.from({ length: sg.to - sg.from + 1 }, (_, i) => sg.from + i).map((h) => (
                <span
                  key={`${sg.from}-${h}`}
                  className="absolute right-3 -translate-y-1/2 text-xs tabular-nums text-slate-400"
                  style={{ top: sg.top + (h - sg.from) * PX_PER_HOUR }}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              )),
            )}
          </div>
          {days.map((d) => (
            <div key={d} className="relative border-l border-slate-200" style={{ height }}>
              {segments.map((sg, si) => (
                <div key={sg.from}>
                  {Array.from({ length: sg.to - sg.from + 1 }, (_, i) => i).map((i) => (
                    <div key={i} className="absolute inset-x-0 border-t border-slate-100" style={{ top: sg.top + i * PX_PER_HOUR }} />
                  ))}
                  {si < segments.length - 1 && (
                    <div
                      className="absolute inset-x-0 border-t border-dashed border-slate-300"
                      style={{ top: sg.top + (sg.to - sg.from) * PX_PER_HOUR + GAP_PX / 2 }}
                      aria-hidden
                    />
                  )}
                </div>
              ))}
              {(slots.get(d) || []).map((s, i) => {
                const p = pal(s.cls);
                return (
                  <button
                    type="button"
                    key={`${s.cls.id}-${i}`}
                    onClick={() => onOpen(s.cls.id)}
                    title={`${s.cls.name}, ${timeLabel(s)}`}
                    className={cn(
                      "absolute overflow-hidden rounded-lg border-l-[3px] py-1 text-left transition-[filter] hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]",
                      s.lanes > 1 ? "px-1.5" : "px-2",
                    )}
                    style={{
                      top: yOf(s.start) + 1,
                      height: Math.max(yOf(s.end) - yOf(s.start) - 3, 28),
                      left: `calc(${(s.lane / s.lanes) * 100}% + 3px)`,
                      width: `calc(${100 / s.lanes}% - 6px)`,
                      background: p.tint,
                      borderColor: p.solid,
                      color: p.ink,
                    }}
                  >
                    <div className={cn("font-bold leading-tight", s.lanes > 1 ? "text-[11px]" : "text-[13px]")}>{s.cls.name}</div>
                    {s.lanes > 1 ? (
                      <div className="mt-0.5 text-[11px] leading-tight tabular-nums opacity-80">
                        <div>{timeLabel(s).split("–")[0]}</div>
                        <div>–{timeLabel(s).split("–")[1]}</div>
                      </div>
                    ) : (
                      <div className="text-xs tabular-nums opacity-80">{timeLabel(s)}</div>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Điện thoại: danh sách theo ngày */}
      <div className="space-y-6 md:hidden">
        {days.map((d) => (
          <div key={d}>
            <h3 className="mb-2 text-sm font-bold text-slate-900">{DAY_LONG[d]}</h3>
            <ul className="space-y-2">
              {[...(slots.get(d) || [])]
                .sort((a, b) => a.start - b.start)
                .map((s, i) => {
                  const p = pal(s.cls);
                  return (
                    <li key={`${s.cls.id}-${i}`}>
                      <button
                        type="button"
                        onClick={() => onOpen(s.cls.id)}
                        className="flex w-full items-center gap-3 rounded-xl border-l-4 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                        style={{ background: p.tint, borderColor: p.solid, color: p.ink }}
                      >
                        <span className="w-28 shrink-0 text-sm font-semibold tabular-nums">{timeLabel(s)}</span>
                        <span className="min-w-0 text-sm font-bold">{s.cls.name}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

/* ---------------- Một lớp trong danh sách học phí ---------------- */

function ClassRowView({ c, p, contactHref, onOpen }: { c: ShowcaseClass; p: Palette; contactHref: string; onOpen: () => void }) {
  const groups = groupSessions(c.sessions);
  const noFee = !(c.feeMonth > 0) && !(c.feeSession > 0);
  return (
    <li id={`class-${c.id}`} className="relative scroll-mt-6 py-7 pl-5 md:grid md:grid-cols-[1.15fr_1.1fr_14rem] md:gap-8 md:pl-6">
      <span className="absolute bottom-7 left-0 top-7 w-1 rounded-full" style={{ background: p.solid }} aria-hidden />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-extrabold leading-snug text-slate-900">{c.name}</h3>
          {c.tag && (
            <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: p.tint, color: p.ink }}>
              {c.tag}
            </span>
          )}
        </div>
        {c.description && <p className="mt-1.5 max-w-prose whitespace-pre-line text-sm leading-relaxed text-slate-600">{c.description}</p>}
        {c.note && <p className="mt-1.5 text-sm font-medium text-slate-800">{c.note}</p>}
      </div>

      <div className="mt-4 md:mt-0">
        {groups.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa có lịch học</p>
        ) : (
          <ul className="space-y-1.5">
            {groups.map((g) => (
              <li key={`${g.start}-${g.end}`} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <span className="font-semibold text-slate-900">{dayText(g.days)}</span>
                <span className="tabular-nums text-slate-600">
                  {g.start} – {g.end}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 md:mt-0 md:text-right">
        {c.feeMonth > 0 && (
          <div>
            <span className="text-2xl font-extrabold tabular-nums tracking-tight text-slate-900">{formatVND(c.feeMonth)}</span>
            <span className="text-sm text-slate-500"> / tháng</span>
          </div>
        )}
        {c.feeSession > 0 && (
          <div className={c.feeMonth > 0 ? "mt-0.5 text-sm text-slate-600" : ""}>
            <span className={cn("tabular-nums", c.feeMonth > 0 ? "font-semibold text-slate-800" : "text-2xl font-extrabold tracking-tight text-slate-900")}>
              {formatVND(c.feeSession)}
            </span>
            <span className="text-sm text-slate-500"> / buổi</span>
          </div>
        )}
        {noFee && <p className="text-sm text-slate-500">Liên hệ để biết học phí</p>}
        <div className="mt-3 flex flex-wrap gap-2 md:justify-end">
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex h-9 items-center rounded-lg bg-[#0B1B3A] px-3 text-sm font-bold text-white transition-colors hover:bg-[#13285a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2"
          >
            Xem chi tiết và đăng ký
          </button>
          {contactHref && (
            <a
              href={contactHref}
              target={contactHref.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="inline-flex h-9 items-center rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-900 transition-colors hover:border-[#0B1B3A] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
            >
              Hỏi về lớp này
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

function ClassRowEditor({
  c,
  p,
  isFirst,
  isLast,
  onPatch,
  onMove,
  onRemove,
}: {
  c: ShowcaseClass;
  p: Palette;
  isFirst: boolean;
  isLast: boolean;
  onPatch: (patch: Partial<ShowcaseClass>) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const setSession = (i: number, patch: Partial<Session>) =>
    onPatch({ sessions: c.sessions.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0));

  return (
    <li id={`class-${c.id}`} className="scroll-mt-6 py-3">
      <div
        className={cn("space-y-4 rounded-2xl border border-slate-300 bg-white p-4 md:p-5", !c.visible && "bg-slate-50")}
        style={{ borderLeft: `4px solid ${p.solid}` }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => onPatch({ visible: !c.visible })}
            aria-pressed={c.visible}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]",
              c.visible ? "bg-emerald-50 text-emerald-700" : "bg-slate-200 text-slate-600",
            )}
          >
            {c.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {c.visible ? "Đang hiện trên trang" : "Đang ẩn"}
          </button>
          <div className="flex items-center gap-1.5">
            <button type="button" className={iconBtn} aria-label="Chuyển lớp lên" disabled={isFirst} onClick={() => onMove(-1)}>
              <ArrowUp className="h-4 w-4" />
            </button>
            <button type="button" className={iconBtn} aria-label="Chuyển lớp xuống" disabled={isLast} onClick={() => onMove(1)}>
              <ArrowDown className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(iconBtn, "hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600")}
              aria-label="Xóa lớp khỏi trang"
              onClick={() => {
                if (window.confirm(`Xóa "${c.name}" khỏi trang? Lớp trong hệ thống không bị ảnh hưởng.`)) onRemove();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_11rem]">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Tên lớp</span>
            <input className={inputCls} value={c.name} onChange={(e) => onPatch({ name: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Hình thức</span>
            <input className={inputCls} value={c.tag} placeholder="Online, Tại lớp" onChange={(e) => onPatch({ tag: e.target.value })} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-600">Mô tả ngắn</span>
          <textarea
            className={areaCls}
            rows={2}
            value={c.description}
            placeholder="Lớp dành cho ai, học nội dung gì"
            onChange={(e) => onPatch({ description: e.target.value })}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-slate-600">Ghi chú nổi bật</span>
          <input className={inputCls} value={c.note} placeholder="Ví dụ: Tối đa 8 học sinh" onChange={(e) => onPatch({ note: e.target.value })} />
        </label>

        <div className="space-y-2">
          <span className="text-xs font-semibold text-slate-600">Ca học</span>
          {c.sessions.length === 0 && <p className="text-sm text-slate-500">Chưa có ca học nào.</p>}
          {c.sessions.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                className={cn(inputCls, "w-32")}
                value={s.day}
                aria-label="Ngày học"
                onChange={(e) => setSession(i, { day: Number(e.target.value) })}
              >
                {DAY_ORDER.map((d) => (
                  <option key={d} value={d}>
                    {DAY_LONG[d]}
                  </option>
                ))}
              </select>
              <input type="time" className={cn(inputCls, "w-28")} value={s.start} aria-label="Giờ bắt đầu" onChange={(e) => setSession(i, { start: e.target.value })} />
              <span className="text-slate-400">đến</span>
              <input type="time" className={cn(inputCls, "w-28")} value={s.end} aria-label="Giờ kết thúc" onChange={(e) => setSession(i, { end: e.target.value })} />
              <button
                type="button"
                className={iconBtn}
                aria-label="Xóa ca học"
                onClick={() => onPatch({ sessions: c.sessions.filter((_, idx) => idx !== i) })}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => onPatch({ sessions: [...c.sessions, { day: 1, start: "18:00", end: "19:30" }].sort(bySession) })}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
          >
            <Plus className="h-4 w-4" /> Thêm ca học
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Học phí theo tháng (đ)</span>
            <input
              type="number"
              min={0}
              step={10000}
              className={inputCls}
              value={c.feeMonth || ""}
              placeholder="0"
              onChange={(e) => onPatch({ feeMonth: num(e.target.value) })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Học phí theo buổi (đ)</span>
            <input
              type="number"
              min={0}
              step={10000}
              className={inputCls}
              value={c.feeSession || ""}
              placeholder="0"
              onChange={(e) => onPatch({ feeSession: num(e.target.value) })}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Sĩ số tối đa (0 = không giới hạn)</span>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={c.capacity || ""}
              placeholder="0"
              onChange={(e) => onPatch({ capacity: num(e.target.value) })}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-slate-600">Số học sinh đã tham gia</span>
            <input
              type="number"
              min={0}
              className={inputCls}
              value={c.enrolled || ""}
              placeholder="0"
              onChange={(e) => onPatch({ enrolled: num(e.target.value) })}
            />
          </label>
        </div>
      </div>
    </li>
  );
}

/* ---------------- Trang ---------------- */

export default function PublicClasses() {
  const [session, setSession] = useState<any>(null);
  const [authReady, setAuthReady] = useState(false);
  const [row, setRow] = useState<{ owner_id: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tableMissing, setTableMissing] = useState(false);
  const [saved, setSaved] = useState<Content>(EMPTY);
  const [draft, setDraft] = useState<Content | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null); // lớp đang mở popup
  const autoInit = useRef(false);

  const user = session?.user ?? null;
  // Chưa có bản đăng nào thì người đang đăng nhập là chủ trang; đã có thì phải đúng chủ.
  const isOwner = authReady && loaded && !!user && (row ? row.owner_id === user.id : true);
  const editing = isOwner && draft !== null;
  const view: Content = editing ? (draft as Content) : saved;
  const dirty = editing && JSON.stringify(draft) !== JSON.stringify(saved);

  // Đăng nhập (chỉ để biết có phải chủ trang không)
  useEffect(() => {
    let alive = true;
    let unsubscribe: (() => void) | undefined;
    (async () => {
      try {
        const { data } = await sb.auth.getSession();
        if (alive) setSession(data?.session ?? null);
        const sub = sb.auth.onAuthStateChange((_e: any, s: any) => alive && setSession(s));
        unsubscribe = () => sub?.data?.subscription?.unsubscribe?.();
      } catch {
        /* không đăng nhập: chỉ xem */
      } finally {
        if (alive) setAuthReady(true);
      }
    })();
    return () => {
      alive = false;
      unsubscribe?.();
    };
  }, []);

  // Tải nội dung đã đăng (ai cũng đọc được)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await sb.from("public_pages").select("owner_id, content").eq("slug", SLUG).maybeSingle();
        if (!alive) return;
        if (error) {
          if (isMissingTable(error)) setTableMissing(true);
        } else if (data) {
          setRow({ owner_id: data.owner_id });
          setSaved(normalize(data.content));
        }
      } catch {
        /* hiện trang trống */
      } finally {
        if (alive) setLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    document.title = `Lớp học – ${view.brand}`;
  }, [view.brand]);

  // Cảnh báo khi đóng tab lúc còn thay đổi chưa đăng
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /* ----- Chỉnh sửa ----- */
  const patch = (p: Partial<Content>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const patchClass = (id: string, p: Partial<ShowcaseClass>) =>
    setDraft((d) => (d ? { ...d, classes: d.classes.map((c) => (c.id === id ? { ...c, ...p } : c)) } : d));
  const moveClass = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      if (!d) return d;
      const i = d.classes.findIndex((c) => c.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.classes.length) return d;
      const next = [...d.classes];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...d, classes: next };
    });
  const removeClass = (id: string) => setDraft((d) => (d ? { ...d, classes: d.classes.filter((c) => c.id !== id) } : d));
  const addClass = () =>
    setDraft((d) =>
      d
        ? {
            ...d,
            classes: [
              ...d.classes,
              {
                id: uid(),
                classId: null,
                name: "Lớp mới",
                tag: "",
                description: "",
                note: "",
                sessions: [],
                feeMonth: 0,
                feeSession: 0,
                capacity: 0,
                enrolled: 0,
                visible: true,
                colorIdx: d.classes.length,
              },
            ],
          }
        : d,
    );

  const startEdit = () => setDraft(JSON.parse(JSON.stringify(saved)));

  const cancelEdit = () => {
    if (dirty && !window.confirm("Bỏ các thay đổi chưa đăng?")) return;
    setDraft(null);
  };

  const syncFromSystem = async (silent = false) => {
    if (!user) return;
    setSyncing(true);
    try {
      const r = await mergeFromSystem(draft ?? saved, user.id);
      setDraft(r.content);
      if (!silent) {
        toast.success(r.added + r.updated === 0 ? "Hệ thống chưa có lớp nào đang mở" : `Đã thêm ${r.added} lớp, cập nhật ${r.updated} lớp`);
      }
    } catch (e: any) {
      toast.error(`Chưa lấy được lớp từ hệ thống: ${e?.message || "lỗi không rõ"}`);
    } finally {
      setSyncing(false);
    }
  };

  const savePage = async () => {
    if (!draft || !user) return;
    setSaving(true);
    try {
      const { error } = await sb
        .from("public_pages")
        .upsert({ slug: SLUG, owner_id: user.id, content: draft, updated_at: new Date().toISOString() }, { onConflict: "slug" });
      if (error) throw error;
      setSaved(draft);
      setRow({ owner_id: user.id });
      setDraft(null);
      toast.success("Đã đăng trang");
    } catch (e: any) {
      if (isMissingTable(e)) setTableMissing(true);
      toast.error(
        isMissingTable(e)
          ? "Chưa có bảng public_pages. Chạy file public_pages.sql trong Supabase rồi đăng lại."
          : `Chưa đăng được trang: ${e?.message || "lỗi không rõ"}`,
      );
    } finally {
      setSaving(false);
    }
  };

  // Lần đầu chủ trang vào mà chưa đăng gì: mở sẵn chế độ sửa và lấy lớp từ hệ thống
  useEffect(() => {
    if (!isOwner || row || saved.classes.length > 0 || autoInit.current) return;
    autoInit.current = true;
    setDraft(JSON.parse(JSON.stringify(saved)));
    void (async () => {
      try {
        const r = await mergeFromSystem(saved, user.id);
        setDraft(r.content);
      } catch {
        /* để chủ trang bấm "Lấy lớp từ hệ thống" sau */
      }
    })();
  }, [isOwner, row, saved, user]);

  /* ----- Dữ liệu hiển thị ----- */
  const palette = useMemo(() => new Map(view.classes.map((c, i) => [c.id, paletteFor(c, i)])), [view.classes]);
  const shown = useMemo(() => view.classes.filter((c) => c.visible), [view.classes]);

  // Lớp đang mở popup, chuyển sang dạng gọn cho ClassDialog
  const openCls = view.classes.find((c) => c.id === openId) ?? null;
  const dialogCls: DialogClass | null = openCls && {
    id: openCls.id,
    name: openCls.name,
    tag: openCls.tag,
    description: openCls.description,
    note: openCls.note,
    feeMonth: openCls.feeMonth,
    feeSession: openCls.feeSession,
    enrolled: openCls.enrolled,
    capacity: openCls.capacity,
    schedule: groupSessions(openCls.sessions).map((g) => ({ days: dayText(g.days), time: `${g.start} – ${g.end}` })),
  };

  const summary = useMemo(() => {
    if (shown.length === 0) return "";
    const activeDays = DAY_ORDER.filter((d) => shown.some((c) => c.sessions.some((s) => s.day === d)));
    const monthFees = shown.map((c) => c.feeMonth).filter((f) => f > 0);
    const sessionFees = shown.map((c) => c.feeSession).filter((f) => f > 0);
    const parts = [`Đang mở ${shown.length} lớp`];
    if (activeDays.length) {
      const ranks = activeDays.map(dayRank);
      const contiguous = activeDays.length > 2 && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
      parts.push(
        contiguous
          ? `học từ ${DAY_LONG[activeDays[0]].toLowerCase()} đến ${DAY_LONG[activeDays[activeDays.length - 1]].toLowerCase()}`
          : `học vào ${dayText(activeDays).toLowerCase()}`,
      );
    }
    if (monthFees.length) parts.push(`học phí từ ${formatVND(Math.min(...monthFees))} mỗi tháng`);
    else if (sessionFees.length) parts.push(`học phí từ ${formatVND(Math.min(...sessionFees))} mỗi buổi`);
    return `${parts.join(", ")}.`;
  }, [shown]);

  const phoneHref = view.phone.trim() ? `tel:${digits(view.phone)}` : "";
  const zaloHref = view.zalo.trim()
    ? /^https?:\/\//i.test(view.zalo.trim())
      ? view.zalo.trim()
      : `https://zalo.me/${digits(view.zalo).replace(/^\+?84/, "0")}`
    : "";
  const facebookHref = looksLikeUrl(view.facebook) ? withProtocol(view.facebook) : "";
  // Địa chỉ có thể là chữ hoặc dán thẳng link Google Maps. Link được chuyển thành "Xem trên Google Maps".
  const addressIsUrl = isUrl(view.address);
  const mapsHref = looksLikeUrl(view.maps) ? withProtocol(view.maps) : addressIsUrl ? view.address.trim() : "";
  const addressText = addressIsUrl ? "" : view.address.trim();
  const phoneLabel = formatPhone(view.phone);
  const contactHref = zaloHref || phoneHref;
  const hasContact = !!(phoneHref || zaloHref || facebookHref || addressText || mapsHref);
  const hasAbout = !!(view.aboutText.trim() || view.highlights.some((h) => h.trim()));

  const showAbout = editing || hasAbout;
  const showContact = editing || hasContact;
  const listed = editing ? view.classes : shown;

  return (
    <div className="min-h-screen bg-[#F3F5F9] font-['Be_Vietnam_Pro',sans-serif] text-slate-900">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
      `}</style>

      {/* THANH DÀNH RIÊNG CHO CHỦ TRANG */}
      {isOwner && (
        <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 md:px-6">
            {editing ? (
              <>
                <p className="text-sm font-semibold text-slate-800">
                  Đang chỉnh sửa
                  <span className="ml-2 font-normal text-slate-500">
                    {dirty ? "Người xem chưa thấy thay đổi cho đến khi bạn đăng trang." : "Chưa có thay đổi nào."}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => syncFromSystem()}
                    disabled={syncing}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                  >
                    <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} /> Lấy lớp từ hệ thống
                  </button>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    className="inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                  >
                    Hủy thay đổi
                  </button>
                  <button
                    type="button"
                    onClick={savePage}
                    disabled={saving || !dirty}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2"
                  >
                    {saving ? "Đang đăng..." : "Đăng trang"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-slate-600">Bạn đang xem trang như khách. Chỉ bạn thấy thanh này.</p>
                <div className="flex items-center gap-2">
                  <Link
                    to={DASHBOARD_PATH}
                    className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                  >
                    <LayoutDashboard className="h-4 w-4" /> Về trang quản lý
                  </Link>
                  <button
                    type="button"
                    onClick={startEdit}
                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2"
                  >
                    <Pencil className="h-4 w-4" /> Chỉnh sửa trang
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {isOwner && tableMissing && (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-6xl items-start gap-2 px-4 py-3 text-sm text-amber-900 md:px-6">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Chưa có bảng <b>public_pages</b> trong Supabase nên chưa lưu được trang. Mở SQL Editor, chạy file <b>public_pages.sql</b>, rồi tải lại trang.
            </p>
          </div>
        </div>
      )}

      {/* ĐẦU TRANG */}
      <header className="relative overflow-hidden bg-[#0B1B3A] pb-28 text-white md:pb-36">
        <div className="pointer-events-none absolute -bottom-28 -right-20 hidden h-72 w-72 rounded-full bg-[#FFB547] md:block" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-4 md:px-6">
          <nav className="flex items-center justify-between gap-4 py-5">
            {editing ? (
              <input
                aria-label="Tên thương hiệu"
                className={cn(darkInputCls, "h-10 max-w-[14rem] text-base font-extrabold")}
                value={view.brand}
                onChange={(e) => patch({ brand: e.target.value })}
              />
            ) : (
              <Link to={LANDING_PATH} className="text-lg font-extrabold tracking-tight hover:opacity-90">
                {view.brand}
              </Link>
            )}
            <div className="flex items-center gap-5 text-sm font-semibold text-white/80">
              <a href="#schedule" onClick={jumpTo("schedule")} className="hidden hover:text-white sm:inline">
                Lịch học
              </a>
              <a href="#fees" onClick={jumpTo("fees")} className="hover:text-white">
                Học phí
              </a>
              {showAbout && (
                <a href="#about" onClick={jumpTo("about")} className="hidden hover:text-white sm:inline">
                  Giới thiệu
                </a>
              )}
              {showContact && (
                <a href="#contact" onClick={jumpTo("contact")} className="hover:text-white">
                  Liên hệ
                </a>
              )}
            </div>
          </nav>

          <div className="max-w-3xl pt-10 md:pt-16">
            {editing ? (
              <div className="space-y-3">
                <textarea
                  aria-label="Tiêu đề trang"
                  rows={2}
                  className={cn(darkInputCls, "py-2 text-3xl font-extrabold leading-tight md:text-4xl")}
                  value={view.heroTitle}
                  onChange={(e) => patch({ heroTitle: e.target.value })}
                />
                <textarea
                  aria-label="Giới thiệu ngắn"
                  rows={3}
                  className={cn(darkInputCls, "py-2 text-base leading-relaxed")}
                  value={view.heroText}
                  onChange={(e) => patch({ heroText: e.target.value })}
                />
              </div>
            ) : (
              <>
                <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight md:text-6xl">{view.heroTitle}</h1>
                {view.heroText && <p className="mt-5 max-w-xl text-base leading-relaxed text-white/75 md:text-lg">{view.heroText}</p>}
              </>
            )}
            {summary && <p className="mt-5 max-w-xl text-sm font-semibold text-[#FFB547] md:text-base">{summary}</p>}
            <div className="mt-8 flex flex-wrap gap-3">
              {contactHref && (
                <a
                  href={contactHref}
                  target={contactHref.startsWith("http") ? "_blank" : undefined}
                  rel="noreferrer"
                  className="inline-flex h-12 items-center rounded-xl bg-[#FFB547] px-6 text-sm font-bold text-[#0B1B3A] transition-colors hover:bg-[#ffc46b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B1B3A]"
                >
                  {zaloHref ? "Nhắn Zalo để đăng ký" : "Gọi để đăng ký"}
                </a>
              )}
              <a
                href="#fees"
                onClick={jumpTo("fees")}
                className="inline-flex h-12 items-center rounded-xl border border-white/30 px-6 text-sm font-bold text-white transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Xem học phí
              </a>
            </div>
          </div>
        </div>
      </header>

      <main>
        {/* LỊCH HỌC TRONG TUẦN */}
        <section id="schedule" className="relative mx-auto -mt-16 max-w-6xl scroll-mt-6 px-4 md:-mt-24 md:px-6">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-[#0B1B3A]/10 md:p-8">
            <div className="mb-6 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-xl font-extrabold tracking-tight md:text-2xl">Lịch học trong tuần</h2>
              <p className="text-sm text-slate-500">Bấm vào một ca học để xem chi tiết và đăng ký.</p>
            </div>
            {!loaded ? (
              <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
            ) : (
              <Timetable classes={shown} palette={palette} onOpen={setOpenId} />
            )}
          </div>
        </section>

        {/* HỌC PHÍ TỪNG LỚP */}
        <section id="fees" className="mx-auto max-w-6xl scroll-mt-6 px-4 py-16 md:px-6 md:py-20">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Học phí từng lớp</h2>
            {editing ? (
              <textarea
                aria-label="Ghi chú về học phí"
                rows={2}
                className={cn(areaCls, "mt-3")}
                placeholder="Ghi chú chung về học phí, ví dụ: học phí thu đầu tháng"
                value={view.feeNote}
                onChange={(e) => patch({ feeNote: e.target.value })}
              />
            ) : (
              view.feeNote.trim() && <p className="mt-3 whitespace-pre-line leading-relaxed text-slate-600">{view.feeNote}</p>
            )}
          </div>

          {listed.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
              <p className="font-bold text-slate-900">{isOwner ? "Chưa có lớp nào trên trang" : "Trang đang được cập nhật"}</p>
              <p className="mt-1 text-sm text-slate-500">
                {isOwner
                  ? "Bấm Chỉnh sửa trang, rồi Lấy lớp từ hệ thống để thêm các lớp đang mở."
                  : "Các lớp học sẽ hiện ở đây ngay khi giáo viên đăng lịch."}
              </p>
            </div>
          ) : (
            <ul className={cn("mt-8", editing ? "space-y-1" : "divide-y divide-slate-200 border-y border-slate-200")}>
              {listed.map((c, i) =>
                editing ? (
                  <ClassRowEditor
                    key={c.id}
                    c={c}
                    p={palette.get(c.id) || PALETTE[0]}
                    isFirst={i === 0}
                    isLast={i === listed.length - 1}
                    onPatch={(p) => patchClass(c.id, p)}
                    onMove={(dir) => moveClass(c.id, dir)}
                    onRemove={() => removeClass(c.id)}
                  />
                ) : (
                  <ClassRowView
                    key={c.id}
                    c={c}
                    p={palette.get(c.id) || PALETTE[0]}
                    contactHref={contactHref}
                    onOpen={() => setOpenId(c.id)}
                  />
                ),
              )}
            </ul>
          )}

          {editing && (
            <button
              type="button"
              onClick={addClass}
              className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl border border-dashed border-slate-400 bg-white px-4 text-sm font-bold text-slate-800 hover:border-[#0B1B3A] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
            >
              <Plus className="h-4 w-4" /> Thêm lớp
            </button>
          )}
        </section>

        {/* GIỚI THIỆU */}
        {showAbout && (
          <section id="about" className="scroll-mt-6 border-t border-slate-200 bg-white">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-5 md:gap-14 md:px-6 md:py-20">
              <div className="md:col-span-3">
                {editing ? (
                  <div className="space-y-3">
                    <input
                      aria-label="Tiêu đề phần giới thiệu"
                      className={cn(inputCls, "h-12 text-xl font-extrabold")}
                      value={view.aboutTitle}
                      onChange={(e) => patch({ aboutTitle: e.target.value })}
                    />
                    <textarea
                      aria-label="Nội dung giới thiệu"
                      rows={7}
                      className={areaCls}
                      placeholder="Giới thiệu về bạn và cách dạy. Cách một dòng trống để tách đoạn."
                      value={view.aboutText}
                      onChange={(e) => patch({ aboutText: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{view.aboutTitle}</h2>
                    <div className="mt-4 space-y-4 text-base leading-relaxed text-slate-600">
                      {paragraphs(view.aboutText).map((p, i) => (
                        <p key={i} className="max-w-prose whitespace-pre-line">
                          {p}
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <div className="md:col-span-2">
                {editing ? (
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold text-slate-600">Điểm nổi bật (mỗi dòng một ý)</span>
                    <textarea
                      rows={7}
                      className={areaCls}
                      placeholder={"Lớp nhỏ, tối đa 8 học sinh\nChữa bài chi tiết sau mỗi buổi"}
                      value={view.highlights.join("\n")}
                      onChange={(e) => patch({ highlights: e.target.value.split("\n") })}
                    />
                  </label>
                ) : (
                  <ul className="divide-y divide-slate-200 border-y border-slate-200">
                    {view.highlights
                      .map((h) => h.trim())
                      .filter(Boolean)
                      .map((h, i) => (
                        <li key={i} className="flex items-start gap-3 py-3.5 text-sm font-medium leading-relaxed text-slate-800">
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                          {h}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        )}

        {/* LIÊN HỆ */}
        {showContact && (
          <section id="contact" className="scroll-mt-0 bg-[#0B1B3A] text-white">
            <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 md:grid-cols-2 md:gap-14 md:px-6 md:py-14">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">Liên hệ tư vấn</h2>
                <p className="mt-3 max-w-md leading-relaxed text-white/70">Nhắn hoặc gọi để hỏi về lớp, giờ học và học phí.</p>
              </div>
              {editing ? (
                <div className="space-y-3">
                  <input aria-label="Số điện thoại" className={cn(darkInputCls, "h-10 text-sm")} placeholder="Số điện thoại" value={view.phone} onChange={(e) => patch({ phone: e.target.value })} />
                  <input
                    aria-label="Zalo"
                    className={cn(darkInputCls, "h-10 text-sm")}
                    placeholder="Số Zalo hoặc đường dẫn Zalo"
                    value={view.zalo}
                    onChange={(e) => patch({ zalo: e.target.value })}
                  />
                  <input
                    aria-label="Facebook"
                    className={cn(darkInputCls, "h-10 text-sm")}
                    placeholder="Đường dẫn trang Facebook"
                    value={view.facebook}
                    onChange={(e) => patch({ facebook: e.target.value })}
                  />
                  <input aria-label="Địa chỉ" className={cn(darkInputCls, "h-10 text-sm")} placeholder="Địa chỉ lớp (nếu có)" value={view.address} onChange={(e) => patch({ address: e.target.value })} />
                  <input
                    aria-label="Liên kết Google Maps"
                    className={cn(darkInputCls, "h-10 text-sm")}
                    placeholder="Liên kết Google Maps (không bắt buộc)"
                    value={view.maps}
                    onChange={(e) => patch({ maps: e.target.value })}
                  />
                </div>
              ) : (
                <ul className="space-y-3 text-sm text-white/80">
                  {phoneHref && (
                    <li>
                      <a href={phoneHref} className={CONTACT_LINK}>
                        <Phone className="h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden /> {phoneLabel}
                      </a>
                    </li>
                  )}
                  {zaloHref && (
                    <li>
                      <a href={zaloHref} target="_blank" rel="noreferrer" className={CONTACT_LINK}>
                        <MessageCircle className="h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden /> Nhắn Zalo
                      </a>
                    </li>
                  )}
                  {facebookHref && (
                    <li>
                      <a href={facebookHref} target="_blank" rel="noreferrer" className={CONTACT_LINK}>
                        <FacebookIcon className="h-4 w-4 shrink-0 text-[#FFB547]" /> Facebook
                      </a>
                    </li>
                  )}
                  {(addressText || mapsHref) && (
                    <li>
                      {mapsHref ? (
                        <a
                          href={mapsHref}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`${addressText || "Địa chỉ lớp"}, mở Google Maps`}
                          className={cn(CONTACT_LINK, "items-start")}
                        >
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden /> {addressText || "Xem trên Google Maps"}
                        </a>
                      ) : (
                        <span className="inline-flex items-start gap-2.5">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden /> {addressText}
                        </span>
                      )}
                    </li>
                  )}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="bg-[#0B1B3A] text-center text-xs text-white/50">
        <p className="mx-auto max-w-6xl border-t border-white/10 px-4 py-5 md:px-6">
          © {new Date().getFullYear()} {view.brand}{addressText && `. ${addressText}`}.
        </p>
      </footer>

      {/* POPUP CHI TIẾT + ĐĂNG KÝ CỦA TỪNG LỚP */}
      <ClassDialog
        cls={dialogCls}
        tone={(openCls && palette.get(openCls.id)) || PALETTE[0]}
        open={!!openCls}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      />
    </div>
  );
}