import { useEffect, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  Award,
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
  User,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/format";
import { resolveStudentColor } from "@/lib/studentColor";

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG (cùng ngôn ngữ với Dashboard) ----------------
   Bảng màu: mực navy #0B1B3A · nền trắng · viền zinc mảnh · nhấn hổ phách #FFB547 (chỉ trên nền navy).
   Thẻ dùng nền trắng đặc nên luôn đọc rõ. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const CHIP = "inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700";
const CHIP_BTN = `${CHIP} shrink-0 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30`;
const TILE = "grid shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700";
const NAVY_BTN =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#13285a]";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const EMPTY = "Chưa cập nhật";

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
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
function StatCard({ icon: Icon, label, value, loading }: { icon: LucideIcon; label: string; value: string; loading?: boolean }) {
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

function ClassCard({ c, roster, schedules, days }: { c: any; roster: any; schedules: any[]; days: string[] }) {
  const monthly = roster?.fee_per_month || c.fee_per_month;
  const perSession = roster?.fee_per_session || c.fee_per_session;
  const upcoming = monthly && Number(monthly) > 0 ? monthly : perSession;
  const upcomingLabel = monthly && Number(monthly) > 0 ? "/ tháng" : "/ buổi";
  const color = c.color || resolveStudentColor(null, String(c.id));
  const meta = [c.subject, c.grade].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4 rounded-xl border border-zinc-200 bg-white p-4">
      <Link
        to={`/student/classes/${c.id}`}
        className={cn("group flex items-center gap-3 rounded-lg", focusRing)}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-semibold" style={solid(color)} aria-hidden="true">
          {c.name ? String(c.name).slice(0, 1).toUpperCase() : "L"}
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-semibold text-zinc-900 group-hover:underline">{c.name}</h4>
          {meta && <p className="truncate text-xs text-zinc-500">{meta}</p>}
        </div>
        <ChevronRight
          className="h-4 w-4 shrink-0 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600"
          aria-hidden="true"
        />
      </Link>

      <div className="rounded-lg bg-zinc-50 px-3 py-2.5">
        <div className="text-xs text-zinc-500">Học phí sắp tới</div>
        <div className="pt-0.5 text-sm font-semibold tabular-nums text-zinc-900">
          {formatVND(Number(upcoming || 0))} <span className="text-xs font-normal text-zinc-400">{upcomingLabel}</span>
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-500">
          <Clock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Lịch học trong tuần
        </div>
        {schedules.length === 0 ? (
          <p className="text-xs italic text-zinc-400">Chưa sắp xếp lịch học.</p>
        ) : (
          <ul className="space-y-1">
            {schedules.map((s: any) => (
              <li key={s.id} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 bg-white px-3 py-2 text-xs">
                <span className="font-semibold text-zinc-900">{days[s.day_of_week]}</span>
                <span className="tabular-nums text-zinc-500">
                  {s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { t, user, profile, lang } = useApp();

  const [classes, setClasses] = useState<any[]>([]);
  const [schedulesByClass, setSchedulesByClass] = useState<Record<string, any[]>>({});
  const [rosterByClass, setRosterByClass] = useState<Record<string, any>>({});
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = `${t.dashboard} — ${t.appName}`;
    if (!user) return;

    (async () => {
      setIsLoading(true);
      try {
        // 1. Fetch thông tin Profile mới nhất từ Supabase
        const { data: profData } = await (supabase as any)
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profData) {
          setUserProfile(profData);
        }

        // 2. Fetch danh sách lớp học
        const { data: members } = await (supabase as any)
          .from("class_members")
          .select("class_id")
          .eq("student_id", user.id);

        const ids = (members || []).map((m: any) => m.class_id);

        if (ids.length > 0) {
          const { data: cls } = await (supabase as any)
            .from("classes")
            .select("*")
            .in("id", ids);
          setClasses(cls || []);

          const { data: schs } = await (supabase as any)
            .from("class_schedules")
            .select("*")
            .in("class_id", ids);

          const sMap: Record<string, any[]> = {};
          (schs || []).forEach((s: any) => (sMap[s.class_id] ||= []).push(s));
          Object.values(sMap).forEach((arr) =>
            arr.sort((a: any, b: any) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
          );
          setSchedulesByClass(sMap);
        } else {
          setClasses([]);
        }

        // 3. Fetch dữ liệu từ bảng students
        const { data: rosters } = await (supabase as any)
          .from("students")
          .select("*")
          .eq("linked_user_id", user.id);

        const primary = (rosters || [])[0];
        if (primary) {
          setStudentDetail(primary);
          const rMap: Record<string, any> = {};
          ids.forEach((cid: string) => {
            rMap[cid] = primary;
          });
          setRosterByClass(rMap);
        }
      } catch (err) {
        console.error("Lỗi lấy dữ liệu dashboard:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.id]);

  const days =
    lang === "vi"
      ? ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]
      : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Ưu tiên bản fetch mới nhất của chính trang này, rồi mới tới profile
  // trong context — cả hai đều là bảng `profiles`, chỉ khác thời điểm tải.
  const activeProfile = userProfile || profile;

  // Đọc đúng tên cột mà Settings.tsx thực sự lưu vào (display_name,
  // date_of_birth, school_class...). Trước đây code đọc nhầm các cột
  // full_name/dob/grade — những cột Settings không hề ghi vào — nên khi
  // sửa thông tin trong Settings, trang này vẫn hiện dữ liệu cũ/sai.
  const studentInfo = {
    fullName:
      (activeProfile as any)?.display_name ||
      studentDetail?.name ||
      user?.user_metadata?.full_name ||
      "Học sinh",

    email: user?.email || EMPTY,

    phone: (activeProfile as any)?.phone || studentDetail?.phone || EMPTY,

    dob: (activeProfile as any)?.date_of_birth || studentDetail?.date_of_birth || EMPTY,

    grade: (activeProfile as any)?.school_class || studentDetail?.grade || EMPTY,

    parentName: (activeProfile as any)?.parent_name || studentDetail?.parent_name || EMPTY,

    parentPhone: (activeProfile as any)?.parent_phone || studentDetail?.parent_phone || EMPTY,
  };

  // Màu avatar dùng chung bảng màu với trang Học sinh
  const avatarColor = resolveStudentColor(studentDetail?.color ?? null, String(studentDetail?.id ?? user?.id ?? ""));

  const stats: { key: string; label: string; value: string; icon: LucideIcon; loading?: boolean }[] = [
    { key: "classes", label: "Lớp đang học", value: String(classes.length), icon: BookOpen, loading: isLoading },
    { key: "status", label: "Trạng thái học tập", value: "Hoạt động", icon: FileCheck2 },
    { key: "rank", label: "Xếp loại chung", value: "Giỏi", icon: Award },
    { key: "schedule", label: "Lịch học", value: "Theo tuần", icon: Clock },
  ];

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
              {String(studentInfo.fullName).slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm text-zinc-500">Góc học tập cá nhân</p>
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
            <span className={CHIP}>
              <BookOpen className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              {isLoading ? "Đang tải..." : `${classes.length} lớp học`}
            </span>
          </div>
        </section>

        {/* SỐ LIỆU + THẺ NỔI BẬT */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
            {stats.map((s) => (
              <StatCard key={s.key} icon={s.icon} label={s.label} value={s.value} loading={s.loading} />
            ))}
          </div>

          {/* Thẻ nổi bật duy nhất của trang: nền navy đặc, nhấn hổ phách.
              Trên điện thoại đưa lên đầu; từ màn lớn nằm bên phải. */}
          <div className="order-first lg:order-none lg:col-span-4">
            <Link
              to="/join"
              className={cn(
                "group flex h-full min-h-[11rem] w-full flex-col justify-between gap-8 rounded-2xl bg-[#0B1B3A] p-6 text-left text-white transition-colors hover:bg-[#10244b]",
                focusRing
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white/65">Lớp học mới</span>
                <Plus className="h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden="true" />
              </div>
              <div className="space-y-3">
                <h3 className="text-3xl font-semibold leading-tight tracking-tight">Tham gia lớp học mới</h3>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-white/65 transition-colors group-hover:text-white">
                  Nhập mã đăng ký lớp
                  <ChevronRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* LỚP HỌC + THÔNG TIN CÁ NHÂN */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-8")}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={cn(TILE, "h-10 w-10")}>
                  <GraduationCap className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-zinc-900">Các lớp học của bạn</h2>
                  <p className="text-xs text-zinc-500">Lịch học và học phí sắp tới của từng lớp</p>
                </div>
              </div>
              {!isLoading && classes.length > 0 && (
                <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600">
                  {classes.length} lớp
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Skeleton className="h-56 rounded-xl" />
                <Skeleton className="h-56 rounded-xl" />
              </div>
            ) : classes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 px-6 py-10 text-center">
                <p className="text-sm text-zinc-500">Bạn chưa tham gia lớp học nào.</p>
                <Link to="/join" className={cn(NAVY_BTN, focusRing)}>
                  <Plus className="h-4 w-4 text-[#FFB547]" aria-hidden="true" />
                  Nhập mã đăng ký lớp ngay
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {classes.map((c) => (
                  <ClassCard
                    key={c.id}
                    c={c}
                    roster={rosterByClass[c.id]}
                    schedules={schedulesByClass[c.id] || []}
                    days={days}
                  />
                ))}
              </div>
            )}
          </section>

          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-4")}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn(TILE, "h-10 w-10")}>
                  <User className="h-5 w-5" aria-hidden="true" />
                </div>
                <h2 className="truncate text-base font-semibold text-zinc-900">Thông tin cá nhân</h2>
              </div>
              <Link to="/settings" className={CHIP_BTN}>
                <Edit3 className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                Sửa
              </Link>
            </div>

            <div className="space-y-5">
              <Group title="Cá nhân">
                <InfoRow icon={User} label="Họ và tên" value={studentInfo.fullName} />
                <InfoRow icon={Mail} label="Email" value={studentInfo.email} />
                <InfoRow icon={Phone} label="Số điện thoại" value={studentInfo.phone} />
                <InfoRow icon={Calendar} label="Ngày sinh" value={fmtDob(studentInfo.dob)} />
                <InfoRow icon={GraduationCap} label="Khối lớp" value={studentInfo.grade} />
              </Group>

              <Group title="Phụ huynh">
                <InfoRow icon={User} label="Tên phụ huynh" value={studentInfo.parentName} />
                <InfoRow icon={Phone} label="SĐT liên hệ" value={studentInfo.parentPhone} />
              </Group>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}