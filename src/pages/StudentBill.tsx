import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Printer, 
  Check, 
  Plus, 
  Eye, 
  EyeOff, 
  Image as ImageIcon,
  Receipt,
  Calendar,
  CreditCard,
  FileText
} from "lucide-react";
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
import { toPng } from "html-to-image";
import { useConfirm } from "@/components/ConfirmProvider";

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
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [homeworkDraft, setHomeworkDraft] = useState<Record<string, string>>({});
  const [footnote, setFootnote] = useState<string>("");

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

  const { data: attendance } = useQuery({
    queryKey: ["student-attendance-all", id],
    queryFn: async () =>
      (
        await supabase
          .from("attendance")
          .select("*, schedule_events(event_date, start_time, end_time, class_id)")
          .eq("student_id", id)
          .eq("present", true)
      ).data || [],
    enabled: !!id,
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
    setFootnote(saved ?? (t as any)?.footnoteDefault ?? "Cảm ơn quý phụ huynh và học sinh!");
  }, [student?.id, t]);

  useEffect(() => {
    if (!student) return;
    localStorage.setItem(`bill_footnote_${student.id}`, footnote);
  }, [footnote, student?.id]);

  const myClasses = useMemo(() => {
    if (!student) return [];
    const cids = (enrollments.data || []).filter((e: any) => e.student_id === student.id).map((e: any) => e.class_id);
    return (classesQ.data || []).filter((c: any) => cids.includes(c.id));
  }, [enrollments.data, classesQ.data, student]);

  useEffect(() => {
    if (myClasses[0] && !addForm.class_id) setAddForm((f) => ({ ...f, class_id: myClasses[0].id }));
  }, [myClasses, addForm.class_id]);

  const sortedAttendance = useMemo(
    () => [...(attendance || [])].sort((a: any, b: any) => (a?.schedule_events?.event_date || "").localeCompare(b?.schedule_events?.event_date || "")),
    [attendance]
  );

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

  const qrContent = displayBill ? displayBill.cycle_label : "";
  const qrUrl = displayBill && profile?.bank_code && profile?.bank_account_number
    ? vietQRUrl(profile?.bank_code, profile?.bank_account_number, profile?.bank_account_name, billTotal, qrContent)
    : null;

  const accent = student?.color || "#2563eb";

  const safeStudentName = student?.name ? student.name.trim().toUpperCase().replace(/\s+/g, '') : "STUDENT";
  const sessionsCount = mode === "by_session"
    ? (selectedSessionIds.size > 0 ? selectedSessionIds.size : availableAttendance.length)
    : (displayBill?.attendances?.length || 0);
  const billNum = `${safeStudentName}_${sessionsCount}BUOI`;

  const paySelectedSessions = async () => {
    if (!student || selectedSessionIds.size === 0) {
      toast.error((t as any)?.selectAtLeastOne || "Vui lòng chọn ít nhất 1 buổi học!");
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
    toast.success((t as any)?.saveSuccess || "Đã xác nhận thanh toán thành công!");
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
      toast.info((t as any)?.alreadyPaid || "Các chu kỳ chọn đều đã đóng học phí!");
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
    toast.success((t as any)?.saveSuccess || "Đã xác nhận thanh toán thành công!");
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
    toast.success(t?.save || "Đã cập nhật");
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
    toast.success(t?.save || "Đã lưu điểm danh");
    setAddForm({ date: new Date().toISOString().slice(0, 10), class_id: myClasses[0]?.id || "", note: "" });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  // HÀM IN ĐƯỢC TỐI ƯU HỖ TRỢ SAFARI IPHONE & POPUP
  const handlePrint = () => {
    if (!billRef.current) {
      window.print();
      return;
    }
    const content = billRef.current.innerHTML;
    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>${displayBill?.cycle_label || "Hóa đơn"}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: system-ui, -apple-system, sans-serif; padding: 12px; background: #fff; color: #000; }
              .no-print { display: none !important; }
              table { width: 100%; border-collapse: collapse; }
              th, td { border: 1px solid #e2e8f0; padding: 6px 8px; }
              img { max-width: 100%; height: auto; }
              @page { size: A4 portrait; margin: 8mm; }
            </style>
          </head>
          <body>
            ${content}
            <script>
              window.onload = function() {
                setTimeout(function() {
                  window.print();
                  window.close();
                }, 400);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } else {
      window.print();
    }
  };

  // HÀM XUẤT ẢNH XỬ LÝ LỖI CORS THỨC THỜI
  const saveAsImage = async () => {
    if (!billRef.current) return;
    const toastId = toast.loading("Đang tạo hình ảnh hóa đơn...");
    try {
      const dataUrl = await toPng(billRef.current, {
        cacheBust: true,
        backgroundColor: "#ffffff",
        pixelRatio: 2,
        skipFonts: true,
        filter: (node) => !node.classList?.contains("no-print"),
      });

      const link = document.createElement("a");
      link.download = `HoaDon_${displayBill?.cycle_label || "HocSinh"}.png`;
      link.href = dataUrl;
      link.click();

      toast.success("Tải ảnh hóa đơn thành công!", { id: toastId });
    } catch (e: any) {
      console.error("Lỗi xuất ảnh:", e);
      toast.error("Không thể xuất ảnh. Vui lòng thử lại!", { id: toastId });
    }
  };

  if (!student) return <div className="p-8 text-center text-slate-400 font-bold">Đang tải thông tin học sinh...</div>;

  return (
    <div className="container mx-auto p-3 sm:p-6 max-w-7xl space-y-6 animate-in fade-in duration-300">
      
      {/* 1. TOP ACTION BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs no-print">
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            onClick={() => navigate(-1)} 
            className="h-10 px-3 rounded-2xl hover:bg-slate-100 font-bold text-slate-600 text-xs gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="h-4 w-4" /> Chi tiết học sinh
          </Button>
          <div className="h-4 w-px bg-slate-200 hidden sm:block" />
          <div className="font-black text-slate-900 text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4 text-blue-600" />
            <span>Hóa đơn học phí: <span className="text-blue-600">{student.name}</span></span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex border border-slate-200/80 rounded-2xl p-1 bg-slate-50 shadow-2xs">
            <button
              onClick={() => { setMode("monthly"); setSelected(null); setSelectedCycles(new Set()); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === "monthly" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t?.payByMonth || "Theo tháng"}
            </button>
            <button
              onClick={() => { setMode("by_session"); setSelected(null); setSelectedSessionIds(new Set()); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                mode === "by_session" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t?.payBySession || "Theo buổi"}
            </button>
          </div>

          <Button 
            variant="outline" 
            onClick={saveAsImage}
            className="h-10 px-3.5 rounded-2xl border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
          >
            <ImageIcon className="h-4 w-4 text-slate-500" /> Xuất ảnh
          </Button>
          <Button 
            onClick={handlePrint}
            className="h-10 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
          >
            <Printer className="h-4 w-4" /> In hóa đơn
          </Button>
        </div>
      </div>

      {/* 2. MAIN 2-COLUMN LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: DANH SÁCH CHỌN CHU KỲ / BUỔI HỌC */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 no-print">
          <Card className="p-5 border-slate-200/80 rounded-3xl bg-white shadow-xs space-y-4">
            <div className="flex justify-between items-center gap-2 pb-2 border-b border-slate-100">
              <h3 className="font-black text-sm text-slate-900 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-blue-600" />
                {mode === "monthly" ? (t?.cycle || "Chu kỳ đóng học phí") : ((t as any)?.sessionList || "Danh sách buổi học")}
              </h3>
              <div className="flex items-center gap-1.5">
                {mode === "monthly" && selectedCycles.size > 0 && (
                  <Button size="sm" onClick={paySelectedCycles} className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer">
                    <Check className="h-3.5 w-3.5 mr-1" /> Đóng ({selectedCycles.size})
                  </Button>
                )}
                {mode === "by_session" && selectedSessionIds.size > 0 && (
                  <Button size="sm" onClick={paySelectedSessions} className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer">
                    <Check className="h-3.5 w-3.5 mr-1" /> Đóng ({selectedSessionIds.size})
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setAddOpen((o) => !o)}
                  className="h-8 px-2.5 rounded-xl border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Thêm buổi
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid gap-3 p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100 text-xs">
                <div>
                  <Label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Ngày điểm danh</Label>
                  <Input type="date" className="h-9 rounded-xl text-xs bg-white" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Lớp học</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className="h-9 rounded-xl text-xs bg-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {myClasses.map((c: any) => <SelectItem key={c.id} value={c.id} className="text-xs">{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[10px] font-bold text-slate-600 uppercase mb-1 block">Nhận xét bài tập</Label>
                  <Textarea rows={2} className="rounded-xl text-xs bg-white" value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} />
                </div>
                <div className="flex justify-end pt-1">
                  <Button size="sm" className="h-8 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs cursor-pointer" onClick={addAttendance}>Lưu điểm danh</Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {mode === "monthly" ? (
                bills.map((b) => {
                  const paid = isPaid(b);
                  const isChecked = selectedCycles.has(b.cycle_label);
                  return (
                    <div
                      key={b.cycle_label}
                      className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        isChecked ? "bg-blue-50/70 border-blue-300 shadow-xs" : "hover:bg-slate-50/80 border-slate-100"
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
                      <div className="flex items-center gap-3">
                        <Checkbox
                          className="rounded-lg"
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
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            {b.cycle_label}
                            {paid && (
                              <span className="text-[9px] px-2 py-0.5 rounded-md font-black bg-emerald-100 text-emerald-700 uppercase tracking-wider">
                                ĐÃ ĐÓNG
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 mt-0.5">{b.description}</div>
                        </div>
                      </div>
                      <div className="text-xs font-black text-slate-900">{formatVND(effectiveAmount(b))}</div>
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
                      className={`flex items-center justify-between gap-3 p-3 rounded-2xl border transition-all cursor-pointer ${
                        isChecked ? "bg-blue-50/70 border-blue-300 shadow-xs" : "hover:bg-slate-50/80 border-slate-100"
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
                      <div className="flex items-center gap-3">
                        <Checkbox
                          className="rounded-lg"
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
                        <div>
                          <div className="text-xs font-black text-slate-800">
                            #{idx + 1} — Ngày {fmtDate(a.schedule_events?.event_date)}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-400 truncate max-w-[180px]">
                            {a.homework_note || "Chưa có ghi chú"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-black text-slate-900">{formatVND(fee)}</div>
                    </div>
                  );
                })
              )}
              {((mode === "monthly" && bills.length === 0) || (mode === "by_session" && availableAttendance.length === 0)) && (
                <div className="text-xs font-semibold text-slate-400 py-6 text-center">Chưa có dữ liệu học phí</div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: HÓA ĐƠN XEM TRƯỚC */}
        <div className="lg:col-span-7 xl:col-span-8 flex justify-center">
          {displayBill && (
            <Card
              ref={billRef as any}
              className="print-area w-full max-w-2xl p-6 sm:p-8 border border-slate-200/80 rounded-3xl shadow-sm print:shadow-none print:border-none print:p-0 bg-white text-slate-900 space-y-6"
              style={{ borderTop: `8px solid ${accent}` }}
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="text-2xl font-black tracking-tight uppercase flex items-center gap-2" style={{ color: accent }}>
                    <Receipt className="h-6 w-6" /> HÓA ĐƠN HỌC PHÍ
                  </div>
                  <div className="text-xs font-bold text-slate-400 mt-1 font-mono">
                    Mã HĐ: {billNum}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-base text-slate-900">{profile?.display_name || t?.teacher || "Giáo viên"}</div>
                  <div className="text-xs font-semibold text-slate-400 mt-0.5">{(profile as any)?.phone || ""}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-2xl border border-slate-100 text-xs">
                <div>
                  <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-1">
                    HỌC SINH NHẬN HÓA ĐƠN
                  </div>
                  <div className="font-black text-base inline-block px-2.5 py-0.5 rounded-lg text-slate-900" style={{ background: `${accent}25` }}>
                    {student.name}
                  </div>
                  {(student as any)?.phone && (
                    <p className="text-xs font-semibold text-slate-500 mt-1.5">SĐT: {(student as any).phone}</p>
                  )}
                  {student.grade && (
                    <div className="mt-1.5">
                      <span className="px-2.5 py-0.5 rounded-full font-bold text-[10px]" style={{ background: `${accent}35`, color: "#0f172a" }}>
                        {student.grade}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right space-y-2">
                  <div>
                    <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                      {mode === "monthly" ? "HỌC PHÍ / THÁNG" : "HỌC PHÍ / BUỔI"}
                    </div>
                    <div className="font-black text-base text-slate-900 mt-0.5">
                      {formatVND(Number(mode === "monthly" ? student.fee_per_month : student.fee_per_session))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-black tracking-wider text-slate-400">
                      {mode === "monthly" ? "KỲ THU HỌC PHÍ" : "SỐ BUỔI TÍNH PHÍ"}
                    </div>
                    <div className="font-bold text-xs text-slate-700 mt-0.5">
                      {mode === "monthly" 
                        ? (displayBill.period_start ? `${fmtDate(displayBill.period_start)} – ${fmtDate(displayBill.period_end)}` : displayBill.description) 
                        : `${displayBill.attendances?.length || 0} buổi học`}
                    </div>
                  </div>
                </div>
              </div>

              {displayBill.attendances?.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <FileText className="h-4 w-4 text-blue-600" /> CHI TIẾT CÁC BUỔI HỌC
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="no-print h-7 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-xl"
                      onClick={() => setShowAtt((s) => !s)}
                    >
                      {showAtt
                        ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> Ẩn danh sách</>
                        : <><Eye className="h-3.5 w-3.5 mr-1" /> Hiện danh sách</>}
                    </Button>
                  </div>

                  {showAtt && (
                    <div className="border border-slate-200/80 rounded-2xl overflow-hidden text-xs shadow-2xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-[11px] font-black uppercase">
                            {mode === "by_session" && (
                              <th className="py-2.5 px-3 w-10 text-center no-print">Chọn</th>
                            )}
                            <th className="py-2.5 px-3 w-8 text-center">STT</th>
                            <th className="py-2.5 px-3 w-28">Ngày học</th>
                            <th className="py-2.5 px-3">Nội dung bài học / Ghi chú</th>
                            <th className="py-2.5 px-3 text-right w-28">Học phí</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {displayBill.attendances.map((a: any, i: number) => {
                            const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
                            const feeDraftVal = feeDraft[a.id] ?? (a.fee_override == null ? "" : String(a.fee_override));
                            const hwDraftVal = homeworkDraft[a.id] ?? (a.homework_note || "");
                            const isChecked = selectedSessionIds.has(a.id);
                            const isPaidSession = (payments || []).some((p: any) => {
                              if (p.attendance_id === a.id) return true;
                              if (Array.isArray(p.attendance_ids) && p.attendance_ids.includes(a.id)) return true;
                              return false;
                            });

                            return (
                              <tr key={a.id} className={`transition-colors ${isChecked ? "bg-blue-50/50" : "hover:bg-slate-50/50"}`}>
                                {mode === "by_session" && (
                                  <td className="py-2.5 px-3 text-center no-print align-middle">
                                    <Checkbox
                                      className="rounded-lg"
                                      checked={isPaidSession || isChecked}
                                      disabled={isPaidSession}
                                      onCheckedChange={(v) => {
                                        if (isPaidSession) return;
                                        setSelectedSessionIds((s) => {
                                          const n = new Set(s);
                                          if (v) n.add(a.id);
                                          else n.delete(a.id);
                                          return n;
                                        });
                                      }}
                                    />
                                  </td>
                                )}
                                <td className="py-2.5 px-3 align-middle text-center font-bold text-slate-500">{i + 1}</td>
                                <td className="py-2.5 px-3 align-middle font-bold text-slate-800 whitespace-nowrap">
                                  {fmtDate(a.schedule_events?.event_date)}
                                </td>
                                <td className="py-2.5 px-3 align-middle">
                                  <Input
                                    type="text"
                                    className="no-print h-8 text-xs w-full rounded-xl border-slate-200 bg-white font-medium"
                                    value={hwDraftVal}
                                    placeholder="Nhập ghi chú / bài tập..."
                                    onChange={(e) => setHomeworkDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                    onBlur={(e) => updateHomeworkNote(a, e.target.value)}
                                  />
                                  <span className="print:inline hidden text-xs font-semibold">{a.homework_note || "—"}</span>
                                </td>
                                <td className="py-2.5 px-3 text-right align-middle">
                                  <span className="print:inline hidden text-xs font-bold">{formatVND(fee)}</span>
                                  <Input
                                    type="number"
                                    className="no-print h-8 text-right w-28 ml-auto text-xs rounded-xl border-slate-200 bg-white font-bold"
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
                <div className="w-full sm:w-72 space-y-2 p-4 rounded-2xl bg-slate-50 border border-slate-100 shadow-2xs">
                  <div className="flex justify-between text-xs font-bold text-slate-500">
                    <span>Tạm tính</span>
                    <span>{formatVND(billTotal)}</span>
                  </div>
                  <div
                    className="flex justify-between items-center font-black text-slate-900 px-3.5 py-2.5 rounded-xl"
                    style={{ background: `${accent}30` }}
                  >
                    <span className="text-xs uppercase tracking-wider">TỔNG CỘNG</span>
                    <span className="text-xl font-black">{formatVND(billTotal)}</span>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="text-[10px] uppercase font-black tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-blue-600" /> THANH TOÁN CHUYỂN KHOẢN (VIETQR)
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/70 p-4 rounded-2xl border border-slate-100">
                  <div className="space-y-1.5 text-xs w-full">
                    <div className="font-black text-sm text-slate-900">Quét mã QR để đóng học phí</div>
                    <div className="text-[11.5px] font-semibold text-slate-500">Mở ứng dụng Ngân hàng (MB, Vietcombank, TPBank...) để quét mã tự động điền số tiền và nội dung.</div>
                    <div className="pt-2.5 text-xs space-y-1 border-t border-slate-200/60 mt-2">
                      <div className="font-bold text-slate-700">Số tiền: <span className="font-black text-blue-600">{formatVND(billTotal)}</span></div>
                      <div className="font-mono text-[11px] text-slate-600 break-all">Cú pháp CK: <span className="bg-white px-2 py-0.5 rounded-md border border-slate-200 font-bold">{billNum}</span></div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {qrUrl ? (
                      <img 
                        src={qrUrl} 
                        alt="VietQR" 
                        crossOrigin="anonymous"
                        className="h-36 w-36 rounded-2xl bg-white p-2 border border-slate-200 shadow-sm object-contain" 
                      />
                    ) : (
                      <div className="text-xs font-bold text-slate-400 no-print text-center p-4 bg-white rounded-2xl border border-slate-200">
                        Chưa thiết lập QR: <Link to="/settings" className="text-blue-600 underline">Cài đặt</Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="no-print pt-2 flex flex-col items-end gap-2">
                {mode === "by_session" ? (
                  <Button
                    disabled={selectedSessionIds.size === 0}
                    onClick={paySelectedSessions}
                    className="h-11 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Xác nhận đóng học phí ({selectedSessionIds.size} buổi)
                  </Button>
                ) : selectedCycles.size > 0 ? (
                  <Button 
                    onClick={paySelectedCycles}
                    className="h-11 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    Xác nhận đóng học phí ({selectedCycles.size} chu kỳ)
                  </Button>
                ) : (
                  <Button 
                    variant={isPaid(current) ? "outline" : "default"} 
                    onClick={() => togglePaid(current)}
                    className={isPaid(current) 
                      ? "h-11 px-6 rounded-2xl border-slate-200 font-bold text-xs text-slate-700 hover:bg-slate-50 cursor-pointer"
                      : "h-11 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20 cursor-pointer"
                    }
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    {isPaid(current) ? "Đánh dấu CHƯA ĐÓNG" : "Đánh dấu ĐÃ ĐÓNG HỌC PHÍ"}
                  </Button>
                )}
              </div>

              <style>{`
                @page {
                  size: A4 portrait;
                  margin: 8mm;
                }
                @media print {
                  body {
                    background: white !important;
                  }
                  .print-area {
                    box-shadow: none !important;
                    border: none !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    width: 100% !important;
                  }
                }
              `}</style>

              <div className="border-t border-slate-100 pt-4">
                <Label className="text-xs font-bold text-slate-600 no-print mb-1.5 block">Ghi chú chân trang hóa đơn</Label>
                <Textarea
                  rows={2}
                  value={footnote}
                  onChange={(e) => setFootnote(e.target.value)}
                  placeholder="Nhập lời cảm ơn hoặc lưu ý..."
                  className="no-print text-xs rounded-xl border-slate-200 bg-white"
                />
                {footnote && (
                  <div className="hidden print:block text-xs italic text-center pt-2 text-slate-500 font-medium">
                    {footnote}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}