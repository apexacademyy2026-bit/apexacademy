import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Check, Plus, Trash2, Eye, EyeOff, Image as ImageIcon } from "lucide-react";
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
  const [monthlyNotes, setMonthlyNotes] = useState<Record<string, string>>({});
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [homeworkDraft, setHomeworkDraft] = useState<Record<string, string>>({});
  const [footnote, setFootnote] = useState<string>("");
  const [selectedBills, setSelectedBills] = useState<Set<string>>(new Set());
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
        description: `${p.session_count || ""} ${t?.sessions || "sessions"} (${fmtDate(p.period_start)} – ${fmtDate(p.period_end)})`,
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
          description: `${g.length} ${t?.sessions || "sessions"} (${fmtDate(first)} – ${fmtDate(last)})`,
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
    if (selected) return;
    const first = bills.find((b) => !isPaid(b));
    if (first) setSelected(first.cycle_label);
    else if (bills.length) setSelected(bills[bills.length - 1].cycle_label);
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

  const current = bills.find((b) => b.cycle_label === selected) || bills[bills.length - 1];

  const selectedBillsArr = useMemo(
    () => bills.filter((b) => selectedBills.has(b.cycle_label)),
    [bills, selectedBills]
  );
  const isCombined = selectedBillsArr.length >= 2;
  const combinedBill = isCombined
    ? {
        cycle_type: "combined" as const,
        cycle_label: selectedBillsArr.map((b) => b.cycle_label).join(" + "),
        description: `${selectedBillsArr.length} ${t?.cycle || "cycles"}`,
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
  const { data: { session } } = await supabase.auth.getSession();
  const activeUserId = user?.id || student.user_id || session?.user?.id;
  if (!activeUserId) {
    toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!");
    return;
  }
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
    });
    if (error) { toast.error(error.message); return; }
  }
  qc.invalidateQueries({ queryKey: ["payments", id] });
  toast.success(t?.save || "Saved");
};

