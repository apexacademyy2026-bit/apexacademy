import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Check, X, Plus, Eye, EyeOff, Image as ImageIcon, Sparkles, Receipt, Calendar, Pencil, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatVND, fmtDate, vietQRUrl } from "@/lib/format";
import { toast } from "sonner";
import { useEnrollments, useClasses } from "@/hooks/useData";
import { toBlob } from "html-to-image";
import { useConfirm } from "@/components/ConfirmProvider";
import { resolveStudentColor } from "@/lib/studentColor";
import { LOG, logVal, hasTest, weekdayLabel, dayMonth, timeRange, sessionSort } from "@/lib/Learninglog";
import {
  EMPTY_TEST,
  cleanTests,
  isBlankTest,
  parseTests,
  serializeTests,
  withSpare,
  type TestItem,
} from "@/lib/Learningtests";

// Tên và số điện thoại giáo viên sửa trên hoá đơn được nhớ trong trình duyệt (dùng chung cho mọi học sinh)
const TEACHER_NAME_KEY = "bill_teacher_name";
const TEACHER_PHONE_KEY = "bill_teacher_phone";
const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, val: string | null) => {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    /* bỏ qua nếu trình duyệt chặn lưu trữ */
  }
};

/* ---------- Hỗ trợ lưu hoá đơn thành ảnh ---------- */

// Ảnh trong suốt 1x1, dùng thay mã QR khi không tải được để việc lưu ảnh không bị lỗi
const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

// Dịch vụ proxy ảnh công khai có bật CORS (wsrv.nl), chỉ dùng khi tải trực tiếp từ VietQR bị trình duyệt chặn.
// Khi dùng, đường dẫn mã QR (gồm số tài khoản, tên chủ tài khoản, số tiền, nội dung) được gửi qua dịch vụ này.
// Muốn tắt hẳn thì đặt thành chuỗi rỗng: const QR_IMAGE_PROXY = "";
const QR_IMAGE_PROXY = "https://wsrv.nl/?url=";

// Bề rộng (px) của ảnh hóa đơn khi lưu. Tăng nếu muốn ảnh rộng hơn, giảm nếu muốn ảnh hẹp lại.
// (Cỡ chữ trong ảnh chỉnh riêng ở BILL_SCALE_IMAGE bên dưới.)
const BILL_IMAGE_WIDTH = 1200;
// Giới hạn số điểm ảnh của ảnh khi lưu (Safari / iOS chỉ dựng được tối đa khoảng 16,7 triệu điểm)
const MAX_IMAGE_PIXELS = 14000000;

/* ---------- Cỡ chữ của hoá đơn: nhỏ trên màn hình, to hơn khi in và khi lưu ảnh ---------- */

// Mọi cỡ chữ Tailwind (text-sm, text-lg, ...) bên trong thẻ hoá đơn được nhân với hệ số --bs.
// 1 = cỡ chữ gốc của Tailwind. Muốn chữ to / nhỏ hơn thì chỉ cần đổi 3 số dưới đây.
const BILL_SCALE_SCREEN = 0.75; // xem trước trên màn hình
const BILL_SCALE_IMAGE = 1.35; // ảnh lưu (nút "Lưu ảnh")
const BILL_SCALE_PRINT = { landscape: 1.3, portrait: 1.1 } as const; // in (giấy dọc hẹp hơn nên hệ số nhỏ hơn)

// Cỡ chữ gốc của Tailwind: [rem, line-height]
const BILL_TEXT_SIZES: Record<string, [number, number]> = {
  "text-xs": [0.75, 1.5],
  "text-sm": [0.875, 1.5],
  "text-base": [1, 1.5],
  "text-lg": [1.125, 1.5],
  "text-xl": [1.25, 1.4],
  "text-2xl": [1.5, 1.3],
};
const BILL_LEADINGS: Record<string, number> = {
  "leading-none": 1,
  "leading-tight": 1.25,
  "leading-snug": 1.375,
  "leading-relaxed": 1.625,
};
// Các ô nhập / nút khi sửa hoá đơn (có class "no-print") giữ nguyên cỡ chữ để dễ thao tác.
// Các class leading-* đặt sau cùng để vẫn thắng line-height mặc định của cỡ chữ.
const BILL_FONT_CSS = [
  ...Object.entries(BILL_TEXT_SIZES).map(
    ([cls, [rem, lh]]) =>
      `.printable-bill-card .${cls}:not(.no-print) { font-size: calc(${rem}rem * var(--bs)); line-height: ${lh}; }`
  ),
  ...Object.entries(BILL_LEADINGS).map(
    ([cls, lh]) => `.printable-bill-card .${cls}:not(.no-print) { line-height: ${lh}; }`
  ),
].join("\n");

// Chỉ áp dụng cho bản xem trước trên màn hình: khoảng cách gọn hơn, mã QR nhỏ hơn, giờ học và học phí gộp cùng một dòng.
// Bản in (@media print) và ảnh lưu (bản sao có data-export) giữ nguyên bố cục rộng như thiết kế gốc.
const BILL_ON_SCREEN = '.printable-bill-card:not([data-export="true"])';
const BILL_SCREEN_CSS = `
  @media screen {
    ${BILL_ON_SCREEN} .bill-head { padding: 1rem 1.5rem; row-gap: 0.75rem; column-gap: 2rem; }
    ${BILL_ON_SCREEN} .bill-avatar { width: 3rem; height: 3rem; border-radius: 0.875rem; }
    ${BILL_ON_SCREEN} .bill-table-outer { padding: 1rem 1rem 0; }
    ${BILL_ON_SCREEN} .bill-table-wrap th,
    ${BILL_ON_SCREEN} .bill-table-wrap td { padding-top: 0.625rem; padding-bottom: 0.625rem; }
    ${BILL_ON_SCREEN} .bill-meta { flex-direction: row; flex-wrap: wrap; justify-content: center; column-gap: 0.625rem; }
    ${BILL_ON_SCREEN} .bill-totals { padding: 0.875rem 1.5rem 1rem; }
    ${BILL_ON_SCREEN} .bill-footnote { padding: 0 1.5rem 1rem; }
    ${BILL_ON_SCREEN} .bill-slip-body { padding: 1.25rem 1.5rem 1.5rem; }
    ${BILL_ON_SCREEN} .bill-qr { width: 12rem; height: 12rem; }
  }
`;

// Tải một ảnh về dạng data URL (cần máy chủ ảnh cho phép CORS)
const fetchImageAsDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`máy chủ trả về lỗi ${res.status}`);
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) throw new Error(`không phải ảnh (${blob.type || "rỗng"})`);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("không đọc được ảnh"));
    reader.readAsDataURL(blob);
  });
};

// Lấy mã QR dạng data URL: thử tải trực tiếp trước, không được thì qua proxy.
// Thêm tham số _cb để tránh dùng lại bản ảnh đã được thẻ <img> cache (bản đó không có header CORS).
const embedQrImage = async (url: string): Promise<string> => {
  const reasons: string[] = [];
  const reasonOf = (e: unknown) => {
    const msg = e instanceof Error ? e.message : String(e);
    return /failed to fetch|load failed|networkerror/i.test(msg) ? "bị trình duyệt chặn (CORS) hoặc mất mạng" : msg;
  };
  try {
    return await fetchImageAsDataUrl(`${url}${url.includes("?") ? "&" : "?"}_cb=${Date.now()}`);
  } catch (e) {
    reasons.push(`tải trực tiếp ${reasonOf(e)}`);
  }
  if (QR_IMAGE_PROXY) {
    try {
      return await fetchImageAsDataUrl(QR_IMAGE_PROXY + encodeURIComponent(url));
    } catch (e) {
      reasons.push(`qua proxy ${reasonOf(e)}`);
    }
  }
  throw new Error(reasons.join("; "));
};

