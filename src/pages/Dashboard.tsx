import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Users, 
  GraduationCap, 
  Wallet, 
  CalendarClock, 
  TrendingUp, 
  Hourglass, 
  Filter,
  CheckCircle2,
  CalendarCheck2,
  UserCheck,
  ExternalLink
} from "lucide-react";
import { useApp } from "@/contexts/AppContext";
import { useStudents, useClasses, usePayments, useEvents, useEnrollments, useClassSchedules } from "@/hooks/useData";
import { formatVND, computeMonthlyCycles } from "@/lib/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export default function Dashboard() {
  const { t, profile, lang, user } = useApp();
  const queryClient = useQueryClient();
  const brandName = user?.user_metadata?.brand_name || "Phương anh";
  const students = useStudents();
  const classes = useClasses();
  const payments = usePayments();
  const events = useEvents();
  const enrollments = useEnrollments();
  const schedules = useClassSchedules();
  
  const attendanceAll = useQuery({
    queryKey: ["attendance", "all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("*");
      if (error) throw error;
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

  // YÊU CẦU 1: Gom nhóm ca học hôm nay theo Khung giờ & Lớp
  const todayShiftGroups = useMemo(() => {
    if (!todayEvents.length || !students.data) return [];

    return todayEvents.map((ev: any) => {
      const cls = (classes.data || []).find((c: any) => String(c.id) === String(ev.class_id));
      const enrolledStudentIds = new Set(
        (enrollments.data || [])
          .filter((e: any) => String(e.class_id) === String(ev.class_id))
          .map((e: any) => String(e.student_id))
      );
      const shiftStudents = students.data.filter((s: any) => enrolledStudentIds.has(String(s.id)));
      
      const timeLabel = ev.start_time 
        ? `${ev.start_time.slice(0, 5)}${ev.end_time ? ` - ${ev.end_time.slice(0, 5)}` : ''}`
        : "Cả ngày";

      return {
        event: ev,
        className: ev.title || cls?.name || "Lớp học",
        timeLabel,
        students: shiftStudents
      };
    });
  }, [todayEvents, classes.data, students.data, enrollments.data]);

  // Đồng bộ state điểm danh cho tất cả ca học
  useEffect(() => {
    if (!todayEvents.length || !attendanceAll.data) return;
    const initialMap: Record<string, Record<string, boolean>> = {};

    todayShiftGroups.forEach(group => {
      const evId = group.event.id;
      initialMap[evId] = {};
      const currentAtt = attendanceAll.data.filter((a: any) => String(a.event_id) === String(evId));

      group.students.forEach((s: any) => {
        const found = currentAtt.find((a: any) => String(a.student_id) === String(s.id));
        initialMap[evId][s.id] = found ? !!found.present : false;
      });
    });

    setAttendanceMap(initialMap);
  }, [todayShiftGroups, attendanceAll.data]);

  const toggleStudentAttendance = (eventId: string, studentId: string) => {
    setAttendanceMap(prev => ({
      ...prev,
      [eventId]: {
        ...(prev[eventId] || {}),
        [studentId]: !prev[eventId]?.[studentId]
      }
    }));
  };

  const handleSaveAllAttendance = async () => {
    if (!user || todayShiftGroups.length === 0) return;
    setSavingAttendance(true);
    try {
      const allUpdates: any[] = [];

      for (const group of todayShiftGroups) {
        let targetEventId = group.event.id;
        
        // Tạo sự kiện thật nếu là buổi ảo
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
            present
          });
        });
      }

      if (allUpdates.length > 0) {
        const { error } = await supabase
          .from("attendance")
          .upsert(allUpdates, { onConflict: "event_id,student_id" });
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
// 1. Kiểm tra danh sách học sinh (đảm bảo truyền đúng mảng)
const studentList = students?.data || students || [];

// 2. Tính tổng học phí
// Tính tổng học phí tất cả học sinh cho kỳ sắp tới
const totalUpcomingFee = useMemo(() => {
  const list = students?.data || [];
  if (!Array.isArray(list)) return 0;

  return list.reduce((sum: number, student: any) => {
    const fee = Number(
      student?.fee_per_month || 
      student?.fee_per_session || 
      student?.tuition_fee || 
      student?.fee || 
      0
    );
    return sum + fee;
  }, 0);
}, [students.data]);

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

  const totalRevenue = (students.data || []).reduce((totalSum, student: any) => {
    const studentCycles = student.cycles || [];
    const studentTotal = studentCycles.reduce((cycleSum: number, cycle: any) => {
      const sessionsCount = cycle.sessionsCount || cycle.attendance?.length || 0;
      const feePerSession = cycle.fee_per_session || student.fee_per_session || 0;
      return cycleSum + (sessionsCount * feePerSession);
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

  (students.data || []).forEach((s: any) => {
    const cycles = computeMonthlyCycles(s.start_date || "2026-04-01", today);
    cycles.forEach((c) => {
      const attInCycle = allPresentAttendance.filter((a: any) => {
        if (a.student_id !== s.id) return false;
        const ev = evList.find((e: any) => e.id === a.event_id);
        if (!ev || !ev.event_date) return false;
        const evDate = new Date(ev.event_date);
        return evDate >= c.start && evDate <= c.end;
      });

      if (attInCycle.length > 0) {
        const cycleAmount = attInCycle.reduce((sum: number, a: any) => {
          const fee = a.fee_override != null ? Number(a.fee_override) : Number(s.fee_per_session || s.fee_per_month || 0);
          return sum + fee;
        }, 0);

        const isPaid = payList.some((p: any) => {
          return p.student_id === s.id && (p.cycle_label === c.label || p.cycle_label?.includes(c.label));
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
  });

  // YÊU CẦU 3: Gom nhóm (Group) Upcoming Bills theo từng Học sinh
  const groupedUpcoming = useMemo(() => {
    const filtered = rawUpcoming.filter((u) =>
      payFilter === "all" ? true : payFilter === "paid" ? u.paid : !u.paid
    );

    const map: Record<string, {
      studentId: string;
      studentName: string;
      totalAmount: number;
      cycles: string[];
      isPaid: boolean;
      latestDue: Date;
    }> = {};

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

  return (
    <div className="space-y-7 max-w-6xl pb-10">
      
      {/* HEADER TIÊU ĐỀ */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            {t.dashboard}{" "}
            <span className="text-slate-400 font-medium text-lg">
              · {(profile as any)?.brand_name || profile?.display_name || ""}
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            {brandName} · <span className="text-blue-600 font-bold">{periodLabel}</span>
          </p>
        </div>
      </div>

      {/* 🌟 YÊU CẦU 1: WIDGET ĐIỂM DANH HIỂN THỊ TẤT CẢ CA HỌC NGHĨA LÀ KHÔNG CẦN DROPDOWN */}
     {/* 🌟 WIDGET ĐIỂM DANH TINH GỌN (COMPACT ATTENDANCE) */}
<Card className="p-4 border border-slate-100 shadow-xs rounded-2xl bg-white space-y-3">
  {/* Header + Nút Lưu gộp làm 1 hàng */}
  <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
    <div className="flex items-center gap-2">
      <div className="h-7 w-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-xs">
        <UserCheck className="h-3.5 w-3.5" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-black text-slate-900">
            {lang === "vi" ? "Điểm danh nhanh hôm nay" : "Today's Quick Attendance"}
          </h3>
          <span className="text-[10px] bg-blue-50 text-blue-600 font-bold px-1.5 py-0.2 rounded-md">
            {new Date().toLocaleDateString(lang === "vi" ? "vi-VN" : "en-US")}
          </span>
        </div>
        <p className="text-[10px] font-medium text-slate-400">
          {lang === "vi" ? "Tích chọn học sinh có mặt cho tất cả ca học hôm nay" : "Mark present students for all shifts today"}
        </p>
      </div>
    </div>

    {/* Nút lưu đưa lên Header */}
    {todayShiftGroups.length > 0 && (
      <Button
        onClick={handleSaveAllAttendance}
        disabled={savingAttendance}
        size="sm"
        className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 shrink-0"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        {savingAttendance 
          ? (lang === "vi" ? "Đang lưu..." : "Saving...") 
          : (lang === "vi" ? "Lưu điểm danh" : "Save Attendance")}
      </Button>
    )}
  </div>

  {/* Danh sách các ca học phẳng & siêu gọn */}
  {todayShiftGroups.length === 0 ? (
    <div className="text-xs text-slate-400 italic text-center py-4 bg-slate-50/50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center gap-1.5">
      <CalendarCheck2 className="h-3.5 w-3.5 text-slate-400" />
      {lang === "vi" ? "Hôm nay không có ca học nào!" : "No scheduled classes for today!"}
    </div>
  ) : (
    <div className="divide-y divide-slate-100">
      {todayShiftGroups.map((group) => {
        const evId = group.event.id;
        const shiftMap = attendanceMap[evId] || {};

        return (
          <div key={evId} className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            {/* Thông tin ca học trên 1 dòng */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-800">{group.className}</span>
              <span className="text-[10px] bg-slate-100 text-slate-500 font-mono px-1.5 py-0.5 rounded">
                🕒 {group.timeLabel}
              </span>
              <span className="text-[10px] text-slate-400">({group.students.length} HS)</span>
            </div>

            {/* Danh sách học sinh dạng Chip Pills siêu tiết kiệm không gian */}
            <div className="flex flex-wrap items-center gap-1.5">
              {group.students.length === 0 ? (
                <span className="text-[11px] text-slate-400 italic">Không có học sinh</span>
              ) : (
                group.students.map((student: any) => {
                  const isPresent = !!shiftMap[student.id];
                  return (
                    <button
                      key={student.id}
                      type="button"
                      onClick={() => toggleStudentAttendance(evId, student.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer select-none",
                        isPresent
                          ? "bg-emerald-500 text-white border-emerald-600 shadow-xs"
                          : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      <span className={cn(
                        "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] font-black",
                        isPresent ? "bg-white/20 text-white" : "bg-slate-200 text-slate-600"
                      )}>
                        {student.name ? student.name.slice(0, 1).toUpperCase() : "?"}
                      </span>
                      {student.name}
                      {isPresent && <CheckCircle2 className="h-3 w-3 text-white ml-0.5" />}
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

      {/* 🛠️ BỘ LỌC THỜI GIAN */}
      <Card className="p-4 border border-slate-100 shadow-sm rounded-2xl space-y-4 bg-white">
        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          {lang === "vi" ? "Bộ lọc thời gian" : "Time filter"}
        </div>
        
        <div className="flex flex-wrap items-center gap-4 justify-between">
          <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl border border-slate-200/40">
            {(
              [
                { k: "thisMonth", vi: "Tháng này", en: "This month" },
                { k: "lastMonth", vi: "Tháng trước", en: "Last month" },
                { k: "last3", vi: "3 tháng gần nhất", en: "Last 3 months" },
                { k: "thisYear", vi: "Năm nay", en: "This year" },
              ] as { k: PresetKey; vi: string; en: string }[]
            ).map((p) => (
              <button
                key={p.k}
                onClick={() => applyPreset(p.k)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                  preset === p.k 
                    ? "bg-white text-slate-950 shadow-sm" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {lang === "vi" ? p.vi : p.en}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-xl px-2.5 py-1.5">
              <span className="text-slate-400 font-medium">{lang === "vi" ? "Từ" : "From"}</span>
              <input type="date" value={fromDate} onChange={(e) => onCustomChange("from", e.target.value)} className="bg-transparent border-none focus:outline-none text-slate-800" />
            </div>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200/60 rounded-xl px-2.5 py-1.5">
              <span className="text-slate-400 font-medium">{lang === "vi" ? "Đến" : "To"}</span>
              <input type="date" value={toDate} onChange={(e) => onCustomChange("to", e.target.value)} className="bg-transparent border-none focus:outline-none text-slate-800" />
            </div>
            {preset === "custom" && (
              <Button variant="ghost" size="sm" onClick={() => applyPreset("thisMonth")} className="h-8 rounded-lg text-xs text-red-500 hover:text-red-600 hover:bg-red-50 font-bold">
                {lang === "vi" ? "Đặt lại" : "Reset"}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* 📊 GRID CÁC THẺ CARD SỐ LIỆU */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        
        {/* Active students */}
        <Link to="/students">
          <Card className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-center justify-between h-full transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer hover:border-blue-200">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">{lang === "vi" ? "Học sinh hoạt động" : "Active students"}</span>
              {loading ? <Skeleton className="h-8 w-20 mt-1" /> : <h3 className="text-2xl font-black text-slate-950 mt-0.5">{activeStudents}</h3>}
              <span className="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5 pt-1">{t.details} ↗</span>
            </div>
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-tr from-blue-500/10 to-indigo-500/10 text-blue-600">
              <Users className="h-5 w-5" />
            </div>
          </Card>
        </Link>

        {/* Active classes */}
        <Link to="/classes">
          <Card className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-center justify-between h-full transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer hover:border-emerald-200">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">{lang === "vi" ? "Lớp có hoạt động" : "Active classes"}</span>
              {loading ? <Skeleton className="h-8 w-20 mt-1" /> : <h3 className="text-2xl font-black text-slate-950 mt-0.5">{activeClasses}</h3>}
              <span className="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5 pt-1">{t.details} ↗</span>
            </div>
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-tr from-emerald-500/10 to-teal-500/10 text-emerald-600">
              <GraduationCap className="h-5 w-5" />
            </div>
          </Card>
        </Link>
        

{/* YÊU CẦU 2: Tổng học phí kỳ sắp tới kèm nút Chi tiết ↗ xem danh sách */}
{/* Thẻ hiển thị tổng học phí ở ngoài Dashboard */}
<Card className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-center justify-between h-full transform hover:-translate-y-0.5 transition-all duration-300 hover:border-amber-200">
  <div className="space-y-1">
    <span className="text-xs font-bold text-slate-400">
      {lang === "vi" ? "Tổng học phí kỳ sắp tới" : "Upcoming period tuition"}
    </span>
    {loading ? (
      <Skeleton className="h-8 w-20 mt-1" />
    ) : (
      <h3 className="text-2xl font-black text-slate-950 mt-0.5">
        {formatVND(totalUpcomingFee)}
      </h3>
    )}
    <button 
      onClick={() => setShowCollectedModal(true)}
      className="text-[10px] font-bold text-amber-600 hover:text-amber-700 inline-flex items-center gap-1 pt-1 underline cursor-pointer"
    >
      {lang === "vi" ? "Chi tiết" : "Details"} ↗
    </button>
  </div>
  <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-tr from-amber-500/10 to-orange-500/10 text-amber-600">
    <Wallet className="h-5 w-5" />
  </div>
</Card>

        {/* Payments count */}
        <Link to="/students">
          <Card className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-center justify-between h-full transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer hover:border-pink-200">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">{lang === "vi" ? "Số lần thanh toán" : "Payments count"}</span>
              {loading ? <Skeleton className="h-8 w-20 mt-1" /> : <h3 className="text-2xl font-black text-slate-950 mt-0.5">{paymentsCount}</h3>}
              <span className="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5 pt-1">{t.details} ↗</span>
            </div>
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-tr from-pink-500/10 to-rose-500/10 text-pink-600">
              <CalendarClock className="h-5 w-5" />
            </div>
          </Card>
        </Link>

        {/* Average / payment */}
        <Link to="/students">
          <Card className="p-5 rounded-2xl border border-slate-100 bg-white shadow-sm flex items-center justify-between h-full transform hover:-translate-y-0.5 transition-all duration-300 cursor-pointer hover:border-purple-200">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">{lang === "vi" ? "Trung bình / lần thu" : "Average / payment"}</span>
              {loading ? <Skeleton className="h-8 w-20 mt-1" /> : <h3 className="text-2xl font-black text-slate-950 mt-0.5">{formatVND(avgPayment)}</h3>}
              <span className="text-[10px] font-bold text-slate-500 inline-flex items-center gap-0.5 pt-1">{t.details} ↗</span>
            </div>
            <div className="h-12 w-12 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-tr from-purple-500/10 to-indigo-500/10 text-purple-600">
              <TrendingUp className="h-5 w-5" />
            </div>
          </Card>
        </Link>

        {/* Upcoming in period */}
        <Link to="/students">
          <Card className="p-5 rounded-2xl text-white shadow-md shadow-blue-500/10 border-0 bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-between relative overflow-hidden h-full transform hover:-translate-y-0.5 transition-transform duration-300 cursor-pointer">
            <div className="space-y-1 z-10">
              <span className="text-xs font-bold text-blue-100/70">{lang === "vi" ? "Học phí dự kiến trong kỳ" : "Upcoming in period"}</span>
              {loading ? <Skeleton className="h-8 w-24 bg-white/20 mt-1" /> : <h3 className="text-2xl font-black tracking-tight mt-0.5">{formatVND(pendingTotal)}</h3>}
              <span className="text-[10px] font-bold text-white/80 hover:text-white underline inline-flex items-center gap-0.5 pt-1">{t.details} ↗</span>
            </div>
            <div className="h-12 w-12 rounded-xl bg-white/10 backdrop-blur-sm flex items-center justify-center text-white z-10 shrink-0">
              <Hourglass className="h-5 w-5" />
            </div>
          </Card>
        </Link>

      </div>

      {/* 🔔 YÊU CẦU 3: SECTION UPCOMING BILLS GOM NHÓM THEO HỌC SINH */}
      <Card className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-white space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="text-sm font-black text-slate-950 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-amber-500" />
              {t.upcomingBills}
            </h3>
            <p className="text-[11px] font-medium text-slate-400">
              {lang === "vi" ? "Danh sách học phí tổng hợp gộp theo từng học sinh" : "Aggregated fee list grouped by student"}
            </p>
          </div>
          
          <div className="flex items-center bg-slate-50 border p-1 rounded-xl text-xs font-bold">
            {(["unpaid", "paid", "all"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setPayFilter(k)}
                className={cn(
                  "px-3 py-1 rounded-lg transition-all",
                  payFilter === k 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-900"
                )}
              >
                {k === "unpaid"
                  ? lang === "vi" ? "Chưa thu" : "Unpaid"
                  : k === "paid"
                  ? lang === "vi" ? "Đã thu" : "Paid"
                  : lang === "vi" ? "Tất cả" : "All"}
              </button>
            ))}
          </div>
        </div>

        {groupedUpcoming.length === 0 ? (
          <div className="text-xs text-slate-400 italic text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            {t.nothingHere}
          </div>
        ) : (
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {groupedUpcoming.map((item) => (
              <Link
                to={`/students`}
                key={item.studentId} 
                className="border border-slate-100 rounded-xl overflow-hidden bg-slate-50/50 p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-100/80 transition-all cursor-pointer block"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-9 w-9 rounded-lg flex items-center justify-center text-xs font-bold shadow-sm",
                    item.isPaid ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                  )}>
                    {item.studentName.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{item.studentName}</h4>
                    <p className="text-[10px] text-slate-500 font-medium">
                      Gộp {item.cycles.length} kỳ ({item.cycles.join(", ")})
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 ml-auto sm:ml-0">
                  <span className="text-sm font-black text-slate-950">{formatVND(item.totalAmount)}</span>
                  <span className={cn(
                    "text-[9px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border",
                    item.isPaid 
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" 
                      : "bg-amber-50 text-amber-700 border-amber-200/50",
                  )}>
                    {item.isPaid
                      ? lang === "vi" ? "Đã thu" : "Paid"
                      : lang === "vi" ? "Chưa thu" : "Unpaid"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

     {/* Modal danh sách học phí kỳ sắp tới */}
{/* Modal danh sách học phí kỳ sắp tới */}
<Dialog open={showCollectedModal} onOpenChange={setShowCollectedModal}>
  <DialogContent className="rounded-3xl max-w-md">
    <DialogHeader>
      <DialogTitle className="font-black text-slate-900">
        {lang === "vi" ? "Chi tiết học phí kỳ sắp tới" : "Upcoming Tuition Details"}
      </DialogTitle>
    </DialogHeader>

    <div className="space-y-3 my-2 max-h-[60vh] overflow-y-auto pr-1">
      {students.data && students.data.length > 0 ? (
        students.data.map((student: any) => {
          const fee = Number(
            student?.fee_per_month || 
            student?.fee_per_session || 
            student?.tuition_fee || 
            student?.fee || 
            0
          );

          return (
            <div 
              key={student.id} 
              className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs">
                  {student.name?.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="font-bold text-xs text-slate-900">{student.name}</div>
                  <div className="text-[10px] text-slate-400 font-semibold">
                    {student.code || student.phone || "Học sinh"}
                  </div>
                </div>
              </div>
              <div className="font-black text-xs text-emerald-600">
                +{formatVND(fee)}
              </div>
            </div>
          );
        })
      ) : (
        <div className="text-center text-xs text-slate-400 py-4">Chưa có dữ liệu học sinh</div>
      )}
    </div>
  </DialogContent>
</Dialog>

    </div>
  );
}