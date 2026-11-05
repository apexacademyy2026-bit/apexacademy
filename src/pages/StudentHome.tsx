import { useEffect, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Calendar,
  CalendarCheck2,
  ChevronRight,
  Clock,
  Edit3,
  FileCheck2,
  GraduationCap,
  Mail,
  Phone,
  Plus,
  TrendingUp,
  User,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { resolveStudentColor } from "@/lib/studentColor";

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG (cùng ngôn ngữ với Dashboard) ----------------
   Bảng màu: mực navy #0B1B3A · nền trắng · viền zinc mảnh · nhấn hổ phách #FFB547 (chỉ trên nền navy).
   Xanh lục chỉ dành cho trạng thái hoàn thành (đã nộp). Thẻ dùng nền trắng đặc nên luôn đọc rõ. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const CHIP = "inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700";
const CHIP_BTN = `${CHIP} shrink-0 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30`;
const TILE = "grid shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const EMPTY = "Chưa cập nhật";
const NO_GRADE = "Chưa chọn";

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền của avatar
const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#0B1B3A" : "#ffffff";
};
// Ô màu đặc, có quầng sáng cùng màu để nổi bật
const solid = (c: string): CSSProperties => ({
  background: c,
  color: inkOn(c),
  boxShadow: `0 8px 18px -8px ${c}`,
});

const fmtDateTime = (d?: string | null) => (d ? new Date(d).toLocaleString("vi-VN") : "—");
// 2008-05-12 → 12/05/2008, giá trị khác giữ nguyên
const fmtDob = (v: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : v;
};
const greetingNow = () => {
  const h = new Date().getHours();
  return h < 11 ? "Chào buổi sáng" : h < 14 ? "Chào buổi trưa" : h < 18 ? "Chào buổi chiều" : "Chào buổi tối";
};

function InfoRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  const empty = value === EMPTY;
  return (
    <div className="flex items-center gap-3">
      <div className={cn(TILE, "h-10 w-10")}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-zinc-500">{label}</div>
        <div className={cn("truncate text-sm", empty ? "italic text-zinc-400" : "font-semibold text-zinc-900")}>{value}</div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-3.5 border-t border-zinc-100 pt-5">
      <h3 className="text-xs font-medium text-zinc-500">{title}</h3>
      {children}
    </div>
  );
}

// Thẻ số liệu: nhãn + icon xám ở trên, số lớn ở dưới (giống thẻ số liệu Dashboard)
function StatCard({ icon: Icon, label, value, loading }: { icon: LucideIcon; label: string; value: string; loading: boolean }) {
  return (
    <div className={cn(CARD, "flex h-full flex-col justify-between gap-6 p-5 sm:p-6")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-500">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
      </div>
      {loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <h3 className="truncate text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</h3>
      )}
    </div>
  );
}