// Tên file không chứa ký tự cấm và không quá dài (nhãn nhiều kỳ có thể rất dài)
const safeFileName = (name: string) =>
  name.replace(/\s*,\s*/g, "_").replace(/[\\/:*?"<>|]+/g, "").trim().slice(0, 80) || "bill";

// html-to-image có thể từ chối bằng một Event (ảnh không tải được) thay vì Error, nên cần đọc riêng
const describeError = (err: unknown): string => {
  if (err instanceof Error && err.message) return err.message;
  if (typeof Event !== "undefined" && err instanceof Event) {
    const target = err.target as (HTMLImageElement | null);
    const src = target?.src ? `, nguồn: ${target.src.slice(0, 40)}...` : "";
    return `không dựng được ảnh từ hóa đơn (${err.type}${src})`;
  }
  return typeof err === "string" && err ? err : "lỗi không xác định";
};

/* ---------- Nhật ký học tập: màu hoá đơn, ô sửa tay ---------- */

const THEME_KEY = "bill_theme"; // màu hoá đơn đã chọn (dùng chung cho mọi học sinh)
const ORIENT_KEY = "bill_orientation"; // hướng giấy khi in

function readJson<T>(key: string, fallback: T): T {
  try {
    const s = readStored(key);
    return s ? (JSON.parse(s) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Các ô sửa riêng trên hoá đơn (lưu trong trình duyệt, không đổi dữ liệu buổi học của hệ thống)
type RowOv = Partial<Record<"stt" | "time" | "weekday" | "date", string>>;

// Ô nhập khi bấm "Sửa hóa đơn"
const CELL_INPUT = "no-print border-slate-300 bg-white px-1.5 text-xs focus-visible:ring-1 focus-visible:ring-green-500";

/* Màu hoá đơn: chỉ cần một màu gốc, các sắc độ còn lại (dải tiêu đề, hàng tiêu đề bảng, viền, nền nhạt) tự suy ra */

const DEFAULT_THEME = "#6a9b4e";
const THEME_PRESETS = [
  { name: "Xanh lá", color: "#6a9b4e" },
  { name: "Xanh ngọc", color: "#2a9d8f" },
  { name: "Xanh dương", color: "#3b82c4" },
  { name: "Tím", color: "#7c5cc4" },
  { name: "Hồng", color: "#d1558a" },
  { name: "Cam", color: "#e08a3c" },
  { name: "Đỏ đô", color: "#b6454a" },
  { name: "Xám", color: "#64748b" },
];

const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
};

// Đọc màu dạng #rgb, #rrggbb, rgb(...) hoặc hsl(...); không đọc được thì trả về null
const toHsl = (c: string): [number, number, number] | null => {
  const s = (c || "").trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    const hex = m[1].length === 3 ? m[1].split("").map((x) => x + x).join("") : m[1];
    return rgbToHsl(parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16));
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return rgbToHsl(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
};

const buildTheme = (color: string) => {
  const [h, s] = toHsl(color) ?? (toHsl(DEFAULT_THEME) as [number, number, number]);
  const hue = Math.round(h);
  const sat = Math.round(Math.min(Math.max(s, 12), 60));
  return {
    banner: `linear-gradient(90deg, hsl(${hue} ${sat}% 26%) 0%, hsl(${hue} ${sat}% 38%) 65%, hsl(${hue} ${sat}% 47%) 100%)`,
    head: `hsl(${hue} ${Math.round(sat * 0.6)}% 27%)`, // hàng tiêu đề bảng
    dark: `hsl(${hue} ${sat}% 22%)`, // chữ tổng tiền, đường kẻ tổng cộng
    soft: `hsl(${hue} ${Math.min(sat, 40)}% 96.5%)`, // nền xen kẽ, nền phiếu chuyển khoản
    line: `hsl(${hue} ${Math.min(sat, 30)}% 88%)`, // viền
  };
};
type Theme = ReturnType<typeof buildTheme>;

/* ---------- Thành phần nhỏ dùng trong hoá đơn ---------- */

// Điểm kiểm tra: hiện nguyên chữ người dùng gõ (8,5 / 17/20...), màu theo màu hoá đơn
function ScoreBadge({ score, theme }: { score: string; theme: Theme }) {
  return (
    <span
      className="inline-flex min-w-[64px] items-center justify-center rounded-lg border px-3.5 py-1 text-lg font-bold tabular-nums"
      style={{ borderColor: theme.head, background: "#ffffff", color: theme.dark }}
    >
      {score}
    </span>
  );
}

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-800">{children}</div>
    </div>
  );
}

function BankRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 py-2 last:border-0">
      <dt className="shrink-0 text-sm text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-base font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

export default function StudentBill() {
  const { id } = useParams();
  const { t, profile, user } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const confirmDialog = useConfirm();
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"monthly" | "by_session" | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ date: new Date().toISOString().slice(0, 10), class_id: "", note: "" });
  const [showAtt, setShowAtt] = useState(true);
  const [editing, setEditing] = useState(false);
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  // Nội dung đang gõ dở trong các ô của nhật ký, khoá dạng "<id buổi>:<tên cột>"
  const [logDraft, setLogDraft] = useState<Record<string, string>>({});
  // Danh sách bài kiểm tra đang sửa dở của từng buổi, khoá là id buổi
  const [testDraft, setTestDraft] = useState<Record<string, TestItem[]>>({});
  // Dòng bài kiểm tra vừa thêm cần được focus ("<id buổi>:<vị trí>")
  const testFocus = useRef<string | null>(null);
  // Các ô sửa riêng cho hoá đơn của học sinh này (theo id buổi học)
  const [rowOv, setRowOv] = useState<Record<string, RowOv>>({});
  // Màu hoá đơn: mã màu hoặc "accent" (dùng màu riêng của học sinh); hướng giấy khi in
  const [themeSel, setThemeSel] = useState<string>(() => readStored(THEME_KEY) || DEFAULT_THEME);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(() =>
    readStored(ORIENT_KEY) === "portrait" ? "portrait" : "landscape"
  );
  const [footnote, setFootnote] = useState<string>("");
  // null = chưa sửa, dùng thông tin trong hồ sơ
  const [teacherNameOv, setTeacherNameOv] = useState<string | null>(() => readStored(TEACHER_NAME_KEY));
  const [teacherPhoneOv, setTeacherPhoneOv] = useState<string | null>(() => readStored(TEACHER_PHONE_KEY));
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [selectedCycles, setSelectedCycles] = useState<Set<string>>(new Set());
  const billRef = useRef<HTMLDivElement | null>(null);
  const enrollments = useEnrollments();
  const classesQ = useClasses();

  const { data: student } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => (await supabase.from("students").select("*").eq("id", id).single()).data,
    enabled: !!id,
  });

  // Chỉ lấy các buổi học sinh có mặt (present = true):
  // buổi vắng hoặc chưa điểm danh không nằm trong danh sách này nên không bị tính học phí
  // Khóa riêng cho hóa đơn: không dùng chung với trang lịch sử điểm danh (trang đó cần cả buổi vắng),
  // nếu không hóa đơn có thể lấy nhầm dữ liệu đã lưu sẵn của trang kia và tính tiền cả buổi vắng.
  // Luôn tải lại khi mở trang, và lọc present = true thêm một lần ở phía ứng dụng cho chắc.
  const { data: attendance } = useQuery({
    queryKey: ["student-bill-attendance", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*, schedule_events(event_date, start_time, end_time, class_id)")
        .eq("student_id", id)
        .eq("present", true);
      return (data || []).filter((a: any) => a.present === true);
    },
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const { data: payments } = useQuery({
    queryKey: ["payments", id],
    queryFn: async () => (await supabase.from("payments").select("*").eq("student_id", id)).data || [],
    enabled: !!id,
  });

  useEffect(() => {
    document.title = student ? `${t?.bill || "Bill"} — ${student.name}` : (t?.bill || "Bill");
  }, [student, t]);

  useEffect(() => {
    if (student && mode === null) setMode(student.payment_mode === "by_session" ? "by_session" : "monthly");
  }, [student, mode]);

  useEffect(() => {
    if (!student) return;
    const saved = localStorage.getItem(`bill_footnote_${student.id}`);
    setFootnote(saved ?? (t as any)?.footnoteDefault ?? "Thank you!");
  }, [student?.id, t]);

  useEffect(() => {
    if (!student) return;
    localStorage.setItem(`bill_footnote_${student.id}`, footnote);
  }, [footnote, student?.id]);

  // Nạp các ô đã sửa riêng của học sinh này
  useEffect(() => {
    if (!student?.id) return;
    setRowOv(readJson<Record<string, RowOv>>(`bill_rows_${student.id}`, {}));
  }, [student?.id]);

  const myClasses = useMemo(() => {
    if (!student) return [];
    const cids = (enrollments.data || []).filter((e: any) => e.student_id === student.id).map((e: any) => e.class_id);
    return (classesQ.data || []).filter((c: any) => cids.includes(c.id));
  }, [enrollments.data, classesQ.data, student]);

  useEffect(() => {
    if (myClasses[0] && !addForm.class_id) setAddForm((f) => ({ ...f, class_id: myClasses[0].id }));
  }, [myClasses, addForm.class_id]);

  const sortedAttendance = useMemo(() => [...(attendance || [])].sort(sessionSort), [attendance]);

  const availableAttendance = useMemo(() => {
    if (mode !== "by_session") return sortedAttendance;
    return sortedAttendance.filter((a: any) => {
      const dateStr = a?.schedule_events?.event_date;
      if (!dateStr) return false;
      const isPaidMonthly = (payments || []).some((p: any) => {
        if (p.cycle_type !== "monthly") return false;
        return p.period_start && p.period_end && dateStr >= p.period_start && dateStr <= p.period_end;
      });
      if (isPaidMonthly) return false;
      const isPaidSession = (payments || []).some((p: any) => {
        if (p.cycle_type !== "session") return false;
        if (p.attendance_id === a.id) return true;
        if (Array.isArray(p.attendance_ids) && p.attendance_ids.includes(a.id)) return true;
        if (p.period_start && p.period_end && dateStr >= p.period_start && dateStr <= p.period_end) return true;
        return false;
      });
      if (isPaidSession) return false;
      return true;
    });
  }, [sortedAttendance, payments, mode]);

  const bills = useMemo(() => {
    if (!student || !mode) return [] as any[];
    const safeName = student.name ? student.name.replace(/\s+/g, "") : "Student";
    if (mode === "monthly") {
      const start = new Date(student.start_date || Date.now());
      const today = new Date();
      const cycles: { periodStart: Date; periodEnd: Date }[] = [];
      let cur = new Date(start);
      while (cur <= today) {
        const next = new Date(cur);
        next.setMonth(next.getMonth() + 1);
        const periodEnd = new Date(next);
        periodEnd.setDate(periodEnd.getDate() - 1);
        cycles.push({ periodStart: new Date(cur), periodEnd });
        cur = next;
      }
      return cycles
        .map(({ periodStart, periodEnd }) => {
          const inCycle = sortedAttendance.filter((a: any) => {
            if (!a?.schedule_events?.event_date) return false;
            const d = new Date(a.schedule_events.event_date);
            return d >= periodStart && d <= periodEnd;
          });
          const m = periodStart.getMonth() + 1;
          const y = periodStart.getFullYear();
          const label = `${safeName}_Thang${m}_${y}`;
          return {
            cycle_type: "monthly",
            cycle_label: label,
            period_start: periodStart.toISOString().slice(0, 10),
            period_end: periodEnd.toISOString().slice(0, 10),
            amount: Number(student.fee_per_month || 0),
            description: `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`,
            attendances: inCycle,
            autoPaid: false,
          };
        })
        // Kỳ mà học sinh không có buổi nào có mặt (vắng cả kỳ / chưa điểm danh) thì không tính học phí,
        // trừ khi kỳ đó đã có thanh toán được ghi nhận
        .filter(
          (b) => b.attendances.length > 0 || (payments || []).some((p: any) => p.cycle_label === b.cycle_label)
        );
    } else {
      const sessionPayments = (payments || []).filter((p: any) => p.cycle_type === "session");
      return availableAttendance.map((a: any) => {
        const dateStr = a?.schedule_events?.event_date || "";
        const isPaidSession = sessionPayments.some((p: any) => {
          if (p.attendance_id === a.id) return true;
          if (Array.isArray(p.attendance_ids) && p.attendance_ids.includes(a.id)) return true;
          return p.period_start && p.period_end && dateStr >= p.period_start && dateStr <= p.period_end;
        });
        const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
        return {
          cycle_type: "session",
          cycle_label: `Session_${a.id.slice(0, 8)}`,
          period_start: dateStr,
          period_end: dateStr,
          session_count: 1,
          amount: fee,
          description: `Buổi học ngày ${fmtDate(dateStr)}`,
          attendances: [a],
          isPaidGroup: isPaidSession,
          attendance_id: a.id,
        };
      });
    }
  }, [student, mode, sortedAttendance, availableAttendance, payments]);

  const isPaid = (b: any) => {
    if (b?.isPaidGroup) return true;
    if ((payments || []).some((p: any) => p.cycle_label === b?.cycle_label)) return true;
    if (b?.cycle_type === "monthly" && b?.autoPaid) return true;
    return false;
  };

  useEffect(() => {
    if (selected) return;
    const first = bills.find((b) => !isPaid(b));
    if (first) setSelected(first.cycle_label);
    else if (bills.length) setSelected(bills[bills.length - 1].cycle_label);
  }, [bills, isPaid, selected]);

  const effectiveAmount = (b: any) => {
    if (!b) return 0;
    if (b.attendances && b.attendances.length > 0) {
      return b.attendances.reduce(
        (s: number, a: any) => s + Number(a.fee_override ?? student?.fee_per_session ?? 0),
        0
      );
    }
    return Number(b.amount || 0);
  };

  const current = bills.find((b) => b.cycle_label === selected) || bills[bills.length - 1];

  const selectedSessionsArray = useMemo(() => {
    return availableAttendance.filter((a: any) => selectedSessionIds.has(a.id));
  }, [availableAttendance, selectedSessionIds]);

  const selectedSessionsAmount = useMemo(() => {
    return selectedSessionsArray.reduce((sum, a) => {
      return sum + Number(a.fee_override ?? student?.fee_per_session ?? 0);
    }, 0);
  }, [selectedSessionsArray, student]);

  // Chọn / bỏ chọn tất cả các buổi chưa thanh toán trong danh sách
  const allSessionsSelected = availableAttendance.length > 0 && selectedSessionsArray.length === availableAttendance.length;
  const toggleAllSessions = () => {
    setSelectedSessionIds(allSessionsSelected ? new Set() : new Set(availableAttendance.map((a: any) => a.id)));
  };

  const selectedCyclesArray = useMemo(() => {
    return bills.filter((b: any) => selectedCycles.has(b.cycle_label));
  }, [bills, selectedCycles]);

  const selectedCyclesAmount = useMemo(() => {
    return selectedCyclesArray.reduce((sum: number, b: any) => sum + effectiveAmount(b), 0);
  }, [selectedCyclesArray]);

  const displayBill: any = mode === "by_session" ? {
    cycle_type: "session_combined",
    cycle_label: `${student?.name || "Student"}_BuoiLe`,
    description: `${selectedSessionIds.size || availableAttendance.length} ${((t as any)?.sessionsCountUnit || "sessions")}`,
    amount: selectedSessionIds.size > 0 
      ? selectedSessionsAmount 
      : availableAttendance.reduce((s, a) => s + Number(a.fee_override ?? student?.fee_per_session ?? 0), 0),
    attendances: selectedSessionIds.size > 0 ? selectedSessionsArray : availableAttendance,
  } : selectedCycles.size > 0 ? {
    cycle_type: "monthly_combined",
    cycle_label: selectedCyclesArray.map((b: any) => b.cycle_label).join(", "),
    description: `${selectedCycles.size} ${((t as any)?.cycles || "cycles")}`,
    amount: selectedCyclesAmount,
    period_start: selectedCyclesArray[0]?.period_start,
    period_end: selectedCyclesArray[selectedCyclesArray.length - 1]?.period_end,
    attendances: selectedCyclesArray.flatMap((b: any) => b.attendances || []),
  } : current;

  const billTotal = mode === "by_session"
    ? (selectedSessionIds.size > 0 ? selectedSessionsAmount : displayBill?.amount || 0)
    : (selectedCycles.size > 0 ? selectedCyclesAmount : effectiveAmount(displayBill));

  const accent = resolveStudentColor(student?.color, student?.id ?? "");
  const safeStudentName = student?.name ? student.name.trim().toUpperCase().replace(/\s+/g, '') : "STUDENT";
  const sessionsCount = mode === "by_session"
    ? (selectedSessionIds.size > 0 ? selectedSessionIds.size : availableAttendance.length)
    : (displayBill?.attendances?.length || 0);
  const billNum = `${safeStudentName}_${sessionsCount}BUOI`;

  // Nội dung chuyển khoản trong mã QR dùng đúng mã hiển thị trên hoá đơn (billNum),
  // không dùng displayBill.cycle_label vì nhãn đó chỉ là nhãn nội bộ (vd. "TEN_BuoiLe").
  const qrContent = billNum;
  const qrUrl = displayBill && profile?.bank_code && profile?.bank_account_number
    ? vietQRUrl(profile?.bank_code, profile?.bank_account_number, profile?.bank_account_name, billTotal, qrContent)
    : null;

  const billAttendances: any[] = displayBill?.attendances || [];

  // Màu hoá đơn: màu đã chọn, hoặc "accent" = màu riêng của từng học sinh
  const theme = buildTheme(themeSel === "accent" ? String(accent) : themeSel);

  // Các cột của bảng nhật ký. Ngoài lúc sửa, cột "Kiểm tra" và "Ghi chú" chỉ hiện khi có buổi nào có dữ liệu.
  const showTestCol = editing || billAttendances.some(hasTest);
  const hasContent = billAttendances.some((a: any) => !!logVal(a, LOG.content));
  const showNoteCol = editing || billAttendances.some((a: any) => !!logVal(a, LOG.note));
  const logCols = [
    { key: "stt", label: "STT", w: editing ? 16 : 17 },
    { key: "date", label: "NGÀY", w: editing ? 13 : 14 },
    // Không buổi nào có nội dung (và không đang sửa) thì thu cột lại cho gọn
    { key: "content", label: "NỘI DUNG", w: editing ? 22 : hasContent ? 27 : 10 },
    { key: "homework", label: "BTVN", w: editing ? 20 : 22 },
    ...(showTestCol ? [{ key: "test", label: "KIỂM TRA", w: editing ? 20 : 15 }] : []),
    ...(showNoteCol ? [{ key: "note", label: "GHI CHÚ", w: editing ? 15 : 14 }] : []),
  ];
  const logColsTotal = logCols.reduce((s, c) => s + c.w, 0);

  // Thông tin phục vụ giao diện hoá đơn
  const billPaid =
    mode === "by_session"
      ? false
      : selectedCycles.size > 0
        ? selectedCyclesArray.length > 0 && selectedCyclesArray.every((b: any) => isPaid(b))
        : isPaid(current);

  // Tên và số điện thoại giáo viên: lấy từ hồ sơ, trừ khi đã sửa trực tiếp trên hoá đơn
  const profileTeacherName = String(profile?.display_name || t?.teacher || "Giáo viên");
  const profileTeacherPhone = String((profile as any)?.phone || "");
  const teacherName = (teacherNameOv ?? "").trim() || profileTeacherName;
  const teacherPhone = teacherPhoneOv !== null ? teacherPhoneOv.trim() : profileTeacherPhone;
  const teacherInitial = teacherName.trim().charAt(0).toUpperCase() || "G";
  const teacherEdited = teacherNameOv !== null || teacherPhoneOv !== null;
  const issueDate = fmtDate(new Date());

  const onTeacherNameChange = (val: string) => {
    setTeacherNameOv(val);
    writeStored(TEACHER_NAME_KEY, val);
  };
  const onTeacherNameBlur = () => {
    // Để trống tên thì quay về tên trong hồ sơ
    if (!(teacherNameOv ?? "").trim()) {
      setTeacherNameOv(null);
      writeStored(TEACHER_NAME_KEY, null);
    }
  };
  const onTeacherPhoneChange = (val: string) => {
    setTeacherPhoneOv(val);
    writeStored(TEACHER_PHONE_KEY, val);
  };
  const resetTeacherInfo = () => {
    setTeacherNameOv(null);
    setTeacherPhoneOv(null);
    writeStored(TEACHER_NAME_KEY, null);
    writeStored(TEACHER_PHONE_KEY, null);
  };

  /* ---------- Hành động ---------- */

  const paySelectedSessions = async () => {
    if (!student || selectedSessionIds.size === 0) {
      toast.error((t as any)?.selectAtLeastOne || "Please select at least 1 session!");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = user?.id || student.user_id || session?.user?.id;
    if (!activeUserId) return;

    const selectedIdsArr = Array.from(selectedSessionIds);
    const selectedAtts = availableAttendance.filter((a) => selectedSessionIds.has(a.id));
    const dates = selectedAtts.map((a) => a.schedule_events?.event_date).filter(Boolean).sort();

    const { error } = await supabase.from("payments").insert({
      user_id: activeUserId,
      student_id: student.id,
      cycle_type: "session",
      cycle_label: `${student.name.trim().toUpperCase().replace(/\s+/g, '')}_${selectedIdsArr.length}BUOI`,
      period_start: dates[0] || null,
      period_end: dates[dates.length - 1] || null,
      session_count: selectedIdsArr.length,
      amount: selectedSessionsAmount,
      attendance_ids: selectedIdsArr as any,
    } as any);

    if (error) { toast.error(error.message); return; }
    setSelectedSessionIds(new Set());
    qc.invalidateQueries({ queryKey: ["payments", id] });
    toast.success((t as any)?.saveSuccess || "Marked as paid successfully!");
  };

  const paySelectedCycles = async () => {
    if (!student || selectedCycles.size === 0) return;
    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = user?.id || student.user_id || session?.user?.id;
    if (!activeUserId) return;

    const cyclesToPay = bills.filter(
      (b: any) => selectedCycles.has(b.cycle_label) && !payments?.some((p: any) => p.cycle_label === b.cycle_label)
    );

    if (cyclesToPay.length === 0) {
      toast.info((t as any)?.alreadyPaid || "Selected cycles are already paid!");
      return;
    }

    const insertData = cyclesToPay.map((b: any) => ({
      user_id: activeUserId,
      student_id: student.id,
      cycle_type: b.cycle_type,
      cycle_label: b.cycle_label,
      period_start: b.period_start,
      period_end: b.period_end,
      session_count: b.session_count ?? null,
      amount: effectiveAmount(b),
    }));

    const { error } = await supabase.from("payments").insert(insertData as any);
    if (error) { toast.error(error.message); return; }
    setSelectedCycles(new Set());
    qc.invalidateQueries({ queryKey: ["payments", id] });
    toast.success((t as any)?.saveSuccess || "Marked as paid successfully!");
  };

  const togglePaid = async (b: any) => {
    if (!student || !b) return;
    const { data: { session } } = await supabase.auth.getSession();
    const activeUserId = user?.id || student.user_id || session?.user?.id;
    if (!activeUserId) return;

    const recorded = (payments || []).find((p: any) => p.cycle_label === b.cycle_label);
    if (recorded) {
      await supabase.from("payments").delete().eq("id", recorded.id);
    } else {
      const { error } = await supabase.from("payments").insert({
        user_id: activeUserId,
        student_id: student.id,
        cycle_type: b.cycle_type,
        cycle_label: b.cycle_label,
        period_start: b.period_start,
        period_end: b.period_end,
        session_count: b.session_count ?? null,
        amount: effectiveAmount(b),
        attendance_ids: (b.attendance_id ? [b.attendance_id] : null) as any,
      } as any);
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["payments", id] });
    toast.success(t?.save || "Saved");
  };

  // Làm mới dữ liệu điểm danh của hóa đơn, của trang lịch sử điểm danh và của trang Nhật ký học tập
  const refreshAttendance = () => {
    qc.invalidateQueries({ queryKey: ["student-bill-attendance", id] });
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
    qc.invalidateQueries({ queryKey: ["learning-log", id] });
  };

  const updateFee = async (a: any, val: string) => {
    const num = val === "" ? null : Number(val);
    await supabase.from("attendance").update({ fee_override: num }).eq("id", a.id);
    refreshAttendance();
  };

  // Lưu một ô của nhật ký học tập (nội dung, BTVN, ghi chú) vào bảng attendance
  const saveColumn = async (a: any, col: string, raw: string) => {
    const next = raw.trim();
    const current = a[col] == null ? "" : String(a[col]).trim();
    if (next === current) return; // không đổi thì khỏi lưu
    const { error } = await supabase
      .from("attendance")
      .update({ [col]: next === "" ? null : next } as any)
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    refreshAttendance();
  };

  const colDraft = (a: any, col: string) => logDraft[`${a.id}:${col}`] ?? (a[col] == null ? "" : String(a[col]));

  // Ô nhập cho dữ liệu của buổi học: gõ xong (rời ô) thì lưu vào hệ thống, trang Nhật ký học tập cũng thấy ngay
  const logInput = (
    a: any,
    col: string,
    opts: { multiline?: boolean; placeholder?: string; className?: string }
  ) => {
    const common = {
      value: colDraft(a, col),
      placeholder: opts.placeholder,
      onChange: (e: any) => setLogDraft((d) => ({ ...d, [`${a.id}:${col}`]: e.target.value })),
      onBlur: (e: any) => saveColumn(a, col, e.target.value),
    };
    return opts.multiline ? (
      <Textarea rows={3} className={`${CELL_INPUT} ${opts.className ?? ""}`} {...common} />
    ) : (
      <Input type="text" className={`h-7 ${CELL_INPUT} ${opts.className ?? ""}`} {...common} />
    );
  };

  /* ---------- Bài kiểm tra: nhiều bài mỗi buổi ---------- */
  // Lưu chung 2 cột tên/điểm với trang Nhật ký học tập (cách đọc/ghi nằm trong lib/learningTests),
  // nên nhập ở trang nào thì trang kia cũng thấy.

  // Danh sách đã lưu của một buổi
  const storedTests = (a: any): TestItem[] => parseTests(a[LOG.testName], a[LOG.testScore]);
  // Danh sách đang hiển thị khi sửa: bản nháp nếu có, không thì dữ liệu đã lưu (luôn có ít nhất 1 dòng)
  const testsOf = (a: any): TestItem[] => withSpare(testDraft[a.id] ?? storedTests(a));

  const editTest = (a: any, idx: number, field: keyof TestItem, value: string) =>
    setTestDraft((d) => ({
      ...d,
      [a.id]: withSpare(d[a.id] ?? storedTests(a)).map((tt, i) => (i === idx ? { ...tt, [field]: value } : tt)),
    }));

  const addTest = (a: any) => {
    testFocus.current = `${a.id}:${testsOf(a).length}`;
    setTestDraft((d) => ({ ...d, [a.id]: [...withSpare(d[a.id] ?? storedTests(a)), { ...EMPTY_TEST }] }));
  };

  // Lưu cả danh sách bài kiểm tra của buổi. Dòng trống không được lưu.
  const saveTests = async (a: any, items: TestItem[]) => {
    const { filled, name, score } = serializeTests(items);

    // Bỏ bản nháp khi nó đã khớp với dữ liệu vừa lưu và không còn dòng trống đang mở.
    // Nếu trong lúc lưu người dùng gõ thêm thì giữ lại bản nháp, không làm mất chữ.
    const settle = () =>
      setTestDraft((d) => {
        const cur = d[a.id];
        if (!cur || cur.some(isBlankTest) || JSON.stringify(cleanTests(cur)) !== JSON.stringify(filled)) return d;
        const n = { ...d };
        delete n[a.id];
        return n;
      });

    const stored = (col: string) => (a[col] == null ? "" : String(a[col]).trim());
    if (name === stored(LOG.testName) && score === stored(LOG.testScore)) {
      settle();
      return; // không đổi thì khỏi lưu
    }
    const { error } = await supabase
      .from("attendance")
      .update({ [LOG.testName]: name || null, [LOG.testScore]: score || null } as any)
      .eq("id", a.id);
    if (error) { toast.error(error.message); return; } // giữ nguyên bản nháp để không mất chữ
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
    qc.invalidateQueries({ queryKey: ["learning-log", id] });
    await qc.invalidateQueries({ queryKey: ["student-bill-attendance", id] });
    settle();
  };

  const removeTest = (a: any, idx: number) => {
    const next = testsOf(a).filter((_, i) => i !== idx);
    setTestDraft((d) => ({ ...d, [a.id]: next }));
    saveTests(a, next);
  };

  // Các ô sửa riêng cho hoá đơn (buổi, giờ, thứ, ngày; không đổi dữ liệu buổi học), nhớ trong trình duyệt theo từng học sinh
  const setOv = (a: any, field: keyof RowOv, val: string) => {
    const next = { ...rowOv, [a.id]: { ...(rowOv[a.id] || {}), [field]: val } };
    setRowOv(next);
    writeStored(`bill_rows_${student?.id}`, JSON.stringify(next));
  };

  const localInput = (
    a: any,
    field: keyof RowOv,
    def: string,
    opts: { placeholder?: string; className?: string }
  ) => {
    const value = rowOv[a.id]?.[field] ?? def;
    return (
      <Input
        type="text"
        className={`h-7 ${CELL_INPUT} ${opts.className ?? ""}`}
        value={value}
        placeholder={opts.placeholder}
        onChange={(e) => setOv(a, field, e.target.value)}
      />
    );
  };

  const chooseTheme = (color: string) => {
    setThemeSel(color);
    writeStored(THEME_KEY, color);
  };

  const chooseOrientation = (o: "landscape" | "portrait") => {
    setOrientation(o);
    writeStored(ORIENT_KEY, o);
  };

  const resetEdits = () => {
    if (!window.confirm("Khôi phục các ô đã sửa riêng trên hóa đơn (buổi, giờ, thứ, ngày) về nội dung gốc?\n(Nội dung buổi học, BTVN, kiểm tra và ghi chú đã lưu vào hệ thống không bị ảnh hưởng.)")) return;
    setRowOv({});
    writeStored(`bill_rows_${student?.id}`, null);
  };
  const addAttendance = async () => {
    if (!user || !student || !addForm.class_id) return;
    const { data: ev, error: e1 } = await supabase
      .from("schedule_events")
      .insert({
        user_id: user.id,
        class_id: addForm.class_id,
        event_date: addForm.date,
        start_time: "00:00",
        end_time: "01:00",
        notes: "__manual__",
      })
      .select()
      .single();

    if (e1) { toast.error(e1.message); return; }

    const { error: e2 } = await supabase.from("attendance").insert({
      user_id: user.id, event_id: ev.id, student_id: student.id, present: true, homework_note: addForm.note,
    });

    if (e2) { toast.error(e2.message); return; }
    toast.success(t?.save || "Saved");
    setAddForm({ date: new Date().toISOString().slice(0, 10), class_id: myClasses[0]?.id || "", note: "" });
    setAddOpen(false);
    refreshAttendance();
  };

  // Tắt chế độ chỉnh sửa trước khi in / lưu ảnh để hoá đơn luôn ở dạng sạch
  const withViewMode = async (fn: () => void | Promise<void>) => {
    if (editing) {
      setEditing(false);
      await new Promise((r) => setTimeout(r, 150));
    }
    await fn();
  };

  const handlePrint = () => withViewMode(() => window.print());

  const saveAsImage = () =>
    withViewMode(async () => {
      const node = billRef.current;
      if (!node) return;

      const loadingId = toast.loading("Đang tạo ảnh hóa đơn...");
      const qrImg = node.querySelector<HTMLImageElement>('img[alt="VietQR"]');
      const originalQrSrc = qrImg?.src || "";
      let qrEmbedded = true;
      let qrReason = "";
      let exportStage: HTMLElement | null = null; // bản sao ngoài màn hình dùng để chụp

      try {
        // 1) Nhúng sẵn mã QR dạng dữ liệu để lúc chụp không phải tải lại ảnh từ VietQR
        //    (ảnh từ máy chủ khác không cho phép đọc nếu thiếu CORS, nên phải lấy trước)
        if (qrImg && originalQrSrc && !originalQrSrc.startsWith("data:")) {
          try {
            qrImg.src = await embedQrImage(originalQrSrc);
            await qrImg.decode();
          } catch (err) {
            qrEmbedded = false;
            qrReason = describeError(err);
            qrImg.src = originalQrSrc;
            console.warn("[saveAsImage] không nhúng được mã QR:", err);
          }
        }

        // 2) Đợi font chữ tải xong để ảnh không bị đổi font
        await (document as any).fonts?.ready;

        // 2b) Chụp từ một bản sao của hóa đơn đặt ngoài màn hình, rộng cố định (BILL_IMAGE_WIDTH).
        //     Nhờ vậy ảnh luôn đủ rộng, không phụ thuộc cửa sổ đang xem rộng hay hẹp (trên điện thoại
        //     hóa đơn hay bị ép hẹp nên các cột chật, chữ xuống dòng nhiều và ảnh dài ngoằng).
        const stage = document.createElement("div");
        stage.setAttribute("aria-hidden", "true");
        stage.style.cssText = `position:fixed;left:-10000px;top:0;width:${BILL_IMAGE_WIDTH}px;pointer-events:none;`;
        const clone = node.cloneNode(true) as HTMLElement;
        // Bản sao dùng hệ số cỡ chữ của ảnh (BILL_SCALE_IMAGE), to hơn bản xem trên màn hình
        clone.setAttribute("data-export", "true");
        Object.assign(clone.style, {
          width: `${BILL_IMAGE_WIDTH}px`,
          minWidth: `${BILL_IMAGE_WIDTH}px`,
          maxWidth: "none",
          margin: "0",
          // Font của hóa đơn được đặt ở khối bao ngoài, nên phải chép sang bản sao
          fontFamily: getComputedStyle(node).fontFamily,
        });
        stage.appendChild(clone);
        document.body.appendChild(stage);
        exportStage = stage;
        // Đợi trình duyệt dàn lại bố cục ở khổ mới rồi mới đo chiều cao
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
        const cloneQr = clone.querySelector<HTMLImageElement>('img[alt="VietQR"]');
        if (cloneQr) await cloneQr.decode().catch(() => undefined);
        // Hóa đơn quá dài thì Safari / iOS không dựng nổi ảnh, nên hạ độ phân giải cho vừa giới hạn
        const pixelRatio = Math.min(
          2,
          Math.sqrt(MAX_IMAGE_PIXELS / (clone.offsetWidth * clone.offsetHeight || 1))
        );

        const options = {
          cacheBust: true,
          backgroundColor: "#ffffff",
          pixelRatio,
          // Không có mã QR thì thay bằng ảnh trong suốt, tránh làm cả ảnh bị lỗi
          imagePlaceholder: qrEmbedded ? undefined : TRANSPARENT_PIXEL,
          // Bỏ các phần chỉ dành cho màn hình (nút, ô nhập...) khỏi ảnh
          filter: (n: HTMLElement) => !(n instanceof HTMLElement && n.classList?.contains("no-print")),
        };

        // 3) Safari / iOS thường chụp thiếu ảnh hoặc font ở lần đầu, nên chụp nháp một lần trước
        const ua = navigator.userAgent;
        const isApple =
          /iPad|iPhone|iPod/.test(ua) ||
          (/Safari/.test(ua) && !/Chrome|Chromium|Android/.test(ua)) ||
          (ua.includes("Macintosh") && "ontouchend" in document);
        if (isApple) await toBlob(clone, options).catch(() => null);

        // Thử lần lượt từ đầy đủ đến tối giản. Lỗi "không dựng được ảnh" thường do việc nhúng
        // font Google hoặc ảnh quá nặng, nên các lần sau bỏ nhúng font và giảm độ phân giải.
        const attempts: { name: string; opts: Record<string, any> }[] = [
          { name: "đầy đủ", opts: options },
          { name: "không nhúng font", opts: { ...options, skipFonts: true, fontEmbedCSS: "" } },
          { name: "tối giản", opts: { ...options, skipFonts: true, fontEmbedCSS: "", cacheBust: false, pixelRatio: 1 } },
        ];
        let blob: Blob | null = null;
        let usedMethod = "";
        let lastErr: unknown = null;
        for (const attempt of attempts) {
          try {
            const b = await toBlob(clone, attempt.opts);
            if (b) {
              blob = b;
              usedMethod = attempt.name;
              break;
            }
            lastErr = new Error(`không tạo được ảnh (cách "${attempt.name}" trả về rỗng)`);
          } catch (err) {
            lastErr = err;
            console.warn(`[saveAsImage] cách "${attempt.name}" bị lỗi:`, err);
          }
        }
        if (!blob) throw lastErr ?? new Error("không tạo được ảnh");

        const fileName = `${safeFileName(displayBill?.cycle_label || "bill")}.png`;

        // 4) Trên điện thoại: mở bảng chia sẻ để lưu vào Ảnh / gửi Zalo. Nơi khác: tải file về.
        const nav = navigator as any;
        const isMobile = /iPhone|iPad|iPod|Android/i.test(ua);
        const file = new File([blob], fileName, { type: "image/png" });
        if (isMobile && nav.canShare?.({ files: [file] })) {
          try {
            await nav.share({ files: [file], title: fileName });
            return;
          } catch (err: any) {
            if (err?.name === "AbortError") return; // người dùng tự đóng bảng chia sẻ
            // Không chia sẻ được thì chuyển sang tải file xuống
          }
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.download = fileName;
        link.href = url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);

        if (!qrEmbedded) toast.warning("Đã lưu ảnh nhưng thiếu mã QR", { description: qrReason || "Không tải được mã QR từ VietQR." });
        else if (usedMethod !== "đầy đủ") toast.success("Đã lưu ảnh hóa đơn (dùng font mặc định vì không nhúng được font)");
        else toast.success("Đã lưu ảnh hóa đơn");
      } catch (err: any) {
        console.error("[saveAsImage]", err);
        toast.error("Không tạo được ảnh hóa đơn", {
          description: describeError(err),
          action: { label: "In / lưu PDF", onClick: () => { void handlePrint(); } },
        });
      } finally {
        exportStage?.remove(); // gỡ bản sao ngoài màn hình
        // Trả mã QR về nguồn ban đầu và tắt thông báo đang tạo ảnh
        if (qrImg && originalQrSrc && qrImg.src !== originalQrSrc) qrImg.src = originalQrSrc;
        toast.dismiss(loadingId);
      }
    });

  if (!student) return <div className="p-8 text-center text-muted-foreground flex items-center justify-center min-h-[400px]">Đang tải dữ liệu học sinh...</div>;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-[1560px] space-y-6">
      
      {/* CSS RIÊNG: cỡ chữ hoá đơn (màn hình / ảnh) và phục vụ in ấn */}
      <style>{`
        /* Hệ số cỡ chữ --bs: nhỏ trên màn hình; to hơn khi lưu ảnh (bản sao có data-export) và khi in (khối @media print bên dưới) */
        .printable-bill-card { --bs: ${BILL_SCALE_SCREEN}; }
        .printable-bill-card[data-export="true"] { --bs: ${BILL_SCALE_IMAGE}; }
        ${BILL_FONT_CSS}
        ${BILL_SCREEN_CSS}

        @media print {
          body * {
            visibility: hidden !important;
          }
          .printable-bill-card, .printable-bill-card * {
            visibility: visible !important;
          }
          .bill-scroll {
            overflow: visible !important;
          }
          /* Hoá đơn dài nhiều buổi sẽ tự sang trang: không cắt phần tràn, lặp lại hàng tiêu đề, không xé đôi một hàng */
          .bill-table-wrap {
            overflow: visible !important;
            border-radius: 0 !important;
          }
          .bill-table-wrap thead {
            display: table-header-group;
          }
          .bill-table-wrap tr, .bill-slip {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .printable-bill-card {
            --bs: ${BILL_SCALE_PRINT[orientation]};
            overflow: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            min-width: 0 !important;
            max-width: 100% !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            margin: 0 !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 ${orientation};
            margin: 8mm;
          }
        }
      `}</style>

      {/* Navigation Bar */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>
      <div className="no-print relative overflow-hidden rounded-2xl bg-[#0B1B3A] px-5 py-4 font-['Be_Vietnam_Pro',sans-serif] sm:px-6">
        <div className="pointer-events-none absolute -right-10 -top-14 h-28 w-28 rounded-full opacity-40" style={{ background: accent }} />
        <div className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Quay lại"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-extrabold text-white ring-2 ring-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
              style={{ background: accent }}
            >
              {(student.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold tracking-tight text-white">Hóa đơn học phí</h1>
              <p className="truncate text-sm text-white/70">{student.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-white/10 p-1">
              <button
                type="button"
                aria-pressed={mode === "monthly"}
                onClick={() => { setMode("monthly"); setSelected(null); setSelectedCycles(new Set()); }}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  mode === "monthly" ? "bg-white text-[#0B1B3A]" : "text-white/75 hover:text-white"
                }`}
              >
                <Calendar className="h-4 w-4" /> {t?.payByMonth || "Pay monthly"}
              </button>
              <button
                type="button"
                aria-pressed={mode === "by_session"}
                onClick={() => { setMode("by_session"); setSelected(null); setSelectedSessionIds(new Set()); }}
                className={`flex h-7 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  mode === "by_session" ? "bg-white text-[#0B1B3A]" : "text-white/75 hover:text-white"
                }`}
              >
                <Receipt className="h-4 w-4" /> {t?.payBySession || "Pay by session"}
              </button>
            </div>
            <Button onClick={saveAsImage} className="h-9 gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20">
              <ImageIcon className="h-4 w-4" /> {(t as any)?.saveAsImage || "Save as image"}
            </Button>
            <Button onClick={handlePrint} className="h-9 gap-2 rounded-xl bg-[#FFB547] px-4 text-sm font-bold text-[#0B1B3A] hover:bg-[#ffc266]">
              <Printer className="h-4 w-4" /> {t?.printBill || "Print bill"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">

        {/* LEFT COLUMN: Controls & Cycle Selector */}
        <div className="space-y-4 no-print font-['Be_Vietnam_Pro',sans-serif]">
          <Card className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#FFB547]" />
                <h3 className="text-base font-bold text-slate-900">
                  {mode === "monthly" ? (t?.cycle || "Cycle") : ((t as any)?.sessionList || "Session List")}
                </h3>
              </div>
              <div className="flex gap-2">
                {mode === "monthly" && selectedCycles.size > 0 && (
                  <Button onClick={paySelectedCycles} className="h-9 gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-500">
                    <Check className="h-4 w-4" /> {(t as any)?.markAsPaid || "Pay"} ({selectedCycles.size})
                  </Button>
                )}
                {mode === "by_session" && selectedSessionIds.size > 0 && (
                  <Button onClick={paySelectedSessions} className="h-9 gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-500">
                    <Check className="h-4 w-4" /> {(t as any)?.markAsPaid || "Pay"} ({selectedSessionIds.size})
                  </Button>
                )}
                <Button variant="outline" onClick={() => setAddOpen((o) => !o)} className="h-9 gap-1.5 rounded-xl border-slate-200 px-3 text-sm font-semibold text-slate-700">
                  <Plus className="h-4 w-4" /> {t?.addAttendance || "Add attendance"}
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">{t?.date || "Date"}</Label>
                  <Input type="date" className="h-10 rounded-xl border-slate-200 bg-white text-sm" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">{t?.class || "Class"}</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {myClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">{t?.homework || "Homework"}</Label>
                  <Textarea rows={2} className="rounded-xl border-slate-200 bg-white text-sm" value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={addAttendance} className="h-9 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]">{t?.save || "Save"}</Button>
                </div>
              </div>
            )}

            {/* Chọn / bỏ chọn tất cả các buổi (đặt ngoài vùng cuộn để luôn nhìn thấy) */}
            {mode === "by_session" && availableAttendance.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2">
                <span className="text-xs font-medium text-slate-500">
                  Đã chọn <b className="font-bold text-slate-800">{selectedSessionsArray.length}</b>/{availableAttendance.length} buổi
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleAllSessions}
                  className="h-8 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {allSessionsSelected ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {allSessionsSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </Button>
              </div>
            )}

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {mode === "monthly" ? (
                bills.map((b) => {
                  const paid = isPaid(b);
                  const isChecked = selectedCycles.has(b.cycle_label);
                  return (
                    <div
                      key={b.cycle_label}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        isChecked ? "border-[#0B1B3A] bg-[#0B1B3A]/[0.04] ring-1 ring-[#0B1B3A]" : "border-slate-200 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setSelectedCycles((prev) => {
                          const next = new Set(prev);
                          if (next.has(b.cycle_label)) next.delete(b.cycle_label);
                          else next.add(b.cycle_label);
                          return next;
                        });
                        setSelected(b.cycle_label);
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(v) => {
                            setSelectedCycles((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(b.cycle_label);
                              else next.delete(b.cycle_label);
                              return next;
                            });
                            setSelected(b.cycle_label);
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                            <span className="truncate">{b.cycle_label}</span>
                            {paid ? (
                              <button
                                type="button"
                                title="Bấm để hủy đánh dấu đã đóng"
                                className="cursor-pointer rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-rose-50 hover:text-rose-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePaid(b);
                                }}
                              >
                                Đã thanh toán (hủy)
                              </button>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Chưa thanh toán</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">{b.description}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-slate-900">{formatVND(effectiveAmount(b))}</div>
                    </div>
                  );
                })
              ) : (
                availableAttendance.map((a: any, idx: number) => {
                  const isChecked = selectedSessionIds.has(a.id);
                  const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
                  return (
                    <div
                      key={a.id}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        isChecked ? "border-[#0B1B3A] bg-[#0B1B3A]/[0.04] ring-1 ring-[#0B1B3A]" : "border-slate-200 hover:bg-slate-50"
                      }`}
                      onClick={() => {
                        setSelectedSessionIds((s) => {
                          const n = new Set(s);
                          if (n.has(a.id)) n.delete(a.id);
                          else n.add(a.id);
                          return n;
                        });
                      }}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={(v) => {
                            setSelectedSessionIds((s) => {
                              const n = new Set(s);
                              if (v) n.add(a.id);
                              else n.delete(a.id);
                              return n;
                            });
                          }}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            Buổi {idx + 1}, {fmtDate(a.schedule_events?.event_date)}
                          </div>
                          <div className="max-w-[180px] truncate text-xs text-slate-500">
                            {a.homework_note || (t as any)?.noNote || "Chưa có ghi chú"}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-slate-900">{formatVND(fee)}</div>
                    </div>
                  );
                })
              )}
              {((mode === "monthly" && bills.length === 0) || (mode === "by_session" && availableAttendance.length === 0)) && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
                  {t?.nothingHere || "Không có dữ liệu"}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Hoá đơn */}
        <div className="min-w-0 font-['Be_Vietnam_Pro',sans-serif]">
          {displayBill && (
            <div className="mx-auto w-full min-w-0 max-w-[980px] space-y-4">

              {/* Thanh công cụ (không in, không vào ảnh) */}
              <div className="no-print flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-500">Xem trước hóa đơn</div>
                <div className="flex flex-wrap items-center gap-2">
                  <div
                    className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1"
                    role="group"
                    aria-label="Hướng giấy khi in"
                  >
                    <span className="px-2 text-xs font-semibold text-slate-500">Giấy in</span>
                    {(["landscape", "portrait"] as const).map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={orientation === o}
                        onClick={() => chooseOrientation(o)}
                        className={`h-7 rounded-lg px-3 text-xs font-semibold transition-colors ${
                          orientation === o ? "bg-[#0B1B3A] text-white" : "text-slate-600 hover:bg-slate-100"
                        }`}
                      >
                        {o === "landscape" ? "Ngang" : "Dọc"}
                      </button>
                    ))}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 rounded-xl border-slate-200 text-sm font-semibold text-slate-700"
                    onClick={() => setShowAtt((s) => !s)}
                  >
                    {showAtt
                      ? <><EyeOff className="h-4 w-4" /> {(t as any)?.hide || "Ẩn danh sách buổi học"}</>
                      : <><Eye className="h-4 w-4" /> {(t as any)?.show || "Hiện danh sách buổi học"}</>}
                  </Button>
                  <Button
                    size="sm"
                    variant={editing ? "default" : "outline"}
                    className={`h-9 gap-1.5 rounded-xl text-sm font-semibold ${
                      editing ? "bg-[#0B1B3A] text-white hover:bg-[#13285a]" : "border-slate-200 text-slate-700"
                    }`}
                    onClick={() => setEditing((e) => !e)}
                  >
                    {editing
                      ? <><Check className="h-4 w-4" /> Xong</>
                      : <><Pencil className="h-4 w-4" /> Sửa hóa đơn</>}
                  </Button>
                </div>
              </div>

              {/* Chọn màu hoá đơn (chỉ hiện khi đang sửa) */}
              {editing && (
                <div className="no-print flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Palette className="h-4 w-4 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-700">Màu hóa đơn</span>
                    {THEME_PRESETS.map((p) => (
                      <button
                        key={p.color}
                        type="button"
                        title={p.name}
                        aria-label={p.name}
                        aria-pressed={themeSel.toLowerCase() === p.color}
                        onClick={() => chooseTheme(p.color)}
                        className={`h-7 w-7 rounded-full ring-2 ring-offset-2 transition-shadow ${
                          themeSel.toLowerCase() === p.color ? "ring-slate-900" : "ring-transparent hover:ring-slate-300"
                        }`}
                        style={{ background: p.color }}
                      />
                    ))}
                    <button
                      type="button"
                      title="Dùng màu riêng của học sinh"
                      aria-pressed={themeSel === "accent"}
                      onClick={() => chooseTheme("accent")}
                      className={`flex h-7 items-center gap-1.5 rounded-full pl-1 pr-2.5 text-xs font-semibold text-slate-700 ring-2 ring-offset-2 transition-shadow ${
                        themeSel === "accent" ? "ring-slate-900" : "ring-transparent hover:ring-slate-300"
                      }`}
                    >
                      <span className="h-5 w-5 rounded-full" style={{ background: accent }} />
                      Màu học sinh
                    </button>
                    <label
                      title="Chọn màu khác"
                      className="flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="color"
                        aria-label="Chọn màu khác"
                        className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
                        value={/^#[0-9a-f]{6}$/i.test(themeSel) ? themeSel : DEFAULT_THEME}
                        onChange={(e) => chooseTheme(e.target.value)}
                      />
                      Màu khác
                    </label>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 rounded-xl border-slate-200 text-xs font-semibold text-slate-700"
                    onClick={resetEdits}
                  >
                    Khôi phục các ô đã sửa
                  </Button>
                </div>
              )}

              {/* ===== PHIẾU NHẬT KÝ HỌC TẬP + HOÁ ĐƠN ===== */}
              <div className="bill-scroll -mx-1 overflow-x-auto px-1 pb-4">
                <div
                  ref={billRef}
                  className="printable-bill-card relative w-full min-w-[720px] overflow-hidden rounded-3xl border bg-white text-slate-900 shadow-xl"
                  style={{ borderColor: theme.line }}
                >
                  {/* Dải màu mảnh trên cùng */}
                  <div className="h-2 w-full" style={{ background: theme.banner }} />

                  {/* Đầu hoá đơn: giáo viên bên trái, thông tin hoá đơn bên phải */}
                  <div
                    className="flex flex-wrap items-center justify-between bill-head gap-x-8 gap-y-5 border-b px-8 py-6"
                    style={{ borderColor: theme.line, background: `linear-gradient(180deg, ${theme.soft} 0%, #ffffff 100%)` }}
                  >
                    <div className="flex min-w-[240px] flex-1 items-center gap-4">
                      <div
                        className="bill-avatar grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-2xl font-extrabold text-white shadow-md"
                        style={{ background: theme.banner }}
                      >
                        {teacherInitial}
                      </div>
                      {editing ? (
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Input
                            type="text"
                            aria-label="Tên giáo viên"
                            className="no-print h-8 w-full max-w-[260px] border-slate-200 bg-white text-sm font-bold focus-visible:ring-1 focus-visible:ring-blue-400"
                            value={teacherNameOv ?? profileTeacherName}
                            placeholder="Tên giáo viên"
                            onChange={(e) => onTeacherNameChange(e.target.value)}
                            onBlur={onTeacherNameBlur}
                          />
                          <Input
                            type="tel"
                            inputMode="tel"
                            aria-label="Số điện thoại giáo viên"
                            className="no-print h-8 w-full max-w-[260px] border-slate-200 bg-white text-xs focus-visible:ring-1 focus-visible:ring-blue-400"
                            value={teacherPhoneOv ?? profileTeacherPhone}
                            placeholder="Số điện thoại"
                            onChange={(e) => onTeacherPhoneChange(e.target.value)}
                          />
                          {teacherEdited && (
                            <button
                              type="button"
                              onClick={resetTeacherInfo}
                              className="no-print text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                            >
                              Dùng lại thông tin trong hồ sơ
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="text-sm font-bold tracking-[0.18em]" style={{ color: theme.head }}>
                            HÓA ĐƠN HỌC PHÍ
                          </div>
                          <div className="mt-1 truncate text-2xl font-extrabold leading-tight text-slate-900">{teacherName}</div>
                          <div className="mt-0.5 truncate text-base text-slate-500">{teacherPhone || "Giáo viên"}</div>
                        </div>
                      )}
                    </div>

                    {/* Mã hoá đơn | Ngày lập | Trạng thái, gom trong một khung */}
                    <div
                      className="flex shrink-0 items-stretch rounded-2xl border bg-white shadow-sm"
                      style={{ borderColor: theme.line }}
                    >
                      <div className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-500">{(t as any)?.billNo || "Mã hóa đơn"}</div>
                        <div className="mt-0.5 break-all font-mono text-base font-bold text-slate-900">{billNum}</div>
                      </div>
                      <div className="w-px self-stretch" style={{ background: theme.line }} />
                      <div className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-500">Ngày lập</div>
                        <div className="mt-0.5 text-base font-semibold text-slate-800">{issueDate}</div>
                      </div>
                      <div className="w-px self-stretch" style={{ background: theme.line }} />
                      <div className="flex items-center px-3">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-bold ${
                            billPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          <span className={`h-2 w-2 rounded-full ${billPaid ? "bg-emerald-500" : "bg-amber-500"}`} />
                          {billPaid ? "Đã thanh toán" : "Chưa thanh toán"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Bảng nhật ký học tập: buổi, ngày, nội dung, BTVN, bài kiểm tra, ghi chú */}
                  {displayBill.attendances?.length > 0 && showAtt && (
                    <div className="bill-table-outer px-5 pt-5">
                      <div className="bill-table-wrap overflow-hidden rounded-2xl border bg-white" style={{ borderColor: theme.line }}>
                        <table className="w-full table-fixed border-collapse text-left text-lg text-slate-800">
                          <colgroup>
                            {logCols.map((c) => (
                              <col key={c.key} style={{ width: `${((c.w / logColsTotal) * 100).toFixed(2)}%` }} />
                            ))}
                          </colgroup>
                          <thead>
                            <tr className="text-white" style={{ background: theme.head }}>
                              {logCols.map((c) => (
                                <th key={c.key} className="px-2 py-4 text-center text-base font-bold tracking-wider">
                                  {c.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {displayBill.attendances.map((a: any, i: number) => {
                              const ev = a.schedule_events;
                              const ov: RowOv = rowOv[a.id] || {};
                              const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
                              const feeDraftVal = feeDraft[a.id] ?? (a.fee_override == null ? "" : String(a.fee_override));
                              const sttText = ov.stt ?? `Buổi ${i + 1}`;
                              const timeText = ov.time ?? timeRange(ev);
                              const weekdayText = ov.weekday ?? weekdayLabel(ev?.event_date);
                              const dateText = ov.date ?? dayMonth(ev?.event_date);
                              const contentText = logVal(a, LOG.content);
                              const homeworkText = logVal(a, LOG.homework);
                              const tests = storedTests(a); // các bài kiểm tra đã lưu (hiển thị)
                              const editTests = editing ? testsOf(a) : []; // danh sách đang sửa
                              const noteText = logVal(a, LOG.note);
                              return (
                                <tr
                                  key={a.id}
                                  className="break-inside-avoid border-b align-top last:border-0"
                                  style={{ borderColor: theme.line, background: i % 2 === 1 ? theme.soft : undefined }}
                                >
                                  {/* STT: buổi thứ mấy, giờ học, học phí */}
                                  <td className="px-3 py-4 text-center print:py-2">
                                    {editing ? (
                                      <div className="space-y-1">
                                        {localInput(a, "stt", `Buổi ${i + 1}`, { placeholder: "Buổi", className: "h-7 text-center font-semibold" })}
                                        {localInput(a, "time", timeRange(ev), { placeholder: "Giờ học", className: "h-7 text-center" })}
                                        <Input
                                          type="number"
                                          aria-label="Học phí"
                                          className={`h-7 ${CELL_INPUT} text-center`}
                                          value={feeDraftVal}
                                          placeholder={String(student.fee_per_session || 0)}
                                          onChange={(e) => setFeeDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                          onBlur={(e) => updateFee(a, e.target.value)}
                                        />
                                      </div>
                                    ) : (
                                      <>
                                        <div className="text-xl font-semibold text-slate-800">{sttText}</div>
                                        <div className="bill-meta mt-0.5 flex flex-col items-center text-base tabular-nums">
                                          {timeText && <span className="whitespace-nowrap text-slate-500">{timeText}</span>}
                                          <span className="whitespace-nowrap font-medium text-slate-600">{formatVND(fee)}</span>
                                        </div>
                                      </>
                                    )}
                                  </td>

                                  {/* NGÀY: thứ + ngày/tháng */}
                                  <td className="px-3 py-4 text-center print:py-2">
                                    {editing ? (
                                      <div className="space-y-1">
                                        {localInput(a, "weekday", weekdayLabel(ev?.event_date), { placeholder: "Thứ", className: "h-7 text-center font-semibold" })}
                                        {localInput(a, "date", dayMonth(ev?.event_date), { placeholder: "dd/mm", className: "h-7 text-center" })}
                                      </div>
                                    ) : (
                                      <>
                                        <div className="text-xl font-semibold text-slate-800">{weekdayText}</div>
                                        <div className="mt-0.5 text-base tabular-nums text-slate-500">{dateText}</div>
                                      </>
                                    )}
                                  </td>

                                  {/* NỘI DUNG buổi học */}
                                  <td className="px-3 py-4 print:py-2">
                                    {editing ? (
                                      logInput(a, LOG.content, { multiline: true, placeholder: "Nội dung buổi học...", className: "text-left" })
                                    ) : contentText ? (
                                      <div className="whitespace-pre-line leading-relaxed">{contentText}</div>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>

                                  {/* BTVN: bài tập về nhà, dạng văn bản */}
                                  <td className="px-3 py-4 print:py-2">
                                    {editing ? (
                                      logInput(a, LOG.homework, { multiline: true, placeholder: "Bài tập về nhà...", className: "text-left" })
                                    ) : homeworkText ? (
                                      <div className="whitespace-pre-line font-semibold leading-relaxed text-slate-900">{homeworkText}</div>
                                    ) : (
                                      <span className="text-slate-300">—</span>
                                    )}
                                  </td>

                                  {/* KIỂM TRA: một buổi có thể có nhiều bài, mỗi bài gồm tên + điểm */}
                                  {showTestCol && (
                                    <td className="px-2 py-4 text-center print:py-2">
                                      {editing ? (
                                        <div className="space-y-1.5">
                                          {editTests.map((tt, k) => (
                                            <div key={k} className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-1">
                                              <Input
                                                type="text"
                                                aria-label={`Tên bài kiểm tra ${k + 1}`}
                                                className={`h-7 ${CELL_INPUT} text-center`}
                                                value={tt.name}
                                                placeholder="Tên bài kiểm tra"
                                                onChange={(e) => editTest(a, k, "name", e.target.value)}
                                                onBlur={() => saveTests(a, editTests)}
                                                ref={(el) => {
                                                  // Dòng vừa bấm "Thêm bài" thì đưa con trỏ vào ngay
                                                  if (el && testFocus.current === `${a.id}:${k}`) {
                                                    testFocus.current = null;
                                                    el.focus();
                                                  }
                                                }}
                                              />
                                              <div className="flex gap-1">
                                                <Input
                                                  type="text"
                                                  inputMode="decimal"
                                                  aria-label={`Điểm kiểm tra ${k + 1}`}
                                                  className={`h-7 min-w-0 flex-1 ${CELL_INPUT} text-center font-semibold`}
                                                  value={tt.score}
                                                  placeholder="Điểm"
                                                  onChange={(e) => editTest(a, k, "score", e.target.value)}
                                                  onBlur={() => saveTests(a, editTests)}
                                                />
                                                <button
                                                  type="button"
                                                  aria-label={`Xóa bài kiểm tra ${k + 1}`}
                                                  onClick={() => removeTest(a, k)}
                                                  className={`no-print grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-400 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 ${
                                                    editTests.length > 1 || !isBlankTest(tt) ? "" : "invisible"
                                                  }`}
                                                >
                                                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                                                </button>
                                              </div>
                                            </div>
                                          ))}
                                          <button
                                            type="button"
                                            disabled={isBlankTest(editTests[editTests.length - 1])}
                                            onClick={() => addTest(a)}
                                            className="no-print flex h-7 w-full items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                                          >
                                            <Plus className="h-3 w-3" aria-hidden="true" /> Thêm bài
                                          </button>
                                        </div>
                                      ) : tests.length > 0 ? (
                                        <div className="flex flex-col items-center gap-3">
                                          {tests.map((tt, k) => (
                                            <div key={k} className="flex flex-col items-center gap-1.5">
                                              {tt.name && <div className="font-semibold leading-snug text-slate-800">{tt.name}</div>}
                                              {tt.score && <ScoreBadge score={tt.score} theme={theme} />}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <span className="text-slate-300">—</span>
                                      )}
                                    </td>
                                  )}

                                  {/* GHI CHÚ */}
                                  {showNoteCol && (
                                    <td className="px-2 py-4 text-center text-slate-500 print:py-2">
                                      {editing ? (
                                        logInput(a, LOG.note, { multiline: true, placeholder: "Ghi chú...", className: "text-left" })
                                      ) : noteText ? (
                                        <div className="whitespace-pre-line">{noteText}</div>
                                      ) : (
                                        "-"
                                      )}
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Kỳ thanh toán và tổng cộng */}
                  <div className="flex flex-wrap items-end justify-between gap-x-8 bill-totals gap-y-4 px-6 pb-6 pt-5 print:pb-3 print:pt-3">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                      <Field
                        label={mode === "monthly" ? (t?.period || "Kỳ thanh toán") : ((t as any)?.billedSessions || "Số buổi tính phí")}
                      >
                        {mode === "monthly"
                          ? (displayBill.period_start
                              ? <span className="text-base">{fmtDate(displayBill.period_start)} – {fmtDate(displayBill.period_end)}</span>
                              : displayBill.description)
                          : `${displayBill.attendances?.length || 0} ${((t as any)?.sessionsCountUnit || "buổi")}`}
                      </Field>
                      <Field
                        label={mode === "monthly" ? (t?.feePerMonth || "Học phí mỗi tháng") : ((t as any)?.feePerSession || "Học phí mỗi buổi")}
                      >
                        {formatVND(Number(mode === "monthly" ? student.fee_per_month : student.fee_per_session))}
                      </Field>
                    </div>

                    <div className="w-96 max-w-full shrink-0">
                      <div className="flex items-center justify-between py-1.5 text-base text-slate-500">
                        <span>Số buổi tính phí</span>
                        <span className="font-semibold tabular-nums text-slate-800">{sessionsCount} buổi</span>
                      </div>
                      <div className="flex items-baseline justify-between gap-4 border-t-2 pt-3" style={{ borderColor: theme.head }}>
                        <span className="text-lg font-bold text-slate-900">Tổng cộng</span>
                        {/* Cỡ chữ tổng tiền (38px gốc) cũng nhân theo hệ số --bs của hoá đơn */}
                        <span
                          className="font-extrabold leading-none tracking-tight tabular-nums"
                          style={{ color: theme.dark, fontSize: "calc(38px * var(--bs, 1))" }}
                        >
                          {formatVND(billTotal)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {footnote && (
                    <p className="bill-footnote whitespace-pre-line px-6 pb-6 text-center text-base italic text-slate-500 print:pb-3">{footnote}</p>
                  )}

                  {/* Phiếu thanh toán: cắt rời theo đường đứt nét */}
                  {qrUrl ? (
                    <div className="bill-slip">
                      <div className="relative">
                        <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full border bg-background" style={{ borderColor: theme.line }} />
                        <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full border bg-background" style={{ borderColor: theme.line }} />
                        <div className="mx-6 border-t-2 border-dashed border-slate-300" />
                      </div>
                      <div className="bill-slip-body px-8 pb-8 pt-7 print:pb-4 print:pt-4" style={{ background: theme.soft }}>
                        <div className="flex flex-row items-start gap-8">
                          <div className="shrink-0 text-center">
                            <img
                              src={qrUrl}
                              alt="VietQR"
                              className="bill-qr h-80 w-80 rounded-2xl border border-slate-200 bg-white p-2 object-contain"
                            />
                            <div className="mt-2 text-sm text-slate-500">Quét bằng app ngân hàng</div>
                          </div>
                          <div className="w-full min-w-0 flex-1">
                            <div className="text-xl font-bold text-slate-900">
                              {(t as any)?.scanToPayShort || "Thanh toán qua chuyển khoản"}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-slate-500">
                              {(t as any)?.scanQrInstr || "Mở ứng dụng ngân hàng, quét mã QR và giữ nguyên nội dung chuyển khoản."}
                            </p>
                            <dl className="mt-3">
                              {profile?.bank_code && <BankRow label="Ngân hàng">{profile.bank_code}</BankRow>}
                              {profile?.bank_account_name && <BankRow label="Chủ tài khoản">{profile.bank_account_name}</BankRow>}
                              {profile?.bank_account_number && (
                                <BankRow label="Số tài khoản">
                                  <span className="font-mono tabular-nums">{profile.bank_account_number}</span>
                                </BankRow>
                              )}
                              <BankRow label="Số tiền">
                                <span className="tabular-nums">{formatVND(billTotal)}</span>
                              </BankRow>
                              <BankRow label="Nội dung">
                                <span
                                  className="inline-block rounded-md px-2 py-0.5 font-mono text-base font-bold"
                                  style={{ background: "#FFB54733", color: theme.dark }}
                                >
                                  {billNum}
                                </span>
                              </BankRow>
                            </dl>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="no-print border-t border-dashed border-slate-300 px-8 py-4 text-center text-xs text-slate-500" style={{ background: theme.soft }}>
                      {t?.vietQR || "VietQR"}:{" "}
                      <Link to="/settings" className="font-medium text-blue-600 underline">
                        {t?.settings || "Thiết lập"}
                      </Link>
                    </div>
                  )}
                </div>
              </div>
              {/* Phần dưới hoá đơn (không in, không vào ảnh) */}
              <div className="no-print space-y-3">
                <div className="flex justify-end">
                  {mode === "by_session" ? (
                    <Button
                      variant="success"
                      className="rounded-xl px-6 font-medium shadow-md"
                      disabled={selectedSessionIds.size === 0}
                      onClick={paySelectedSessions}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {(t as any)?.markAsPaid || "Đánh dấu đã thanh toán"} ({selectedSessionIds.size})
                    </Button>
                  ) : (
                    <Button
                      variant={isPaid(current) ? "outline" : "success"}
                      className={`rounded-xl px-6 font-medium ${isPaid(current) ? "border-red-300 text-red-600 hover:bg-red-50" : ""}`}
                      onClick={() => togglePaid(current)}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {isPaid(current) ? "Hủy đánh dấu đã đóng (Unpaid)" : (t?.markPaid || "Đã thanh toán")}
                    </Button>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    {(t as any)?.footnote || "Lời cảm ơn / ghi chú cuối hóa đơn"}
                  </Label>
                  <Textarea
                    rows={2}
                    value={footnote}
                    onChange={(e) => setFootnote(e.target.value)}
                    placeholder={(t as any)?.footnoteDefault || "Cảm ơn quý phụ huynh và học sinh!"}
                    className="rounded-xl border-slate-200 bg-white text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}