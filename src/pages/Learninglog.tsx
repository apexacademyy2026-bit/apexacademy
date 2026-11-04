import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Check, ClipboardCheck, ClipboardList, Clock, Loader2, Plus, Search, StickyNote, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useEnrollments, useClasses } from "@/hooks/useData";
import { resolveStudentColor } from "@/lib/studentColor";
import {
  LOG,
  type LogCol,
  rawVal,
  weekdayShort,
  dayMonth,
  timeRange,
  monthKeyLabel,
  sessionSort,
} from "@/lib/Learninglog";
import {
  EMPTY_TEST,
  cleanTests,
  isBlankTest,
  parseTests,
  serializeTests,
  withSpare,
  type TestItem,
} from "@/lib/Learningtests";

/* Design tokens: mực navy #0B1B3A · nền trắng · viền zinc mảnh.
   Màu của học sinh đang chọn là điểm nhấn duy nhất: vạch màu trên khung tiêu đề, avatar đặc, ô ngày đặc, đường nối các buổi. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const FIELD =
  "rounded-xl border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const SEG = "inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-zinc-100 p-1";
const segBtn = (active: boolean) =>
  cn(
    "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
    active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
  );
const GAP = 20; // px, khoảng cách giữa các mục trên dòng thời gian (= gap-5)

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
// Phủ một lớp màu rất nhạt lên nền trắng
const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;

// Bỏ dấu để tìm "nguyen" ra được "Nguyễn"
const normalize = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

type PayFilter = "all" | "unpaid" | "paid";
const PAY_FILTERS: { key: PayFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unpaid", label: "Chưa đóng" },
  { key: "paid", label: "Đã đóng" },
];

// Dòng thời gian gồm tiêu đề tháng (chỉ khi xem "Tất cả") và các buổi học
type Entry = { kind: "month"; key: string } | { kind: "session"; a: any };

// Buổi đã đóng học phí: cùng cách tính với trang hóa đơn
// (nằm trong kỳ theo tháng đã đóng, hoặc là buổi lẻ đã đóng)
const isSessionPaid = (a: any, payments: any[]): boolean => {
  const date = a?.schedule_events?.event_date;
  if (!date) return false;
  return payments.some((p: any) => {
    const inPeriod = !!p.period_start && !!p.period_end && date >= p.period_start && date <= p.period_end;
    if (p.cycle_type === "monthly") return inPeriod;
    if (p.cycle_type === "session") {
      return p.attendance_id === a.id || (Array.isArray(p.attendance_ids) && p.attendance_ids.includes(a.id)) || inPeriod;
    }
    return false;
  });
};

// ---- Nhiều bài kiểm tra trong một buổi ----
// Cách đọc/ghi nằm trong lib/learningTests, dùng chung với trang Hóa đơn.
const parseTestsOf = (a: any): TestItem[] => parseTests(rawVal(a, LOG.testName), rawVal(a, LOG.testScore));
// Danh sách đang hiển thị: bản nháp nếu có, không thì dữ liệu đã lưu. Luôn có ít nhất 1 dòng để nhập.
const itemsFrom = (a: any, draft: Record<string, TestItem[]>): TestItem[] => withSpare(draft[a.id] ?? parseTestsOf(a));

function LogField({
  icon: Icon,
  label,
  className = "",
  children,
}: {
  icon: LucideIcon;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-zinc-700">
        <Icon className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        {label}
      </div>
      {children}
    </div>
  );
}

// Đường dọc nối các buổi: đi từ tâm ô ngày của mục này xuống mục kế tiếp
function Rail({ color, anchor, first, last }: { color: string; anchor: number; first: boolean; last: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="absolute left-1/2 w-px -translate-x-1/2"
      style={{
        background: color,
        top: first ? anchor : -GAP,
        ...(last ? { height: first ? 0 : anchor + GAP } : { bottom: -GAP }),
      }}
    />
  );
}

export default function LearningLog() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [month, setMonth] = useState(""); // "" = tháng mới nhất có buổi học, "all" = tất cả
  const [payFilter, setPayFilter] = useState<PayFilter>("all");
  // Nội dung đang gõ dở, khoá dạng "<id buổi>:<tên cột>"
  const [draft, setDraft] = useState<Record<string, string>>({});
  // Danh sách bài kiểm tra đang sửa dở, khoá là id buổi
  const [testDraft, setTestDraft] = useState<Record<string, TestItem[]>>({});
  // Dòng bài kiểm tra vừa thêm cần được focus ("<id buổi>:<vị trí>")
  const focusNext = useRef<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const enrollments = useEnrollments();
  const classesQ = useClasses();

  const studentsQ = useQuery({
    queryKey: ["learning-log-students"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const students: any[] = studentsQ.data || [];

  const classNameById = useMemo(
    () => new Map<string, string>((classesQ.data || []).map((c: any) => [c.id, c.name] as [string, string])),
    [classesQ.data]
  );
  const classesOf = useMemo(() => {
    const m = new Map<string, string[]>();
    (enrollments.data || []).forEach((e: any) => {
      const name = classNameById.get(e.class_id);
      if (name) m.set(e.student_id, [...(m.get(e.student_id) || []), name]);
    });
    return m;
  }, [enrollments.data, classNameById]);

  const visibleStudents = useMemo(() => {
    const q = normalize(search.trim());
    return q ? students.filter((s) => normalize(s.name).includes(q)) : students;
  }, [students, search]);

  const student: any = students.find((s) => s.id === params.get("student")) ?? students[0] ?? null;
  const studentId: string | undefined = student?.id;
  const accent = String(resolveStudentColor(student?.color, student?.id ?? ""));
  const ink = inkOn(accent);
  const pickStudent = (id: string) => setParams({ student: id }, { replace: true });

  // Chỉ lấy các buổi học sinh có mặt, giống hoá đơn
  const logsQ = useQuery({
    queryKey: ["learning-log", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, schedule_events(event_date, start_time, end_time, class_id)")
        .eq("student_id", studentId as string)
        .eq("present", true);
      if (error) throw error;
      return (data || []).filter((a: any) => a.present === true && a?.schedule_events?.event_date);
    },
    enabled: !!studentId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const paymentsQ = useQuery({
    queryKey: ["learning-log-payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("payments").select("*").eq("student_id", studentId as string);
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentId,
    staleTime: 0,
    refetchOnMount: "always",
  });
  const payReady = paymentsQ.isSuccess; // chưa tải xong thì chưa biết buổi nào đã đóng

  const sessions = useMemo(() => [...(logsQ.data || [])].sort(sessionSort), [logsQ.data]);
  const months = useMemo(
    () =>
      Array.from(new Set(sessions.map((a: any) => String(a.schedule_events.event_date).slice(0, 7))))
        .sort()
        .reverse(),
    [sessions]
  );
  const activeMonth = month === "all" ? "all" : months.includes(month) ? month : months[0] ?? "all";
  const monthRows = useMemo(
    () =>
      activeMonth === "all"
        ? sessions
        : sessions.filter((a: any) => String(a.schedule_events.event_date).startsWith(activeMonth)),
    [sessions, activeMonth]
  );
  const paidIds = useMemo(
    () => new Set<string>(sessions.filter((a: any) => isSessionPaid(a, paymentsQ.data || [])).map((a: any) => a.id)),
    [sessions, paymentsQ.data]
  );
  const paidCount = monthRows.filter((a: any) => paidIds.has(a.id)).length;
  const unpaidCount = monthRows.length - paidCount;
  // Hiển thị buổi mới nhất lên đầu. monthRows vẫn theo thứ tự cũ → mới nên số buổi không bị đảo.
  const rows = useMemo(
    () =>
      [
        ...(payFilter === "all" || !payReady
          ? monthRows
          : monthRows.filter((a: any) => (payFilter === "paid") === paidIds.has(a.id))),
      ].reverse(),
    [monthRows, paidIds, payFilter, payReady]
  );
  // Số thứ tự buổi tính theo tháng đang xem, không đổi khi lọc theo học phí
  const sessionNo = useMemo(
    () => new Map<string, number>(monthRows.map((a: any, i: number) => [a.id, i + 1] as [string, number])),
    [monthRows]
  );
  // Số liệu ở dải tiêu đề tính theo tháng đang xem, không đổi khi lọc theo học phí
  const testCount = monthRows.reduce((n: number, a: any) => n + parseTestsOf(a).length, 0);
  const loggedCount = monthRows.filter((a: any) => String(rawVal(a, LOG.content) ?? "").trim() !== "").length;

  // Dòng thời gian: chèn tiêu đề tháng khi đang xem tất cả các tháng
  const entries = useMemo(() => {
    const out: Entry[] = [];
    let prev = "";
    rows.forEach((a: any) => {
      const mk = String(a.schedule_events.event_date).slice(0, 7);
      if (activeMonth === "all" && mk !== prev) {
        out.push({ kind: "month", key: mk });
        prev = mk;
      }
      out.push({ kind: "session", a });
    });
    return out;
  }, [rows, activeMonth]);

  useEffect(() => {
    if (saveState !== "saved") return;
    const id = setTimeout(() => setSaveState("idle"), 2500);
    return () => clearTimeout(id);
  }, [saveState]);

  const keyOf = (a: any, col: LogCol) => `${a.id}:${col}`;

  // Gõ xong (rời ô) thì lưu vào bảng attendance. Hoá đơn của học sinh này đọc đúng dữ liệu này.
  const save = async (a: any, col: LogCol, value: string) => {
    const key = keyOf(a, col);
    const next = value.trim();
    if (next === rawVal(a, col).trim()) {
      setDraft((d) => {
        const n = { ...d };
        delete n[key];
        return n;
      });
      return;
    }
    setSaveState("saving");
    const { error } = await supabase
      .from("attendance")
      .update({ [col]: next === "" ? null : next } as any)
      .eq("id", a.id);
    if (error) {
      setSaveState("idle");
      toast.error("Không lưu được nhật ký", { description: error.message });
      return; // giữ nguyên nội dung đang gõ để không mất chữ
    }
    await qc.invalidateQueries({ queryKey: ["learning-log", studentId] });
    qc.invalidateQueries({ queryKey: ["student-bill-attendance", studentId] });
    setDraft((d) => {
      const n = { ...d };
      delete n[key];
      return n;
    });
    setSaveState("saved");
  };

  const bind = (a: any, col: LogCol) => ({
    value: draft[keyOf(a, col)] ?? rawVal(a, col),
    onChange: (e: any) => setDraft((d) => ({ ...d, [keyOf(a, col)]: e.target.value })),
    onBlur: (e: any) => save(a, col, e.target.value),
  });

  // ---- Bài kiểm tra: nhiều dòng, mỗi dòng gồm tên và điểm ----
  const testsOf = (a: any) => itemsFrom(a, testDraft);

  const editTest = (a: any, idx: number, field: keyof TestItem, value: string) =>
    setTestDraft((d) => ({
      ...d,
      [a.id]: itemsFrom(a, d).map((t, i) => (i === idx ? { ...t, [field]: value } : t)),
    }));

  const addTest = (a: any) => {
    focusNext.current = `${a.id}:${testsOf(a).length}`;
    setTestDraft((d) => ({ ...d, [a.id]: [...itemsFrom(a, d), { ...EMPTY_TEST }] }));
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

    if (
      name === String(rawVal(a, LOG.testName) ?? "").trim() &&
      score === String(rawVal(a, LOG.testScore) ?? "").trim()
    ) {
      settle();
      return;
    }
    setSaveState("saving");
    const { error } = await supabase
      .from("attendance")
      .update({ [LOG.testName]: name || null, [LOG.testScore]: score || null } as any)
      .eq("id", a.id);
    if (error) {
      setSaveState("idle");
      toast.error("Không lưu được nhật ký", { description: error.message });
      return; // giữ nguyên bản nháp để không mất chữ
    }
    await qc.invalidateQueries({ queryKey: ["learning-log", studentId] });
    qc.invalidateQueries({ queryKey: ["student-bill-attendance", studentId] });
    settle();
    setSaveState("saved");
  };

  const removeTest = (a: any, idx: number) => {
    const next = testsOf(a).filter((_, i) => i !== idx);
    setTestDraft((d) => ({ ...d, [a.id]: next }));
    saveTests(a, next);
  };

  const monthChips = [{ key: "all", label: "Tất cả" }, ...months.map((m) => ({ key: m, label: monthKeyLabel(m) }))];
  const railColor = wash(accent, 40);
  // Số liệu của học sinh đang chọn trong tháng đang xem (không đổi khi lọc theo học phí)
  const loadingLogs = logsQ.isLoading;
  const heroStats = [
    { label: "Buổi học", value: loadingLogs ? "–" : String(monthRows.length) },
    { label: "Bài kiểm tra", value: loadingLogs ? "–" : String(testCount) },
    { label: "Buổi đã ghi", value: loadingLogs ? "–" : `${loggedCount}/${monthRows.length}` },
  ];

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      {/* TIÊU ĐỀ + SỐ LIỆU: cùng khung với trang Lớp học, vạch trên cùng mang màu học sinh */}
      <section className={cn(CARD, "relative overflow-hidden")}>
        <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: accent }} />
        <div className="flex flex-col gap-4 p-5 pt-6 sm:flex-row sm:items-center sm:justify-between sm:p-6 sm:pt-7">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Nhật ký học tập</h1>
            <p className="text-sm text-zinc-500">Nội dung nhập ở đây sẽ hiện trong hóa đơn gửi phụ huynh.</p>
          </div>
          <span
            aria-live="polite"
            className="inline-flex min-w-[112px] items-center justify-center gap-1.5 self-start rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-500 sm:self-auto"
          >
            {saveState === "saving" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Đang lưu
              </>
            )}
            {saveState === "saved" && (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> Đã lưu
              </>
            )}
            {saveState === "idle" && <span className="text-zinc-400">Tự động lưu</span>}
          </span>
        </div>
        {student && (
          <dl className="grid grid-cols-3 border-t border-zinc-100 sm:grid-cols-4">
            <div
              className="col-span-3 flex flex-col justify-center border-b border-zinc-100 px-5 py-4 sm:col-span-1 sm:border-b-0 sm:px-6"
              style={{ background: wash(accent, 8) }}
            >
              <dt className="text-xs text-zinc-500">Học sinh</dt>
              <dd className="mt-1 flex h-8 min-w-0 items-center gap-2.5" title={(classesOf.get(student.id) || []).join(", ") || "Chưa xếp lớp"}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold" style={solid(accent)}>
                  {(student.name || "?").charAt(0).toUpperCase()}
                </span>
                <span className="truncate text-lg font-semibold text-zinc-900">{student.name}</span>
              </dd>
            </div>
            {heroStats.map((st, i) => (
              <div key={st.label} className={cn("px-5 py-4 sm:px-6", i === 0 ? "sm:border-l sm:border-zinc-100" : "border-l border-zinc-100")}>
                <dt className="text-xs text-zinc-500">{st.label}</dt>
                <dd className="mt-1 flex h-8 items-center text-xl font-semibold tabular-nums text-zinc-900">{st.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        {/* Danh sách học sinh: cuộn ngang trên màn hình nhỏ, cột dọc trên màn hình lớn */}
        <aside className="min-w-0 xl:sticky xl:top-4">
          <div className={`${CARD} p-3`}>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
              <Input
                aria-label="Tìm học sinh"
                placeholder="Tìm học sinh"
                className={`h-10 pl-9 ${FIELD}`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 xl:max-h-[calc(100vh-15rem)] xl:flex-col xl:gap-1 xl:overflow-y-auto xl:overflow-x-hidden xl:pb-0 xl:pr-1">
              {visibleStudents.map((s) => {
                const active = s.id === studentId;
                const color = String(resolveStudentColor(s.color, s.id));
                const classes = classesOf.get(s.id) || [];
                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickStudent(s.id)}
                    className={`flex w-60 shrink-0 items-center gap-3 rounded-xl p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/40 xl:w-full ${
                      active ? "" : "hover:bg-zinc-50"
                    }`}
                    style={active ? { background: wash(color, 12), boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-semibold" style={solid(color)}>
                      {(s.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-zinc-900">{s.name}</span>
                      <span className="block truncate text-xs text-zinc-500">{classes.join(", ") || "Chưa xếp lớp"}</span>
                    </span>
                  </button>
                );
              })}
              {!studentsQ.isLoading && visibleStudents.length === 0 && (
                <div className="w-full rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-sm text-zinc-500">
                  {students.length === 0 ? "Chưa có học sinh nào. Thêm học sinh ở trang Học sinh." : "Không tìm thấy học sinh phù hợp."}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Nhật ký của học sinh đang chọn */}
        <section className="min-w-0 space-y-4">
          {student ? (
            <>
              {/* THANH LỌC: chọn tháng và lọc học phí, cùng kiểu với trang Lớp học */}
              {sessions.length > 0 && (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div role="group" aria-label="Chọn tháng" className={SEG}>
                    {monthChips.map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        aria-pressed={m.key === activeMonth}
                        onClick={() => setMonth(m.key)}
                        className={segBtn(m.key === activeMonth)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {paymentsQ.isError && <span className="text-xs text-rose-600">Không tải được tình trạng học phí.</span>}
                    <div role="group" aria-label="Lọc theo học phí" className={SEG}>
                      {PAY_FILTERS.map((f) => {
                        const active = payFilter === f.key;
                        const count = f.key === "all" ? monthRows.length : f.key === "paid" ? paidCount : unpaidCount;
                        return (
                          <button
                            key={f.key}
                            type="button"
                            aria-pressed={active}
                            disabled={f.key !== "all" && !payReady}
                            onClick={() => setPayFilter(f.key)}
                            className={cn(segBtn(active), "flex items-center gap-1.5 disabled:opacity-50")}
                          >
                            {f.label}
                            <span className={cn("text-xs tabular-nums", active ? "text-zinc-500" : "text-zinc-400")}>
                              {f.key === "all" || payReady ? count : "–"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {logsQ.isLoading && (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-10 text-center text-sm text-zinc-500">
                  Đang tải nhật ký...
                </div>
              )}
              {logsQ.isError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  Không tải được nhật ký. Tải lại trang và thử lại.
                </div>
              )}
              {!logsQ.isLoading && !logsQ.isError && sessions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
                  Chưa có buổi học nào. Nhật ký sẽ xuất hiện ở đây sau khi bạn điểm danh học sinh có mặt.
                </div>
              )}

              {!logsQ.isLoading && !logsQ.isError && sessions.length > 0 && rows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
                  Không có buổi nào {payFilter === "paid" ? "đã đóng" : "chưa đóng"} học phí
                  {activeMonth === "all" ? "" : ` trong ${monthKeyLabel(activeMonth).toLowerCase()}`}.
                </div>
              )}

              {/* DÒNG THỜI GIAN CÁC BUỔI HỌC: ô ngày bên trái, thẻ nhập liệu bên phải */}
              {!logsQ.isLoading && !logsQ.isError && entries.length > 0 && (
                <div className="flex flex-col" style={{ gap: GAP }}>
                  {entries.map((en, idx) => {
                    const first = idx === 0;
                    const last = idx === entries.length - 1;

                    if (en.kind === "month") {
                      return (
                        <div key={`m-${en.key}`} className="grid md:grid-cols-[72px_minmax(0,1fr)]">
                          <div className="relative hidden md:block">
                            <Rail color={railColor} anchor={14} first={first} last={last} />
                            <span
                              className="absolute left-1/2 top-2 h-3 w-3 -translate-x-1/2 rounded-full"
                              style={{ background: accent }}
                            />
                          </div>
                          <div>
                            <span className="inline-flex rounded-full bg-white px-3 py-1 text-sm font-semibold text-zinc-900 ring-1 ring-zinc-200">
                              {monthKeyLabel(en.key)}
                            </span>
                          </div>
                        </div>
                      );
                    }

                    const a = en.a;
                    const paid = paidIds.has(a.id);
                    const ev = a.schedule_events;
                    const time = timeRange(ev);
                    const cls = classNameById.get(ev?.class_id) || "";
                    const tests = testsOf(a);
                    const lastTestBlank = isBlankTest(tests[tests.length - 1]);

                    return (
                      <div key={a.id} className="grid md:grid-cols-[72px_minmax(0,1fr)]">
                        {/* Ô ngày + đường nối (ẩn trên điện thoại, ngày hiện trong tiêu đề thẻ) */}
                        <div className="relative hidden md:block">
                          <Rail color={railColor} anchor={28} first={first} last={last} />
                          <div
                            className="relative mx-auto flex h-14 w-14 flex-col items-center justify-center gap-1 rounded-xl"
                            style={solid(accent)}
                          >
                            <span className="text-[11px] font-medium leading-none opacity-90">{weekdayShort(ev?.event_date)}</span>
                            <span className="text-base font-semibold leading-none tabular-nums">{dayMonth(ev?.event_date)}</span>
                          </div>
                        </div>

                        <article className="min-w-0 overflow-hidden rounded-2xl border bg-white" style={{ borderColor: wash(accent, 38) }}>
                          <header
                            className="flex items-center justify-between gap-3 border-b px-5 py-3"
                            style={{ background: wash(accent, 6), borderColor: wash(accent, 25) }}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span
                                className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums md:hidden"
                                style={{ background: accent, color: ink }}
                              >
                                {weekdayShort(ev?.event_date)} {dayMonth(ev?.event_date)}
                              </span>
                              <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-zinc-900">{cls || "Buổi học"}</div>
                                {time && (
                                  <div className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-zinc-500">
                                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                                    {time}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {payReady &&
                                (paid ? (
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">Đã đóng</span>
                                ) : (
                                  <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-200">Chưa đóng</span>
                                ))}
                              <span className="text-xs font-medium tabular-nums text-zinc-500">Buổi {sessionNo.get(a.id)}</span>
                            </div>
                          </header>

                          {/* Hai cột xếp chồng: bài giảng ở bên trái, kết quả ở bên phải. Không bị kéo cao bằng nhau. */}
                          <div className="grid gap-x-6 gap-y-4 p-5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
                            <div className="min-w-0 space-y-4">
                              <LogField icon={BookOpen} label="Nội dung buổi học">
                                <Textarea
                                  rows={3}
                                  aria-label="Nội dung buổi học"
                                  placeholder="Hôm nay học gì..."
                                  className={`min-h-[88px] resize-y ${FIELD}`}
                                  {...bind(a, LOG.content)}
                                />
                              </LogField>
                              <LogField icon={ClipboardList} label="Bài tập về nhà">
                                <Textarea
                                  rows={3}
                                  aria-label="Bài tập về nhà"
                                  placeholder="Bài tập giao cho buổi sau..."
                                  className={`min-h-[88px] resize-y ${FIELD}`}
                                  {...bind(a, LOG.homework)}
                                />
                              </LogField>
                            </div>

                            <div className="min-w-0 space-y-4">
                              <LogField icon={ClipboardCheck} label="Bài kiểm tra">
                                <div className="space-y-2">
                                  {tests.map((t, i) => (
                                    <div key={i} className="flex gap-2">
                                      <Input
                                        type="text"
                                        aria-label={`Tên bài kiểm tra ${i + 1}`}
                                        placeholder="Tên bài kiểm tra"
                                        className={`h-10 min-w-0 flex-1 ${FIELD}`}
                                        value={t.name}
                                        onChange={(e) => editTest(a, i, "name", e.target.value)}
                                        onBlur={() => saveTests(a, tests)}
                                        ref={(el) => {
                                          // Dòng vừa bấm "Thêm bài kiểm tra" thì đưa con trỏ vào ngay
                                          if (el && focusNext.current === `${a.id}:${i}`) {
                                            focusNext.current = null;
                                            el.focus();
                                          }
                                        }}
                                      />
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        aria-label={`Điểm kiểm tra ${i + 1}`}
                                        placeholder="Điểm"
                                        className={`h-10 w-20 shrink-0 text-center font-semibold tabular-nums ${FIELD}`}
                                        value={t.score}
                                        onChange={(e) => editTest(a, i, "score", e.target.value)}
                                        onBlur={() => saveTests(a, tests)}
                                      />
                                      <button
                                        type="button"
                                        aria-label={`Xóa bài kiểm tra ${i + 1}`}
                                        onClick={() => removeTest(a, i)}
                                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30 ${
                                          tests.length > 1 || !isBlankTest(t) ? "" : "invisible"
                                        }`}
                                      >
                                        <X className="h-4 w-4" aria-hidden="true" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    disabled={lastTestBlank}
                                    onClick={() => addTest(a)}
                                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                                  >
                                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                    Thêm bài kiểm tra
                                  </button>
                                </div>
                              </LogField>
                              <LogField icon={StickyNote} label="Ghi chú">
                                <Input
                                  type="text"
                                  aria-label="Ghi chú"
                                  placeholder="Nhận xét thêm cho phụ huynh..."
                                  className={`h-10 ${FIELD}`}
                                  {...bind(a, LOG.note)}
                                />
                              </LogField>
                            </div>
                          </div>
                        </article>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            !studentsQ.isLoading && (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-10 text-center text-sm text-zinc-500">
                Chưa có học sinh nào. Thêm học sinh ở trang Học sinh để bắt đầu ghi nhật ký.
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}