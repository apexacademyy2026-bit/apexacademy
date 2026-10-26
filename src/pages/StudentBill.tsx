import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Printer, Check, X, Plus, Eye, EyeOff, Image as ImageIcon, Sparkles, Receipt, Calendar, Pencil } from "lucide-react";
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
import { resolveStudentColor } from "@/lib/studentColor";

// Tên và số điện thoại giáo viên sửa trên hoá đơn được nhớ trong trình duyệt (dùng chung cho mọi học sinh)
const TEACHER_NAME_KEY = "bill_teacher_name";
const TEACHER_PHONE_KEY = "bill_teacher_phone";
const readStored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStored = (key: string, val: string | null) => {
  try {
    if (val === null) localStorage.removeItem(key);
    else localStorage.setItem(key, val);
  } catch {
    /* bỏ qua nếu trình duyệt chặn lưu trữ */
  }
};

/* ---------- Thành phần nhỏ dùng trong hoá đơn ---------- */

function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="text-xs font-medium text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-800">{children}</div>
    </div>
  );
}

function BankRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-slate-200/80 py-2 last:border-0">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-sm font-semibold text-slate-900">{children}</dd>
    </div>
  );
}

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
  const [editing, setEditing] = useState(false);
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});
  const [homeworkDraft, setHomeworkDraft] = useState<Record<string, string>>({});
  const [footnote, setFootnote] = useState<string>("");
  // null = chưa sửa, dùng thông tin trong hồ sơ
  const [teacherNameOv, setTeacherNameOv] = useState<string | null>(() => readStored(TEACHER_NAME_KEY));
  const [teacherPhoneOv, setTeacherPhoneOv] = useState<string | null>(() => readStored(TEACHER_PHONE_KEY));
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

  // Chỉ lấy các buổi học sinh có mặt (present = true):
  // buổi vắng hoặc chưa điểm danh không nằm trong danh sách này nên không bị tính học phí
  // Khóa riêng cho hóa đơn: không dùng chung với trang lịch sử điểm danh (trang đó cần cả buổi vắng),
  // nếu không hóa đơn có thể lấy nhầm dữ liệu đã lưu sẵn của trang kia và tính tiền cả buổi vắng.
  // Luôn tải lại khi mở trang, và lọc present = true thêm một lần ở phía ứng dụng cho chắc.
  const { data: attendance } = useQuery({
    queryKey: ["student-bill-attendance", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("attendance")
        .select("*, schedule_events(event_date, start_time, end_time, class_id)")
        .eq("student_id", id)
        .eq("present", true);
      return (data || []).filter((a: any) => a.present === true);
    },
    enabled: !!id,
    staleTime: 0,
    refetchOnMount: "always",
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
      return cycles
        .map(({ periodStart, periodEnd }) => {
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
        })
        // Kỳ mà học sinh không có buổi nào có mặt (vắng cả kỳ / chưa điểm danh) thì không tính học phí,
        // trừ khi kỳ đó đã có thanh toán được ghi nhận
        .filter(
          (b) => b.attendances.length > 0 || (payments || []).some((p: any) => p.cycle_label === b.cycle_label)
        );
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

  // Chọn / bỏ chọn tất cả các buổi chưa thanh toán trong danh sách
  const allSessionsSelected = availableAttendance.length > 0 && selectedSessionsArray.length === availableAttendance.length;
  const toggleAllSessions = () => {
    setSelectedSessionIds(allSessionsSelected ? new Set() : new Set(availableAttendance.map((a: any) => a.id)));
  };

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

  const accent = resolveStudentColor(student?.color, student?.id ?? "");
  const safeStudentName = student?.name ? student.name.trim().toUpperCase().replace(/\s+/g, '') : "STUDENT";
  const sessionsCount = mode === "by_session"
    ? (selectedSessionIds.size > 0 ? selectedSessionIds.size : availableAttendance.length)
    : (displayBill?.attendances?.length || 0);
  const billNum = `${safeStudentName}_${sessionsCount}BUOI`;

  // Nội dung chuyển khoản trong mã QR dùng đúng mã hiển thị trên hoá đơn (billNum),
  // không dùng displayBill.cycle_label vì nhãn đó chỉ là nhãn nội bộ (vd. "TEN_BuoiLe").
  const qrContent = billNum;
  const qrUrl = displayBill && profile?.bank_code && profile?.bank_account_number
    ? vietQRUrl(profile?.bank_code, profile?.bank_account_number, profile?.bank_account_name, billTotal, qrContent)
    : null;

  // Thông tin phục vụ giao diện hoá đơn
  const billPaid =
    mode === "by_session"
      ? false
      : selectedCycles.size > 0
        ? selectedCyclesArray.length > 0 && selectedCyclesArray.every((b: any) => isPaid(b))
        : isPaid(current);

  // Tên và số điện thoại giáo viên: lấy từ hồ sơ, trừ khi đã sửa trực tiếp trên hoá đơn
  const profileTeacherName = String(profile?.display_name || t?.teacher || "Giáo viên");
  const profileTeacherPhone = String((profile as any)?.phone || "");
  const teacherName = (teacherNameOv ?? "").trim() || profileTeacherName;
  const teacherPhone = teacherPhoneOv !== null ? teacherPhoneOv.trim() : profileTeacherPhone;
  const teacherInitial = teacherName.trim().charAt(0).toUpperCase() || "G";
  const teacherEdited = teacherNameOv !== null || teacherPhoneOv !== null;
  const issueDate = fmtDate(new Date());

  const onTeacherNameChange = (val: string) => {
    setTeacherNameOv(val);
    writeStored(TEACHER_NAME_KEY, val);
  };
  const onTeacherNameBlur = () => {
    // Để trống tên thì quay về tên trong hồ sơ
    if (!(teacherNameOv ?? "").trim()) {
      setTeacherNameOv(null);
      writeStored(TEACHER_NAME_KEY, null);
    }
  };
  const onTeacherPhoneChange = (val: string) => {
    setTeacherPhoneOv(val);
    writeStored(TEACHER_PHONE_KEY, val);
  };
  const resetTeacherInfo = () => {
    setTeacherNameOv(null);
    setTeacherPhoneOv(null);
    writeStored(TEACHER_NAME_KEY, null);
    writeStored(TEACHER_PHONE_KEY, null);
  };

  /* ---------- Hành động ---------- */

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

  // Làm mới dữ liệu điểm danh của hóa đơn và của trang lịch sử điểm danh
  const refreshAttendance = () => {
    qc.invalidateQueries({ queryKey: ["student-bill-attendance", id] });
    qc.invalidateQueries({ queryKey: ["student-attendance-all", id] });
  };

  const updateFee = async (a: any, val: string) => {
    const num = val === "" ? null : Number(val);
    await supabase.from("attendance").update({ fee_override: num }).eq("id", a.id);
    refreshAttendance();
  };

  const updateHomeworkNote = async (a: any, val: string) => {
    await supabase.from("attendance").update({ homework_note: val }).eq("id", a.id);
    refreshAttendance();
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
    refreshAttendance();
  };

  // Tắt chế độ chỉnh sửa trước khi in / lưu ảnh để hoá đơn luôn ở dạng sạch
  const withViewMode = async (fn: () => void | Promise<void>) => {
    if (editing) {
      setEditing(false);
      await new Promise((r) => setTimeout(r, 150));
    }
    await fn();
  };

  const handlePrint = () => withViewMode(() => window.print());

  const saveAsImage = () =>
    withViewMode(async () => {
      if (!billRef.current) return;
      try {
        const dataUrl = await toPng(billRef.current, {
          cacheBust: true,
          backgroundColor: "#ffffff",
          pixelRatio: 2,
          // Bỏ các phần chỉ dành cho màn hình (nút, ô nhập...) khỏi ảnh
          filter: (node) => !(node instanceof HTMLElement && node.classList?.contains("no-print")),
        });
        const link = document.createElement("a");
        link.download = `${displayBill?.cycle_label || "bill"}.png`;
        link.href = dataUrl;
        link.click();
      } catch (e: any) {
        toast.error(e.message || "Error");
      }
    });

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
            border: none !important;
            border-radius: 0 !important;
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
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>
      <div className="no-print relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-6 font-['Be_Vietnam_Pro',sans-serif] sm:px-8">
        <div className="pointer-events-none absolute -right-14 -top-16 h-44 w-44 rounded-full" style={{ background: accent }} />
        <div className="relative space-y-5">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Quay lại"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div
              className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white ring-2 ring-white/90 [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
              style={{ background: accent }}
            >
              {(student.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-extrabold tracking-tight text-white">Hóa đơn học phí</h1>
              <p className="truncate text-sm text-white/70">{student.name}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 rounded-xl bg-white/10 p-1">
              <button
                type="button"
                aria-pressed={mode === "monthly"}
                onClick={() => { setMode("monthly"); setSelected(null); setSelectedCycles(new Set()); }}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  mode === "monthly" ? "bg-white text-[#0B1B3A]" : "text-white/75 hover:text-white"
                }`}
              >
                <Calendar className="h-4 w-4" /> {t?.payByMonth || "Pay monthly"}
              </button>
              <button
                type="button"
                aria-pressed={mode === "by_session"}
                onClick={() => { setMode("by_session"); setSelected(null); setSelectedSessionIds(new Set()); }}
                className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 ${
                  mode === "by_session" ? "bg-white text-[#0B1B3A]" : "text-white/75 hover:text-white"
                }`}
              >
                <Receipt className="h-4 w-4" /> {t?.payBySession || "Pay by session"}
              </button>
            </div>
            <Button onClick={saveAsImage} className="h-10 gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20">
              <ImageIcon className="h-4 w-4" /> {(t as any)?.saveAsImage || "Save as image"}
            </Button>
            <Button onClick={handlePrint} className="h-10 gap-2 rounded-xl bg-[#FFB547] px-4 text-sm font-bold text-[#0B1B3A] hover:bg-[#ffc266]">
              <Printer className="h-4 w-4" /> {t?.printBill || "Print bill"}
            </Button>
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* LEFT COLUMN: Controls & Cycle Selector */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4 no-print font-['Be_Vietnam_Pro',sans-serif]">
          <Card className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-[#FFB547]" />
                <h3 className="text-base font-bold text-slate-900">
                  {mode === "monthly" ? (t?.cycle || "Cycle") : ((t as any)?.sessionList || "Session List")}
                </h3>
              </div>
              <div className="flex gap-2">
                {mode === "monthly" && selectedCycles.size > 0 && (
                  <Button onClick={paySelectedCycles} className="h-9 gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-500">
                    <Check className="h-4 w-4" /> {(t as any)?.markAsPaid || "Pay"} ({selectedCycles.size})
                  </Button>
                )}
                {mode === "by_session" && selectedSessionIds.size > 0 && (
                  <Button onClick={paySelectedSessions} className="h-9 gap-1.5 rounded-xl bg-emerald-600 px-3 text-sm font-bold text-white hover:bg-emerald-500">
                    <Check className="h-4 w-4" /> {(t as any)?.markAsPaid || "Pay"} ({selectedSessionIds.size})
                  </Button>
                )}
                <Button variant="outline" onClick={() => setAddOpen((o) => !o)} className="h-9 gap-1.5 rounded-xl border-slate-200 px-3 text-sm font-semibold text-slate-700">
                  <Plus className="h-4 w-4" /> {t?.addAttendance || "Add attendance"}
                </Button>
              </div>
            </div>

            {addOpen && (
              <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">{t?.date || "Date"}</Label>
                  <Input type="date" className="h-10 rounded-xl border-slate-200 bg-white text-sm" value={addForm.date} onChange={(e) => setAddForm({ ...addForm, date: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">{t?.class || "Class"}</Label>
                  <Select value={addForm.class_id} onValueChange={(v) => setAddForm({ ...addForm, class_id: v })}>
                    <SelectTrigger className="h-10 rounded-xl border-slate-200 bg-white text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {myClasses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium text-slate-700">{t?.homework || "Homework"}</Label>
                  <Textarea rows={2} className="rounded-xl border-slate-200 bg-white text-sm" value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} />
                </div>
                <div className="flex justify-end">
                  <Button onClick={addAttendance} className="h-9 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]">{t?.save || "Save"}</Button>
                </div>
              </div>
            )}

            {/* Chọn / bỏ chọn tất cả các buổi (đặt ngoài vùng cuộn để luôn nhìn thấy) */}
            {mode === "by_session" && availableAttendance.length > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2">
                <span className="text-xs font-medium text-slate-500">
                  Đã chọn <b className="font-bold text-slate-800">{selectedSessionsArray.length}</b>/{availableAttendance.length} buổi
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={toggleAllSessions}
                  className="h-8 gap-1.5 rounded-lg border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  {allSessionsSelected ? <X className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                  {allSessionsSelected ? "Bỏ chọn tất cả" : "Chọn tất cả"}
                </Button>
              </div>
            )}

            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {mode === "monthly" ? (
                bills.map((b) => {
                  const paid = isPaid(b);
                  const isChecked = selectedCycles.has(b.cycle_label);
                  return (
                    <div
                      key={b.cycle_label}
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        isChecked ? "border-[#0B1B3A] bg-[#0B1B3A]/[0.04] ring-1 ring-[#0B1B3A]" : "border-slate-200 hover:bg-slate-50"
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
                      <div className="flex min-w-0 items-center gap-3">
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
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                            <span className="truncate">{b.cycle_label}</span>
                            {paid ? (
                              <button
                                type="button"
                                title="Bấm để hủy đánh dấu đã đóng"
                                className="cursor-pointer rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-rose-50 hover:text-rose-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  togglePaid(b);
                                }}
                              >
                                Đã thanh toán (hủy)
                              </button>
                            ) : (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">Chưa thanh toán</span>
                            )}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">{b.description}</div>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-slate-900">{formatVND(effectiveAmount(b))}</div>
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
                      className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors ${
                        isChecked ? "border-[#0B1B3A] bg-[#0B1B3A]/[0.04] ring-1 ring-[#0B1B3A]" : "border-slate-200 hover:bg-slate-50"
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
                      <div className="flex min-w-0 items-center gap-3">
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
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900">
                            Buổi {idx + 1}, {fmtDate(a.schedule_events?.event_date)}
                          </div>
                          <div className="max-w-[180px] truncate text-xs text-slate-500">
                            {a.homework_note || (t as any)?.noNote || "Chưa có ghi chú"}
                          </div>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-bold text-slate-900">{formatVND(fee)}</div>
                    </div>
                  );
                })
              )}
              {((mode === "monthly" && bills.length === 0) || (mode === "by_session" && availableAttendance.length === 0)) && (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-8 text-center text-sm text-slate-500">
                  {t?.nothingHere || "Không có dữ liệu"}
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* RIGHT COLUMN: Hoá đơn */}
        <div className="lg:col-span-7 xl:col-span-8 flex justify-center font-['Be_Vietnam_Pro',sans-serif]">
          {displayBill && (
            <div className="w-full max-w-2xl space-y-4">

              {/* Thanh công cụ (không in, không vào ảnh) */}
              <div className="no-print flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-slate-500">Xem trước hóa đơn</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 gap-1.5 rounded-xl border-slate-200 text-sm font-semibold text-slate-700"
                    onClick={() => setShowAtt((s) => !s)}
                  >
                    {showAtt
                      ? <><EyeOff className="h-4 w-4" /> {(t as any)?.hide || "Ẩn danh sách buổi học"}</>
                      : <><Eye className="h-4 w-4" /> {(t as any)?.show || "Hiện danh sách buổi học"}</>}
                  </Button>
                  <Button
                    size="sm"
                    variant={editing ? "default" : "outline"}
                    className={`h-9 gap-1.5 rounded-xl text-sm font-semibold ${
                      editing ? "bg-[#0B1B3A] text-white hover:bg-[#13285a]" : "border-slate-200 text-slate-700"
                    }`}
                    onClick={() => setEditing((e) => !e)}
                  >
                    {editing
                      ? <><Check className="h-4 w-4" /> Xong</>
                      : <><Pencil className="h-4 w-4" /> Sửa hóa đơn</>}
                  </Button>
                </div>
              </div>

              {/* ===== HOÁ ĐƠN ===== */}
              <div
                ref={billRef}
                className="printable-bill-card relative w-full overflow-hidden rounded-3xl border border-slate-200 bg-white text-slate-900 shadow-xl"
              >
                {/* Dải màu của học sinh */}
                <div className="h-2 w-full" style={{ background: accent }} />

                {/* Đầu hoá đơn */}
                <div className="px-8 pb-6 pt-7">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#0B1B3A] text-base font-extrabold text-white">
                        {teacherInitial}
                      </div>
                      {editing ? (
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <Input
                            type="text"
                            aria-label="Tên giáo viên"
                            className="no-print h-8 w-full max-w-[260px] border-slate-200 bg-white text-sm font-bold focus-visible:ring-1 focus-visible:ring-blue-400"
                            value={teacherNameOv ?? profileTeacherName}
                            placeholder="Tên giáo viên"
                            onChange={(e) => onTeacherNameChange(e.target.value)}
                            onBlur={onTeacherNameBlur}
                          />
                          <Input
                            type="tel"
                            inputMode="tel"
                            aria-label="Số điện thoại giáo viên"
                            className="no-print h-8 w-full max-w-[260px] border-slate-200 bg-white text-xs focus-visible:ring-1 focus-visible:ring-blue-400"
                            value={teacherPhoneOv ?? profileTeacherPhone}
                            placeholder="Số điện thoại"
                            onChange={(e) => onTeacherPhoneChange(e.target.value)}
                          />
                          {teacherEdited && (
                            <button
                              type="button"
                              onClick={resetTeacherInfo}
                              className="no-print text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
                            >
                              Dùng lại thông tin trong hồ sơ
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900">{teacherName}</div>
                          <div className="truncate text-xs text-slate-500">{teacherPhone || "Giáo viên"}</div>
                        </div>
                      )}
                    </div>
                    <div className="max-w-[240px] shrink-0 text-right">
                      <div className="text-xs text-slate-400">{(t as any)?.billNo || "Mã hóa đơn"}</div>
                      <div className="mt-0.5 break-all font-mono text-[13px] font-bold text-slate-900">{billNum}</div>
                      <div className="mt-1.5 text-xs text-slate-500">Ngày lập {issueDate}</div>
                    </div>
                  </div>

                  <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-[28px] font-extrabold leading-none tracking-tight text-[#0B1B3A]">
                      {(t as any)?.invoice || "Hóa đơn thanh toán"}
                    </h2>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                        billPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${billPaid ? "bg-emerald-500" : "bg-amber-500"}`} />
                      {billPaid ? "Đã thanh toán" : "Chưa thanh toán"}
                    </span>
                  </div>

                  {/* Học sinh và kỳ học phí */}
                  <div className="mt-6 grid gap-5 border-y border-slate-200 py-5 sm:grid-cols-2 sm:gap-0 sm:divide-x sm:divide-slate-200">
                    <div className="flex items-center gap-3 sm:pr-6">
                      <div
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-extrabold text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.3)]"
                        style={{ background: accent }}
                      >
                        {(student.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-400">{(t as any)?.billedTo || "Học sinh"}</div>
                        <div className="truncate text-base font-bold text-slate-900">{student.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          {student.grade && <span>Lớp {student.grade}</span>}
                          {(student as any)?.phone && <span>{(student as any).phone}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 sm:pl-6">
                      <Field
                        label={mode === "monthly" ? (t?.period || "Kỳ thanh toán") : ((t as any)?.billedSessions || "Số buổi tính phí")}
                      >
                        {mode === "monthly"
                          ? (displayBill.period_start
                              ? <span className="text-[13px]">{fmtDate(displayBill.period_start)} – {fmtDate(displayBill.period_end)}</span>
                              : displayBill.description)
                          : `${displayBill.attendances?.length || 0} ${((t as any)?.sessionsCountUnit || "buổi")}`}
                      </Field>
                      <Field
                        label={mode === "monthly" ? (t?.feePerMonth || "Học phí mỗi tháng") : ((t as any)?.feePerSession || "Học phí mỗi buổi")}
                      >
                        {formatVND(Number(mode === "monthly" ? student.fee_per_month : student.fee_per_session))}
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Chi tiết các buổi học */}
                {displayBill.attendances?.length > 0 && showAtt && (
                  <div className="px-8">
                    <div className="mb-2 text-sm font-bold text-slate-900">
                      {(t as any)?.sessionDetails || "Chi tiết các buổi học"}
                    </div>
                    <table className="w-full border-collapse text-left text-[13px]">
                      <thead>
                        <tr className="border-b-2 text-xs font-semibold text-slate-500" style={{ borderColor: accent }}>
                          <th className="w-12 py-2.5 pr-3 text-center">STT</th>
                          <th className="w-28 py-2.5 pr-3">{t?.date || "Ngày học"}</th>
                          <th className="py-2.5 pr-3">{t?.homework || "Nội dung / ghi chú"}</th>
                          <th className="w-32 py-2.5 text-right">{t?.feePerOne || "Học phí"}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayBill.attendances.map((a: any, i: number) => {
                          const fee = Number(a.fee_override ?? student.fee_per_session ?? 0);
                          const feeDraftVal = feeDraft[a.id] ?? (a.fee_override == null ? "" : String(a.fee_override));
                          const hwDraftVal = homeworkDraft[a.id] ?? (a.homework_note || "");
                          return (
                            <tr key={a.id} className="break-inside-avoid border-b border-slate-100 last:border-0">
                              <td className="py-3 pr-3 text-center align-middle font-medium tabular-nums text-slate-400">{i + 1}</td>
                              <td className="whitespace-nowrap py-3 pr-3 align-middle font-semibold tabular-nums text-slate-800">
                                {fmtDate(a.schedule_events?.event_date)}
                              </td>
                              <td className="py-3 pr-3 align-middle text-slate-600">
                                {editing ? (
                                  <Input
                                    type="text"
                                    className="no-print h-8 border-slate-200 bg-white text-xs focus-visible:ring-1 focus-visible:ring-blue-400"
                                    value={hwDraftVal}
                                    placeholder="Thêm ghi chú..."
                                    onChange={(e) => setHomeworkDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                    onBlur={(e) => updateHomeworkNote(a, e.target.value)}
                                  />
                                ) : (
                                  a.homework_note || <span className="text-slate-300">—</span>
                                )}
                              </td>
                              <td className="py-3 text-right align-middle font-bold tabular-nums text-slate-900">
                                {editing ? (
                                  <Input
                                    type="number"
                                    className="no-print ml-auto h-8 w-28 border-slate-200 bg-white text-right text-xs focus-visible:ring-1 focus-visible:ring-blue-400"
                                    value={feeDraftVal}
                                    placeholder={String(student.fee_per_session || 0)}
                                    onChange={(e) => setFeeDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                                    onBlur={(e) => updateFee(a, e.target.value)}
                                  />
                                ) : (
                                  formatVND(fee)
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Tổng cộng */}
                <div className="px-8 pb-7 pt-5">
                  <div className="ml-auto w-full sm:w-80">
                    <div className="flex items-center justify-between py-1.5 text-sm text-slate-500">
                      <span>Số buổi tính phí</span>
                      <span className="font-semibold tabular-nums text-slate-800">{sessionsCount} buổi</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 border-t-2 border-[#0B1B3A] pt-3">
                      <span className="text-sm font-bold text-slate-900">Tổng cộng</span>
                      <span className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-[#0B1B3A]">
                        {formatVND(billTotal)}
                      </span>
                    </div>
                  </div>

                  {footnote && (
                    <p className="mt-6 whitespace-pre-line text-center text-sm italic text-slate-500">{footnote}</p>
                  )}
                </div>

                {/* Phiếu thanh toán: cắt rời theo đường đứt nét */}
                {qrUrl ? (
                  <div>
                    <div className="relative">
                      <div className="absolute -left-3 -top-3 h-6 w-6 rounded-full border border-slate-200 bg-background" />
                      <div className="absolute -right-3 -top-3 h-6 w-6 rounded-full border border-slate-200 bg-background" />
                      <div className="mx-6 border-t-2 border-dashed border-slate-300" />
                    </div>
                    <div className="bg-slate-50 px-8 pb-8 pt-7">
                      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
                        <div className="shrink-0 text-center">
                          <img
                            src={qrUrl}
                            alt="VietQR"
                            className="h-40 w-40 rounded-2xl border border-slate-200 bg-white p-2 object-contain"
                          />
                          <div className="mt-2 text-xs text-slate-500">Quét bằng app ngân hàng</div>
                        </div>
                        <div className="w-full min-w-0 flex-1">
                          <div className="text-base font-bold text-slate-900">
                            {(t as any)?.scanToPayShort || "Thanh toán qua chuyển khoản"}
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            {(t as any)?.scanQrInstr || "Mở ứng dụng ngân hàng, quét mã QR và giữ nguyên nội dung chuyển khoản."}
                          </p>
                          <dl className="mt-3">
                            {profile?.bank_code && <BankRow label="Ngân hàng">{profile.bank_code}</BankRow>}
                            {profile?.bank_account_name && <BankRow label="Chủ tài khoản">{profile.bank_account_name}</BankRow>}
                            {profile?.bank_account_number && (
                              <BankRow label="Số tài khoản">
                                <span className="font-mono tabular-nums">{profile.bank_account_number}</span>
                              </BankRow>
                            )}
                            <BankRow label="Số tiền">
                              <span className="tabular-nums">{formatVND(billTotal)}</span>
                            </BankRow>
                            <BankRow label="Nội dung">
                              <span
                                className="inline-block rounded-md px-2 py-0.5 font-mono text-[13px] font-bold text-[#0B1B3A]"
                                style={{ background: "#FFB54733" }}
                              >
                                {billNum}
                              </span>
                            </BankRow>
                          </dl>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="no-print border-t border-dashed border-slate-300 bg-slate-50 px-8 py-4 text-center text-xs text-slate-500">
                    {t?.vietQR || "VietQR"}:{" "}
                    <Link to="/settings" className="font-medium text-blue-600 underline">
                      {t?.settings || "Thiết lập"}
                    </Link>
                  </div>
                )}
              </div>

              {/* Phần dưới hoá đơn (không in, không vào ảnh) */}
              <div className="no-print space-y-3">
                <div className="flex justify-end">
                  {mode === "by_session" ? (
                    <Button
                      variant="success"
                      className="rounded-xl px-6 font-medium shadow-md"
                      disabled={selectedSessionIds.size === 0}
                      onClick={paySelectedSessions}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {(t as any)?.markAsPaid || "Đánh dấu đã thanh toán"} ({selectedSessionIds.size})
                    </Button>
                  ) : (
                    <Button
                      variant={isPaid(current) ? "outline" : "success"}
                      className={`rounded-xl px-6 font-medium ${isPaid(current) ? "border-red-300 text-red-600 hover:bg-red-50" : ""}`}
                      onClick={() => togglePaid(current)}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {isPaid(current) ? "Hủy đánh dấu đã đóng (Unpaid)" : (t?.markPaid || "Đã thanh toán")}
                    </Button>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <Label className="mb-1.5 block text-xs font-semibold text-slate-600">
                    {(t as any)?.footnote || "Lời cảm ơn / ghi chú cuối hóa đơn"}
                  </Label>
                  <Textarea
                    rows={2}
                    value={footnote}
                    onChange={(e) => setFootnote(e.target.value)}
                    placeholder={(t as any)?.footnoteDefault || "Cảm ơn quý phụ huynh và học sinh!"}
                    className="rounded-xl border-slate-200 bg-white text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}