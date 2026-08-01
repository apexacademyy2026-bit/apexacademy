import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Pencil, 
  Plus, 
  Trash2, 
  Receipt, 
  Printer, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  GraduationCap, 
  BookOpen, 
  Clock, 
  FileText 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEnrollments, useClasses } from "@/hooks/useData";
import { formatVND, fmtDate } from "@/lib/format";
import StudentDialog from "@/components/StudentDialog";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, user } = useApp();
  const enrollments = useEnrollments();
  const classes = useClasses();
  const qc = useQueryClient();
  const confirm = useConfirm();

  // State điều khiển Modal & Form
  const [editing, setEditing] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    class_id: "",
    note: "",
  });

  const [editRow, setEditRow] = useState<Record<string, { present: boolean; note: string; date: string }>>({});
  const [editRowTime, setEditRowTime] = useState<Record<string, { start: string; end: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<"unpaid" | "paid" | "all">("unpaid");

  // 1. Fetch thông tin học sinh
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // 2. Fetch điểm danh kèm thông tin lịch học (schedule_events)
  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["student-attendance", id],
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

  // 3. Fetch dữ liệu thanh toán
  const { data: payments = [] } = useQuery({
    queryKey: ["student-payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("student_id", id);
      return data || [];
    },
    enabled: !!id,
  });

  // Tự động kiểm tra buổi học đã đóng tiền hay chưa
  const isPaid = (a: any) => {
    const ev = a.schedule_events;
    if (!ev?.event_date) return false;
    const d = ev.event_date as string;
    const label = d.slice(0, 7); // YYYY-MM
    return (payments as any[]).some((p) => {
      if (p.class_id && ev.class_id && p.class_id !== ev.class_id) return false;
      if (p.cycle_type === "monthly") return p.cycle_label === label;
      if (p.period_start && p.period_end) return d >= p.period_start && d <= p.period_end;
      return false;
    });
  };

  useEffect(() => {
    document.title = student ? `${student.name} — ${t.appName || "Lớp Học"}` : t.appName || "Apex Academy";
  }, [student, t]);

  // Lớp học sinh đang tham gia
  const myClasses = useMemo(() => {
    const cids = (enrollments.data || []).filter((e: any) => e.student_id === id).map((e: any) => e.class_id);
    return (classes.data || []).filter((c: any) => cids.includes(c.id));
  }, [enrollments.data, classes.data, id]);

  useEffect(() => {
    if (myClasses[0] && !addForm.class_id) {
      setAddForm((f) => ({ ...f, class_id: myClasses[0].id }));
    }
  }, [myClasses, addForm.class_id]);

  // Tính tổng học phí
  const totalFee = useMemo(() => {
    return myClasses.reduce((sum: number, c: any) => {
      const fee = Number(c.fee_per_month || c.fee_per_session || c.fee || 0);
      return sum + fee;
    }, 0);
  }, [myClasses]);

  // Xử lý Thêm Điểm Danh Mới
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

    toast.success(t.save || "Đã lưu");
    setAddForm({ date: new Date().toISOString().slice(0, 10), class_id: myClasses[0]?.id || "", note: "" });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["student-attendance", id] });
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  // Xử lý Xóa Buổi Điểm Danh
  const removeAttendance = async (a: any) => {
    if (!(await confirm({ description: t.confirmDelete || "Bạn có chắc chắn muốn xóa?", destructive: true }))) return;
    await supabase.from("attendance").delete().eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["student-attendance", id] });
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
    toast.success("Đã xóa thành công");
  };

  // Xử lý Bắt đầu Chỉnh Sửa
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

  // Xử lý Lưu Chỉnh Sửa
  const saveEdit = async (a: any) => {
    const row = editRow[a.id];
    const timeRow = editRowTime[a.id];
    if (!row) return;

    const { error: e1 } = await supabase
      .from("attendance")
      .update({ present: row.present, homework_note: row.note })
      .eq("id", a.id);

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

    toast.success(t.save || "Đã cập nhật");
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["student-attendance", id] });
  };

  // Danh sách điểm danh lọc theo trạng thái thanh toán
  const visibleAttendance = useMemo(() => {
    return (attendance || []).filter((a: any) => {
      if (payFilter === "all") return true;
      return payFilter === "paid" ? isPaid(a) : !isPaid(a);
    });
  }, [attendance, payFilter, payments]);

  const handlePrint = () => {
    window.print();
  };

  if (studentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center space-y-4">
        <p className="text-slate-500">Không tìm thấy thông tin học sinh.</p>
        <Button variant="outline" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Nút Quay Lại */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 text-xs font-bold text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t.students || "Học sinh"}
      </Button>

      {/* HEADER TỔNG QUAN HỌC SINH */}
      <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div 
              className="h-16 w-16 rounded-2xl text-white font-black text-2xl flex items-center justify-center shadow-md shrink-0"
              style={{ background: student.color || "linear-gradient(to top right, #3b82f6, #6366f1)" }}
            >
              {(student.name || "S").charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-950 tracking-tight">{student.name}</h1>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                {student.grade && (
                  <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold border-blue-100 flex items-center gap-1">
                    <GraduationCap className="h-3.5 w-3.5" /> {t.grade || "Khối"}: {student.grade}
                  </Badge>
                )}
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> {t.startDate || "Bắt đầu"}: {fmtDate(student.start_date || student.created_at)}
                </Badge>
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 font-bold">
                  {student.payment_mode === "monthly" ? (t.monthly || "Theo tháng") : (t.bySession || "Theo buổi")}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button 
              variant="outline" 
              onClick={() => setEditing(true)}
              className="rounded-xl border-slate-200 font-bold text-xs h-9 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> {t.edit || "Sửa"}
            </Button>
            <Button 
              onClick={() => setBillOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs h-9 gap-1.5 shadow-xs"
            >
              <Receipt className="h-3.5 w-3.5" /> {t.viewBill || "Xem hóa đơn"}
            </Button>
          </div>
        </div>
      </Card>

      {/* THÔNG TIN CHI TIẾT VÀ BẢNG LỚP HỌC */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CỘT THÔNG TIN CÁ NHÂN & PHỤ HUYNH */}
        <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-4">
          <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" /> {t.parentName || "Thông tin Phụ huynh & Liên hệ"}
          </h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                <User className="h-4 w-4 text-slate-400" /> Phụ huynh
              </span>
              <span className="text-xs font-black text-slate-900">{student.parent_name || "—"}</span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                <Phone className="h-4 w-4 text-slate-400" /> SĐT Phụ huynh
              </span>
              <span className="text-xs font-black text-emerald-600">{student.parent_phone || "—"}</span>
            </div>

            <div className="p-3 rounded-2xl bg-slate-50 space-y-1">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                <FileText className="h-4 w-4 text-slate-400" /> {t.notes || "Ghi chú"}
              </span>
              <p className="text-xs text-slate-700 pl-6">{student.notes || "Chưa có ghi chú"}</p>
            </div>
          </div>
        </Card>

        {/* CỘT LỚP HỌC ĐANG THAM GIA */}
        <Card className="lg:col-span-2 p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-4">
          <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-blue-600" /> {t.classes || "Lớp học đang tham gia"}
          </h2>

          {myClasses.length === 0 ? (
            <div className="text-xs text-slate-400 italic py-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              {t.nothingHere || "Chưa đăng ký lớp học nào"}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myClasses.map((c: any) => (
                <div 
                  key={c.id} 
                  className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: c.color || "#3b82f6" }} />
                    <span className="font-black text-xs text-slate-900">{c.name}</span>
                  </div>
                  <span className="text-xs font-bold text-emerald-600">
                    {Number(c.fee_per_month || 0) > 0
                      ? `${formatVND(Number(c.fee_per_month))}`
                      : Number(c.fee_per_session || 0) > 0
                      ? `${formatVND(Number(c.fee_per_session))}`
                      : c.fee ? `${formatVND(Number(c.fee))}` : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>

      </div>

      {/* PHẦN ĐIỂM DANH & BÀI TẬP VỀ NHÀ */}
      <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" /> {t.addAttendance || "Lịch sử điểm danh"} & {t.homework || "Bài tập"}
            </h2>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Bộ Lọc Đã Đóng Tiền / Chưa Đóng Tiền */}
            <div className="flex border border-slate-200 rounded-xl p-0.5 bg-slate-50 text-xs">
              {(["unpaid", "paid", "all"] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setPayFilter(k)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    payFilter === k 
                      ? "bg-white text-slate-900 shadow-xs" 
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {k === "unpaid" ? (t.unpaid || "Chưa thu") : k === "paid" ? (t.paid || "Đã thu") : (t.selectAll || "Tất cả")}
                </button>
              ))}
            </div>

            <Button 
              size="sm" 
              onClick={() => setAddOpen((o) => !o)}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs gap-1.5 h-8"
            >
              <Plus className="h-3.5 w-3.5" /> {t.addAttendance || "Điểm danh mới"}
            </Button>
          </div>
        </div>

        {/* FORM THÊM ĐIỂM DANH */}
        {addOpen && (
          <div className="grid sm:grid-cols-4 gap-3 p-4 rounded-2xl bg-blue-50/50 border border-blue-100/80">
            <div>
              <Label className="text-xs font-bold text-slate-600">{t.date || "Ngày"}</Label>
              <Input 
                type="date" 
                value={addForm.date} 
                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} 
                className="mt-1 bg-white rounded-xl text-xs"
              />
            </div>
            <div>
              <Label className="text-xs font-bold text-slate-600">{t.class || "Lớp học"}</Label>
              <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                <SelectTrigger className="mt-1 bg-white rounded-xl text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {myClasses.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs font-bold text-slate-600">{t.homework || "Ghi chú / Bài tập"}</Label>
              <Textarea 
                rows={1} 
                value={addForm.note} 
                onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} 
                className="mt-1 bg-white rounded-xl text-xs"
                placeholder="Ghi chú bài tập hoặc nhận xét..."
              />
            </div>
            <div className="sm:col-span-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="rounded-xl text-xs">
                {t.cancel || "Hủy"}
              </Button>
              <Button size="sm" onClick={addAttendance} className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold">
                {t.save || "Lưu"}
              </Button>
            </div>
          </div>
        )}

        {/* DANH SÁCH LỊCH SỬ ĐIỂM DANH */}
        {attendanceLoading ? (
          <p className="text-xs text-slate-400 py-4 text-center">Đang tải lịch sử điểm danh...</p>
        ) : visibleAttendance.length === 0 ? (
          <div className="text-xs text-slate-400 italic py-8 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            {t.nothingHere || "Không tìm thấy dữ liệu điểm danh"}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleAttendance.map((a: any) => {
              const ev = a.schedule_events;
              const cls = (classes.data || []).find((c: any) => c.id === ev?.class_id);

              if (editingId === a.id) {
                const row = editRow[a.id];
                const timeRow = editRowTime[a.id] || { start: "00:00", end: "01:00" };
                return (
                  <div key={a.id} className="py-3 space-y-3 bg-slate-50/80 p-3 rounded-2xl my-2">
                    <div className="grid sm:grid-cols-5 gap-2">
                      <Input 
                        type="date" 
                        value={row.date}
                        onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, date: e.target.value } })} 
                        className="bg-white text-xs rounded-xl"
                      />
                      <div className="flex gap-1">
                        <Input 
                          type="time" 
                          value={timeRow.start}
                          onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, start: e.target.value } })} 
                          className="bg-white text-xs rounded-xl"
                        />
                        <Input 
                          type="time" 
                          value={timeRow.end}
                          onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, end: e.target.value } })} 
                          className="bg-white text-xs rounded-xl"
                        />
                      </div>
                      <Select 
                        value={row.present ? "1" : "0"}
                        onValueChange={(v) => setEditRow({ ...editRow, [a.id]: { ...row, present: v === "1" } })}
                      >
                        <SelectTrigger className="bg-white text-xs rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">{t.present || "Có mặt"}</SelectItem>
                          <SelectItem value="0">{t.absent || "Vắng"}</SelectItem>
                        </SelectContent>
                      </Select>
                      <Textarea 
                        rows={1} 
                        className="sm:col-span-2 bg-white text-xs rounded-xl" 
                        value={row.note}
                        onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, note: e.target.value } })} 
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="rounded-xl text-xs">
                        {t.cancel || "Hủy"}
                      </Button>
                      <Button size="sm" onClick={() => saveEdit(a)} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold">
                        {t.save || "Lưu"}
                      </Button>
                    </div>
                  </div>
                );
              }

              return (
                <div key={a.id} className="py-3.5 flex items-start justify-between gap-3 hover:bg-slate-50/50 px-2 rounded-2xl transition-colors">
                  <div className="space-y-0.5">
                    <div className="font-bold text-xs text-slate-900">
                      {ev?.event_date ? fmtDate(ev.event_date) : fmtDate(a.created_at)} 
                      {ev?.start_time && <span className="text-slate-400 font-normal"> · {ev.start_time.slice(0, 5)}–{ev.end_time?.slice(0, 5)}</span>}
                    </div>
                    <div className="text-[11px] font-semibold text-blue-600">{cls?.name || "Lớp học"}</div>
                    {a.homework_note && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded-xl mt-1 border border-slate-100">
                        💬 {a.homework_note}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {isPaid(a) && (
                      <Badge className="rounded-xl bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px] font-bold">
                        {t.paid || "Đã đóng"}
                      </Badge>
                    )}
                    <Badge 
                      variant={a.present ? "default" : "secondary"} 
                      className={`rounded-xl text-[10px] font-bold ${
                        a.present 
                          ? "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200" 
                          : "bg-rose-100 text-rose-800 hover:bg-rose-100 border-rose-200"
                      }`}
                    >
                      {a.present ? (t.present || "Có mặt") : (t.absent || "Vắng")}
                    </Badge>
                    <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-slate-400 hover:text-slate-700" onClick={() => startEdit(a)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 rounded-lg text-rose-400 hover:text-rose-600 hover:bg-rose-50" onClick={() => removeAttendance(a)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* DIALOG CHỈNH SỬA HỌC SINH */}
      <StudentDialog
        open={editing}
        onOpenChange={(o) => {
          setEditing(o);
          if (!o) qc.invalidateQueries({ queryKey: ["student", id] });
        }}
        student={student}
      />

      {/* MODAL IN HÓA ĐƠN HỌC PHÍ (BILL DIALOG) */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-md rounded-3xl p-6 bg-white print:p-0 print:border-none print:shadow-none">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2 print:hidden">
              <Receipt className="h-5 w-5 text-emerald-600" /> Hóa Đơn Học Phí
            </DialogTitle>
          </DialogHeader>

          {/* KHU VỰC NỘI DUNG HÓA ĐƠN HIỂN THỊ / IN */}
          <div className="space-y-5 pt-2 print:pt-4" id="printable-bill">
            <div className="text-center pb-3 border-b border-slate-100">
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">HÓA ĐƠN HỌC PHÍ</h2>
              <p className="text-xs text-slate-500 font-medium">{t.appName || "Apex Academy"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Ngày xuất: {new Date().toLocaleDateString("vi-VN")}</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Họ tên học sinh:</span>
                <span className="font-bold text-slate-900">{student.name}</span>
              </div>
              {student.grade && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Khối lớp:</span>
                  <span className="font-bold text-slate-900">{student.grade}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Phụ huynh:</span>
                <span className="font-bold text-slate-900">{student.parent_name || "—"} ({student.parent_phone || "—"})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Hình thức thu:</span>
                <span className="font-bold text-slate-900">
                  {student.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}
                </span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Lớp học</th>
                    <th className="p-3 text-right">Học phí</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myClasses.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-3 text-center text-slate-400 italic">Chưa đăng ký lớp</td>
                    </tr>
                  ) : (
                    myClasses.map((c: any) => {
                      const fee = Number(c.fee_per_month || c.fee_per_session || c.fee || 0);
                      return (
                        <tr key={c.id}>
                          <td className="p-3 font-semibold text-slate-800">{c.name}</td>
                          <td className="p-3 text-right font-bold text-slate-900">
                            {formatVND(fee)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100">
              <span className="text-xs font-bold text-emerald-900">TỔNG CỘNG HỌC PHÍ</span>
              <span className="text-base font-black text-emerald-700">{formatVND(totalFee)}</span>
            </div>

            <div className="text-center text-[10px] text-slate-400 pt-2">
              <p>Cảm ơn quý phụ huynh và học sinh!</p>
            </div>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex justify-end gap-2 mt-4 print:hidden">
            <Button variant="outline" onClick={() => setBillOpen(false)} className="rounded-xl font-bold text-xs">
              Đóng
            </Button>
            <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs gap-1.5 shadow-xs">
              <Printer className="h-4 w-4" /> In hóa đơn
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}