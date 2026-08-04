import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Check, Plus, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
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

  // State lưu danh sách ID được tích chọn
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

  // Tính toán cho Buổi lẻ
  const selectedSessionsArray = useMemo(() => {
    return availableAttendance.filter((a: any) => selectedSessionIds.has(a.id));
  }, [availableAttendance, selectedSessionIds]);

  const selectedSessionsAmount = useMemo(() => {
    return selectedSessionsArray.reduce((sum, a) => {
      return sum + Number(a.fee_override ?? student?.fee_per_session ?? 0);
    }, 0);
  }, [selectedSessionsArray, student]);

  // Tính toán cho Chu kỳ Tháng được chọn
  const selectedCyclesArray = useMemo(() => {
    return bills.filter((b: any) => selectedCycles.has(b.cycle_label));
  }, [bills, selectedCycles]);

  const selectedCyclesAmount = useMemo(() => {
    return selectedCyclesArray.reduce((sum: number, b: any) => sum + effectiveAmount(b), 0);
  }, [selectedCyclesArray]);

  // Dynamic Bill xem trước
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
  const billNum = (displayBill?.cycle_label || student?.id || "").slice(0, 100).toUpperCase();

  // Đóng tiền Buổi lẻ
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
      cycle_label: `${student.name}_${selectedIdsArr.length}buoi_${new Date().getFullYear()}`,
      period_start: dates[0] || null,
      period_end: dates[dates.length - 1] || null,
      session_count: selectedIdsArr.length,
      amount: selectedSessionsAmount,
      attendance_ids: selectedIdsArr as any,
    } as any);

    if (error) { toast.error(error.message); return; }
    setSelectedSessionIds(new Set());
    qc.invalidateQueries({ queryKey: ["payments", id] });
