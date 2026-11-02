import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { BookOpen, Check, ClipboardCheck, ClipboardList, Clock, Loader2, Plus, Search, StickyNote, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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

const FIELD = "rounded-xl border-slate-200 bg-white text-sm placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30";

// Bỏ dấu để tìm "nguyen" ra được "Nguyễn"
const normalize = (s: string) =>
  (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");

type PayFilter = "all" | "unpaid" | "paid";
const PAY_FILTERS: { key: PayFilter; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unpaid", label: "Chưa đóng" },
  { key: "paid", label: "Đã đóng" },
];

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
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
        <Icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {label}
      </div>
      {children}
    </div>
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
  // Tổng số bài kiểm tra (một buổi có thể có nhiều bài)
  const testCount = rows.reduce((n: number, a: any) => n + parseTestsOf(a).length, 0);

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

  return (
    <div className="container mx-auto max-w-[1560px] space-y-6 p-4 font-['Be_Vietnam_Pro',sans-serif] md:p-6">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-6 sm:px-8">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full" style={{ background: accent }} />
        <div className="relative flex items-center gap-4">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-white">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-extrabold tracking-tight text-white">Nhật ký học tập</h1>
            <p className="text-sm text-white/70">Nội dung nhập ở đây sẽ hiện trong hóa đơn gửi phụ huynh.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12">
        {/* Danh sách học sinh */}
        <aside className="xl:sticky xl:top-4 xl:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                aria-label="Tìm học sinh"
                placeholder="Tìm học sinh"
                className="h-10 rounded-xl border-slate-200 pl-9 text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1 xl:max-h-[calc(100vh-16rem)]">
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
                    className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/40 ${
                      active ? "border-[#0B1B3A] bg-[#0B1B3A]/[0.04] ring-1 ring-[#0B1B3A]" : "border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span
                      className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-base font-extrabold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
                      style={{ background: color }}
                    >
                      {(s.name || "?").charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900">{s.name}</span>
                      <span className="block truncate text-xs text-slate-500">{classes.join(", ") || "Chưa xếp lớp"}</span>
                    </span>
                  </button>
                );
              })}
              {!studentsQ.isLoading && visibleStudents.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                  {students.length === 0 ? "Chưa có học sinh nào. Thêm học sinh ở trang Học sinh." : "Không tìm thấy học sinh phù hợp."}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Nhật ký của học sinh đang chọn */}
        <section className="min-w-0 space-y-4 xl:col-span-9">
          {student ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
                    style={{ background: accent }}
                  >
                    {(student.name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-bold text-slate-900">{student.name}</h2>
                    <p className="truncate text-sm text-slate-500">{(classesOf.get(student.id) || []).join(", ") || "Chưa xếp lớp"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span aria-live="polite" className="flex min-w-[76px] items-center justify-end gap-1.5 text-xs font-medium text-slate-500">
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
                  </span>
                  <Select value={activeMonth} onValueChange={setMonth} disabled={sessions.length === 0}>
                    <SelectTrigger aria-label="Chọn tháng" className="h-10 w-48 rounded-xl border-slate-200 bg-white text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="all">Tất cả các tháng</SelectItem>
                      {months.map((m) => (
                        <SelectItem key={m} value={m}>
                          {monthKeyLabel(m)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {sessions.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-1">
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
                    <span>
                      <b className="font-bold text-slate-800">{rows.length}</b> buổi học
                    </span>
                    <span>
                      <b className="font-bold text-slate-800">{testCount}</b> bài kiểm tra
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {paymentsQ.isError && <span className="text-xs text-rose-600">Không tải được tình trạng học phí.</span>}
                    <div role="group" aria-label="Lọc theo học phí" className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
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
                            className={`flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/40 disabled:opacity-50 ${
                              active ? "bg-[#0B1B3A] text-white" : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {f.label}
                            <span className={`tabular-nums ${active ? "text-white/70" : "text-slate-400"}`}>
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
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">
                  Đang tải nhật ký...
                </div>
              )}
              {logsQ.isError && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-700">
                  Không tải được nhật ký. Tải lại trang và thử lại.
                </div>
              )}
              {!logsQ.isLoading && !logsQ.isError && sessions.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  Chưa có buổi học nào. Nhật ký sẽ xuất hiện ở đây sau khi bạn điểm danh học sinh có mặt.
                </div>
              )}

              {!logsQ.isLoading && !logsQ.isError && sessions.length > 0 && rows.length === 0 && (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                  Không có buổi nào {payFilter === "paid" ? "đã đóng" : "chưa đóng"} học phí
                  {activeMonth === "all" ? "" : ` trong ${monthKeyLabel(activeMonth).toLowerCase()}`}.
                </div>
              )}

              {rows.map((a: any) => {
                const paid = paidIds.has(a.id);
                const ev = a.schedule_events;
                const time = timeRange(ev);
                const cls = classNameById.get(ev?.class_id) || "";
                const tests = testsOf(a);
                const lastTestBlank = isBlankTest(tests[tests.length - 1]);
                return (
                  <article key={a.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="flex h-14 w-14 shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
                          style={{ background: accent }}
                        >
                          <span className="text-[11px] font-semibold leading-none">{weekdayShort(ev?.event_date)}</span>
                          <span className="text-base font-extrabold leading-none tabular-nums">{dayMonth(ev?.event_date)}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900">{cls || "Buổi học"}</div>
                          {time && (
                            <div className="mt-0.5 flex items-center gap-1.5 text-xs tabular-nums text-slate-500">
                              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                              {time}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {payReady &&
                          (paid ? (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">Đã đóng</span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Chưa đóng</span>
                          ))}
                        <span className="text-xs font-medium text-slate-400">Buổi {sessionNo.get(a.id)}</span>
                      </div>
                    </header>

                    <div className="grid gap-4 p-5 md:grid-cols-2">
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
                                className={`h-10 w-24 shrink-0 text-center font-semibold tabular-nums ${FIELD}`}
                                value={t.score}
                                onChange={(e) => editTest(a, i, "score", e.target.value)}
                                onBlur={() => saveTests(a, tests)}
                              />
                              <button
                                type="button"
                                aria-label={`Xóa bài kiểm tra ${i + 1}`}
                                onClick={() => removeTest(a, i)}
                                className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30 ${
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
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
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
                  </article>
                );
              })}
            </>
          ) : (
            !studentsQ.isLoading && (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center text-sm text-slate-500">
                Chưa có học sinh nào. Thêm học sinh ở trang Học sinh để bắt đầu ghi nhật ký.
              </div>
            )
          )}
        </section>
      </div>
    </div>
  );
}