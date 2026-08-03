import { useEffect, useMemo, useRef, useState } from "react";
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
  Check,
  Eye,
  EyeOff,
  Image as ImageIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
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
import { formatVND, fmtDate, vietQRUrl } from "@/lib/format";
import StudentDialog from "@/components/StudentDialog";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { toPng } from "html-to-image";

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, user, profile } = useApp();
  const enrollments = useEnrollments();
  const classes = useClasses();
  const qc = useQueryClient();
  const confirm = useConfirm();

  // Dialog control
  const [editing, setEditing] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  // Bill States
  const [selectedBillCycle, setSelectedBillCycle] = useState<string | null>(null);
  const [mode, setMode] = useState<"monthly" | "by_session" | null>(null);
  const [showAtt, setShowAtt] = useState(true);
  const [monthlyNotes, setMonthlyNotes] = useState<Record<string, string>>({});
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [homeworkDraft, setHomeworkDraft] = useState<Record<string, string>>({});
  const [footnote, setFootnote] = useState<string>("");
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
  const billRef = useRef<HTMLDivElement | null>(null);

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

  // Fetch thông tin học sinh
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["student", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
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

  useEffect(() => {
    if (student && mode === null) {
      setMode(student.payment_mode === "by_session" ? "by_session" : "monthly");
    }
  }, [student, mode]);

  useEffect(() => {
    if (!student) return;
    const saved = localStorage.getItem(`bill_footnote_${student.id}`);
    setFootnote(saved ?? ((t as any)?.footnoteDefault ?? "Cảm ơn quý phụ huynh và học sinh!"));
  }, [student?.id, t]);

  useEffect(() => {
    if (!student) return;
    localStorage.setItem(`bill_footnote_${student.id}`, footnote);
  }, [footnote, student?.id]);

  const myClasses = useMemo(() => {
    if (!student) return [];
    const cids = (enrollments.data || []).filter((e: any) => e.student_id === student.id).map((e: any) => e.class_id);
    return (classes.data || []).filter((c: any) => cids.includes(c.id));
  }, [enrollments.data, classes.data, student]);

  useEffect(() => {
    if (myClasses[0] && !addForm.class_id) {
      setAddForm((f) => ({ ...f, class_id: myClasses[0].id }));
    }
  }, [myClasses, addForm.class_id]);

  const sortedAttendance = useMemo(
    () => [...(attendance || [])].filter((a: any) => a.present).sort((a: any, b: any) => (a?.schedule_events?.event_date || "").localeCompare(b?.schedule_events?.event_date || "")),
    [attendance]
  );

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
      return cycles.map(({ periodStart, periodEnd }) => {
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
      });
    } else {
      const paidSessionPayments = (payments || []).filter((p: any) => p.cycle_type === "session");
      const isPaidSession = (a: any) => {
        const d = a?.schedule_events?.event_date;
        return paidSessionPayments.some((p: any) => p.period_start && p.period_end && d >= p.period_start && d <= p.period_end);
      };
      const unpaid = sortedAttendance.filter((a: any) => !isPaidSession(a));
      const size = student.sessions_per_cycle || 8;
      const groups: any[][] = [];
      for (let i = 0; i < unpaid.length; i += size) groups.push(unpaid.slice(i, i + size));
      const paidGroups = paidSessionPayments.map((p: any) => ({
        cycle_type: "session",
        cycle_label: p.cycle_label,
        period_start: p.period_start,
        period_end: p.period_end,
        amount: Number(p.amount || 0),
        session_count: p.session_count || 0,
        description: `${p.session_count || ""} ${t?.sessions || "buổi"} (${fmtDate(p.period_start)} – ${fmtDate(p.period_end)})`,
        attendances: sortedAttendance.filter((a: any) => {
          const d = a?.schedule_events?.event_date;
          return p.period_start && p.period_end && d >= p.period_start && d <= p.period_end;
        }),
        isPaidGroup: true,
      }));
      const unpaidGroups = groups.map((g) => {
        const first = g[0]?.schedule_events?.event_date || "";
        const last = g[g.length - 1]?.schedule_events?.event_date || "";
        const year = last ? new Date(last).getFullYear() : new Date().getFullYear();
        return {
          cycle_type: "session",
          cycle_label: `${safeName}_${g.length}buoi_${year}`,
          period_start: first,
          period_end: last,
          session_count: g.length,
          amount: g.reduce((s: number, a: any) => s + Number(a.fee_override ?? student.fee_per_session ?? 0), 0),
          description: `${g.length} ${t?.sessions || "buổi"} (${fmtDate(first)} – ${fmtDate(last)})`,
          attendances: g,
        };
      });
      return [...paidGroups, ...unpaidGroups];
    }
  }, [student, mode, sortedAttendance, payments, t]);

  const isPaid = (b: any) => {
    if (b?.isPaidGroup) return true;
    if ((payments || []).some((p: any) => p.cycle_label === b?.cycle_label)) return true;
    if (b?.cycle_type === "monthly" && b?.autoPaid) return true;
    return false;
  };

  useEffect(() => {
    if (selectedBillCycle) return;
    const first = bills.find((b) => !isPaid(b));
    if (first) setSelectedBillCycle(first.cycle_label);
    else if (bills.length) setSelectedBillCycle(bills[bills.length - 1].cycle_label);
  }, [bills.length, payments?.length]);

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

  const current = bills.find((b) => b.cycle_label === selectedBillCycle) || bills[bills.length - 1];
  const selectedBillsArr = useMemo(
    () => bills.filter((b) => selectedBills.has(b.cycle_label)),
    [bills, selectedBills]
  );
  const isCombined = selectedBillsArr.length >= 2;
  const combinedBill = isCombined
    ? {
        cycle_type: "combined" as const,
        cycle_label: selectedBillsArr.map((b) => b.cycle_label).join(" + "),
        description: `${selectedBillsArr.length} kỳ`,
        amount: selectedBillsArr.reduce((s, b) => s + effectiveAmount(b), 0),
        attendances: selectedBillsArr.flatMap((b: any) => b.attendances || []),
        parts: selectedBillsArr,
      }
    : null;
  const displayBill: any = combinedBill || current;
  const billTotal =
    displayBill?.cycle_type === "combined"
      ? selectedBillsArr.reduce((s, b) => s + effectiveAmount(b), 0)
      : effectiveAmount(displayBill);
  const qrContent = displayBill ? displayBill.cycle_label : "";
  const qrUrl = displayBill && profile?.bank_code && profile?.bank_account_number
    ? vietQRUrl(profile?.bank_code, profile?.bank_account_number, profile?.bank_account_name, billTotal, qrContent)
    : null;
  const accent = student?.color || "#3b82f6";
  const billNum = (displayBill?.cycle_label || student?.id || "").slice(0, 100).toUpperCase();

  const togglePaid = async (b: any) => {
    if (!student || !b) return;
    const recorded = (payments || []).find((p: any) => p.cycle_label === b.cycle_label);
    if (recorded) {
      await supabase.from("payments").delete().eq("id", recorded.id);
    } else {
      const { error } = await supabase.from("payments").insert({
        user_id: student.user_id,
        student_id: student.id,
        cycle_type: b.cycle_type,
        cycle_label: b.cycle_label,
        period_start: b.period_start,
        period_end: b.period_end,
        session_count: b.session_count ?? null,
        amount: effectiveAmount(b),
      });
      if (error) { toast.error(error.message); return; }
    }
    qc.invalidateQueries({ queryKey: ["payments", id] });
    toast.success(t?.save || "Đã cập nhật thanh toán");
  };

  const paySelected = async () => {
    if (!student) return;
    const toPay = bills.filter((b) => selectedBills.has(b.cycle_label) && !isPaid(b));
    if (toPay.length === 0) return;
    const rows = toPay.map((b) => ({
      user_id: student.user_id,
      student_id: student.id,
      cycle_type: b.cycle_type,
      cycle_label: b.cycle_label,
      period_start: b.period_start,
      period_end: b.period_end,
      session_count: b.session_count ?? null,
      amount: effectiveAmount(b),
    }));
    const { error } = await supabase.from("payments").insert(rows);
    if (error) { toast.error(error.message); return; }
    setSelectedBills(new Set());
    qc.invalidateQueries({ queryKey: ["payments", id] });
    toast.success(t?.save || "Đã thanh toán chọn lựa");
  };

  const updateFee = async (a: any, val: string) => {
    const num = val === "" ? null : Number(val);
    await supabase.from("attendance").update({ fee_override: num }).eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  const updateHomeworkNote = async (a: any, val: string) => {
    await supabase.from("attendance").update({ homework_note: val }).eq("id", a.id);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  const saveAsImage = async () => {
    if (!billRef.current) return;
    try {
      const dataUrl = await toPng(billRef.current, { cacheBust: true, backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${current?.cycle_label || "bill"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      toast.error(e.message || "Lỗi tải ảnh");
    }
  };

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
      
      {/* CẤU HÌNH CSS ĐẶC BIỆT KHI IN (PRINT CSS) */}
      <style>{`
        @media print {
          /* Ẩn tất cả các phần tử trên trang ngoại trừ bill printable */
          body * {
            visibility: hidden !important;
          }
          /* Chỉ hiển thị duy nhất vùng billRef */
          .printable-bill, .printable-bill * {
            visibility: visible !important;
          }
          /* Đưa thẻ in ra góc trên cùng của trang giấy */
          .printable-bill {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            box-shadow: none !important;
            border: none !important;
            background: white !important;
          }
          /* Loại bỏ bớt lề mặc định của trình duyệt */
          @page {
            size: auto;
            margin: 10mm;
          }
        }
      `}</style>

      {/* HEADER HỌC SINH */}
      <Card className="p-5 border border-slate-200/70 rounded-2xl bg-white shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
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

      {/* KHU VỰC 2 CỘT CHI TIẾT HỌC SINH */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border border-slate-200/70 rounded-2xl bg-white shadow-2xs space-y-4">
            <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-blue-500" /> THÔNG TIN CÁ NHÂN & PHỤ HUYNH
            </h2>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2"><User className="h-3.5 w-3.5 text-slate-400" /> Họ và tên</span>
                <span className="font-bold text-slate-900">{student.name}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-slate-400" /> Email</span>
                <span className="font-medium text-slate-500">Chưa cập nhật</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /> Số điện thoại</span>
                <span className="font-bold text-blue-600">Chưa cập nhật</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2"><GraduationCap className="h-3.5 w-3.5 text-slate-400" /> Khối lớp</span>
                <span className="font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">Lớp {student.grade || "10"}</span>
              </div>
            </div>

            <div className="pt-2 space-y-2.5 text-xs">
              <p className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">THÔNG TIN PHỤ HUYNH</p>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2"><User className="h-3.5 w-3.5 text-slate-400" /> Tên phụ huynh</span>
                <span className="font-bold text-slate-900">{student.parent_name || "—"}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/60">
                <span className="font-bold text-slate-500 flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-slate-400" /> SĐT Phụ huynh</span>
                <span className="font-bold text-emerald-600">{student.parent_phone || "—"}</span>
              </div>
            </div>
          </Card>

          <Card className="p-6 border border-slate-200/70 rounded-2xl bg-white shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <h2 className="text-xs font-bold uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-blue-500" /> LỊCH SỬ ĐIỂM DANH ({visibleAttendance.length})
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex border border-slate-200 rounded-lg p-0.5 bg-slate-50 text-xs">
                  {(["unpaid", "paid", "all"] as const).map((k) => (
                    <button
                      key={k}
                      onClick={() => setPayFilter(k)}
                      className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                        payFilter === k ? "bg-white text-slate-900 shadow-2xs" : "text-slate-500 hover:text-slate-900"
                      }`}
                    >
                      {k === "unpaid" ? "Chưa thu" : k === "paid" ? "Đã thu" : "Tất cả"}
                    </button>
                  ))}
                </div>
                <Button size="sm" onClick={() => setAddOpen((o) => !o)} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs h-7 gap-1">
                  <Plus className="h-3.5 w-3.5" /> Điểm danh
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid sm:grid-cols-4 gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs">
                <div>
                  <Label className="text-[11px] font-bold text-slate-600">Ngày</Label>
                  <Input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} className="mt-1 bg-white rounded-lg h-8 text-xs"/>
                </div>
                <div>
                  <Label className="text-[11px] font-bold text-slate-600">Lớp học</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className="mt-1 bg-white rounded-lg h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{myClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="sm:col-span-2">
                  <Label className="text-[11px] font-bold text-slate-600">Ghi chú / Bài tập</Label>
                  <Textarea rows={1} value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} className="mt-1 bg-white rounded-lg min-h-[32px] text-xs" placeholder="Ghi chú bài tập..."/>
                </div>
                <div className="sm:col-span-4 flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)} className="h-7 text-xs">Hủy</Button>
                  <Button size="sm" onClick={addAttendance} className="bg-blue-600 hover:bg-blue-500 text-white h-7 text-xs font-bold">Lưu điểm danh</Button>
                </div>
              </div>
            )}

            {attendanceLoading ? (
              <div className="text-center py-6 text-slate-400 text-xs">Đang tải...</div>
            ) : visibleAttendance.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs italic">Chưa có dữ liệu điểm danh.</div>
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
                          <Input type="date" value={row.date} onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, date: e.target.value } })} className="bg-white h-8 text-xs rounded-lg"/>
                          <div className="flex gap-1">
                            <Input type="time" value={timeRow.start} onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, start: e.target.value } })} className="bg-white h-8 text-xs rounded-lg"/>
                            <Input type="time" value={timeRow.end} onChange={(e) => setEditRowTime({ ...editRowTime, [a.id]: { ...timeRow, end: e.target.value } })} className="bg-white h-8 text-xs rounded-lg"/>
                          </div>
                          <Select value={row.present ? "1" : "0"} onValueChange={(v) => setEditRow({ ...editRow, [a.id]: { ...row, present: v === "1" } })}>
                            <SelectTrigger className="bg-white h-8 text-xs rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent><SelectItem value="1">Có mặt</SelectItem><SelectItem value="0">Vắng</SelectItem></SelectContent>
                          </Select>
                          <Textarea rows={1} className="sm:col-span-2 bg-white min-h-[32px] text-xs rounded-lg" value={row.note} onChange={(e) => setEditRow({ ...editRow, [a.id]: { ...row, note: e.target.value } })} />
                        </div>
                        <div className="flex justify-end gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => setEditingId(null)} className="h-7 text-xs">Hủy</Button>
                          <Button size="sm" onClick={() => saveEdit(a)} className="bg-emerald-600 text-white h-7 text-xs font-bold">Lưu</Button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={a.id} className="p-3 rounded-xl bg-slate-50/70 border border-slate-100 flex items-center justify-between text-xs">
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900">
                          {ev?.event_date ? fmtDate(ev.event_date) : fmtDate(a.created_at)}
                          {ev?.start_time && <span className="text-slate-400 font-normal"> ({ev.start_time.slice(0, 5)} - {ev.end_time?.slice(0, 5)})</span>}
                        </div>
                        <div className="font-semibold text-blue-600">{cls?.name || "Lớp học"}</div>
                        {a.homework_note && <div className="text-[11px] text-slate-500 italic mt-0.5">Ghi chú: {a.homework_note}</div>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className={`text-[10px] font-bold ${a.present ? "bg-blue-100 text-blue-800" : "bg-rose-100 text-rose-800"}`}>
                          {a.present ? "Có mặt" : "Vắng"}
                        </Badge>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400" onClick={() => startEdit(a)}><Pencil className="h-3 w-3" /></Button>
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-rose-400" onClick={() => removeAttendance(a)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

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
                  <div key={c.id} className="p-3 rounded-xl bg-slate-50/60 border border-slate-100 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" style={{ backgroundColor: c.color || "#3b82f6" }} />
                      <span className="font-bold text-slate-900">{c.name}</span>
                    </div>
                    <span className="font-bold text-emerald-600">
                      {Number(c.fee_per_month || 0) > 0 ? formatVND(Number(c.fee_per_month)) : formatVND(Number(c.fee_per_session || c.fee || 0))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <StudentDialog open={editing} onOpenChange={(o) => { setEditing(o); if (!o) qc.invalidateQueries({ queryKey: ["student", id] }); }} student={student} />

      {/* DIALOG VIEW BILL */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-4 md:p-6 bg-slate-50/90 rounded-2xl">
          <DialogHeader className="border-b pb-3 print:hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <DialogTitle className="text-base font-black text-slate-900 flex items-center gap-2">
                <Receipt className="h-5 w-5 text-emerald-600" /> Hóa Đơn Học Phí & Thanh Toán
              </DialogTitle>
              <div className="flex items-center gap-2">
                <div className="flex border rounded-xl p-1 bg-white shadow-2xs">
                  <Button size="sm" variant={mode === "monthly" ? "default" : "ghost"} className="h-7 text-xs font-bold" onClick={() => { setMode("monthly"); setSelectedBillCycle(null); }}>
                    Theo tháng
                  </Button>
                  <Button size="sm" variant={mode === "by_session" ? "default" : "ghost"} className="h-7 text-xs font-bold" onClick={() => { setMode("by_session"); setSelectedBillCycle(null); }}>
                    Theo buổi
                  </Button>
                </div>
                <Button variant="outline" size="sm" onClick={saveAsImage} className="h-8 text-xs font-bold rounded-xl gap-1">
                  <ImageIcon className="h-3.5 w-3.5" /> Lưu ảnh
                </Button>
                <Button size="sm" onClick={() => window.print()} className="bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-bold rounded-xl gap-1">
                  <Printer className="h-3.5 w-3.5" /> In hóa đơn
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
            
            {/* CỘT TÌM CHỌN KỲ BILL */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-4 print:hidden">
              <Card className="p-4 border border-slate-200/80 shadow-2xs space-y-3 bg-white rounded-xl">
                <div className="flex justify-between items-center">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500">Các kỳ học phí</h3>
                  {selectedBills.size > 0 && (
                    <Button size="sm" onClick={paySelected} className="bg-emerald-600 text-white h-7 text-xs font-bold">
                      <Check className="h-3.5 w-3.5 mr-1" /> Đóng chọn ({selectedBills.size})
                    </Button>
                  )}
                </div>

                <div className="space-y-1.5 max-h-[450px] overflow-y-auto pr-1">
                  {bills.map((b) => {
                    const paid = isPaid(b);
                    const isSelected = selectedBills.has(b.cycle_label);
                    const active = selectedBillCycle === b.cycle_label;
                    return (
                      <div
                        key={b.cycle_label}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer text-xs ${
                          active ? "bg-blue-50/80 border-blue-300 shadow-2xs" : "hover:bg-slate-50 border-slate-100"
                        }`}
                        onClick={() => setSelectedBillCycle(b.cycle_label)}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={paid || isSelected}
                            onCheckedChange={() => {
                              if (paid) {
                                togglePaid(b);
                              } else {
                                setSelectedBills((s) => {
                                  const n = new Set(s);
                                  if (n.has(b.cycle_label)) n.delete(b.cycle_label);
                                  else n.add(b.cycle_label);
                                  return n;
                                });
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {b.cycle_label}
                              {paid && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 text-emerald-800 uppercase">
                                  ĐÃ ĐÓNG
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{b.description}</div>
                          </div>
                        </div>
                        <div className="font-bold text-slate-900">{formatVND(effectiveAmount(b))}</div>
                      </div>
                    );
                  })}
                  {bills.length === 0 && <div className="text-xs text-slate-400 py-4 text-center italic">Không có kỳ nào.</div>}
                </div>
              </Card>
            </div>

            {/* KHU VỰC HIỂN THỊ VÀ IN (CÓ THÊM CLASS printable-bill) */}
            <div className="lg:col-span-7 xl:col-span-8 flex justify-center">
              {displayBill && (
                <Card
                  ref={billRef as any}
                  className="printable-bill w-full p-6 md:p-8 border rounded-2xl shadow-sm bg-white text-slate-800 space-y-6" 
                  style={{ borderTop: `8px solid ${accent}` }}
                >
                  <div className="flex items-start justify-between border-b pb-4">
                    <div>
                      <div className="text-xl font-black tracking-wider uppercase" style={{ color: accent }}>
                        HÓA ĐƠN HỌC PHÍ
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 break-all font-mono">
                        Số bill: {billNum}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-slate-900">{profile?.display_name || t?.appName || "Lớp Cô Phương Anh"}</div>
                      <div className="text-xs text-slate-500">{profile?.phone || ""}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl text-xs border border-slate-100">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">HỌC SINH RECEIVER</div>
                      <div className="font-bold text-base mt-1 inline-block px-2 py-0.5 rounded text-slate-900" style={{ background: `${accent}22` }}>
                        {student.name}
                      </div>
                      {student.grade && (
                        <div className="mt-1 text-xs">
                          <span className="px-2 py-0.5 rounded-full font-bold text-slate-700 bg-slate-200/60">
                            Khối {student.grade}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase font-bold text-slate-400">
                        {displayBill.cycle_type === "monthly" ? "HỌC PHÍ THÁNG" : "HỌC PHÍ BÀI/BUỔI"}
                      </div>
                      <div className="font-bold text-sm mt-1 text-slate-900">
                        {displayBill.cycle_type === "combined"
                          ? `${selectedBillsArr.length} kỳ`
                          : formatVND(Number(displayBill.cycle_type === "monthly" ? student.fee_per_month : student.fee_per_session))}
                      </div>
                      <div className="text-[10px] uppercase font-bold text-slate-400 mt-2">
                        {displayBill.cycle_type === "monthly" ? "THỜI GIAN" : "SỐ BUỔI CÓ MẶT"}
                      </div>
                      <div className="font-bold text-xs mt-0.5 text-slate-800">
                        {displayBill.cycle_type === "monthly" ? displayBill.description : `${displayBill.attendances?.length || 0} buổi`}
                      </div>
                    </div>
                  </div>

                  {displayBill.cycle_type === "monthly" && (
                    <div className="print:hidden">
                      <Label className="text-xs font-bold mb-1 block text-slate-600">Ghi chú hóa đơn</Label>
                      <Textarea
                        rows={1}
                        className="text-xs rounded-lg"
                        value={monthlyNotes[displayBill.cycle_label] || ""}
                        onChange={(e) => setMonthlyNotes((m) => ({ ...m, [displayBill.cycle_label]: e.target.value }))}
                        placeholder="Thêm ghi chú riêng cho hóa đơn..."
                      />
                    </div>
                  )}

                  {displayBill.attendances?.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-[10px] uppercase font-bold text-slate-400">CHI TIẾT BUỔI HỌC</div>
                        <Button size="sm" variant="ghost" className="print:hidden h-6 text-xs text-slate-500" onClick={() => setShowAtt((s) => !s)}>
                          {showAtt ? <><EyeOff className="h-3 w-3 mr-1" /> Ẩn</> : <><Eye className="h-3 w-3 mr-1" /> Hiện</>}
                        </Button>
                      </div>

                      {showAtt && (
                        <div className="rounded-xl overflow-hidden border border-slate-200">
                          <table className="w-full text-xs border-collapse">
                            <thead className="bg-slate-50 font-bold text-slate-600">
                              <tr className="text-left border-b">
                                <th className="py-2 px-3 w-8">#</th>
                                <th className="py-2 px-3">Ngày học</th>
                                <th className="py-2 px-3">Nội dung / Bài tập</th>
                                <th className="py-2 px-3 text-right">Học phí</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {displayBill.attendances.map((a: any, i: number) => {
                                const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
                                const feeDraftVal = feeDraft[a.id] ?? (a.fee_override == null ? "" : String(a.fee_override));
                                const hwDraftVal = homeworkDraft[a.id] ?? (a.homework_note || "");
                                return (
                                  <tr key={a.id}>
                                    <td className="py-2 px-3">{i + 1}</td>
                                    <td className="py-2 px-3 font-semibold whitespace-nowrap">{fmtDate(a.schedule_events?.event_date)}</td>
                                    <td className="py-2 px-3">
                                      <Input
                                        type="text"
                                        className="print:hidden h-7 text-xs w-full bg-slate-50"
                                        value={hwDraftVal}
                                        placeholder="Nhập ghi chú..."
                                        onChange={(e) => setHomeworkDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                        onBlur={(e) => updateHomeworkNote(a, e.target.value)}
                                      />
                                      <span className="hidden print:inline text-xs">{a.homework_note || "—"}</span>
                                    </td>
                                    <td className="py-2 px-3 text-right">
                                      <span className="hidden print:inline font-bold">{formatVND(fee)}</span>
                                      <Input
                                        type="number"
                                        className="print:hidden h-7 text-right w-24 ml-auto text-xs bg-slate-50"
                                        value={feeDraftVal}
                                        placeholder={String(student.fee_per_session || 0)}
                                        onChange={(e) => setFeeDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                        onBlur={(e) => updateFee(a, e.target.value)}
                                      />
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end pt-2">
                    <div className="w-full sm:w-64 space-y-1.5 p-3 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex justify-between text-slate-500 font-medium">
                        <span>Tạm tính:</span>
                        <span>{formatVND(billTotal)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-sm px-3 py-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-100">
                        <span>TỔNG CỘNG:</span>
                        <span className="text-base font-black text-emerald-700">{formatVND(billTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* VietQR */}
                  <div className="border-t pt-4">
                    <div className="text-[10px] uppercase font-bold text-slate-400 mb-2">THANH TOÁN CHUYỂN KHOẢN (VIETQR)</div>
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <div className="space-y-1 text-xs w-full">
                        <div className="font-bold text-sm text-slate-900">Quét mã QR để đóng học phí</div>
                        <div className="text-[11px] text-slate-500">Mở ứng dụng Ngân hàng/MoMo để quét mã tự động nhập số tiền & nội dung.</div>
                        <div className="pt-2 text-xs space-y-0.5 border-t border-slate-200/60 mt-2">
                          <div>Số tiền: <span className="font-bold text-emerald-600">{formatVND(billTotal)}</span></div>
                          <div className="font-mono text-[11px] break-all">Nội dung: <span className="bg-slate-200 px-1.5 py-0.5 rounded font-bold">{billNum}</span></div>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {qrUrl ? (
                          <img src={qrUrl} alt="VietQR" className="h-36 w-36 rounded-xl bg-white p-1.5 border shadow-2xs object-contain" />
                        ) : (
                          <div className="text-[11px] text-slate-400 print:hidden text-center p-3 border rounded-xl">
                            Cấu hình tài khoản ngân hàng trong Cài đặt
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="print:hidden pt-2 flex flex-col items-end gap-2">
                    {displayBill.cycle_type === "combined" ? (
                      <Button onClick={paySelected} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8">
                        <Check className="h-3.5 w-3.5 mr-1" /> Đánh dấu đã đóng ({selectedBillsArr.length} kỳ)
                      </Button>
                    ) : (
                      <Button variant={isPaid(current) ? "outline" : "default"} onClick={() => togglePaid(current)} className={isPaid(current) ? "h-8 text-xs font-bold" : "bg-emerald-600 hover:bg-emerald-500 text-white h-8 text-xs font-bold"}>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        {isPaid(current) ? "Hủy đánh dấu đã đóng" : "Đánh dấu đã đóng học phí"}
                      </Button>
                    )}
                  </div>

                  <div className="border-t pt-4">
                    <Label className="text-xs font-bold print:hidden mb-1 block text-slate-500">Lời cảm ơn / Chân trang</Label>
                    <Textarea
                      rows={1}
                      value={footnote}
                      onChange={(e) => setFootnote(e.target.value)}
                      className="print:hidden text-xs rounded-lg"
                      placeholder="Cảm ơn quý phụ huynh và học sinh!"
                    />
                    {footnote && (
                      <div className="hidden print:block text-xs italic text-center pt-2 text-slate-500">
                        {footnote}
                      </div>
                    )}
                  </div>

                </Card>
              )}
            </div>

          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}