import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Users,
  GraduationCap,
  Wallet,
  CalendarClock,
  TrendingUp,
  Hourglass,
  CheckCircle2,
  CalendarCheck2,
  UserCheck,
  ChevronRight,
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useStudents, useClasses, usePayments, useEvents, useEnrollments, useClassSchedules } from "@/hooks/useData";
import { formatVND, computeMonthlyCycles } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { resolveStudentColor } from "@/lib/studentColor";

export default function Dashboard() {
  const { t, profile, lang, user } = useApp();
  const queryClient = useQueryClient();
  const brandName = user?.user_metadata?.brand_name || "Phương anh";

  const rawStudents = useStudents();
  const classes = useClasses();
  const payments = usePayments();
  const events = useEvents();
  const enrollments = useEnrollments();
  const schedules = useClassSchedules();

  // 🌟 ĐẢM BẢO CHỈ LẤY HỌC SINH THUỘC TÀI KHOẢN HIỆN TẠI (USER_ID)
  const students = useMemo(() => {
    const list = rawStudents?.data || rawStudents || [];
    if (!Array.isArray(list)) return [];
    if (!user?.id) return list;
    return list.filter((s: any) => !s.user_id || String(s.user_id) === String(user.id));
  }, [rawStudents, user?.id]);

  const attendanceAll = useQuery({
    queryKey: ["attendance", "all", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("*").eq("user_id", user.id);
      if (error) {
        // Fallback nếu bảng attendance chưa có cột user_id
        const { data: fallbackData, error: fbErr } = await supabase.from("attendance").select("*");
        if (fbErr) throw fbErr;
        return fallbackData || [];
      }
      return data || [];
    },
  });

  const [attendanceMap, setAttendanceMap] = useState<Record<string, Record<string, boolean>>>({});
  const [savingAttendance, setSavingAttendance] = useState(false);
  const [showCollectedModal, setShowCollectedModal] = useState(false);

  useEffect(() => {
    document.title = `${t.dashboard} — ${t.appName}`;
  }, [t]);

  const startOfThisMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  };
  const endOfThisMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth() + 1, 0);
  };
  const toISO = (d: Date | string) => {
    if (!d) return "";
    const dateObj = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dateObj.getTime())) return "";

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, "0");
    const day = String(dateObj.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  type PresetKey = "thisMonth" | "lastMonth" | "last3" | "thisYear" | "custom";
  const [preset, setPreset] = useState<PresetKey>("thisMonth");
  const [fromDate, setFromDate] = useState<string>(toISO(startOfThisMonth()));
  const [toDate, setToDate] = useState<string>(toISO(endOfThisMonth()));
  const [loading, setLoading] = useState(false);
  const [payFilter, setPayFilter] = useState<"unpaid" | "paid" | "all">("unpaid");
  const todayStr = useMemo(() => toISO(new Date()), []);

  // Lấy toàn bộ các sự kiện hôm nay
  const todayEvents = useMemo(() => {
    const allTodayRealEvents = (events.data || []).filter((e: any) => {
      if (!e.event_date) return false;
      const rawDateStr = String(e.event_date).slice(0, 10);
      const formattedDate = toISO(e.event_date);
      return rawDateStr === todayStr || formattedDate === todayStr;
    });
    const todayDow = new Date().getDay();
    const virtualTodayEvents = (schedules.data || [])
      .filter((sched: any) => sched.day_of_week === todayDow)
      .filter((sched: any) => !allTodayRealEvents.some((e: any) => e.class_id === sched.class_id))
      .map((sched: any) => {
        const cls = (classes.data || []).find((c: any) => c.id === sched.class_id);
        return {
          id: `virtual-${sched.id}-${todayStr}`,
          class_id: sched.class_id,
          event_date: todayStr,
          start_time: sched.start_time,
          end_time: sched.end_time,
          virtual: true,
          title: cls?.name || "Lớp học",
        };
      });
    const merged: any[] = [...allTodayRealEvents, ...virtualTodayEvents];
    return merged.filter((e: any) => e.notes !== "__cancelled__");
  }, [events.data, schedules.data, classes.data, todayStr]);

  // Gom nhóm ca học hôm nay theo Khung giờ & Lớp
  const todayShiftGroups = useMemo(() => {
    if (!todayEvents.length || !students) return [];
    return todayEvents.map((ev: any) => {
      const cls = (classes.data || []).find((c: any) => String(c.id) === String(ev.class_id));
      const enrolledStudentIds = new Set(
        (enrollments.data || [])
          .filter((e: any) => String(e.class_id) === String(ev.class_id))
          .map((e: any) => String(e.student_id))
      );
      const shiftStudents = students.filter((s: any) => enrolledStudentIds.has(String(s.id)));

      const timeLabel = ev.start_time
        ? `${ev.start_time.slice(0, 5)}${ev.end_time ? ` - ${ev.end_time.slice(0, 5)}` : ""}`
        : "Cả ngày";
      return {
        event: ev,
        className: ev.title || cls?.name || "Lớp học",
        timeLabel,
        students: shiftStudents,
      };
    });
  }, [todayEvents, classes.data, students, enrollments.data]);

  // Đồng bộ state điểm danh ban đầu cho tất cả ca học (Chỉ chạy khi có dữ liệu mới từ Database)
  useEffect(() => {
    if (!todayEvents.length || !attendanceAll.data) return;

    setAttendanceMap((prevMap) => {
      const newMap = { ...prevMap };

      todayShiftGroups.forEach((group) => {
        const evId = String(group.event.id);

        // Nếu ca học này chưa có trong map thì mới khởi tạo từ Database
        if (!newMap[evId]) {
          newMap[evId] = {};
          const currentAtt = attendanceAll.data.filter((a: any) => String(a.event_id) === evId);

          group.students.forEach((s: any) => {
            const studentIdStr = String(s.id);
            const found = currentAtt.find((a: any) => String(a.student_id) === studentIdStr);
            newMap[evId][studentIdStr] = found ? !!found.present : false;
          });
        }
      });

      return newMap;
    });
  }, [todayShiftGroups, attendanceAll.data]);

  const toggleStudentAttendance = (eventId: string | number, studentId: string | number) => {
    const eId = String(eventId);
    const sId = String(studentId);

    setAttendanceMap((prev) => {
      const currentShift = prev[eId] || {};
      return {
        ...prev,
        [eId]: {
          ...currentShift,
          [sId]: !currentShift[sId],
        },
      };
    });
  };

  const handleSaveAllAttendance = async () => {
    if (!user || todayShiftGroups.length === 0) return;
    setSavingAttendance(true);
    try {
      const allUpdates: any[] = [];
      for (const group of todayShiftGroups) {
        let targetEventId = group.event.id;

        if (group.event.virtual) {
          const { data: newEvent, error: insertError } = await supabase
            .from("schedule_events")
            .insert({
              user_id: user.id,
              class_id: group.event.class_id,
              event_date: group.event.event_date,
              start_time: group.event.start_time,
              end_time: group.event.end_time,
            })
            .select()
            .single();
          if (insertError) throw insertError;
          targetEventId = newEvent.id;
        }
        const shiftAttMap = attendanceMap[group.event.id] || {};
        Object.entries(shiftAttMap).forEach(([studentId, present]) => {
          allUpdates.push({
            user_id: user.id,
            event_id: targetEventId,
            student_id: studentId,
            present,
          });
        });
      }
      if (allUpdates.length > 0) {
        const { error } = await supabase.from("attendance").upsert(allUpdates, { onConflict: "event_id,student_id" });
        if (error) throw error;
      }
      toast.success(lang === "vi" ? "Đã lưu điểm danh tất cả các ca học!" : "Attendance saved for all shifts!");
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu điểm danh");
    } finally {
      setSavingAttendance(false);
    }
  };

  const applyPreset = (key: PresetKey) => {
    const today = new Date();
    let from = startOfThisMonth();
    let to = endOfThisMonth();
    if (key === "thisMonth") {
      from = new Date(today.getFullYear(), today.getMonth(), 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (key === "lastMonth") {
      from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      to = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (key === "last3") {
      from = new Date(today.getFullYear(), today.getMonth() - 2, 1);
      to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (key === "thisYear") {
      from = new Date(today.getFullYear(), 0, 1);
      to = new Date(today.getFullYear(), 11, 31);
    }
    setPreset(key);
    setFromDate(toISO(from));
    setToDate(toISO(to));
    setLoading(true);
    setTimeout(() => setLoading(false), 350);
  };

  const onCustomChange = (kind: "from" | "to", val: string) => {
    setPreset("custom");
    if (kind === "from") setFromDate(val);
    else setToDate(val);
    setLoading(true);
    setTimeout(() => setLoading(false), 350);
  };

  // 🌟 TÍNH TỔNG HỌC PHÍ KỲ SẮP TỚI (ĐÃ LỌC THEO USER)
  const totalUpcomingFee = useMemo(() => {
    if (!Array.isArray(students)) return 0;
    return students.reduce((sum: number, student: any) => {
      const fee = Number(student?.fee_per_month || student?.fee_per_session || student?.tuition_fee || student?.fee || 0);
      return sum + fee;
    }, 0);
  }, [students]);

  const inRange = (iso: string | Date) => {
    const d = new Date(iso);
    const from = fromDate ? new Date(fromDate) : null;
    const to = toDate ? new Date(toDate) : null;
    if (to) to.setHours(23, 59, 59, 999);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  };

  const filteredPayments = useMemo(
    () => (payments.data || []).filter((p: any) => inRange(p.paid_at)),
    [payments.data, fromDate, toDate],
  );

  const filteredEvents = useMemo(
    () => (events.data || []).filter((e: any) => inRange(e.event_date)),
    [events.data, fromDate, toDate],
  );

  const filteredAttendance = useMemo(() => {
    const evIds = new Set(filteredEvents.map((e: any) => e.id));
    return (attendanceAll.data || []).filter((a: any) => evIds.has(a.event_id) && a.present);
  }, [attendanceAll.data, filteredEvents]);

  const totalRevenue = students.reduce((totalSum, student: any) => {
    const studentCycles = student.cycles || [];
    const studentTotal = studentCycles.reduce((cycleSum: number, cycle: any) => {
      const sessionsCount = cycle.sessionsCount || cycle.attendance?.length || 0;
      const feePerSession = cycle.fee_per_session || student.fee_per_session || 0;
      return cycleSum + sessionsCount * feePerSession;
    }, 0);
    return totalSum + studentTotal;
  }, 0);

  const activeStudentIds = new Set<string>();
  filteredPayments.forEach((p: any) => p.student_id && activeStudentIds.add(p.student_id));
  filteredAttendance.forEach((a: any) => a.student_id && activeStudentIds.add(a.student_id));
  const activeStudents = activeStudentIds.size;

  const activeClassIds = new Set<string>();
  filteredEvents.forEach((e: any) => e.class_id && activeClassIds.add(e.class_id));
  const activeClasses = activeClassIds.size;

  const paymentsCount = filteredPayments.length;
  const avgPayment = paymentsCount > 0 ? totalRevenue / paymentsCount : 0;

  // Lấy danh sách hóa đơn
  const rawUpcoming: { studentId: string; studentName: string; due: Date; label: string; amount: number; paid: boolean }[] = [];
  const today = new Date();
  let pendingTotal = 0;
  const evList = events.data || [];
  const allPresentAttendance = (attendanceAll.data || []).filter((a: any) => a.present);
  const payList = payments.data || [];

  students.forEach((s: any) => {
    const isBySession =
      s.billing_type === "session" ||
      s.billing_type === "by_session" ||
      s.fee_type === "session" ||
      s.fee_type === "by_session" ||
      s.payment_mode === "by_session" ||
      s.payment_type === "session" ||
      s.payment_mode === "session";

    if (isBySession) {
      const studentAtts = allPresentAttendance.filter((a: any) => String(a.student_id) === String(s.id));
      const unpaidAtts: any[] = [];
      studentAtts.forEach((a: any) => {
        const ev = evList.find((e: any) => String(e.id) === String(a.event_id));
        if (!ev || !ev.event_date) return;
        const dateStr = String(ev.event_date).slice(0, 10);

        const isPaid = payList.some((p: any) => {
          if (String(p.student_id) !== String(s.id)) return false;
          if (String(p.attendance_id) === String(a.id)) return true;
          if (Array.isArray(p.attendance_ids) && p.attendance_ids.map(String).includes(String(a.id))) return true;
          if (p.period_start && p.period_end && dateStr >= p.period_start && dateStr <= p.period_end) return true;
          return false;
        });
        if (!isPaid) {
          unpaidAtts.push({ ...a, event_date: ev.event_date });
        }
      });
      if (unpaidAtts.length > 0) {
        const totalFee = unpaidAtts.reduce((sum: number, a: any) => {
          const fee = a.fee_override != null ? Number(a.fee_override) : Number(s.fee_per_session || s.tuition_fee || s.fee || 0);
          return sum + fee;
        }, 0);
        pendingTotal += totalFee;
        rawUpcoming.push({
          studentId: s.id,
          studentName: s.name,
          due: new Date(unpaidAtts[unpaidAtts.length - 1].event_date),
          label: `${unpaidAtts.length} buổi học`,
          amount: totalFee,
          paid: false,
        });
      }
    } else {
      const cycles = computeMonthlyCycles(s.start_date || "2026-04-01", today);
      cycles.forEach((c) => {
        const attInCycle = allPresentAttendance.filter((a: any) => {
          if (String(a.student_id) !== String(s.id)) return false;
          const ev = evList.find((e: any) => String(e.id) === String(a.event_id));
          if (!ev || !ev.event_date) return false;
          const evDate = new Date(ev.event_date);
          return evDate >= c.start && evDate <= c.end;
        });
        if (attInCycle.length > 0) {
          const cycleAmount = attInCycle.reduce((sum: number, a: any) => {
            const fee = a.fee_override != null ? Number(a.fee_override) : Number(s.fee_per_session || s.fee_per_month || s.tuition_fee || 0);
            return sum + fee;
          }, 0);
          const isPaid = payList.some((p: any) => {
            return String(p.student_id) === String(s.id) && (p.cycle_label === c.label || p.cycle_label?.includes(c.label));
          });
          if (!isPaid) {
            pendingTotal += cycleAmount;
          }
          rawUpcoming.push({
            studentId: s.id,
            studentName: s.name,
            due: c.end,
            label: c.label,
            amount: cycleAmount,
            paid: isPaid,
          });
        }
      });
    }
  });

  const groupedUpcoming = useMemo(() => {
    const filtered = rawUpcoming.filter((u) => (payFilter === "all" ? true : payFilter === "paid" ? u.paid : !u.paid));
    const map: Record<
      string,
      { studentId: string; studentName: string; totalAmount: number; cycles: string[]; isPaid: boolean; latestDue: Date }
    > = {};
    filtered.forEach((item) => {
      if (!map[item.studentId]) {
        map[item.studentId] = {
          studentId: item.studentId,
          studentName: item.studentName,
          totalAmount: 0,
          cycles: [],
          isPaid: item.paid,
          latestDue: item.due,
        };
      }
      map[item.studentId].totalAmount += item.amount;
      map[item.studentId].cycles.push(item.label);
      if (item.due > map[item.studentId].latestDue) {
        map[item.studentId].latestDue = item.due;
      }
    });
    return Object.values(map);
  }, [rawUpcoming, payFilter]);

  const periodLabel =
    preset === "thisMonth"
      ? lang === "vi" ? "Tháng này" : "This month"
      : preset === "lastMonth"
      ? lang === "vi" ? "Tháng trước" : "Last month"
      : preset === "last3"
      ? lang === "vi" ? "3 tháng gần nhất" : "Last 3 months"
      : preset === "thisYear"
      ? lang === "vi" ? "Năm nay" : "This year"
      : lang === "vi" ? "Tuỳ chỉnh" : "Custom";

  /* ---------------- GIAO DIỆN (đồng bộ với trang Học sinh) ---------------- */
  const vi = lang === "vi";

  // Màu riêng của từng học sinh, dùng chung bảng màu với trang Học sinh
  const studentColorMap = useMemo(
    () => new Map<string, string>(students.map((s: any) => [String(s.id), resolveStudentColor(s.color, s.id)])),
    [students],
  );
  const colorOf = (id: any) => studentColorMap.get(String(id)) || resolveStudentColor(null, String(id));
  const bubble = "grid place-items-center font-extrabold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]";

  const stats: {
    key: string;
    label: string;
    value: string | number;
    icon: any;
    tone: string;
    to?: string;
    onClick?: () => void;
    highlight?: boolean;
  }[] = [
    { key: "students", to: "/students", label: vi ? "Học sinh hoạt động" : "Active students", value: activeStudents, icon: Users, tone: "bg-indigo-50 text-indigo-600" },
    { key: "classes", to: "/classes", label: vi ? "Lớp có hoạt động" : "Active classes", value: activeClasses, icon: GraduationCap, tone: "bg-emerald-50 text-emerald-600" },
    { key: "tuition", onClick: () => setShowCollectedModal(true), label: vi ? "Tổng học phí kỳ sắp tới" : "Upcoming period tuition", value: formatVND(totalUpcomingFee), icon: Wallet, tone: "bg-amber-50 text-amber-600" },
    { key: "payments", to: "/students", label: vi ? "Số lần thanh toán" : "Payments count", value: paymentsCount, icon: CalendarClock, tone: "bg-rose-50 text-rose-600" },
    { key: "avg", to: "/students", label: vi ? "Trung bình / lần thu" : "Average / payment", value: formatVND(avgPayment), icon: TrendingUp, tone: "bg-violet-50 text-violet-600" },
    { key: "pending", to: "/students", label: vi ? "Học phí dự kiến trong kỳ" : "Upcoming in period", value: formatVND(pendingTotal), icon: Hourglass, tone: "bg-[#FFB547] text-[#0B1B3A]", highlight: true },
  ];

  const renderStat = (s: (typeof stats)[number]) => {
    const card = (
      <Card
        className={cn(
          "flex h-full items-center justify-between gap-3 rounded-2xl border p-5 transition-all",
          s.highlight
            ? "border-transparent bg-[#0B1B3A] text-white shadow-md hover:shadow-xl hover:shadow-[#0B1B3A]/20"
            : "border-slate-200 bg-white shadow-xs hover:border-slate-300 hover:shadow-lg hover:shadow-slate-900/5"
        )}
      >
        <div className="min-w-0 space-y-1">
          <span className={cn("text-sm font-medium", s.highlight ? "text-white/70" : "text-slate-500")}>{s.label}</span>
          {loading ? (
            <Skeleton className={cn("h-8 w-24", s.highlight && "bg-white/20")} />
          ) : (
            <h3 className="truncate text-2xl font-extrabold tracking-tight">{s.value}</h3>
          )}
          <span className={cn("inline-flex items-center gap-0.5 pt-0.5 text-xs font-semibold", s.highlight ? "text-[#FFB547]" : "text-slate-500")}>
            {t.details} <ChevronRight className="h-3.5 w-3.5" />
          </span>
        </div>
        <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", s.tone)}>
          <s.icon className="h-5 w-5" />
        </div>
      </Card>
    );
    return s.to ? (
      <Link key={s.key} to={s.to} className="block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]">
        {card}
      </Link>
    ) : (
      <button key={s.key} type="button" onClick={s.onClick} className="block h-full w-full rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]">
        {card}
      </button>
    );
  };

  const presets: { k: PresetKey; vi: string; en: string }[] = [
    { k: "thisMonth", vi: "Tháng này", en: "This month" },
    { k: "lastMonth", vi: "Tháng trước", en: "Last month" },
    { k: "last3", vi: "3 tháng gần nhất", en: "Last 3 months" },
    { k: "thisYear", vi: "Năm nay", en: "This year" },
  ];
  const segBtn = (active: boolean) =>
    cn(
      "h-9 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
      active ? "bg-white text-[#0B1B3A] shadow-sm" : "text-slate-500 hover:text-slate-900"
    );
  const datePill = "flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-xs focus-within:border-[#0B1B3A] focus-within:ring-2 focus-within:ring-[#0B1B3A]/20";

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#FFB547]" />
        <div className="pointer-events-none absolute -bottom-28 right-40 hidden h-60 w-60 rounded-full border-[36px] border-white/[0.07] sm:block" />
        <div className="relative max-w-lg space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.dashboard}</h1>
          <p className="text-sm leading-relaxed text-white/70">
            {vi ? "Số liệu của" : "Overview for"} {(profile as any)?.brand_name || profile?.display_name || brandName}, {periodLabel.toLowerCase()}.
          </p>
        </div>
      </div>

      {/* ĐIỂM DANH NHANH */}
      <Card className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#0B1B3A] text-white">
              <UserCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">{vi ? "Điểm danh nhanh hôm nay" : "Today's quick attendance"}</h3>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                  {new Date().toLocaleDateString(vi ? "vi-VN" : "en-US")}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {vi ? "Chọn học sinh có mặt cho tất cả ca học hôm nay" : "Mark present students for all shifts today"}
              </p>
            </div>
          </div>
          {todayShiftGroups.length > 0 && (
            <Button
              onClick={handleSaveAllAttendance}
              disabled={savingAttendance}
              className="h-10 shrink-0 gap-2 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {savingAttendance ? (vi ? "Đang lưu..." : "Saving...") : vi ? "Lưu điểm danh" : "Save attendance"}
            </Button>
          )}
        </div>

        {todayShiftGroups.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 py-6 text-sm text-slate-500">
            <CalendarCheck2 className="h-4 w-4" />
            {vi ? "Hôm nay không có ca học nào." : "No scheduled classes for today."}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {todayShiftGroups.map((group) => {
              const evId = group.event.id;
              const shiftMap = attendanceMap[evId] || {};
              return (
                <div key={evId} className="flex flex-col justify-between gap-3 py-3.5 first:pt-0 last:pb-0 lg:flex-row lg:items-center">
                  <div className="flex shrink-0 items-center gap-2.5">
                    <Link to={`/classes/${group.event.class_id}`} className="text-sm font-bold text-slate-900 hover:text-[#0B1B3A] hover:underline">
                      {group.className}
                    </Link>
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{group.timeLabel}</span>
                    <span className="text-xs text-slate-400">{group.students.length} HS</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {group.students.length === 0 ? (
                      <span className="text-xs text-slate-400">Không có học sinh</span>
                    ) : (
                      group.students.map((student: any) => {
                        const isPresent = !!shiftMap[String(student.id)];
                        const color = colorOf(student.id);
                        return (
                          <button
                            key={student.id}
                            type="button"
                            aria-pressed={isPresent}
                            onClick={() => toggleStudentAttendance(evId, student.id)}
                            className={cn(
                              "inline-flex select-none items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/40",
                              isPresent ? "text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.2)]" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                            )}
                            style={isPresent ? { background: color, borderColor: color } : undefined}
                          >
                            <span
                              className={cn("h-6 w-6 rounded-full text-xs", bubble, isPresent && "bg-white/25")}
                              style={isPresent ? undefined : { background: color }}
                            >
                              {student.name ? student.name.slice(0, 1).toUpperCase() : "?"}
                            </span>
                            {student.name}
                            {isPresent && <CheckCircle2 className="h-3.5 w-3.5" />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* BỘ LỌC THỜI GIAN */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit max-w-full flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
          {presets.map((p) => (
            <button key={p.k} type="button" aria-pressed={preset === p.k} onClick={() => applyPreset(p.k)} className={segBtn(preset === p.k)}>
              {vi ? p.vi : p.en}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className={datePill}>
            <span className="text-slate-500">{vi ? "Từ" : "From"}</span>
            <input type="date" value={fromDate} onChange={(e) => onCustomChange("from", e.target.value)} className="bg-transparent font-medium text-slate-900 focus:outline-none" />
          </label>
          <label className={datePill}>
            <span className="text-slate-500">{vi ? "Đến" : "To"}</span>
            <input type="date" value={toDate} onChange={(e) => onCustomChange("to", e.target.value)} className="bg-transparent font-medium text-slate-900 focus:outline-none" />
          </label>
          {preset === "custom" && (
            <Button variant="ghost" onClick={() => applyPreset("thisMonth")} className="h-10 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700">
              {vi ? "Đặt lại" : "Reset"}
            </Button>
          )}
        </div>
      </div>

      {/* SỐ LIỆU */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">{stats.map(renderStat)}</div>

      {/* HỌC PHÍ SẮP TỚI */}
      <Card className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{t.upcomingBills}</h3>
            <p className="text-xs text-slate-500">
              {vi ? "Học phí tổng hợp, gộp theo từng học sinh" : "Aggregated fees, grouped by student"}
            </p>
          </div>
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
            {(["unpaid", "paid", "all"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={payFilter === k} onClick={() => setPayFilter(k)} className={segBtn(payFilter === k)}>
                {k === "unpaid" ? (vi ? "Chưa thu" : "Unpaid") : k === "paid" ? (vi ? "Đã thu" : "Paid") : vi ? "Tất cả" : "All"}
              </button>
            ))}
          </div>
        </div>

        {groupedUpcoming.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-10 text-center text-sm text-slate-500">{t.nothingHere}</div>
        ) : (
          <div className="max-h-[22rem] space-y-2 overflow-y-auto pr-1">
            {groupedUpcoming.map((item) => (
              <Link
                to="/students"
                key={item.studentId}
                className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div className={cn("h-10 w-10 shrink-0 rounded-xl text-sm", bubble)} style={{ background: colorOf(item.studentId) }}>
                    {item.studentName.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-bold text-slate-900">{item.studentName}</h4>
                    <p className="truncate text-xs text-slate-500">
                      Gộp {item.cycles.length} kỳ ({item.cycles.join(", ")})
                    </p>
                  </div>
                </div>
                <div className="ml-auto flex items-center gap-4">
                  <span className="text-base font-extrabold text-slate-900">{formatVND(item.totalAmount)}</span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      item.isPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    )}
                  >
                    {item.isPaid ? (vi ? "Đã thu" : "Paid") : vi ? "Chưa thu" : "Unpaid"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      {/* POPUP CHI TIẾT HỌC PHÍ KỲ SẮP TỚI */}
      <Dialog open={showCollectedModal} onOpenChange={setShowCollectedModal}>
        <DialogContent className="max-h-[90vh] gap-0 overflow-hidden rounded-3xl border-0 p-0 font-['Be_Vietnam_Pro',sans-serif] sm:max-w-md">
          <div className="h-1.5 bg-[#FFB547]" />
          <DialogHeader className="space-y-1 border-b border-slate-100 px-6 py-5 text-left">
            <DialogTitle className="text-lg font-extrabold text-slate-900">
              {vi ? "Chi tiết học phí kỳ sắp tới" : "Upcoming tuition details"}
            </DialogTitle>
            <p className="text-sm text-slate-500">
              {vi ? "Tổng cộng" : "Total"} <span className="font-bold text-slate-900">{formatVND(totalUpcomingFee)}</span>
            </p>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto px-6 py-5">
            {students && students.length > 0 ? (
              students.map((student: any) => {
                const fee = Number(student?.fee_per_month || student?.fee_per_session || student?.tuition_fee || student?.fee || 0);
                return (
                  <div key={student.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className={cn("h-10 w-10 shrink-0 rounded-xl text-sm", bubble)} style={{ background: colorOf(student.id) }}>
                        {student.name ? student.name.slice(0, 2).toUpperCase() : "HS"}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-slate-900">{student.name}</div>
                        <div className="truncate text-xs text-slate-500">{student.code || student.phone || "Học sinh"}</div>
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-extrabold text-emerald-600">+{formatVND(fee)}</div>
                  </div>
                );
              })
            ) : (
              <div className="py-4 text-center text-sm text-slate-500">Chưa có dữ liệu học sinh</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}