function AttemptRow({ a, title }: { a: any; title: string }) {
  const done = !!a.submitted_at;
  const max = Number(a.max_score) || 0;
  const score = Number(a.score) || 0;
  const pct = done && max > 0 ? Math.min(100, Math.max(0, (score / max) * 100)) : 0;

  const body = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(TILE, "h-10 w-10")}>
          {done ? <FileCheck2 className="h-4 w-4" aria-hidden="true" /> : <Clock className="h-4 w-4" aria-hidden="true" />}
        </div>
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-zinc-900">{title}</h4>
          <p className="truncate text-xs tabular-nums text-zinc-500">{fmtDateTime(a.submitted_at || a.started_at)}</p>
        </div>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {done && (
          <span className="text-sm font-semibold tabular-nums text-zinc-900">
            {score.toFixed(1)} / {max.toFixed(1)}
          </span>
        )}
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium",
            done ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
          )}
        >
          {done ? "Đã nộp" : "Đang làm"}
        </span>
        {done && (
          <ChevronRight
            className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600"
            aria-hidden="true"
          />
        )}
      </div>

      {done && max > 0 && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full rounded-full bg-[#0B1B3A]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  );

  const row = "flex flex-wrap items-center justify-between gap-x-3 gap-y-2.5 rounded-xl border border-zinc-200 bg-white p-3";
  return done ? (
    <Link
      to={`/student/tests/${a.test_id}/result/${a.id}`}
      aria-label={`Xem kết quả ${title}`}
      className={cn(row, "group transition-colors hover:border-zinc-300 hover:bg-zinc-50", focusRing)}
    >
      {body}
    </Link>
  ) : (
    <div className={row}>{body}</div>
  );
}

export default function StudentHome() {
  const { t, user, profile } = useApp();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [tests, setTests] = useState<Record<string, any>>({});
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = `${(t as any)?.home || "Trang chủ"} — ${t?.appName || "Apex Academy"}`;
  }, [t]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // 1. Lấy lịch sử làm bài
        const { data: at } = await supabase
          .from("test_attempts")
          .select("*")
          .eq("student_id", user.id)
          .order("started_at", { ascending: false });
        setAttempts(at || []);

        const ids = Array.from(new Set((at || []).map((a: any) => a.test_id)));
        if (ids.length) {
          const { data: ts } = await supabase.from("tests").select("id,title,class_id").in("id", ids);
          const map: Record<string, any> = {};
          (ts || []).forEach((x: any) => (map[x.id] = x));
          setTests(map);
        }

        // 2. Lấy thông tin học sinh từ Supabase
        const { data: st } = await (supabase as any)
          .from("students")
          .select("*")
          .or(`user_id.eq.${user.id},linked_user_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle();

        if (st) setStudentDetail(st);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id, user?.email]);

  const cleanName = (val: any) => {
    if (!val || typeof val !== "string") return "";
    const trimmed = val.trim();
    if (["game", "vi", "en"].includes(trimmed.toLowerCase())) return "";
    return trimmed;
  };

  // Lấy tên hiển thị mặc định từ Google Meta, Email hoặc hiển thị Học sinh
  const defaultDisplayName =
    user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Học sinh";

  const studentInfo = {
    fullName:
      cleanName(studentDetail?.name) ||
      cleanName((profile as any)?.full_name) ||
      cleanName(profile?.display_name) ||
      defaultDisplayName,
    email: user?.email || studentDetail?.email || EMPTY,
    phone: studentDetail?.phone || (profile as any)?.phone || EMPTY,
    dob: studentDetail?.dob || studentDetail?.date_of_birth || (profile as any)?.date_of_birth || EMPTY,
    grade: studentDetail?.grade || (profile as any)?.school_class || (profile as any)?.grade || NO_GRADE,
    parentName: cleanName(studentDetail?.parent_name) || cleanName((profile as any)?.parent_name) || EMPTY,
    parentPhone: studentDetail?.parent_phone || (profile as any)?.parent_phone || EMPTY,
  };

  // Màu avatar dùng chung bảng màu với trang Học sinh
  const avatarColor = resolveStudentColor(studentDetail?.color ?? null, String(studentDetail?.id ?? user?.id ?? ""));

  // Số liệu làm bài
  const done = attempts.filter((a) => a.submitted_at);
  const scored = done.filter((a) => Number(a.max_score) > 0);
  const avg = scored.length
    ? Math.round((scored.reduce((s, a) => s + Number(a.score) / Number(a.max_score), 0) / scored.length) * 100)
    : null;
  const stats: { key: string; label: string; value: string; icon: LucideIcon }[] = [
    { key: "done", label: "Đã nộp", value: String(done.length), icon: FileCheck2 },
    { key: "doing", label: "Đang làm", value: String(attempts.length - done.length), icon: Clock },
    { key: "avg", label: "Điểm trung bình", value: avg === null ? "—" : `${avg}%`, icon: TrendingUp },
  ];

  // Hồ sơ còn thiếu mục nào thì nhắc bổ sung
  const missing =
    [studentInfo.phone, studentInfo.dob, studentInfo.parentName, studentInfo.parentPhone].filter((v) => v === EMPTY).length +
    (studentInfo.grade === NO_GRADE ? 1 : 0);

  const noGrade = studentInfo.grade === NO_GRADE;

  return (
    <div className={cn("min-h-screen w-full bg-zinc-50", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      <div className="mx-auto max-w-7xl space-y-4 p-4 pb-12 sm:p-8 sm:pb-14">
        {/* LỜI CHÀO */}
        <section className={cn(CARD, "flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7")}>
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-base font-semibold"
              style={solid(avatarColor)}
              aria-hidden="true"
            >
              {studentInfo.fullName.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm text-zinc-500">Tổng quan học tập</p>
              <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
                {greetingNow()}, {studentInfo.fullName}
              </h1>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={CHIP}>
              <CalendarCheck2 className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              {new Date().toLocaleDateString("vi-VN")}
            </span>
            <span className={cn(CHIP, noGrade && "border-dashed text-zinc-500")}>
              <GraduationCap className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              {noGrade ? "Chưa chọn lớp" : `Lớp ${studentInfo.grade}`}
            </span>
            <span className={CHIP}>
              <Mail className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="truncate">{studentInfo.email}</span>
            </span>
          </div>
        </section>

        {/* SỐ LIỆU LÀM BÀI + THẺ NỔI BẬT */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:col-span-8">
            {stats.map((s) => (
              <StatCard key={s.key} icon={s.icon} label={s.label} value={s.value} loading={loading} />
            ))}
          </div>

          {/* Thẻ nổi bật duy nhất của trang: nền navy đặc, nhấn hổ phách.
              Trên điện thoại đưa lên đầu để vào lớp nhanh; từ màn lớn nằm bên phải. */}
          <div className="order-first lg:order-none lg:col-span-4">
            <Link
              to="/student/classes"
              className={cn(
                "group flex h-full min-h-[11rem] w-full flex-col justify-between gap-8 rounded-2xl bg-[#0B1B3A] p-6 text-left text-white transition-colors hover:bg-[#10244b]",
                focusRing
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white/65">Phòng học</span>
                <BookOpen className="h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                <h3 className="truncate text-3xl font-semibold tracking-tight sm:text-4xl">Vào phòng học</h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-white/65 transition-colors group-hover:text-white">
                  Xem danh sách lớp
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* LỊCH SỬ LÀM BÀI + HỒ SƠ */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-8")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cn(TILE, "h-10 w-10")}>
                  <FileCheck2 className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">Lịch sử làm bài</h2>
                  <p className="text-xs text-zinc-500">Các bài kiểm tra trực tuyến đã làm</p>
                </div>
              </div>
              {attempts.length > 0 && (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600">
                  {attempts.length} bài
                </span>
              )}
            </div>

            {attempts.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 px-6 py-8 text-center">
                <div className="flex items-center gap-2 text-sm text-zinc-500">
                  <Clock className="h-4 w-4" aria-hidden="true" />
                  Chưa có dữ liệu bài làm
                </div>
                <p className="text-xs text-zinc-400">Các bài kiểm tra trực tuyến sau khi hoàn thành sẽ hiển thị chi tiết tại đây.</p>
              </div>
            ) : (
              <ul className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                {attempts.map((a) => (
                  <li key={a.id}>
                    <AttemptRow a={a} title={tests[a.test_id]?.title || "Bài kiểm tra"} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-4")}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn(TILE, "h-10 w-10")}>
                  <User className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="truncate text-base font-semibold text-zinc-900">Hồ sơ</h2>
              </div>
              <Link to="/settings" className={CHIP_BTN}>
                <Edit3 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                Chỉnh sửa
              </Link>
            </div>

            <div className="space-y-5">
              <Group title="Cá nhân">
                <InfoRow icon={Phone} label="Số điện thoại" value={studentInfo.phone} />
                <InfoRow icon={Calendar} label="Ngày sinh" value={fmtDob(studentInfo.dob)} />
              </Group>

              <Group title="Phụ huynh">
                <InfoRow icon={User} label="Họ tên" value={studentInfo.parentName} />
                <InfoRow icon={Phone} label="Số điện thoại" value={studentInfo.parentPhone} />
              </Group>
            </div>

            {missing > 0 && (
              <Link
                to="/settings"
                className={cn(
                  "flex h-11 items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900",
                  focusRing
                )}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Bổ sung {missing} mục còn thiếu
              </Link>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}