import { useEffect, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { useParams, Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  CreditCard,
  Download,
  FileCheck2,
  FileText,
  GraduationCap,
  PlayCircle,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/format";
import { resolveStudentColor } from "@/lib/studentColor";

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG (cùng ngôn ngữ với Dashboard) ----------------
   Bảng màu: mực navy #0B1B3A · nền trắng · viền zinc mảnh · nhấn hổ phách #FFB547 (chỉ trên nền navy).
   Xanh lục chỉ dành cho trạng thái hoàn thành (có mặt / đã thanh toán). */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const CHIP = "inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700";
const CHIP_BTN = `${CHIP} shrink-0 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30`;
const SMALL_BTN =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50";
const NAVY_SMALL_BTN =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg bg-[#0B1B3A] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#13285a]";
const TILE = "grid shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700";
const SEG = "flex w-fit max-w-full flex-wrap gap-0.5 rounded-full bg-zinc-100 p-1";
const COUNT = "rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

const segBtn = (active: boolean) =>
  cn(
    "h-8 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
    active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
  );

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#0B1B3A" : "#ffffff";
};

const solid = (c: string): CSSProperties => ({
  background: c,
  color: inkOn(c),
  boxShadow: `0 8px 18px -8px ${c}`,
});

// Bảng `attendance` có cột ngày là `attendance_date` (không có `date`). `created_at` chỉ là dự phòng.
const ATT_DATE_KEYS = ["attendance_date", "created_at"];
const attDate = (a: any): string | undefined => {
  if (!a) return undefined;
  const key = ATT_DATE_KEYS.find((k) => a[k]);
  return key ? a[key] : undefined;
};

function SectionHead({ icon: Icon, title, subtitle, right }: { icon: LucideIcon; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(TILE, "h-10 w-10")}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function EmptyBox({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {text}
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className={cn(CARD, "flex h-full flex-col justify-between gap-6 p-5 sm:p-6")}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-zinc-500">{label}</span>
        <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
      </div>
      <h3 className="truncate text-2xl font-semibold tabular-nums tracking-tight text-zinc-900 sm:text-3xl">{value}</h3>
    </div>
  );
}

export default function StudentClassDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useApp();

  const [cls, setCls] = useState<any>(null);
  const [studentRoster, setStudentRoster] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [lessonsByChapter, setLessonsByChapter] = useState<Record<string, any[]>>({});
  const [documents, setDocuments] = useState<any[]>([]);
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  const [attendanceTab, setAttendanceTab] = useState<"all" | "unpaid" | "paid">("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user) return;

    (async () => {
      setLoading(true);
      try {
        // 1. Lấy thông tin Lớp học
        const { data: c, error: clsErr } = await (supabase as any)
          .from("classes")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (clsErr) console.error("[classes]", clsErr);
        setCls(c);
        if (c) document.title = `${c.name} — Apex Academy`;

        // 2. Tìm hồ sơ roster mà giáo viên đã liên kết với tài khoản này.
        //    LƯU Ý: bảng `students` KHÔNG có cột `email`, và `user_id` là id của giáo viên
        //    (chủ hồ sơ) nên không dùng để khớp tài khoản học sinh. Chỉ khớp qua `linked_user_id`.
        //    Trước đây câu .or(...) có `email.eq.` → PostgREST trả lỗi 400 (cột không tồn tại),
        //    stList = null và lỗi bị nuốt, nên học sinh luôn bị coi là "chưa liên kết".
        const idSet = new Set<string>([user.id]);

        const { data: stList, error: stErr } = await (supabase as any)
          .from("students")
          .select("id, linked_user_id")
          .eq("linked_user_id", user.id);
        if (stErr) console.error("[students]", stErr);

        if (stList && stList.length > 0) {
          setStudentRoster(stList[0]);
          stList.forEach((s: any) => idSet.add(s.id));
        }

        const possibleStudentIds = Array.from(idSet);

        // 3. FETCH ĐIỂM DANH
        //    Bảng `attendance` KHÔNG có cột `class_id` (trước đây .eq("class_id") gây lỗi 400 → luôn rỗng).
        //    Buổi học nằm ở `event_id` → `schedule_events`, nên lấy điểm danh theo học sinh
        //    rồi lọc những buổi thuộc lớp này.
        const { data: attAll, error: attErr } = await (supabase as any)
          .from("attendance")
          .select("*")
          .in("student_id", possibleStudentIds);
        if (attErr) console.error("[attendance]", attErr);

        const { data: evs, error: evErr } = await (supabase as any)
          .from("schedule_events")
          .select("id, class_id")
          .eq("class_id", id);
        if (evErr) console.error("[schedule_events]", evErr);

        const eventIds = new Set<string>((evs || []).map((e: any) => e.id));
        const att = (attAll || []).filter((a: any) => a.event_id && eventIds.has(a.event_id));

        // TODO: xoá dòng log này khi đã xác nhận liên kết hoạt động
        console.log("DEBUG liên kết HS", {
          userId: user.id,
          roster: stList,
          ids: possibleStudentIds,
          attendanceOfStudent: attAll?.length ?? 0,
          eventsOfClass: eventIds.size,
          attendanceInThisClass: att.length,
          sample: attAll?.[0],
        });

        // Sắp xếp mới → cũ ngay trên client (không order ở DB vì không biết chắc tên cột ngày)
        const sortedAtt = (att || [])
          .slice()
          .sort((x: any, y: any) => new Date(attDate(y) || 0).getTime() - new Date(attDate(x) || 0).getTime());
        setAttendance(sortedAtt);

        // 4. Lấy danh sách bài kiểm tra
        const { data: tts } = await (supabase as any)
          .from("tests")
          .select("*")
          .eq("class_id", id)
          .order("created_at", { ascending: false });
        setTests(tts || []);

        // 5. FETCH TÀI LIỆU / BÀI HỌC
        let chData: any[] = [];
        const { data: ch1 } = await (supabase as any)
          .from("class_chapters")
          .select("*")
          .eq("class_id", id)
          .order("sort_order", { ascending: true });

        if (ch1 && ch1.length > 0) {
          chData = ch1;
        } else {
          const { data: ch2 } = await (supabase as any)
            .from("chapters")
            .select("*")
            .eq("class_id", id);
          if (ch2) chData = ch2;
        }
        setChapters(chData);

        if (chData.length > 0) {
          const chIds = chData.map((ch: any) => ch.id);
          let lssData: any[] = [];

          const { data: l1 } = await (supabase as any)
            .from("class_lessons")
            .select("*")
            .in("chapter_id", chIds);
          if (l1 && l1.length > 0) lssData = l1;

          if (lssData.length === 0) {
            const { data: l2 } = await (supabase as any)
              .from("lessons")
              .select("*")
              .in("chapter_id", chIds);
            if (l2) lssData = l2;
          }

          const lMap: Record<string, any[]> = {};
          lssData.forEach((l: any) => {
            (lMap[l.chapter_id] ||= []).push(l);
          });
          setLessonsByChapter(lMap);

          const initialOpen: Record<string, boolean> = {};
          if (chData[0]) initialOpen[chData[0].id] = true;
          setOpenChapters(initialOpen);
        }
      } catch (err) {
        console.error("Lỗi lấy dữ liệu:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id, user?.email]);

  const toggleChapter = (chapterId: string) => {
    setOpenChapters((prev) => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  const fmtVnd = (n: any) => formatVND(Number(n || 0));
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");

  if (loading) {
    return (
      <div className={cn("min-h-screen w-full bg-zinc-50", FONT)}>
        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
          <p className="text-sm text-zinc-500">Đang đồng bộ dữ liệu với giáo viên...</p>
          <Skeleton className="h-36 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-12">
            <Skeleton className="h-44 rounded-2xl lg:col-span-8" />
            <Skeleton className="h-44 rounded-2xl lg:col-span-4" />
          </div>
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!cls) {
    return (
      <div className={cn("min-h-screen w-full bg-zinc-50", FONT)}>
        <div className="mx-auto max-w-xl space-y-4 p-4 pt-16 text-center sm:p-8 sm:pt-20">
          <div className={cn(CARD, "space-y-4 p-8")}>
            <p className="text-sm font-medium text-zinc-500">Không tìm thấy thông tin lớp học.</p>
            <Link to="/student/classes" className={cn(CHIP_BTN, "mx-auto")}>
              <ArrowLeft className="h-4 w-4 text-zinc-400" aria-hidden="true" />
              Quay lại danh sách lớp
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const filteredAttendance = attendance.filter((a) => {
    if (attendanceTab === "unpaid") return !a.is_paid;
    if (attendanceTab === "paid") return a.is_paid;
    return true;
  });

  const classColor = cls.color || resolveStudentColor(null, String(cls.id));

  return (
    <div className={cn("min-h-screen w-full bg-zinc-50", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      <div className="mx-auto max-w-7xl space-y-4 p-4 pb-12 sm:p-8 sm:pb-14">
        <div>
          <Link to="/student/classes" className={CHIP_BTN}>
            <ArrowLeft className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            Tất cả lớp học
          </Link>
        </div>

        {/* ĐẦU TRANG LỚP HỌC */}
        <section className={cn(CARD, "flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-7")}>
          <div className="flex min-w-0 items-center gap-4">
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-base font-semibold"
              style={solid(classColor)}
              aria-hidden="true"
            >
              {cls.name ? String(cls.name).slice(0, 1).toUpperCase() : "L"}
            </div>
            <div className="min-w-0 space-y-1.5">
              <p className="text-sm text-zinc-500">Chi tiết lớp học</p>
              <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{cls.name}</h1>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={CHIP}>
              <BookOpen className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
              <span className="truncate">{cls.subject || "Môn học"}</span>
            </span>
            {cls.grade && (
              <span className={CHIP}>
                <GraduationCap className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                Khối {cls.grade}
              </span>
            )}
          </div>
        </section>

        {!studentRoster && (
          <div className={cn(CARD, "flex items-start gap-3 p-4")}>
            <div className={cn(TILE, "h-9 w-9")}>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </div>
            <p className="pt-1.5 text-sm text-zinc-600">
              Chú ý: Tài khoản của bạn cần giáo viên xác nhận danh sách lớp để xem điểm danh chuẩn xác nhất.
            </p>
          </div>
        )}

        {/* SỐ LIỆU + THẺ NỔI BẬT (học phí tháng) */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-8">
            <StatCard icon={Calendar} label="Ngày khai giảng" value={fmtDate(cls.start_date || cls.created_at)} />
            <StatCard icon={Clock} label="Học phí / buổi" value={fmtVnd(cls.fee_per_session)} />
          </div>

          <div className="lg:col-span-4">
            <div className="flex h-full min-h-[11rem] w-full flex-col justify-between gap-8 rounded-2xl bg-[#0B1B3A] p-6 text-white">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-white/65">Học phí / tháng</span>
                <CreditCard className="h-4 w-4 shrink-0 text-[#FFB547]" aria-hidden="true" />
              </div>
              <h3 className="truncate text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl">{fmtVnd(cls.fee_per_month)}</h3>
            </div>
          </div>
        </div>

        {/* CHƯƠNG TRÌNH & BÀI HỌC + BÀI KIỂM TRA */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-8")}>
            <SectionHead
              icon={BookOpen}
              title="Chương trình & Bài học"
              subtitle="Nội dung giáo viên đã đăng tải cho lớp"
              right={<span className={COUNT}>{chapters.length > 0 ? `${chapters.length} chương` : `${documents.length} tài liệu`}</span>}
            />

            {chapters.length === 0 && documents.length === 0 ? (
              <EmptyBox icon={BookOpen} text="Giáo viên chưa đăng tải nội dung bài học." />
            ) : chapters.length > 0 ? (
              <div className="space-y-2">
                {chapters.map((ch, idx) => {
                  const lessons = lessonsByChapter[ch.id] || [];
                  const isOpen = !!openChapters[ch.id];

                  return (
                    <div key={ch.id} className="rounded-xl border border-zinc-200 bg-white">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => toggleChapter(ch.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl p-3 text-left transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className={cn(TILE, "h-10 w-10 text-sm font-semibold tabular-nums")}>{idx + 1}</div>
                          <div className="min-w-0">
                            <h3 className="truncate text-sm font-semibold text-zinc-900">{ch.title || ch.name}</h3>
                            {ch.description && <p className="truncate text-xs text-zinc-500">{ch.description}</p>}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className={COUNT}>{lessons.length} bài</span>
                          <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                        </div>
                      </button>

                      {isOpen && (
                        <div className="space-y-1 rounded-b-xl border-t border-zinc-100 bg-zinc-50/70 p-3">
                          {lessons.length === 0 ? (
                            <p className="px-1 py-1 text-xs italic text-zinc-400">Chương này chưa có bài học.</p>
                          ) : (
                            lessons.map((ls) => (
                              <div
                                key={ls.id}
                                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 bg-white px-3 py-2"
                              >
                                <div className="flex min-w-0 items-center gap-3">
                                  <div className={cn(TILE, "h-8 w-8 rounded-lg")}>
                                    {ls.video_url ? (
                                      <PlayCircle className="h-4 w-4" aria-hidden="true" />
                                    ) : (
                                      <FileText className="h-4 w-4" aria-hidden="true" />
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <h4 className="truncate text-sm font-semibold text-zinc-900">{ls.title || ls.name}</h4>
                                    {ls.summary && <p className="truncate text-xs text-zinc-500">{ls.summary}</p>}
                                  </div>
                                </div>

                                <Link to={`/student/lessons/${ls.id}`} className={cn(SMALL_BTN, focusRing)}>
                                  Xem bài học <ChevronRight className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
                                </Link>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn(TILE, "h-10 w-10")}>
                        <FileText className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold text-zinc-900">{doc.title || doc.name}</h4>
                        <p className="truncate text-xs text-zinc-500">{doc.file_type || "Tài liệu học tập"}</p>
                      </div>
                    </div>
                    {doc.file_url && (
                      <a href={doc.file_url} target="_blank" rel="noreferrer" className={cn(SMALL_BTN, focusRing)}>
                        <Download className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Tải về
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-4")}>
            <SectionHead icon={FileCheck2} title="Bài kiểm tra & Đề thi" right={<span className={COUNT}>{tests.length} bài</span>} />

            {tests.length === 0 ? (
              <EmptyBox icon={FileCheck2} text="Chưa có bài kiểm tra nào cho lớp này." />
            ) : (
              <div className="space-y-2">
                {tests.map((test) => (
                  <div key={test.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-zinc-900">{test.title}</h4>
                      <p className="flex items-center gap-1 text-xs tabular-nums text-zinc-500">
                        <Clock className="h-3 w-3 text-zinc-400" aria-hidden="true" />
                        {test.duration_minutes || 45} phút
                      </p>
                    </div>
                    <Link to={`/student/tests/${test.id}`} className={cn(NAVY_SMALL_BTN, focusRing)}>
                      Làm bài
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* LỊCH SỬ ĐIỂM DANH & HỌC PHÍ */}
        <section className={cn(CARD, "space-y-5 p-5 sm:p-6")}>
          <SectionHead
            icon={CheckCircle2}
            title="Lịch sử điểm danh & Học phí"
            subtitle="Các buổi học đã ghi nhận và tình trạng thanh toán"
            right={
              <div className={SEG}>
                <button type="button" aria-pressed={attendanceTab === "all"} onClick={() => setAttendanceTab("all")} className={segBtn(attendanceTab === "all")}>
                  Tất cả ({attendance.length})
                </button>
                <button type="button" aria-pressed={attendanceTab === "unpaid"} onClick={() => setAttendanceTab("unpaid")} className={segBtn(attendanceTab === "unpaid")}>
                  Chưa đóng
                </button>
                <button type="button" aria-pressed={attendanceTab === "paid"} onClick={() => setAttendanceTab("paid")} className={segBtn(attendanceTab === "paid")}>
                  Đã đóng
                </button>
              </div>
            }
          />

          {filteredAttendance.length === 0 ? (
            <EmptyBox icon={Clock} text="Chưa có dữ liệu điểm danh nào được ghi nhận." />
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
              {filteredAttendance.map((a) => {
                const present = !!a.present;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn(TILE, "h-10 w-10")}>
                        <Calendar className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate text-sm font-semibold tabular-nums text-zinc-900">{fmtDate(attDate(a))}</h4>
                        <p className="truncate text-xs tabular-nums text-zinc-500">
                          Học phí ca: {fmtVnd(a.fee_override ?? cls.fee_per_session)}
                        </p>
                      </div>
                    </div>

                    <div className="ml-auto flex shrink-0 flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-1 text-xs font-medium",
                          present ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                        )}
                      >
                        {present ? "Có mặt" : "Vắng mặt"}
                      </span>
                      {/* TODO: `attendance` không có `is_paid`; trạng thái thanh toán nằm ở bảng khác (payments?).
                          Tạm ẩn nhãn thay vì hiện sai "Chưa thanh toán" cho mọi buổi. */}
                      {typeof a.is_paid === "boolean" && (
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-1 text-xs font-medium",
                            a.is_paid ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                          )}
                        >
                          {a.is_paid ? "Đã thanh toán" : "Chưa thanh toán"}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}