toast.success((t as any)?.saveSuccess || "Marked as paid successfully!");  };

  // Đóng tiền Chu kỳ Tháng
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
toast.success((t as any)?.saveSuccess || "Marked as paid successfully!");  };

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

  if (!student) return <div className="p-6 text-muted-foreground">Loading...</div>;

  return (
    <div className="container mx-auto p-4 md:p-6 max-w-7xl space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4 no-print">
        <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" /> {t?.details || "Details"}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex border rounded-xl p-1 bg-card shadow-sm">
            <Button size="sm" variant={mode === "monthly" ? "soft" : "ghost"} onClick={() => { setMode("monthly"); setSelected(null); setSelectedCycles(new Set()); }}>
              {t?.payByMonth || "Pay monthly"}
            </Button>
            <Button size="sm" variant={mode === "by_session" ? "soft" : "ghost"} onClick={() => { setMode("by_session"); setSelected(null); setSelectedSessionIds(new Set()); }}>
              {t?.payBySession || "Pay by session"}
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={saveAsImage}>
            <ImageIcon className="h-4 w-4 mr-1.5" /> {(t as any)?.saveAsImage || "Save as image"}
          </Button>
          <Button variant="success" size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" /> {t?.printBill || "Print bill"}
          </Button>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* LEFT COLUMN: Danh sách chu kỳ / buổi học */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 no-print">
          <Card className="p-5 border shadow-sm space-y-4">
            <div className="flex justify-between items-center gap-2">
              <h3 className="font-semibold text-base">
                {mode === "monthly" ? (t?.cycle || "Cycle") : ((t as any)?.sessionList || "Session List")}
              </h3>
              <div className="flex gap-2">
                {/* NÚT ĐÓNG TIỀN CHO THÁNG (MONTHLY) */}
                {mode === "monthly" && selectedCycles.size > 0 && (
                  <Button size="sm" variant="success" onClick={paySelectedCycles}>
                    <Check className="h-3.5 w-3.5 mr-1" /> {(t as any)?.markAsPaid || "Pay"} ({selectedCycles.size})
                  </Button>
                )}

                {/* NÚT ĐÓNG TIỀN CHO BUỔI LẺ (SESSION) */}
                {mode === "by_session" && selectedSessionIds.size > 0 && (
                  <Button size="sm" variant="success" onClick={paySelectedSessions}>
                    <Check className="h-3.5 w-3.5 mr-1" /> {(t as any)?.markAsPaid || "Pay"} ({selectedSessionIds.size})
                  </Button>
                )}

                <Button size="sm" variant="soft" onClick={() => setAddOpen((o) => !o)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> {t?.addAttendance || "Add attendance"}
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid gap-3 p-3 rounded-xl bg-muted/50 border text-xs">
                <div>
                  <Label className="text-xs mb-1 block">{t?.date || "Date"}</Label>
                  <Input type="date" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t?.class || "Class"}</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {myClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t?.homework || "Homework"}</Label>
                  <Textarea rows={2} value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} />
                </div>
                <div className="flex justify-end pt-1">
                  <Button size="sm" variant="success" onClick={addAttendance}>{t?.save || "Save"}</Button>
                </div>
              </div>
            )}

            <div className="space-y-1.5 max-h-[500px] overflow-y-auto pr-1">
              {mode === "monthly" ? (
                bills.map((b) => {
                  const paid = isPaid(b);
                  const isChecked = selectedCycles.has(b.cycle_label);

                  return (
                    <div
                      key={b.cycle_label}
                      className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                        isChecked ? "bg-primary/10 border-primary/40 shadow-sm" : "hover:bg-muted/60 border-transparent"
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
                          <div className="text-sm font-medium flex items-center gap-2">
                            {b.cycle_label}
                            {paid && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-100 text-emerald-700 uppercase">
                                {t?.paid || "PAID"}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{b.description}</div>
                        </div>
                      </div>
                      <div className="text-sm font-bold">{formatVND(effectiveAmount(b))}</div>
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
                      className={`flex items-center justify-between gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isChecked ? "bg-primary/10 border-primary/40" : "hover:bg-muted/60 border-transparent"
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
                          <div className="text-xs font-bold text-slate-800">
                            #{idx + 1} - {fmtDate(a.schedule_events?.event_date)}
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                            {a.homework_note || (t as any)?.noNote || "No notes"}
                          </div>
                        </div>
                      </div>
                      <div className="text-xs font-bold">{formatVND(fee)}</div>
                    </div>
                  );
                })
              )}
              {((mode === "monthly" && bills.length === 0) || (mode === "by_session" && availableAttendance.length === 0)) && (
                <div className="text-sm text-muted-foreground py-4 text-center">{t?.nothingHere || "Nothing here"}</div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Invoice Document Preview */}
        <div className="lg:col-span-7 xl:col-span-8 flex justify-center">
          {displayBill && (
            <Card
              ref={billRef as any}
              className="print-area w-full max-w-2xl p-6 border rounded-2xl shadow-md print:shadow-none print:border-none print:p-0 bg-white text-foreground space-y-4"
              style={{ borderTop: `8px solid ${accent}` }}
            >
              {/* Invoice Header */}
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <div className="text-2xl font-black tracking-wider uppercase" style={{ color: accent }}>
                    {(t as any)?.invoice || "INVOICE"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 break-all font-mono">
                    {(t as any)?.billNo || "Bill No."}: {billNum}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-base">{profile?.display_name || t?.teacher || "Teacher"}</div>
                  <div className="text-xs text-muted-foreground">{(profile as any)?.phone || ""}</div>
                </div>
              </div>

              {/* Billed Info Grid */}
              <div className="grid grid-cols-2 gap-3 bg-muted/30 p-3.5 rounded-xl text-xs border">
                <div>
                  <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                    {(t as any)?.billedTo || "BILLED TO"}
                  </div>
                  <div className="font-bold text-base mt-0.5 inline-block px-2 py-0.5 rounded" style={{ background: `${accent}33` }}>
                    {student.name}
                  </div>
                  {(student as any)?.phone && (
                    <p className="text-xs text-muted-foreground mt-1">{(student as any).phone}</p>
                  )}
                  {student.grade && (
                    <div className="mt-1 text-[11px]">
                      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: `${accent}44` }}>
                        {student.grade}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right space-y-1">
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                      {mode === "monthly" 
                        ? (t?.feePerMonth || "FEE PER MONTH") 
                        : ((t as any)?.feePerSession || "FEE PER SESSION")}
                    </div>
                    <div className="font-bold text-base mt-0.5">
                      {formatVND(Number(mode === "monthly" ? student.fee_per_month : student.fee_per_session))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase font-semibold text-muted-foreground">
                      {mode === "monthly" 
                        ? (t?.period || "PERIOD") 
                        : ((t as any)?.billedSessions || "BILLED SESSIONS")}
                    </div>
                    <div className="font-semibold text-xs mt-0.5">
                      {mode === "monthly" 
                        ? (displayBill.period_start ? `${fmtDate(displayBill.period_start)} – ${fmtDate(displayBill.period_end)}` : displayBill.description) 
                        : `${displayBill.attendances?.length || 0} ${((t as any)?.sessionsCountUnit || "sessions")}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sessions table */}
              {displayBill.attendances?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      {(t as any)?.sessionDetails || "SESSION DETAILS"}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="no-print h-7 text-xs"
                      onClick={() => setShowAtt((s) => !s)}
                    >
                      {showAtt
                        ? <><EyeOff className="h-3 w-3 mr-1" /> {(t as any)?.hide || "Hide"}</>
                        : <><Eye className="h-3 w-3 mr-1" /> {(t as any)?.show || "Show"}</>}
                    </Button>
                  </div>
                  {showAtt && (
                    <div className="border rounded-xl overflow-hidden text-xs">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 text-[11px] font-bold">
                            {mode === "by_session" && (
                              <th className="py-2 px-3 w-10 text-center no-print">{(t as any)?.select || "Select"}</th>
                            )}
                            <th className="py-2 px-3 w-8 text-center">#</th>
                            <th className="py-2 px-3 w-28">{t?.date || "Date"}</th>
                            <th className="py-2 px-3">{t?.homework || "Homework / Note"}</th>
                            <th className="py-2 px-3 text-right w-28">{t?.feePerOne || "Fee"}</th>
                          </tr>
                        </thead>
                        <tbody>
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
                              <tr key={a.id} className={`border-t ${isChecked ? "bg-blue-50/50" : ""}`}>
                                {mode === "by_session" && (
                                  <td className="py-2 px-3 text-center no-print align-top">
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
                                <td className="py-2 px-3 align-top text-center">{i + 1}</td>
                                <td className="py-2 px-3 align-top font-medium whitespace-nowrap">
                                  {fmtDate(a.schedule_events?.event_date)}
                                </td>
                                <td className="py-2 px-3 align-top">
                                  <Input
                                    type="text"
                                    className="no-print h-8 text-xs w-full"
                                    value={hwDraftVal}
                                    placeholder="Note / Homework..."
                                    onChange={(e) => setHomeworkDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                    onBlur={(e) => updateHomeworkNote(a, e.target.value)}
                                  />
                                  <span className="print:inline hidden text-xs">{a.homework_note || "—"}</span>
                                </td>
                                <td className="py-2 px-3 text-right align-top">
                                  <span className="print:inline hidden text-xs">{formatVND(fee)}</span>
                                  <Input
                                    type="number"
                                    className="no-print h-8 text-right w-28 ml-auto text-xs"
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

              {/* Total summary */}
              <div className="flex justify-end pt-1">
                <div className="w-full sm:w-64 space-y-1.5 p-3 rounded-xl bg-muted/30 border">
                  <div className="flex justify-between text-xs text-muted-foreground font-medium">
                    <span>{(t as any)?.subtotal || "Subtotal"}</span>
                    <span>{formatVND(billTotal)}</span>
                  </div>
                  <div
                    className="flex justify-between font-bold text-base px-3 py-1.5 rounded-lg"
                    style={{ background: `${accent}44` }}
                  >
                    <span>{(t as any)?.totalDue || "Total due"}</span>
                    <span className="text-lg font-black">{formatVND(billTotal)}</span>
                  </div>
                </div>
              </div>

              {/* VietQR Payment Card */}
              <div className="border-t pt-3">
                <div className="text-xs uppercase font-semibold text-muted-foreground mb-2">
                  {(t as any)?.mobileBankingPayment || "MOBILE BANKING PAYMENT"}
                </div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-muted/20 p-3.5 rounded-xl border">
                  <div className="space-y-1 text-xs w-full">
                    <div className="font-bold text-sm">{(t as any)?.scanToPayShort || "Scan QR to pay"}</div>
                    <div className="text-[11px] text-muted-foreground">{(t as any)?.scanQrInstr || "Use any banking app to scan the QR code and complete the payment."}</div>
                    <div className="pt-2 text-xs space-y-0.5 border-t mt-1">
                      <div>{t?.amount || "Amount"}: <span className="font-bold">{formatVND(billTotal)}</span></div>
                      <div className="font-mono text-[11px] break-all">{(t as any)?.reference || "Reference"}: <span className="bg-muted px-1.5 py-0.5 rounded">{billNum}</span></div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {qrUrl ? (
                      <img src={qrUrl} alt="VietQR" className="h-36 w-36 rounded-xl bg-white p-2 border shadow-sm object-contain" />
                    ) : (
                      <div className="text-xs text-muted-foreground no-print text-center p-3">
                        {t?.vietQR || "VietQR"}: <Link to="/settings" className="text-primary underline">{t?.settings || "Settings"}</Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Action Buttons */}
              <div className="no-print pt-1 flex flex-col items-end gap-2">
                {mode === "by_session" ? (
                  <Button
                    variant="success"
                    disabled={selectedSessionIds.size === 0}
                    onClick={paySelectedSessions}
                  >
                    <Check className="h-4 w-4 mr-1.5" />
                    {(t as any)?.markAsPaid || "Mark as paid"} ({selectedSessionIds.size})
                  </Button>
                ) : selectedCycles.size > 0 ? (
                  <Button variant="success" onClick={paySelectedCycles}>
                    <Check className="h-4 w-4 mr-1.5" />
                    {(t as any)?.markAsPaid || "Mark as paid"} ({selectedCycles.size})
                  </Button>
                ) : (
                  <Button variant={isPaid(current) ? "outline" : "success"} onClick={() => togglePaid(current)}>
                    <Check className="h-4 w-4 mr-1.5" />
                    {isPaid(current) ? (t?.unpaid || "Unpaid") : (t?.markPaid || "Mark as paid")}
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

              {/* Footnote */}
              <div className="border-t pt-3">
                <Label className="text-xs font-semibold no-print mb-1 block">{(t as any)?.footnote || "Bill footnote"}</Label>
                <Textarea
                  rows={2}
                  value={footnote}
                  onChange={(e) => setFootnote(e.target.value)}
                  placeholder={(t as any)?.footnoteDefault || "Thank you!"}
                  className="no-print text-xs"
                />
                {footnote && (
                  <div className="hidden print:block text-xs italic text-center pt-2 text-muted-foreground">
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