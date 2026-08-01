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
  FileText,
  CheckCircle2,
  XCircle
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

  // Dialog control
  const [editing, setEditing] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Form states
  const [addForm, setAddForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    class_id: "",
    note: "",
  });

  const [editRow, setEditRow] = useState<Record<string, { present: boolean; note: string; date: string }>>({});
  const [editRowTime, setEditRowTime] = useState<Record<string, { start: string; end: string }>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payFilter, setPayFilter] = useState<"unpaid" | "paid" | "all">("all");

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

  // 2. Fetch điểm danh & schedule_events
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

  // 3. Fetch thanh toán
  const { data: payments = [] } = useQuery({
    queryKey: ["student-payments", id],
    queryFn: async () => {
      const { data } = await supabase.from("payments").select("*").eq("student_id", id);
      return data || [];
    },
    enabled: !!id,
  });

  // Helper kiểm tra buổi học đã đóng tiền chưa
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
    document.title = student ? `${student.name} — ${t.appName || "Lớp Cô Phương Anh"}` : t.appName || "Lớp Cô Phương Anh";
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

  // Tổng học phí
  const totalFee = useMemo(() => {
    return myClasses.reduce((sum: number, c: any) => {
      const fee = Number(c.fee_per_month || c.fee_per_session || c.fee || 0);
      return sum + fee;
    }, 0);
  }, [myClasses]);

  // Xử lý Thêm Điểm Danh
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

    toast.success(t.save || "Đã lưu thành công");
    setAddForm({ date: new Date().toISOString().slice(0, 10), class_id: myClasses[0]?.id || "", note: "" });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["student-attendance", id] });
  };

  // Xử lý Xóa
  const removeAttendance = async (a: any) => {
    if (!(await confirm({ description: t.confirmDelete || "Bạn có chắc muốn xóa?", destructive: true }))) return;
    await supabase.from("attendance").delete().eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["student-attendance", id] });
    toast.success("Đã xóa điểm danh");
  };

  // Bắt đầu chỉnh sửa
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

  // Lưu chỉnh sửa
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

    toast.success(t.save || "Lưu thay đổi thành công");
    setEditingId(null);
    qc.invalidateQueries({ queryKey: ["student-attendance", id] });
  };

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
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="p-6 text-center space-y-4">
        <p className="text-slate-500 text-sm">Không tìm thấy thông tin học sinh.</p>
        <Button variant="outline" size="sm" onClick={() => navigate("/students")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Quay lại
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12 text-slate-800">
      
      {/* 1. HEADER KHU VỰC HỌC SINH */}
      <Card className="p-5 border border-slate-200/70 rounded-2xl bg-white shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar hồng như trong hình */}
            <div 
              className="h-14 w-14 rounded-2xl bg-pink-100 text-pink-400 font-extrabold text-2xl flex items-center justify-center shrink-0"
              style={student.color ? { backgroundColor: student.color + "20", color: student.color } : undefined}
            >
              {(student.name || "B").charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">{student.name}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500">
                {student.grade && (
                  <Badge variant="outline" className="rounded-full bg-blue-50/50 border-blue-200 text-blue-700 font-bold px-2.5 py-0.5 flex items-center gap-1">
                    <GraduationCap className="h-3 w-3" /> Grade: {student.grade}
                  </Badge>
                )}
                <Badge variant="outline" className="rounded-full bg-slate-50 border-slate-200 text-slate-600 font-bold px-2.5 py-0.5 flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> Start date: {fmtDate(student.start_date || student.created_at)}
                </Badge>
                <Badge variant="outline" className="rounded-full bg-indigo-50/50 border-indigo-200 text-indigo-700 font-bold px-2.5 py-0.5">
                  {student.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button 
              variant="outline" 
              onClick={() => setEditing(true)}
              className="rounded-xl border-slate-200 font-bold text-xs h-9 px-3 gap-1.5 text-slate-700"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button 
              onClick={() => setBillOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs h-9 px-3 gap-1.5"
            >
              <Receipt className="h-3.5 w-3.5" /> View bill
            </Button>
          </div>
        </div>
      </Card>

      {/* 2. KHU VỰC NỘI DUNG CHÍNH (2 CỘT) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* CỘT TRÁI (2 CỘT NÓI CHUNG) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* CARD THÔNG TIN CÁ NHÂN & PHỤ HUYNH */}
          <Card className="p-6 border border-slate-200/70 rounded-2xl bg-white shadow-2xs space-y-4">
            <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-blue-500" /> THÔNG TIN CÁ NHÂN & PHỤ HUYNH
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" /> Họ và tên
                </span>
                <span className="font-bold text-slate-900">{student.name}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-slate-400" /> Email
                </span>
                <span className="font-medium text-slate-500">Chưa cập nhật</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400" /> Số điện thoại
                </span>
                <span className="font-bold text-blue-600">Chưa cập nhật</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-slate-400" /> Ngày sinh
                </span>
                <span className="font-medium text-slate-500">Chưa cập nhật</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <GraduationCap className="h-3.5 w-3.5 text-slate-400" /> Khối lớp
                </span>
                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">
                  Lớp {student.grade || "10"}
                </span>
              </div>
            </div>

            <div className="pt-2 space-y-2.5 text-xs">
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">THÔNG TIN PHỤ HUYNH</p>
              
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <User className="h-3.5 w-3.5 text-slate-400" /> Tên phụ huynh
                </span>
                <span className="font-bold text-slate-900">{student.parent_name || "—"}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-slate-400" /> SĐT Phụ huynh
                </span>
                <span className="font-bold text-emerald-600">{student.parent_phone || "—"}</span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/60 space-y-1">
                <span className="font-bold text-slate-500 flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-slate-400" /> Ghi chú
                </span>
                <p className="text-slate-600 pl-5 text-[11px]">{student.notes || "Chưa có ghi chú"}</p>
              </div>
            </div>
          </Card>

          {/* CARD LỊCH SỬ ĐIỂM DANH (XEM LẠI THEO ẢNH MÀN HÌNH) */}
          <Card className="p-6 border border-slate-200/70 rounded-2xl bg-white shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-500" /> LỊCH SỬ ĐIỂM DANH ({visibleAttendance.length})
              </h2>

              <div className="flex items-center gap-2">
                {/* Lọc trạng thái thu tiền */}
                <div className="flex border border-slate-200 rounded-lg p-0.5 bg-slate-50 text-xs">
                  {(["unpaid", "paid", "all"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setPayFilter(k)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                        payFilter === k 
                          ? "bg-white text-slate-900 shadow-2xs" 
                          : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {k === "unpaid" ? "Chưa thu" : k === "paid" ? "Đã thu" : "Tất cả"}
                    </button>
                  ))}
                </div>

                <Button 
                  size="sm" 
                  onClick={() => setAddOpen((o) => !o)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs h-7 gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Điểm danh
                </Button>
              </div>
            </div>

            {/* Form thêm điểm danh nhanh */}
            {addOpen && (
              <div className="grid sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div>
                  <Label className="text-[11px] font-bold text-slate-600">Ngày</Label>
                  <Input 
                    type="date" 
                    value={addForm.date} 
                    onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} 
                    className="mt-1 bg-white rounded-lg h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-slate-600">Lớp học</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className="mt-1 bg-white rounded-lg h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {myClasses.map((c: any) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[11px] font-bold text-slate-600">Ghi chú / Bài tập</Label>
                  <Textarea 
                    rows={1} 
                    value={addForm.note} 
                    onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} 
                    className="mt-1 bg-white rounded-lg min-h-[32px] text-xs"
                    placeholder="Ghi chú bài tập..."
                  />
                </div>
                <div className="sm:col-span-4 flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="h-7 text-xs">
                    Hủy
                  </Button>
                  <Button size="sm" onClick={addAttendance} className="bg-blue-600 hover:bg-blue-500 text-white h-7 text-xs font-bold">
                    Lưu điểm danh
                  </Button>
                </div>
              </div>
            )}

            {/* Hiển thị danh sách điểm danh */}
            {attendanceLoading ? (
              <div className="text-center py-6 text-slate-400 text-xs">Đang tải điểm danh...</div>
            ) : visibleAttendance.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic">
                Chưa có dữ liệu điểm danh.
              </div>
            ) : (
              <div className="space-y-2">
                {visibleAttendance.map((a: any) => {
                  const ev = a.schedule_events;
                  const cls = (classes.data || []).find((c: any) => c.id === ev?.class_id);

                  if (editingId === a.id) {
                    const row = editRow[a.id];
                    const timeRow = editRowTime[a.id] || { start: "00:00", end: "01:00" };
                    return (
                      <div key={a.id} className="p-3 bg-slate-50 rounded-xl space-y-2 text-xs">
                        <div className="grid sm:grid-cols-5 gap-2">
                          <Input 
                            type="date" 
                            value={row.date}
                            onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, date: e.target.value } })} 
                            className="bg-white h-8 text-xs rounded-lg"
                          />
                          <div className="flex gap-1">
                            <Input 
                              type="time" 
                              value={timeRow.start}
                              onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, start: e.target.value } })} 
                              className="bg-white h-8 text-xs rounded-lg"
                            />
                            <Input 
                              type="time" 
                              value={timeRow.end}
                              onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, end: e.target.value } })} 
                              className="bg-white h-8 text-xs rounded-lg"
                            />
                          </div>
                          <Select 
                            value={row.present ? "1" : "0"}
                            onValueChange={(v) => setEditRow({ ...editRow, [a.id]: { ...row, present: v === "1" } })}
                          >
                            <SelectTrigger className="bg-white h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">Có mặt</SelectItem>
                              <SelectItem value="0">Vắng</SelectItem>
                            </SelectContent>
                          </Select>
                          <Textarea 
                            rows={1} 
                            className="sm:col-span-2 bg-white min-h-[32px] text-xs rounded-lg" 
                            value={row.note}
                            onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, note: e.target.value } })} 
                          />
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 text-xs">
                            Hủy
                          </Button>
                          <Button size="sm" onClick={() => saveEdit(a)} className="bg-emerald-600 text-white h-7 text-xs font-bold">
                            Lưu
                          </Button>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div 
                      key={a.id} 
                      className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900">
                          {ev?.event_date ? fmtDate(ev.event_date) : fmtDate(a.created_at)}
                          {ev?.start_time && <span className="text-slate-400 font-normal"> ({ev.start_time.slice(0, 5)} - {ev.end_time?.slice(0, 5)})</span>}
                        </div>
                        <div className="font-semibold text-blue-600">{cls?.name || "Lớp học"}</div>
                        {a.homework_note && (
                          <div className="text-[11px] text-slate-500 italic mt-0.5">Ghi chú: {a.homework_note}</div>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isPaid(a) && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px] font-bold">
                            Đã đóng
                          </Badge>
                        )}
                        <Badge 
                          variant="secondary"
                          className={`text-[10px] font-bold ${
                            a.present 
                              ? "bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200" 
                              : "bg-rose-100 text-rose-800 hover:bg-rose-100 border-rose-200"
                          }`}
                        >
                          {a.present ? "Có mặt" : "Vắng"}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-700" onClick={() => startEdit(a)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400 hover:text-rose-600" onClick={() => removeAttendance(a)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>

        {/* CỘT PHẢI: LỚP HỌC DANG THAM GIA */}
        <div>
          <Card className="p-6 border border-slate-200/70 rounded-2xl bg-white shadow-2xs space-y-4">
            <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <BookOpen className="h-3.5 w-3.5 text-blue-500" /> LỚP HỌC ĐANG THAM GIA
            </h2>

            {myClasses.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Chưa đăng ký lớp học nào</p>
            ) : (
              <div className="space-y-2">
                {myClasses.map((c: any) => (
                  <div 
                    key={c.id} 
                    className="p-3 rounded-xl bg-slate-50/60 border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" style={{ backgroundColor: c.color || "#3b82f6" }} />
                      <span className="font-bold text-slate-900">{c.name}</span>
                    </div>
                    <span className="font-bold text-emerald-600">
                      {Number(c.fee_per_month || 0) > 0
                        ? `${formatVND(Number(c.fee_per_month))}`
                        : Number(c.fee_per_session || 0) > 0
                        ? `${formatVND(Number(c.fee_per_session))}`
                        : c.fee ? formatVND(Number(c.fee)) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

      </div>

      {/* MODAL EDIT HỌC SINH */}
      <StudentDialog
        open={editing}
        onOpenChange={(o) => {
          setEditing(o);
          if (!o) qc.invalidateQueries({ queryKey: ["student", id] });
        }}
        student={student}
      />

      {/* MODAL VIEW BILL / IN HÓA ĐƠN */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-md rounded-2xl p-6 bg-white print:p-0 print:border-none print:shadow-none">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2 print:hidden">
              <Receipt className="h-5 w-5 text-emerald-600" /> Hóa Đơn Học Phí
            </DialogTitle>
          </DialogHeader>

          {/* KHU VỰC IN HÓA ĐƠN */}
          <div className="space-y-4 pt-2 print:pt-4" id="printable-bill">
            <div className="text-center pb-3 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">HÓA ĐƠN HỌC PHÍ</h2>
              <p className="text-xs text-slate-500 font-medium">{t.appName || "Lớp Cô Phương Anh"}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Ngày xuất: {new Date().toLocaleDateString("vi-VN")}</p>
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Họ tên học sinh:</span>
                <span className="font-bold text-slate-900">{student.name}</span>
              </div>
              {student.grade && (
                <div className="flex justify-between">
                  <span className="text-slate-500 font-medium">Khối lớp:</span>
                  <span className="font-bold text-slate-900">Lớp {student.grade}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Phụ huynh:</span>
                <span className="font-bold text-slate-900">{student.parent_name || "—"} ({student.parent_phone || "—"})</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-2.5">Lớp học</th>
                    <th className="p-2.5 text-right">Học phí</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myClasses.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-2.5 text-center text-slate-400 italic">Chưa đăng ký lớp</td>
                    </tr>
                  ) : (
                    myClasses.map((c: any) => {
                      const fee = Number(c.fee_per_month || c.fee_per_session || c.fee || 0);
                      return (
                        <tr key={c.id}>
                          <td className="p-2.5 font-semibold text-slate-800">{c.name}</td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            {formatVND(fee)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center p-3 bg-emerald-50 rounded-xl border border-emerald-100">
              <span className="text-xs font-bold text-emerald-900">TỔNG CỘNG HỌC PHÍ</span>
              <span className="text-base font-black text-emerald-700">{formatVND(totalFee)}</span>
            </div>

            <div className="text-center text-[10px] text-slate-400 pt-2">
              <p>Cảm ơn quý phụ huynh và học sinh!</p>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 print:hidden">
            <Button variant="outline" onClick={() => setBillOpen(false)} className="rounded-xl font-bold text-xs">
              Đóng
            </Button>
            <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs gap-1.5">
              <Printer className="h-4 w-4" /> In hóa đơn
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}