const paySelected = async () => {
  if (!student) return;
  const { data: { session } } = await supabase.auth.getSession();
  const activeUserId = user?.id || student.user_id || session?.user?.id;
  if (!activeUserId) {
    toast.error("Phiên đăng nhập hết hạn. Vui lòng đăng nhập lại!");
    return;
  }
  const toPay = bills.filter((b) => selectedBills.has(b.cycle_label) && !isPaid(b));
  if (toPay.length === 0) return;
  const rows = toPay.map((b) => ({
    user_id: activeUserId,
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

  const removeAttendance = async (a: any) => {
    if (!(await confirmDialog({ description: t?.confirmDelete || "Confirm delete?", destructive: true }))) return;
    await supabase.from("attendance").delete().eq("id", a.id);
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
            <Button size="sm" variant={mode === "monthly" ? "soft" : "ghost"} onClick={() => { setMode("monthly"); setSelected(null); }}>
              {t?.payByMonth || "Pay monthly"}
            </Button>
            <Button size="sm" variant={mode === "by_session" ? "soft" : "ghost"} onClick={() => { setMode("by_session"); setSelected(null); }}>
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
        {/* LEFT COLUMN: Cycles List */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 no-print">
          <Card className="p-5 border shadow-sm space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-base">{t?.cycle || "Cycle"}</h3>
              <div className="flex gap-2">
                {selectedBills.size > 0 && (
                  <Button size="sm" variant="success" onClick={paySelected}>
                    <Check className="h-3.5 w-3.5 mr-1" /> {(t as any)?.paySelected || "Pay selected"} ({selectedBills.size})
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
              {bills.map((b) => {
                const paid = isPaid(b);
                const isSelected = selectedBills.has(b.cycle_label);
                const active = selected === b.cycle_label;
                return (
                  <div
                    key={b.cycle_label}
                    className={`flex items-center justify-between gap-3 p-3 rounded-xl border transition-all cursor-pointer ${
                      active ? "bg-primary/10 border-primary/40 shadow-sm" : "hover:bg-muted/60 border-transparent"
                    }`}
                    onClick={() => setSelected(b.cycle_label)}
                  >
                    <div className="flex items-center gap-3">
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
              })}
              {bills.length === 0 && <div className="text-sm text-muted-foreground py-4 text-center">{t?.nothingHere || "Nothing here"}</div>}
            </div>

            {mode === "monthly" && (
              <p className="text-xs text-muted-foreground italic border-t pt-3">
                {t?.autoPaidByMonth || "Only auto-marked as paid once a payment is recorded for that month."}
              </p>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Invoice Document Preview */}
        <div className="lg:col-span-7 xl:col-span-8 flex justify-center">
          {displayBill && (
            <Card
  ref={billRef as any}
  className="print-area w-full max-w-2xl p-6 md:p-8 border rounded-2xl shadow-md print:shadow-none print:border-none print:p-0 bg-white text-foreground space-y-6" style={{ borderTop: `8px solid ${accent}` }}
            >
              {/* Invoice Header */}
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <div className="text-2xl font-black tracking-wider uppercase" style={{ color: accent }}>{(t as any)?.invoice || "INVOICE"}</div>
                  <div className="text-xs text-muted-foreground mt-1 break-all font-mono">{(t as any)?.billNo || "Bill No"}: {billNum}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-base">{profile?.display_name || t?.teacher || "Teacher"}</div>
                  <div className="text-xs text-muted-foreground">{(profile as any)?.phone || ""}</div>
                </div>
              </div>

              {/* Billed Info Grid */}
              <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-xl text-sm border">
                <div>
                  <div className="text-xs uppercase font-semibold text-muted-foreground">{(t as any)?.billedTo || "BILLED TO"}</div>
                  <div className="font-bold text-lg mt-1 inline-block px-2 py-0.5 rounded" style={{ background: `${accent}33` }}>
                    {student.name}
                  </div>
                  {student.grade && (
                    <div className="mt-2 text-xs">
                      <span className="px-2 py-0.5 rounded-full font-medium" style={{ background: `${accent}44` }}>
                        {student.grade}
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs uppercase font-semibold text-muted-foreground">
                    {displayBill.cycle_type === "monthly"
                      ? (t?.feePerMonth || "FEE PER MONTH")
                      : displayBill.cycle_type === "combined"
                      ? (t?.cycle || "CYCLE")
                      : (t?.feePerSession || "FEE PER SESSION")}
                  </div>
                  <div className="font-bold text-lg mt-1">
                    {displayBill.cycle_type === "combined"
                      ? `${selectedBillsArr.length}`
                      : formatVND(Number(displayBill.cycle_type === "monthly" ? student.fee_per_month : student.fee_per_session))}
                  </div>
                  <div className="text-xs uppercase font-semibold text-muted-foreground mt-2">
                    {displayBill.cycle_type === "monthly" ? (t?.period || "PERIOD") : (t?.sessions || "SESSIONS")}
                  </div>
                  <div className="font-bold text-base mt-1">
                    {displayBill.cycle_type === "monthly" ? displayBill.description : displayBill.attendances?.length || 0}
                  </div>
                </div>
              </div>

              {/* Notes (monthly) */}
              {displayBill.cycle_type === "monthly" && (
                <div className="no-print">
                  <Label className="text-xs font-semibold mb-1 block">{(t as any)?.notesLabel || "Notes"}</Label>
                  <Textarea
                    rows={2}
                    value={monthlyNotes[displayBill.cycle_label] || ""}
                    onChange={(e) => setMonthlyNotes((m) => ({ ...m, [displayBill.cycle_label]: e.target.value }))}
                    placeholder="Add notes..."
                  />
                </div>
              )}
              {displayBill.cycle_type === "monthly" && monthlyNotes[displayBill.cycle_label] && (
                <div className="hidden print:block text-sm border-l-2 pl-3 py-1" style={{ borderColor: accent }}>
                  <div className="text-xs uppercase font-semibold text-muted-foreground">{(t as any)?.notesLabel || "Notes"}</div>
                  <div>{monthlyNotes[displayBill.cycle_label]}</div>
                </div>
              )}

              {/* Combined parts breakdown */}
              {displayBill.cycle_type === "combined" && (
                <div className="space-y-2">
                  <div className="text-xs uppercase font-semibold text-muted-foreground">{t?.cycle || "Cycle"}</div>
                  <div className="rounded-xl overflow-hidden border">
                    <table className="w-full text-sm border-collapse">
                      <thead className="bg-muted/50">
                        <tr className="text-left text-xs font-semibold">
                          <th className="py-2 px-3 w-8">#</th>
                          <th className="py-2 px-3">{t?.bill || "Bill"}</th>
                          <th className="py-2 px-3">{t?.period || "Period"}</th>
                          <th className="py-2 px-3 text-right">{t?.amount || "Amount"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedBillsArr.map((b: any, i: number) => (
                          <tr key={b.cycle_label} className="border-t">
                            <td className="py-2 px-3 align-top">{i + 1}</td>
                            <td className="py-2 px-3 align-top break-all font-mono text-xs">{b.cycle_label}</td>
                            <td className="py-2 px-3 align-top">{b.description}</td>
                            <td className="py-2 px-3 text-right align-top font-semibold">{formatVND(effectiveAmount(b))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sessions table */}
              {displayBill.attendances?.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-xs uppercase font-semibold text-muted-foreground">
                      {(t as any)?.attendances || "ATTENDANCE"}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="no-print h-7 text-xs"
                      onClick={() => setShowAtt((s) => !s)}
                    >
                      {showAtt
                        ? <><EyeOff className="h-3 w-3 mr-1" /> {(t as any)?.hideAttendance || "Hide"}</>
                        : <><Eye className="h-3 w-3 mr-1" /> {(t as any)?.showAttendance || "Show"}</>}
                    </Button>
                  </div>

                  {showAtt && (
                    <div className="rounded-xl overflow-hidden border">
                      <table className="w-full text-sm border-collapse">
                        <thead className="bg-muted/50">
                          <tr className="text-left text-xs font-semibold">
                            <th className="py-2.5 px-3 w-8">#</th>
                            <th className="py-2.5 px-3">{t?.date || "Date"}</th>
                            <th className="py-2.5 px-3">{t?.homework || "Homework / note"}</th>
                            <th className="py-2.5 px-3 text-right">{t?.feePerOne || "Fee"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {displayBill.attendances.map((a: any, i: number) => {
                            const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
                            const feeDraftVal = feeDraft[a.id] ?? (a.fee_override == null ? "" : String(a.fee_override));
                            const hwDraftVal = homeworkDraft[a.id] ?? (a.homework_note || "");

                            return (
                              <tr key={a.id} className="border-t">
                                <td className="py-2 px-3 align-top">{i + 1}</td>
                                <td className="py-2 px-3 align-top font-medium whitespace-nowrap">{fmtDate(a.schedule_events?.event_date)}</td>
                                <td className="py-2 px-3 align-top">
                                  {/* Web input element */}
                                  <Input
                                    type="text"
                                    className="no-print h-8 text-xs w-full"
                                    value={hwDraftVal}
                                    placeholder="Note / Homework..."
                                    onChange={(e) => setHomeworkDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                    onBlur={(e) => { updateHomeworkNote(a, e.target.value); }}
                                  />
                                  {/* Print/Image static text */}
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
                                    onBlur={(e) => { updateFee(a, e.target.value); }}
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
              <div className="flex justify-end pt-2">
                <div className="w-full sm:w-64 space-y-1.5 p-3 rounded-xl bg-muted/30 border">
                  <div className="flex justify-between text-xs text-muted-foreground font-medium">
                    <span>{(t as any)?.subtotal || "Subtotal"}</span>
                    <span>{formatVND(billTotal)}</span>
                  </div>
                  <div
                    className="flex justify-between font-bold text-base px-3 py-2 rounded-lg"
                    style={{ background: `${accent}44` }}
                  >
                    <span>{(t as any)?.totalDue || "Total due"}</span>
                    <span className="text-lg font-black">{formatVND(billTotal)}</span>
                  </div>
                </div>
              </div>

              {/* VietQR Payment Card */}
              <div className="border-t pt-4">
                <div className="text-xs uppercase font-semibold text-muted-foreground mb-3">{(t as any)?.mobileBankingPayment || "MOBILE BANKING PAYMENT"}</div>
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6 bg-muted/20 p-4 rounded-xl border">
                  <div className="space-y-1.5 text-sm w-full">
                    <div className="font-bold text-base">{(t as any)?.scanToPayShort || "Scan QR to pay"}</div>
                    <div className="text-xs text-muted-foreground">{(t as any)?.scanQrInstr || "Use any banking app to scan the QR code and complete the payment."}</div>
                    <div className="pt-2 text-xs space-y-1 border-t">
                      <div>{t?.amount || "Amount"}: <span className="font-bold">{formatVND(billTotal)}</span></div>
                      <div className="font-mono text-[11px] break-all">{(t as any)?.reference || "Reference"}: <span className="bg-muted px-1.5 py-0.5 rounded">{billNum}</span></div>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    {qrUrl ? (
                      <img src={qrUrl} alt="VietQR" className="h-44 w-44 rounded-xl bg-white p-2 border shadow-sm object-contain" />
                    ) : (
                      <div className="text-xs text-muted-foreground no-print text-center p-4">
                        {t?.vietQR || "VietQR"}: <Link to="/settings" className="text-primary underline">{t?.settings || "Settings"}</Link>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Payment Action Buttons */}
              <div className="no-print pt-2 flex flex-col items-end gap-2">
                {displayBill.cycle_type === "combined" ? (
                  <Button variant="success" onClick={paySelected}>
                    <Check className="h-4 w-4 mr-1.5" />
                    {(t as any)?.paySelected || "Pay selected"} ({selectedBillsArr.length})
                  </Button>
                ) : (
                  <Button variant={isPaid(current) ? "outline" : "success"} onClick={() => togglePaid(current)}>
                    <Check className="h-4 w-4 mr-1.5" />
                    {isPaid(current) ? (t?.unpaid || "Unpaid") : (t?.markPaid || "Mark as paid")}
                  </Button>
                )}
                {displayBill.cycle_type === "session" && displayBill.attendances?.length > 0 && (
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-2 justify-end">
                    {displayBill.attendances.map((a: any) => (
                      <span key={a.id} className="inline-flex items-center gap-1 bg-muted px-2 py-0.5 rounded">
                        {fmtDate(a.schedule_events?.event_date)}
                        <button onClick={() => removeAttendance(a)} className="text-destructive hover:opacity-80">
                          <Trash2 className="h-3 w-3 inline" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Footnote */}
              <div className="border-t pt-4">
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