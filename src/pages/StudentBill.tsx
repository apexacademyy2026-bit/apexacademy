import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Check, Plus, Eye, EyeOff, Image as ImageIcon, Sparkles, Receipt, Calendar } from "lucide-react";
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
    setFootnote(saved ?? (t as any)?.footnoteDefault ?? "Thank you!");
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

  const accent = student?.color || "#3b82f6";
  const safeStudentName = student?.name ? student.name.trim().toUpperCase().replace(/\s+/g, '') : "STUDENT";
  const sessionsCount = mode === "by_session"
    ? (selectedSessionIds.size > 0 ? selectedSessionIds.size : availableAttendance.length)
    : (displayBill?.attendances?.length || 0);
  const billNum = `${safeStudentName}_${sessionsCount}BUOI`;

  const paySelectedSessions = async () => {
    if (!student || selectedSessionIds.size === 0) {
      toast.error((t as any)?.selectAtLeastOne || "Please select at least 1 session!");
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
    toast.success((t as any)?.saveSuccess || "Marked as paid successfully!");
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
      toast.info((t as any)?.alreadyPaid || "Selected cycles are already paid!");
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
    toast.success((t as any)?.saveSuccess || "Marked as paid successfully!");
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
    toast.success(t?.save || "Saved");
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
    toast.success(t?.save || "Saved");
    setAddForm({ date: new Date().toISOString().slice(0, 10), class_id: myClasses[0]?.id || "", note: "" });
    setAddOpen(false);
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  const handlePrint = () => {
    window.print();
  };

  const saveAsImage = async () => {
    if (!billRef.current) return;
    try {
      const dataUrl = await toPng(billRef.current, { cacheBust: true, backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${displayBill?.cycle_label || "bill"}.png`;
      link.href = dataUrl;
      link.click();
    } catch (e: any) {
      toast.error(e.message || "Error");
    }
  };

  if (!student) return <div className="p-8 text-center text-muted-foreground flex items-center justify-center min-h-[400px]">Đang tải dữ liệu học sinh...</div>;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
      
      {/* CSS RIÊNG PHỤC VỤ IN ẤN */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          .printable-bill-card, .printable-bill-card * {
            visibility: visible !important;
          }
          .printable-bill-card {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            border: none !important;
            box-shadow: none !important;
            background: #ffffff !important;
          }
          .no-print {
            display: none !important;
          }
          body {
            background: #ffffff !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      {/* Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 no-print">
        <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 w-fit rounded-xl hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4 mr-2" /> {t?.details || "Details"}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex border rounded-xl p-1 bg-muted/40 shadow-inner">
            <Button size="sm" variant={mode === "monthly" ? "default" : "ghost"} className="rounded-lg transition-all" onClick={() => { setMode("monthly"); setSelected(null); setSelectedCycles(new Set()); }}>
              <Calendar className="h-3.5 w-3.5 mr-1.5" /> {t?.payByMonth || "Pay monthly"}
            </Button>
            <Button size="sm" variant={mode === "by_session" ? "default" : "ghost"} className="rounded-lg transition-all" onClick={() => { setMode("by_session"); setSelected(null); setSelectedSessionIds(new Set()); }}>
              <Receipt className="h-3.5 w-3.5 mr-1.5" /> {t?.payBySession || "Pay by session"}
            </Button>
          </div>
          <Button variant="outline" size="sm" className="rounded-xl shadow-sm hover:bg-slate-50" onClick={saveAsImage}>
            <ImageIcon className="h-4 w-4 mr-1.5 text-slate-600" /> {(t as any)?.saveAsImage || "Save as image"}
          </Button>
          <Button size="sm" className="rounded-xl shadow-md bg-blue-600 hover:bg-blue-700 text-white" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-1.5" /> {t?.printBill || "Print bill"}
          </Button>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN: Controls & Cycle Selector */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 no-print">
          <Card className="p-5 border shadow-sm rounded-2xl bg-card space-y-4">
            <div className="flex justify-between items-center gap-2 border-b pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-base text-slate-800">
                  {mode === "monthly" ? (t?.cycle || "Cycle") : ((t as any)?.sessionList || "Session List")}
                </h3>
              </div>
              <div className="flex gap-2">
                {mode === "monthly" && selectedCycles.size > 0 && (
                  <Button size="sm" variant="success" className="rounded-lg" onClick={paySelectedCycles}>
                    <Check className="h-3.5 w-3.5 mr-1" /> {(t as any)?.markAsPaid || "Pay"} ({selectedCycles.size})
                  </Button>
                )}
                {mode === "by_session" && selectedSessionIds.size > 0 && (
                  <Button size="sm" variant="success" className="rounded-lg" onClick={paySelectedSessions}>
                    <Check className="h-3.5 w-3.5 mr-1" /> {(t as any)?.markAsPaid || "Pay"} ({selectedSessionIds.size})
                  </Button>
                )}
                <Button size="sm" variant="outline" className="rounded-lg text-xs" onClick={() => setAddOpen((o) => !o)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t?.addAttendance || "Add attendance"}
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs transition-all">
                <div>
                  <Label className="text-xs mb-1 block font-medium">{t?.date || "Date"}</Label>
                  <Input type="date" className="bg-white rounded-lg" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block font-medium">{t?.class || "Class"}</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className="bg-white rounded-lg"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {myClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block font-medium">{t?.homework || "Homework"}</Label>
                  <Textarea rows={2} className="bg-white rounded-lg" value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} />
                </div>
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="default" className="rounded-lg px-4" onClick={addAttendance}>{t?.save || "Save"}</Button>
                </div>
              </div>
            )}

            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {mode === "monthly" ? (
                bills.map((b) => {
                  const paid = isPaid(b);
                  const isChecked = selectedCycles.has(b.cycle_label);
                  return (
                    <div
                      key={b.cycle_label}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked ? "bg-blue-50/80 border-blue-400 shadow-sm" : "hover:bg-slate-50 border-slate-100"
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
                          <div className="text-xs font-semibold flex items-center gap-2 text-slate-800">
                            {b.cycle_label}
                            {paid ? (
                              <button
                                type="button"
                                title="Bấm để hủy đánh dấu đã đóng"
                                className="text-[9px] px-2 py-0.5 rounded-full font-bold bg-emerald-100 hover:bg-red-100 text-emerald-700 hover:text-red-700 transition-colors cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePaid(b);
                                }}
                              >
                                Paid (Hủy đóng)
                              </button>
                            ) : (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700">
                                CHƯA THANH TOÁN
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{b.description}</div>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900">{formatVND(effectiveAmount(b))}</div>
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
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked ? "bg-blue-50/80 border-blue-400 shadow-sm" : "hover:bg-slate-50 border-slate-100"
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
                          <div className="text-xs font-semibold text-slate-800">
                            #{idx + 1} • {fmtDate(a.schedule_events?.event_date)}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {a.homework_note || (t as any)?.noNote || "Chưa có ghi chú"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-bold text-slate-900">{formatVND(fee)}</div>
                    </div>
                  );
                })
              )}
              {((mode === "monthly" && bills.length === 0) || (mode === "by_session" && availableAttendance.length === 0)) && (
                <div className="text-xs text-muted-foreground py-8 text-center">{t?.nothingHere || "Không có dữ liệu"}</div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Interactive Bill Preview Card */}
        <div className="lg:col-span-7 xl:col-span-8 flex justify-center">
          {displayBill && (
            <Card
              ref={billRef as any}
              className="printable-bill-card w-full max-w-2xl p-8 border rounded-2xl shadow-xl bg-white text-slate-900 space-y-6 relative overflow-hidden"
            >
              <div 
                className="absolute top-0 left-0 right-0 h-2" 
                style={{ backgroundColor: accent }} 
              />
              
              {/* Header */}
              <div className="flex items-start justify-between border-b pb-4 pt-1">
                <div className="space-y-1">
                  <div className="text-3xl font-black tracking-tight uppercase" style={{ color: accent }}>
                    {(t as any)?.invoice || "HOÁ ĐƠN THANH TOÁN"}
                  </div>
                  <div className="text-xs text-slate-400 font-mono tracking-wide">
                    {(t as any)?.billNo || "Mã HD"}: <span className="font-bold text-slate-600">{billNum}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-base text-slate-800">{profile?.display_name || t?.teacher || "Giáo viên"}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{(profile as any)?.phone || ""}</div>
                </div>
              </div>

              {/* Student Summary */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100 text-xs">
                <div className="space-y-1.5">
                  <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    {(t as any)?.billedTo || "NGƯỜI NHẬN HOÁ ĐƠN"}
                  </div>
                  <div className="font-bold text-sm text-slate-900 inline-block px-2.5 py-1 rounded-lg bg-white border border-slate-200/80 shadow-sm">
                    {student.name}
                  </div>
                  {(student as any)?.phone && (
                    <p className="text-xs text-slate-500">{(student as any).phone}</p>
                  )}
                  {student.grade && (
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-200/60 text-slate-700">
                        Lớp: {student.grade}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right space-y-2">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      {mode === "monthly" 
                        ? (t?.feePerMonth || "HỌC PHÍ / THÁNG") 
                        : ((t as any)?.feePerSession || "HỌC PHÍ / BUỔI")}
                    </div>
                    <div className="font-bold text-sm text-slate-800 mt-0.5">
                      {formatVND(Number(mode === "monthly" ? student.fee_per_month : student.fee_per_session))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                      {mode === "monthly" 
                        ? (t?.period || "KỲ THANH TOÁN") 
                        : ((t as any)?.billedSessions || "SỐ BUỔI TÍNH PHÍ")}
                    </div>
                    <div className="font-semibold text-xs text-slate-700 mt-0.5">
                      {mode === "monthly" 
                        ? (displayBill.period_start ? `${fmtDate(displayBill.period_start)} – ${fmtDate(displayBill.period_end)}` : displayBill.description) 
                        : `${displayBill.attendances?.length || 0} ${((t as any)?.sessionsCountUnit || "buổi")}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sessions Table */}
              {displayBill.attendances?.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {(t as any)?.sessionDetails || "CHI TIẾT CÁC BUỔI HỌC"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="no-print h-7 text-xs text-slate-500 hover:text-slate-800"
                      onClick={() => setShowAtt((s) => !s)}
                    >
                      {showAtt
                        ? <><EyeOff className="h-3.5 w-3.5 mr-1" /> {(t as any)?.hide || "Ẩn danh sách"}</>
                        : <><Eye className="h-3.5 w-3.5 mr-1" /> {(t as any)?.show || "Hiện danh sách"}</>}
                    </Button>
                  </div>
                  {showAtt && (
                    <div className="border rounded-xl overflow-hidden text-xs bg-white border-slate-200">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 text-[11px] font-semibold">
                            {mode === "by_session" && (
                              <th className="py-2.5 px-3 w-10 text-center no-print">{(t as any)?.select || "Chọn"}</th>
                            )}
                            <th className="py-2.5 px-3 w-8 text-center">STT</th>
                            <th className="py-2.5 px-3 w-28">{t?.date || "Ngày học"}</th>
                            <th className="py-2.5 px-3">{t?.homework || "Nội dung bài học / Ghi chú"}</th>
                            <th className="py-2.5 px-3 text-right w-28">{t?.feePerOne || "Học phí"}</th>
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
                              <tr key={a.id} className={`hover:bg-slate-50/50 ${isChecked ? "bg-blue-50/40" : ""}`}>
                                {mode === "by_session" && (
                                  <td className="py-2 px-3 text-center no-print align-middle">
                                    <Checkbox
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
                                <td className="py-2 px-3 align-middle text-center text-slate-500 font-medium">{i + 1}</td>
                                <td className="py-2 px-3 align-middle font-medium text-slate-800 whitespace-nowrap">
                                  {fmtDate(a.schedule_events?.event_date)}
                                </td>
                                <td className="py-2 px-3 align-middle">
                                  <Input
                                    type="text"
                                    className="no-print h-8 text-xs border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-400 bg-white"
                                    value={hwDraftVal}
                                    placeholder="Thêm ghi chú..."
                                    onChange={(e) => setHomeworkDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                    onBlur={(e) => updateHomeworkNote(a, e.target.value)}
                                  />
                                  <span className="print:inline hidden text-xs text-slate-700">{a.homework_note || "—"}</span>
                                </td>
                                <td className="py-2 px-3 text-right align-middle">
                                  <span className="print:inline hidden text-xs font-semibold">{formatVND(fee)}</span>
                                  <Input
                                    type="number"
                                    className="no-print h-8 text-right w-28 ml-auto text-xs border-slate-200 focus-visible:ring-1 focus-visible:ring-blue-400 bg-white"
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

              {/* Total Summary */}
              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-72 space-y-2 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="flex justify-between text-xs text-slate-500 font-medium">
                    <span>Tạm tính</span>
                    <span>{formatVND(billTotal)}</span>
                  </div>
                  <div
                    className="flex justify-between items-center font-bold text-slate-900 px-3 py-2 rounded-lg"
                    style={{ backgroundColor: `${accent}22` }}
                  >
                    <span className="text-xs uppercase tracking-wider">Tổng cộng</span>
                    <span className="text-xl font-black">{formatVND(billTotal)}</span>
                  </div>
                </div>
              </div>

              {/* VietQR Section */}
              <div className="border-t border-slate-200 pt-4">
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">
                  {(t as any)?.mobileBankingPayment || "THANH TOÁN QUA CHUYỂN KHOẢN (VIETQR)"}
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                  <div className="space-y-1.5 text-xs w-full">
                    <div className="font-bold text-sm text-slate-800">{(t as any)?.scanToPayShort || "Quét mã QR để thanh toán"}</div>
                    <div className="text-[11px] text-slate-500 leading-relaxed">
                      {(t as any)?.scanQrInstr || "Sử dụng ứng dụng Ngân hàng để quét mã QR và hoàn tất chuyển khoản."}
                    </div>
                    <div className="pt-2 text-xs space-y-1 border-t border-slate-200 mt-2">
                      <div className="text-slate-600">Số tiền: <span className="font-bold text-slate-900">{formatVND(billTotal)}</span></div>
                      <div className="font-mono text-[11px] text-slate-600">
                        Nội dung: <span className="bg-slate-200/80 px-2 py-0.5 rounded text-slate-900 font-bold">{billNum}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {qrUrl ? (
                      <img src={qrUrl} alt="VietQR" className="h-36 w-36 rounded-xl bg-white p-2 border border-slate-200 shadow-sm object-contain" />
                    ) : (
                      <div className="text-xs text-slate-400 no-print text-center p-4 border border-dashed rounded-xl bg-white">
                        {t?.vietQR || "VietQR"}: <Link to="/settings" className="text-blue-600 underline font-medium">{t?.settings || "Thiết lập"}</Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="no-print pt-2 flex flex-col items-end gap-2">
                {mode === "by_session" ? (
                  <Button
                    variant="success"
                    className="rounded-xl px-6 font-medium shadow-md"
                    disabled={selectedSessionIds.size === 0}
                    onClick={paySelectedSessions}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    {(t as any)?.markAsPaid || "Đánh dấu đã thanh toán"} ({selectedSessionIds.size})
                  </Button>
                ) : (
                  <Button
                    variant={isPaid(current) ? "outline" : "success"}
                    className={`rounded-xl px-6 font-medium ${isPaid(current) ? "border-red-300 text-red-600 hover:bg-red-50" : ""}`}
                    onClick={() => togglePaid(current)}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    {isPaid(current) ? "Hủy đánh dấu đã đóng (Unpaid)" : (t?.markPaid || "Đã thanh toán")}
                  </Button>
                )}
              </div>

              {/* Footnote */}
              <div className="border-t border-slate-200 pt-3">
                <Label className="text-xs font-semibold text-slate-600 no-print mb-1.5 block">{(t as any)?.footnote || "Lời cảm ơn / Ghi chú chân trang"}</Label>
                <Textarea
                  rows={2}
                  value={footnote}
                  onChange={(e) => setFootnote(e.target.value)}
                  placeholder={(t as any)?.footnoteDefault || "Cảm ơn quý phụ huynh và học sinh!"}
                  className="no-print text-xs rounded-xl border-slate-200 bg-white"
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
    </div>
  );
}