import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Trash2,
  Receipt,
  User,
  Phone,
  Mail,
  Calendar,
  GraduationCap,
  BookOpen,
  Clock,
  CalendarClock,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEnrollments, useClasses } from "@/hooks/useData";
import { formatVND, fmtDate } from "@/lib/format";
import StudentDialog from "@/components/StudentDialog";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import { resolveStudentColor } from "@/lib/studentColor";
import { getBillingPeriod, shortDate } from "@/lib/Billingperiod";

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate (giống trang Học sinh) */
const CARD = "rounded-2xl border border-slate-200 bg-white p-6 shadow-xs";
const INPUT = "h-9 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20";
const HERO_PILL = "inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white";

// Học phí hiển thị của một lớp: ưu tiên học phí tháng, nếu không có thì lấy học phí buổi
const classFee = (c: any) =>
  Number(c.fee_per_month || 0) > 0 ? formatVND(Number(c.fee_per_month)) : formatVND(Number(c.fee_per_session || c.fee || 0));

const InfoRow = ({ icon: Icon, label, value, tone }: { icon: any; label: string; value: React.ReactNode; tone?: string }) => (
  <div className="flex items-center justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
    <span className="flex items-center gap-2 text-slate-500">
      <Icon className="h-4 w-4 text-slate-400" /> {label}
    </span>
    <span className={cn("text-right font-semibold text-slate-900", tone)}>{value}</span>
  </div>
);

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, user } = useApp();
  const enrollments = useEnrollments();
  const classes = useClasses();
  const qc = useQueryClient();
  const confirm = useConfirm();

  // Dialog control
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Đăng ký lớp cho học sinh
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);

  // Form states cho Điểm danh
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    class_id: "",
    note: "",
  });
  const [editRow, setEditRow] = useState<Record<string, { present: boolean; note: string; date: string }>>({});
  const [editRowTime, setEditRowTime] = useState<Record<string, { start: string; end: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<"unpaid" | "paid" | "all">("all");
  const [savingBillingDay, setSavingBillingDay] = useState(false);

  // Fetch thông tin học sinh
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  // Fetch điểm danh
  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["student-attendance-all", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*, schedule_events(event_date, start_time, end_time, class_id)")
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data || []) as any[];
      rows.sort((a, b) => {
        const da = a.schedule_events?.event_date || a.created_at || "";
        const db = b.schedule_events?.event_date || b.created_at || "";
        return db.localeCompare(da);
      });
      return rows;
    },
    enabled: !!id,
  });

  // Fetch thanh toán
  const { data: payments = [] } = useQuery({
    queryKey: ["payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("student_id", id);
      return data || [];
    },
    enabled: !!id,
  });

  useEffect(() => {
    document.title = student ? `${student.name} — ${t?.appName || "Lớp Cô Phương Anh"}` : t?.appName || "Lớp Cô Phương Anh";
  }, [student, t]);

  const myClasses = useMemo(() => {
    if (!student) return [];
    const cids = (enrollments.data || []).filter((e: any) => e.student_id === student.id).map((e: any) => e.class_id);
    return (classes.data || []).filter((c: any) => cids.includes(c.id));
  }, [enrollments.data, classes.data, student]);

  // Các lớp học sinh đã đăng ký (để loại khỏi danh sách chọn)
  const joinedClassIds = useMemo(() => {
    if (!student) return new Set<string>();
    return new Set<string>(
      (enrollments.data || []).filter((e: any) => String(e.student_id) === String(student.id)).map((e: any) => String(e.class_id)),
    );
  }, [enrollments.data, student]);

  // Các lớp học sinh CHƯA đăng ký, xếp theo tên
  const availableClasses = useMemo(
    () =>
      (classes.data || [])
        .filter((c: any) => !joinedClassIds.has(String(c.id)))
        .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || ""), "vi")),
    [classes.data, joinedClassIds],
  );

  useEffect(() => {
    if (myClasses[0] && !addForm.class_id) {
      setAddForm((f) => ({ ...f, class_id: myClasses[0].id }));
    }
  }, [myClasses, addForm.class_id]);

  const addAttendance = async () => {
    if (!user || !addForm.class_id) return;
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
    if (e1) {
      toast.error(e1.message);
      return;
    }
    const { error: e2 } = await supabase.from("attendance").insert({
      user_id: user.id,
      event_id: ev.id,
      student_id: student.id,
      present: true,
      homework_note: addForm.note,
    });
    if (e2) {
      toast.error(e2.message);
      return;
    }
    toast.success("Thêm thành công");
    setAddForm({ date: new Date().toISOString().slice(0, 10), class_id: myClasses[0]?.id || "", note: "" });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  const toggleSelectClass = (classId: string | number) => {
    const cid = String(classId);
    setSelectedClassIds((prev) => (prev.includes(cid) ? prev.filter((x) => x !== cid) : [...prev, cid]));
  };

  const closeEnroll = () => {
    setEnrollOpen(false);
    setSelectedClassIds([]);
  };

  // Đăng ký học sinh vào các lớp đã chọn (thêm dòng vào bảng enrollments)
  const enrollClasses = async () => {
    if (!user || !student) return;
    // Bỏ các lớp học sinh đã có sẵn để tránh đăng ký trùng
    const classIds = selectedClassIds.filter((cid) => !joinedClassIds.has(cid));
    if (classIds.length === 0) return;

    setEnrolling(true);
    const buildRows = (withUser: boolean) =>
      classIds.map((class_id) => ({ ...(withUser ? { user_id: user.id } : {}), class_id, student_id: student.id }));

    let { error } = await supabase.from("enrollments").insert(buildRows(true) as any);
    // Dự phòng: nếu bảng enrollments không có cột user_id thì thử lại không kèm user_id
    if (error && /user_id/i.test(error.message)) {
      ({ error } = await supabase.from("enrollments").insert(buildRows(false) as any));
    }
    setEnrolling(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Đã đăng ký ${classIds.length} lớp cho ${student.name}`);
    closeEnroll();
    qc.invalidateQueries({ queryKey: ["enrollments"] });
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["classes"] });
    await (enrollments as any).refetch?.();
  };

  const removeAttendance = async (a: any) => {
    if (!(await confirm({ description: "Bạn có chắc chắn muốn xóa điểm danh này?", destructive: true }))) return;
    await supabase.from("attendance").delete().eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
    toast.success("Đã xóa điểm danh");
  };

  const startEdit = (a: any) => {
    setEditingId(a.id);
    setEditRow({
      ...editRow,
      [a.id]: {
        present: !!a.present,
        note: a.homework_note || "",
        date: a.schedule_events?.event_date || new Date().toISOString().slice(0, 10),
      },
    });
    setEditRowTime({
      ...editRowTime,
      [a.id]: {
        start: (a.schedule_events?.start_time || "00:00").slice(0, 5),
        end: (a.schedule_events?.end_time || "01:00").slice(0, 5),
      },
    });
  };

  const saveEdit = async (a: any) => {
    const row = editRow[a.id];
    const timeRow = editRowTime[a.id];
    if (!row) return;
    const { error: e1 } = await supabase.from("attendance").update({ present: row.present, homework_note: row.note }).eq("id", a.id);
    if (e1) return toast.error(e1.message);
    if (a.event_id) {
      const ev = a.schedule_events || {};
      const updates: any = {};
      if (row.date !== ev.event_date) updates.event_date = row.date;
      if (timeRow && timeRow.start !== (ev.start_time || "").slice(0, 5)) updates.start_time = timeRow.start;
      if (timeRow && timeRow.end !== (ev.end_time || "").slice(0, 5)) updates.end_time = timeRow.end;
      if (Object.keys(updates).length) {
        await supabase.from("schedule_events").update(updates).eq("id", a.event_id);
      }
    }
    toast.success("Đã lưu thay đổi");
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  const visibleAttendance = useMemo(() => {
    return (attendance || []).filter((a: any) => {
      if (payFilter === "all") return true;
      const paid = (payments || []).some((p: any) => {
        const d = a.schedule_events?.event_date;
        return p.period_start && p.period_end && d >= p.period_start && d <= p.period_end;
      });
      return payFilter === "paid" ? paid : !paid;
    });
  }, [attendance, payFilter, payments]);

  if (studentLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#0B1B3A]" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="space-y-4 p-6 text-center">
        <p className="text-sm text-slate-500">Không tìm thấy thông tin học sinh.</p>
        <Button variant="outline" onClick={() => navigate("/students")} className="h-10 rounded-xl">
          <ArrowLeft className="mr-2 h-4 w-4" /> Quay lại
        </Button>
      </div>
    );
  }

  // Lưu ngày thu học phí (1–31) vào cột billing_day của bảng students
  const saveBillingDay = async (val: string) => {
    const billing_day = val === "none" ? null : Number(val);
    setSavingBillingDay(true);
    const { error } = await supabase.from("students").update({ billing_day } as any).eq("id", student.id);
    setSavingBillingDay(false);
    if (error) return toast.error(error.message);
    toast.success("Đã lưu ngày thu học phí");
    qc.invalidateQueries({ queryKey: ["student", id] });
    qc.invalidateQueries({ queryKey: ["students"] });
  };
  const billingPeriod = Number(student.billing_day) >= 1 ? getBillingPeriod(Number(student.billing_day)) : null;

  /* ---------------- GIAO DIỆN ---------------- */
  const accent = resolveStudentColor(student.color, student.id);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif] text-slate-800">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* HERO HỌC SINH: hình tròn lớn mang màu riêng của học sinh */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-7 sm:px-10 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full" style={{ background: accent }} />
        <div className="pointer-events-none absolute -bottom-24 right-36 hidden h-52 w-52 rounded-full border-[32px] border-white/[0.07] sm:block" />
        <div className="relative space-y-6">
          <div className="flex items-center gap-5">
            <div
              className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl text-4xl font-extrabold text-white ring-4 ring-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
              style={{ background: accent }}
            >
              {(student.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 space-y-2.5">
              <h1 className="truncate text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{student.name}</h1>
              <div className="flex flex-wrap gap-2">
                {student.grade && (
                  <span className={HERO_PILL}>
                    <GraduationCap className="h-3.5 w-3.5" /> Lớp {student.grade}
                  </span>
                )}
                <span className={HERO_PILL}>
                  <Calendar className="h-3.5 w-3.5" /> Bắt đầu {fmtDate(student.start_date || student.created_at)}
                </span>
                <span className={HERO_PILL}>{student.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}</span>
                {student.billing_day ? (
                  <span className={HERO_PILL}>
                    <CalendarClock className="h-3.5 w-3.5" /> Thu ngày {student.billing_day}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Button onClick={() => setEditing(true)} className="h-10 gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#0B1B3A] hover:bg-slate-100">
              <Pencil className="h-4 w-4" /> Sửa thông tin
            </Button>
            <Button
              onClick={() => navigate(`/students/${id}/bill`)}
              className="h-10 gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20"
            >
              <Receipt className="h-4 w-4" /> Xem hóa đơn
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* THÔNG TIN */}
          <Card className={cn(CARD, "space-y-5")}>
            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">Thông tin học sinh</h2>
              <InfoRow icon={User} label="Họ và tên" value={student.name} />
              <InfoRow icon={Mail} label="Email" value="Chưa cập nhật" tone="font-medium text-slate-400" />
              <InfoRow icon={Phone} label="Số điện thoại" value={student.phone || "Chưa cập nhật"} tone={student.phone ? "text-indigo-700" : "font-medium text-slate-400"} />
              <InfoRow icon={GraduationCap} label="Khối lớp" value={student.grade ? `Lớp ${student.grade}` : "Chưa cập nhật"} tone={student.grade ? undefined : "font-medium text-slate-400"} />
              <InfoRow
                icon={CalendarClock}
                label="Ngày thu học phí"
                value={
                  <Select value={student.billing_day ? String(student.billing_day) : "none"} onValueChange={saveBillingDay} disabled={savingBillingDay}>
                    <SelectTrigger className={cn(INPUT, "h-8 w-44")} aria-label="Ngày thu học phí">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 rounded-xl">
                      <SelectItem value="none">Chưa đặt</SelectItem>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={String(day)}>
                          Ngày {day} hằng tháng
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              {billingPeriod && (
                <p className="px-1 text-xs text-slate-500">
                  Kỳ học phí hiện tại: {shortDate(billingPeriod.start)} – {shortDate(billingPeriod.end)} (các buổi trong khoảng này tính vào lần thu kế tiếp)
                </p>
              )}
            </div>
            <div className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">Phụ huynh</h2>
              <InfoRow icon={User} label="Tên phụ huynh" value={student.parent_name || "—"} />
              <InfoRow icon={Phone} label="SĐT phụ huynh" value={student.parent_phone || "—"} tone="text-emerald-700" />
            </div>
          </Card>

          {/* LỊCH SỬ ĐIỂM DANH */}
          <Card className={cn(CARD, "space-y-4")}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <Clock className="h-4 w-4 text-slate-400" /> Lịch sử điểm danh
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{visibleAttendance.length}</span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                  {(["unpaid", "paid", "all"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={payFilter === k}
                      onClick={() => setPayFilter(k)}
                      className={cn(
                        "h-8 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                        payFilter === k ? "bg-white text-[#0B1B3A] shadow-sm" : "text-slate-500 hover:text-slate-900"
                      )}
                    >
                      {k === "unpaid" ? "Chưa thu" : k === "paid" ? "Đã thu" : "Tất cả"}
                    </button>
                  ))}
                </div>
                <Button onClick={() => setAddOpen((o) => !o)} className="h-10 gap-1.5 rounded-xl bg-[#0B1B3A] px-3.5 text-sm font-bold text-white hover:bg-[#13285a]">
                  <Plus className="h-4 w-4" /> Điểm danh
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Ngày</Label>
                  <Input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} className={INPUT} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">Lớp học</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className={INPUT}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {myClasses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-sm font-medium text-slate-700">Ghi chú / Bài tập</Label>
                  <Textarea rows={1} value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} className="min-h-9 rounded-xl border-slate-200 bg-white text-sm" placeholder="Ghi chú bài tập..." />
                </div>
                <div className="flex justify-end gap-2 sm:col-span-4">
                  <Button variant="ghost" onClick={() => setAddOpen(false)} className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600">
                    Hủy
                  </Button>
                  <Button onClick={addAttendance} className="h-9 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]">
                    Lưu điểm danh
                  </Button>
                </div>
              </div>
            )}

            {attendanceLoading ? (
              <div className="py-6 text-center text-sm text-slate-400">Đang tải...</div>
            ) : visibleAttendance.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">Chưa có dữ liệu điểm danh.</div>
            ) : (
              <div className="space-y-2">
                {visibleAttendance.map((a: any) => {
                  const ev = a.schedule_events;
                  const cls = (classes.data || []).find((c: any) => c.id === ev?.class_id);
                  if (editingId === a.id) {
                    const row = editRow[a.id];
                    const timeRow = editRowTime[a.id] || { start: "00:00", end: "01:00" };
                    return (
                      <div key={a.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <div className="grid gap-2 sm:grid-cols-5">
                          <Input type="date" value={row.date} onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, date: e.target.value } })} className={INPUT} />
                          <div className="flex gap-1">
                            <Input type="time" value={timeRow.start} onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, start: e.target.value } })} className={INPUT} />
                            <Input type="time" value={timeRow.end} onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, end: e.target.value } })} className={INPUT} />
                          </div>
                          <Select value={row.present ? "1" : "0"} onValueChange={(v) => setEditRow({ ...editRow, [a.id]: { ...row, present: v === "1" } })}>
                            <SelectTrigger className={INPUT}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl">
                              <SelectItem value="1">Có mặt</SelectItem>
                              <SelectItem value="0">Vắng</SelectItem>
                            </SelectContent>
                          </Select>
                          <Textarea rows={1} className="min-h-9 rounded-xl border-slate-200 bg-white text-sm sm:col-span-2" value={row.note} onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, note: e.target.value } })} />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" onClick={() => setEditingId(null)} className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600">
                            Hủy
                          </Button>
                          <Button onClick={() => saveEdit(a)} className="h-9 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]">
                            Lưu
                          </Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:bg-slate-50">
                      <div className="min-w-0 space-y-0.5">
                        <div className="text-sm font-bold text-slate-900">
                          {ev?.event_date ? fmtDate(ev.event_date) : fmtDate(a.created_at)}
                          {ev?.start_time && (
                            <span className="font-normal text-slate-400">
                              {" "}
                              ({ev.start_time.slice(0, 5)} - {ev.end_time?.slice(0, 5)})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: resolveStudentColor(cls?.color, cls?.id ?? "") }} />
                          <span className="truncate">{cls?.name || "Lớp học"}</span>
                        </div>
                        {a.homework_note && <div className="text-xs italic text-slate-500">Ghi chú: {a.homework_note}</div>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", a.present ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>
                          {a.present ? "Có mặt" : "Vắng"}
                        </span>
                        <Button size="icon" variant="ghost" aria-label="Sửa" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900" onClick={() => startEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label="Xóa" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => removeAttendance(a)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* LỚP ĐANG THAM GIA + ĐĂNG KÝ LỚP */}
        <Card className={cn(CARD, "space-y-4")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
              <BookOpen className="h-4 w-4 text-slate-400" /> Lớp đang tham gia
            </h2>
            <Button
              type="button"
              aria-expanded={enrollOpen}
              onClick={() => (enrollOpen ? closeEnroll() : setEnrollOpen(true))}
              className="h-9 gap-1.5 rounded-xl bg-[#0B1B3A] px-3 text-sm font-bold text-white hover:bg-[#13285a]"
            >
              <Plus className="h-4 w-4" /> Đăng ký lớp
            </Button>
          </div>

          {enrollOpen && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Chọn lớp để đăng ký cho {student.name}</p>
              {availableClasses.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white py-5 text-center text-sm text-slate-500">
                  Không còn lớp nào để đăng ký. Hãy tạo lớp mới ở trang Lớp học.
                </p>
              ) : (
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {availableClasses.map((c: any) => {
                    const checked = selectedClassIds.includes(String(c.id));
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() => toggleSelectClass(c.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border bg-white p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                          checked ? "border-[#0B1B3A] ring-2 ring-[#0B1B3A]/15" : "border-slate-200 hover:border-slate-300"
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            className={cn(
                              "grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                              checked ? "border-[#0B1B3A] bg-[#0B1B3A] text-white" : "border-slate-300 bg-white text-transparent"
                            )}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </span>
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: resolveStudentColor(c.color, c.id) }} />
                          <span className="truncate text-sm font-semibold text-slate-900">{c.name}</span>
                        </span>
                        <span className="shrink-0 text-xs font-bold text-emerald-700">{classFee(c)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={closeEnroll} className="h-9 rounded-xl px-3 text-sm font-semibold text-slate-600">
                  Hủy
                </Button>
                <Button
                  type="button"
                  onClick={enrollClasses}
                  disabled={enrolling || selectedClassIds.length === 0}
                  className="h-9 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]"
                >
                  {enrolling ? "Đang lưu..." : selectedClassIds.length > 0 ? `Đăng ký (${selectedClassIds.length})` : "Đăng ký"}
                </Button>
              </div>
            </div>
          )}

          {myClasses.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-6 text-center text-sm text-slate-500">Chưa đăng ký lớp học nào</p>
          ) : (
            <div className="space-y-2">
              {myClasses.map((c: any) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white" style={{ background: resolveStudentColor(c.color, c.id) }}>
                      <BookOpen className="h-4 w-4" />
                    </div>
                    <span className="truncate text-sm font-bold text-slate-900">{c.name}</span>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-emerald-700">{classFee(c)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <StudentDialog
        open={editing}
        onOpenChange={(o) => {
          setEditing(o);
          if (!o) qc.invalidateQueries({ queryKey: ["student", id] });
        }}
        student={student}
      />
    </div>
  );
}