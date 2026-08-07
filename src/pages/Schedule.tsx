import { useEffect, useMemo, useState, useRef } from "react";
import { Plus, ChevronLeft, ChevronRight, Trash2, Check, Clock, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useEvents, useClasses, useClassSchedules, useEnrollments, useStudents, qk, useAttendance } from "@/hooks/useData";
import { toast } from "sonner";
import { addDays, startOfWeek, format, isSameDay } from "date-fns";
import { getStoredGoogleCalendarSelection, getStoredGoogleCalendarToken, listGoogleCalendarEvents } from "@/lib/google-calendar";
import { cn } from "@/lib/utils";

// Cấu hình khung giờ gọn gàng vừa khít 1 trang A4 Landscape (08:00 - 20:00)
const HOUR_START = 6;     // Bắt đầu từ 08:00
const HOUR_END = 23;      // Kết thúc 20:00
const HOUR_HEIGHT = 40;   // Thu gọn chiều cao ô giờ xuống 32px
const SCHEDULE_MAX_HEIGHT = 700;

const toMinutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};

function layoutColumns<T extends { start_time: string; end_time: string }>(events: T[]) {
  const sorted = [...events].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const cols: T[][] = [];
  const placed: { ev: T; col: number; cols: number }[] = [];
  for (const ev of sorted) {
    let col = 0;
    while (true) {
      const c = cols[col] || [];
      const overlap = c.some(
        (x) => toMinutes(ev.start_time) < toMinutes(x.end_time) && toMinutes(ev.end_time) > toMinutes(x.start_time)
      );
      if (!overlap) {
        cols[col] = [...c, ev];
        placed.push({ ev, col, cols: 0 });
        break;
      }
      col++;
    }
  }
  const total = Math.max(1, cols.length);
  return placed.map((p) => ({ ...p, cols: total }));
}

export default function Schedule() {
  const { t, user, lang } = useApp();
  const qc = useQueryClient();
  const [view, setView] = useState<"week" | "month">("week");
  const [anchor, setAnchor] = useState(new Date());
  const [eventDialog, setEventDialog] = useState<{ open: boolean; date?: Date; event?: any }>({ open: false });
  const [attDialog, setAttDialog] = useState<{ open: boolean; event?: any }>({ open: false });
  const [confirmDel, setConfirmDel] = useState<{ open: boolean; ev?: any }>({ open: false });
  const [googleEvents, setGoogleEvents] = useState<any[]>([]);
  const [googleCalendarBusy, setGoogleCalendarBusy] = useState(false);
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  /* ---------------- DIALOG THÊM SỰ KIỆN ---------------- */
  function EventDialog({ open, onOpenChange, date, classes, defaultHour }: any) {
    const { t, user } = useApp();
    const qc = useQueryClient();
    const [addToFixed, setAddToFixed] = useState(false);
    const [classId, setClassId] = useState("");
    const [start, setStart] = useState("18:00");
    const [end, setEnd] = useState("19:30");
    const [d, setD] = useState(format(date || new Date(), "yyyy-MM-dd"));
    const [notes, setNotes] = useState("");

    useEffect(() => {
      if (date) setD(format(date, "yyyy-MM-dd"));
      if (typeof defaultHour === "number") {
        const h = String(defaultHour).padStart(2, "0");
        const h2 = String(defaultHour + 1).padStart(2, "0");
        setStart(`${h}:00`);
        setEnd(`${h2}:30`);
      }
    }, [date, defaultHour, open]);

    const submit = async () => {
      if (!user || !classId) return;
      const { error } = await supabase.from("schedule_events").insert({
        user_id: user.id,
        class_id: classId,
        event_date: d,
        start_time: start,
        end_time: end,
        notes,
      });
      if (addToFixed) {
        const dayOfWeek = new Date(d).getDay();
        await supabase.from("class_schedules").insert({
          user_id: user.id,
          class_id: classId,
          day_of_week: dayOfWeek,
          start_time: start,
          end_time: end,
        });
      }
      if (error) toast.error(error.message);
      else {
        toast.success(t.save);
        qc.invalidateQueries({ queryKey: ["events"] });
        qc.invalidateQueries({ queryKey: ["class-schedules"] });
        onOpenChange(false);
        setClassId(""); setNotes(""); setAddToFixed(false);
      }
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl max-w-md">
          <DialogHeader><DialogTitle className="font-black text-slate-900">{t.addEvent}</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label className="text-xs font-bold text-slate-600 mb-1 block">{t.class}</Label>
              <Select value={classId} onValueChange={setClassId}>
                <SelectTrigger className="rounded-2xl h-10 border-slate-200 text-xs font-semibold"><SelectValue placeholder={t.class} /></SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {classes.map((c: any) => <SelectItem key={c.id} value={c.id} className="rounded-xl text-xs font-semibold">{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <Checkbox id="fixed-schedule" checked={addToFixed} onCheckedChange={(v) => setAddToFixed(!!v)} className="rounded-lg" />
              <Label htmlFor="fixed-schedule" className="text-xs font-bold text-slate-600 cursor-pointer">Thêm vào lịch cố định hàng tuần</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px] font-bold text-slate-500 mb-1 block">{t.startDate}</Label><Input type="date" className="rounded-xl h-9 text-xs" value={d} onChange={(e) => setD(e.target.value)} /></div>
              <div><Label className="text-[10px] font-bold text-slate-500 mb-1 block">Bắt đầu</Label><Input type="time" className="rounded-xl h-9 text-xs" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div><Label className="text-[10px] font-bold text-slate-500 mb-1 block">Kết thúc</Label><Input type="time" className="rounded-xl h-9 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <div><Label className="text-xs font-bold text-slate-600 mb-1 block">{t.notes}</Label><Textarea className="rounded-2xl border-slate-200 text-xs" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter className="pt-2">
            <Button variant="ghost" className="rounded-xl text-xs font-bold" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
            <Button className="rounded-xl text-xs font-bold bg-blue-600 text-white" onClick={submit}>{t.save}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  /* ---------------- DIALOG ĐIỂM DANH ---------------- */
  function AttendanceDialog({ open, onOpenChange, event, students, enrollments, classes, onDelete }: any) {
    const { t, user } = useApp();
    const qc = useQueryClient();
    const att = useAttendance(event?.id);
    const [rows, setRows] = useState<Record<string, { present: boolean; note: string }>>({});
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [evDate, setEvDate] = useState("");

    const enrolled = useMemo(() => {
      if (!event) return [];
      const sids = enrollments.filter((e: any) => e.class_id === event.class_id).map((e: any) => e.student_id);
      return students.filter((s: any) => sids.includes(s.id));
    }, [event, enrollments, students]);

    useEffect(() => {
      const init: any = {};
      enrolled.forEach((s: any) => {
        const a = (att.data || []).find((x: any) => x.student_id === s.id);
        init[s.id] = { present: a ? a.present : true, note: a?.homework_note || "" };
      });
      setRows(init);
    }, [enrolled, att.data]);

    useEffect(() => {
      if (event) {
        setStart((event.start_time || "").slice(0, 5));
        setEnd((event.end_time || "").slice(0, 5));
        setEvDate(event.event_date || "");
      }
    }, [event]);

    const cls = event && classes.find((c: any) => c.id === event.class_id);

    const save = async () => {
      if (!event || !user) return;
      let targetEventId = event.id;
      if (event.virtual || event.source === "google") {
        const { data: newEvent, error: insertError } = await supabase
          .from("schedule_events")
          .insert({
            user_id: user.id,
            class_id: event.class_id,
            event_date: evDate,
            start_time: start,
            end_time: end,
            notes: "Google Event Attendance"
          })
          .select()
          .single();
        if (insertError) {
          toast.error("Không thể tạo sự kiện điểm danh: " + insertError.message);
          return;
        }
        targetEventId = newEvent.id;
      } else {
        await supabase
          .from("schedule_events")
          .update({ start_time: start, end_time: end, event_date: evDate })
          .eq("id", targetEventId);
      }
      for (const s of enrolled) {
        const r = rows[s.id];
        const existing = (att.data || []).find((x: any) => x.student_id === s.id);
        
        if (existing) {
          await supabase.from("attendance").update({ 
            present: r.present, 
            homework_note: r.note,
            attendance_start_time: start as any,
            attendance_end_time: end as any
          } as any).eq("id", existing.id);
        } else {
          await supabase.from("attendance").insert({
            user_id: user.id,
            event_id: targetEventId,
            student_id: s.id,
            present: r.present,
            homework_note: r.note,
            attendance_date: evDate,
            attendance_start_time: start as any,
            attendance_end_time: end as any
          } as any);
        }
      }
      qc.invalidateQueries({ queryKey: ["events"] });
      qc.invalidateQueries({ queryKey: ["student-attendance"] });
      toast.success("Đã lưu điểm danh thành công!");
      onOpenChange(false);
    };

    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-3xl max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-black text-slate-900">
              <span className="h-3 w-3 rounded-full" style={{ background: cls?.color || "#3b82f6" }} />
              {cls?.name || event?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 my-2">
            <div><Label className="text-[10px] font-bold text-slate-400 block mb-1">{t.date}</Label><Input type="date" className="rounded-xl h-9 text-xs" value={evDate} onChange={(e) => setEvDate(e.target.value)} /></div>
            <div><Label className="text-[10px] font-bold text-slate-400 block mb-1">{t.startDate}</Label><Input type="time" className="rounded-xl h-9 text-xs" value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div><Label className="text-[10px] font-bold text-slate-400 block mb-1">{t.endDate}</Label><Input type="time" className="rounded-xl h-9 text-xs" value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-3 pt-2">
            <Label className="text-xs font-bold text-slate-700">Danh sách điểm danh</Label>
            {enrolled.length === 0 ? (
              <div className="text-xs font-semibold text-slate-400 py-4 text-center">{t.nothingHere}</div>
            ) : enrolled.map((s: any) => (
              <div key={s.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-100/80 space-y-2">
                <label className="flex items-center gap-2.5 font-bold text-xs text-slate-800 cursor-pointer">
                  <Checkbox
                    className="rounded-lg"
                    checked={rows[s.id]?.present ?? true}
                    onCheckedChange={(v) => setRows({ ...rows, [s.id]: { ...rows[s.id], present: !!v } })}
                  />
                  {s.name}
                </label>
                <Textarea
                  placeholder={t.homework}
                  className="text-xs rounded-xl bg-white border-slate-200"
                  value={rows[s.id]?.note || ""}
                  onChange={(e) => setRows({ ...rows, [s.id]: { ...rows[s.id], note: e.target.value } })}
                />
              </div>
            ))}
          </div>
          <DialogFooter className="flex justify-between gap-2 sm:justify-between pt-4">
            <Button variant="ghost" className="rounded-xl text-xs font-bold text-red-600 hover:bg-red-50" onClick={() => { onOpenChange(false); onDelete(event); }}>
              <Trash2 className="h-4 w-4" /> {t.delete}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" className="rounded-xl text-xs font-bold" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
              <Button className="rounded-xl text-xs font-bold bg-blue-600 text-white" onClick={save}><Check className="h-4 w-4" /> {t.save}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  useEffect(() => { document.title = `${t.schedule} — ${t.appName}`; }, [t]);
  
  useEffect(() => {
    if (view === "week" && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [view]);

  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const days = Array.from({ length: view === "week" ? 7 : 35 }, (_, i) => 
    addDays(view === "week" ? weekStart : startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1), { weekStartsOn: 1 }), i)
  );
  
  const fromISO = format(days[0], "yyyy-MM-dd");
  const toISO = format(days[days.length - 1], "yyyy-MM-dd");
  const events = useEvents(fromISO, toISO);
  const classes = useClasses();
  const schedules = useClassSchedules();
  const enrollments = useEnrollments();
  const students = useStudents();

  // Load Google Calendar
  useEffect(() => {
    const token = getStoredGoogleCalendarToken();
    const selected = getStoredGoogleCalendarSelection();
    if (!token || !selected.length) {
      setGoogleEvents([]);
      return;
    }
    let active = true;
    (async () => {
      try {
        setGoogleCalendarBusy(true);
        const items = await listGoogleCalendarEvents(token, selected, fromISO, toISO);
        if (active) setGoogleEvents(items);
      } catch {
        if (active) setGoogleEvents([]);
      } finally {
        if (active) setGoogleCalendarBusy(false);
      }
    })();
    return () => { active = false; };
  }, [fromISO, toISO]);

  // LOGIC ĐỒNG BỘ LỊCH
  const allEvents = useMemo(() => {
    const realEvents = (events.data || []).map((e: any) => ({ ...e, virtual: false }));
    const virtualEvents: any[] = [];
    days.forEach((dayDate) => {
      const dateStr = format(dayDate, "yyyy-MM-dd");
      const dayOfWeek = dayDate.getDay();
      (schedules.data || []).forEach((sched: any) => {
        if (sched.day_of_week === dayOfWeek) {
          const targetClass = (classes.data || []).find((c: any) => c.id === sched.class_id);
          const classStartDate = targetClass?.start_date ? format(new Date(targetClass.start_date), "yyyy-MM-dd") : null;
          if (classStartDate && dateStr < classStartDate) return;
          const hasRealEvent = realEvents.some(
            (re) => re.class_id === sched.class_id && re.event_date === dateStr
          );
          if (!hasRealEvent) {
            virtualEvents.push({
              id: `virtual-${sched.id}-${dateStr}`,
              class_id: sched.class_id,
              event_date: dateStr,
              start_time: sched.start_time,
              end_time: sched.end_time,
              virtual: true,
              title: targetClass?.name || "Lớp học",
            });
          }
        }
      });
    });

    const savedGoogleEventIds = new Set(
      realEvents.filter((r) => r.source === "google").map((r) => r.google_event_id)
    );
    const filteredGoogleEvents = googleEvents
      .filter((e) => !savedGoogleEventIds.has(e.id))
      .map((e) => {
        const linkedClass = (classes.data || []).find((c: any) => c.google_calendar_id === e.calendarId);
        return linkedClass 
          ? { ...e, title: linkedClass.name, class_id: linkedClass.id, source: "google", virtual: false }
          : { ...e, virtual: false };
      });
    return [...realEvents, ...virtualEvents, ...filteredGoogleEvents];
  }, [events.data, schedules.data, classes.data, days, googleEvents]);

  const classOf = (cid: string) => (classes.data || []).find((c: any) => c.id === cid);
  
  const hasFixedSlot = (ev: any) =>
    (schedules.data || []).some((s: any) => {
      const eventDay = new Date(`${ev.event_date}T00:00:00`).getDay();
      return s.class_id === ev.class_id && s.day_of_week === eventDay;
    });

  const requestDelete = (ev: any) => setConfirmDel({ open: true, ev });

  const deleteEvent = async (ev: any) => {
    if (ev.virtual) {
      const { error } = await supabase.from("schedule_events").insert({
        user_id: user!.id,
        class_id: ev.class_id,
        event_date: ev.event_date,
        start_time: ev.start_time,
        end_time: ev.end_time,
        notes: "__cancelled__",
      });
      if (error) toast.error(error.message);
      qc.invalidateQueries({ queryKey: ["events"] });
      return;
    }
    if (hasFixedSlot(ev)) {
      await supabase.from("schedule_events").update({ notes: "__cancelled__" }).eq("id", ev.id);
    } else {
      await supabase.from("schedule_events").delete().eq("id", ev.id);
    }
    qc.invalidateQueries({ queryKey: ["events"] });
  };

 const handlePrint = () => {
    const printArea = document.querySelector(".print-area");
    if (!printArea) {
      window.print();
      return;
    }

    // 1. Tạo iframe ẩn
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (doc) {
      // 2. Lấy toàn bộ các thẻ <style> và CSS Tailwind của ứng dụng
      const styles = Array.from(document.querySelectorAll("style, link[rel='stylesheet']"))
        .map((style) => style.outerHTML)
        .join("\n");

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Thời khóa biểu giảng dạy</title>
            ${styles}
            <style>
              body { 
                background: #fff !important; 
                color: #000 !important; 
                padding: 10px !important;
              }
              .print-hide { display: none !important; }
              .sticky { position: static !important; }
              .overflow-y-auto, .overflow-x-auto { overflow: visible !important; max-height: none !important; }
              @page { size: A4 landscape; margin: 5mm; }
            </style>
          </head>
          <body class="bg-white">
            <div class="text-center mb-4">
              <h2 class="text-lg font-black uppercase tracking-wide text-slate-900">THỜI KHÓA BIỂU GIẢNG DẠY</h2>
            </div>
            <div class="print-area">
              ${printArea.innerHTML}
            </div>
          </body>
        </html>
      `);
      doc.close();

      // 3. Đợi CSS load xong rồi mới bật AirPrint trên iOS
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        
        setTimeout(() => {
          if (document.body.contains(iframe)) {
            document.body.removeChild(iframe);
          }
        }, 1000);
      }, 400);
    } else {
      window.print();
    }
  };

  const visibleEvents = allEvents.filter((e: any) => e.notes !== "__cancelled__" && e.notes !== "__google_master__");
  const hours = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
  const totalH = hours.length * HOUR_HEIGHT;
  const weekDays = days.slice(0, 7);
  const eventsForDay = (d: Date) =>
    visibleEvents
      .filter((e: any) => e.event_date === format(d, "yyyy-MM-dd"))
      .sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));

  return (
  <div className="p-2 sm:p-6 pt-0 sm:pt-2 max-w-7xl mx-auto space-y-4 sm:space-y-6 animate-in fade-in duration-300">     {/* CSS CHUYÊN DỤNG CHO IN A4 LANDSCAPE & ÉP HIỂN THỊ SỰ KIỆN */}
<style>{`
  @media print {
    @page {
      size: A4 landscape;
      margin: 5mm;
    }
    
    /* Reset toàn bộ khung chứa để tràn 100% trang in */
    html, body, #root, main, .print-area {
      background: #fff !important;
      color: #000 !important;
      width: 100% !important;
      max-width: 100% !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* Ẩn các thành phần giao diện không dùng khi in */
    header, sidebar, nav, button, .print-hide, aside, [role="navigation"] {
      display: none !important;
    }

    /* Mở rộng bảng thời khóa biểu ra 100% chiều rộng trang */
    .print-area {
      display: block !important;
      width: 100% !important;
      border: none !important;
      box-shadow: none !important;
    }

    .print-area > div, 
    .print-area .min-w-\\[900px\\] {
      min-width: 100% !important;
      width: 100% !important;
    }

    /* Tắt scrollbar và sticky */
    .sticky, [class*="sticky"] {
      position: static !important;
    }
    
    .print-scroll-container {
      max-height: none !important;
      overflow: visible !important;
    }

    /* Ép hiển thị các sự kiện (thẻ lịch) và giữ nguyên màu sắc khi in */
    [data-event] {
      display: flex !important;
      visibility: visible !important;
      opacity: 1 !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      box-shadow: none !important;
    }
  }
`}</style>

      {/* HEADER WEBSITE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print-hide">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">{t.schedule}</h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            {lang === "vi" ? "Quản lý lịch dạy, ca học và điểm danh học sinh" : "Manage your weekly teaching sessions and attendance"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-white" onClick={() => setAnchor(addDays(anchor, view === "week" ? -7 : -30))}>
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </Button>
            <span className="px-3 text-xs font-bold text-slate-800 min-w-[90px] text-center">
              {format(anchor, "MMM yyyy")}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl hover:bg-white" onClick={() => setAnchor(addDays(anchor, view === "week" ? 7 : 30))}>
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </Button>
          </div>
          <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/60">
            <button
              onClick={() => setView("week")}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer", view === "week" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500")}
            >
              {t.weekView}
            </button>
            <button
              onClick={() => setView("month")}
              className={cn("px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer", view === "month" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500")}
            >
              {t.monthView}
            </button>
          </div>
          
          <Button 
            onClick={handlePrint}
            variant="outline"
            className="h-10 px-3.5 rounded-2xl border-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
          >
            <Printer className="h-4 w-4 text-slate-600" /> In lịch dạy
          </Button>
          <Button 
            onClick={() => setEventDialog({ open: true, date: new Date() })}
            className="h-10 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
          >
            <Plus className="h-4 w-4" /> {t.addEvent}
          </Button>
        </div>
      </div>

      {googleCalendarBusy && (
        <div className="text-xs font-semibold text-blue-600 bg-blue-50 p-3 rounded-2xl border border-blue-100 flex items-center gap-2 print-hide">
          <Clock className="h-4 w-4 animate-spin" /> Đang đồng bộ từ Google Calendar...
        </div>
      )}

      {/* TIÊU ĐỀ BẢN IN (Chỉ hiển thị khi in) */}
      <div className="hidden print:block text-center mb-2">
        <h2 className="text-base font-black uppercase text-slate-900 tracking-wide">
          THỜI KHÓA BIỂU GIẢNG DẠY
        </h2>
        <p className="text-[11px] font-bold text-slate-600 mt-0.5">
          Tuần: {format(weekDays[0], "dd/MM/yyyy")} - {format(weekDays[6], "dd/MM/yyyy")}
        </p>
      </div>

      {/* WEEK VIEW */}
      {view === "week" ? (
        <Card className="rounded-3xl border-slate-200/80 bg-white shadow-xs overflow-hidden print:overflow-visible print-area">
          <div className="overflow-x-auto print:overflow-visible">
            <div className="min-w-[900px] print:min-w-full">
              
              {/* Header Thứ / Ngày - Loại bỏ sticky khi in */}
              <div className="sticky top-0 print:static z-20 grid bg-slate-50 border-b border-slate-200/80" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
                <div className="p-2 text-right text-[10px] font-black uppercase text-slate-400 border-r border-slate-200/60">
                  Giờ
                </div>
                {weekDays.map((d, i) => {
                  const isToday = isSameDay(d, new Date());
                  return (
                    <div key={i} className={cn("p-2 text-center border-r border-slate-200/60 last:border-r-0", isToday && "bg-blue-50/50")}>
                      <div className="text-[10px] font-bold text-slate-400 uppercase">{t.daysLong[d.getDay()]}</div>
                      <div className={cn("text-sm font-black mt-0.5", isToday ? "text-blue-600" : "text-slate-800")}>
                        {format(d, "dd/MM")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Thân bảng giờ và các lớp học */}
              <div ref={scrollContainerRef} className="overflow-y-auto print-scroll-container" style={{ maxHeight: SCHEDULE_MAX_HEIGHT }}>
                <div className="grid relative" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
                  <div className="border-r border-slate-200/60 bg-slate-50/50" style={{ height: totalH }}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-100 text-[10px] font-bold text-slate-400 text-right pr-2 pt-1">
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>
                  {weekDays.map((d, di) => {
                    const evs = eventsForDay(d);
                    const laid = layoutColumns(evs as any);
                    return (
                      <div
                        key={di}
                        className="relative border-r border-slate-200/60 last:border-r-0 group cursor-pointer"
                        style={{ height: totalH }}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("[data-event]")) return;
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const y = e.clientY - rect.top;
                          const hour = Math.max(HOUR_START, Math.min(HOUR_END, Math.floor(y / HOUR_HEIGHT)));
                          setEventDialog({ open: true, date: d, event: { _newHour: hour } });
                        }}
                      >
                        {hours.map((h) => (
                          <div key={h} className="border-b border-slate-100/80" style={{ height: HOUR_HEIGHT }} />
                        ))}
                        {laid.map(({ ev, col, cols }: any) => {
                          const cls = classOf(ev.class_id);
                          const isGoogleEvent = ev.source === "google";
                          const startMin = toMinutes(ev.start_time) - HOUR_START * 60;
                          const endMin = toMinutes(ev.end_time) - HOUR_START * 60;
                          const top = (startMin / 60) * HOUR_HEIGHT;
                          const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2);
                          const widthPct = 100 / cols;
                          return (
                            <button
                              key={ev.id}
                              data-event
                              className="absolute rounded-xl p-1.5 text-xs text-left overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between"
                             style={{
  top,
  height,
  left: `calc(${col * widthPct}% + 2px)`,
  width: `calc(${widthPct}% - 4px)`,
  // Tăng độ đậm nền: dùng mã màu gốc đầy đủ (đổi từ + "20" nhạt sang đậm đà + "35" hoặc đậm hơn)
  backgroundColor: isGoogleEvent ? "#dbeafe" : (cls?.color ? cls.color + "35" : "#3b82f635"),
  borderLeft: `4px solid ${isGoogleEvent ? "#2563eb" : (cls?.color || "#2563eb")}`,
  borderStyle: ev.virtual ? "dashed" : "solid",
  color: "#0f172a",
}}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (ev.source === "google") {
                                  const targetClass = (classes.data || []).find((c: any) => c.google_calendar_id === ev.calendarId);
                                  if (!targetClass) {
                                    toast.error("Lịch Google này chưa được liên kết với lớp học nào.");
                                    return;
                                  }
                                  setAttDialog({ open: true, event: { ...ev, class_id: targetClass.id, virtual: true } });
                                } else {
                                  setAttDialog({ open: true, event: ev });
                                }
                              }}
                            >
                             <div>
  <div className="font-black text-slate-950 truncate text-[11.5px] tracking-tight">
    {isGoogleEvent ? ev.title : cls?.name || ev.title}
  </div>
  <div className="text-[9.5px] font-bold text-slate-700 flex items-center gap-0.5 mt-0.5">
    <Clock className="h-2.5 w-2.5 text-blue-600 shrink-0 print-hide" />
    <span>{ev.start_time.slice(0,5)} - {ev.end_time.slice(0,5)}</span>
  </div>
</div>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </Card>
      ) : (
        /* MONTH VIEW */
        <Card className="rounded-3xl border-slate-200/80 bg-white p-4 shadow-xs overflow-x-auto print-area">
          <div className="grid gap-2 grid-cols-7 min-w-[700px] print:min-w-full">
            {weekDays.map((d, i) => (
              <div key={i} className="text-xs font-black uppercase text-slate-400 text-center py-2">
                {t.daysLong[d.getDay()]}
              </div>
            ))}
            {days.map((d, i) => {
              const evs = eventsForDay(d);
              const isToday = isSameDay(d, new Date());
              return (
                <div
                  key={i}
                  className={cn(
                    "min-h-[100px] rounded-2xl border p-1.5 cursor-pointer hover:border-blue-400 transition-all",
                    isToday ? "border-blue-500 bg-blue-50/30" : "border-slate-100 bg-slate-50/50"
                  )}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-event]")) return;
                    setEventDialog({ open: true, date: d });
                  }}
                >
                  <div className={cn("text-xs font-black mb-1", isToday ? "text-blue-600" : "text-slate-700")}>
                    {format(d, "d/M")}
                  </div>
                  <div className="space-y-1">
                    {evs.map((ev: any) => {
                      const cls = classOf(ev.class_id);
                      const isGoogleEvent = ev.source === "google";
                      return (
                        <div
                          key={ev.id}
                          data-event
                          className="text-[9px] font-bold p-1 rounded-lg truncate hover:opacity-80 transition-opacity"
                          style={{
  backgroundColor: isGoogleEvent ? "#dbeafe" : (cls?.color ? cls.color + "35" : "#3b82f635"),
  color: "#0f172a",
  borderLeft: `3px solid ${isGoogleEvent ? "#2563eb" : (cls?.color || "#2563eb")}`
}}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (ev.source === "google") {
                              const targetClass = (classes.data || []).find((c: any) => c.google_calendar_id === ev.calendarId);
                              if (!targetClass) {
                                toast.error("Lịch Google này chưa được liên kết với lớp học nào.");
                                return;
                              }
                              setAttDialog({ open: true, event: { ...ev, class_id: targetClass.id, virtual: true } });
                            } else {
                              setAttDialog({ open: true, event: ev });
                            }
                          }}
                        >
                          {ev.start_time.slice(0,5)} {isGoogleEvent ? ev.title : cls?.name || ev.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* DIALOGS */}
      <EventDialog open={eventDialog.open} onOpenChange={(o) => setEventDialog({ open: o })} date={eventDialog.date} defaultHour={(eventDialog as any).event?._newHour} classes={classes.data || []} />
      <AttendanceDialog open={attDialog.open} onOpenChange={(o) => setAttDialog({ open: o })} event={attDialog.event} students={students.data || []} enrollments={enrollments.data || []} classes={classes.data || []} onDelete={requestDelete} />
      
      <AlertDialog open={confirmDel.open} onOpenChange={(o) => setConfirmDel({ open: o, ev: o ? confirmDel.ev : undefined })}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-slate-900">{(t as any).confirmDeleteTitle || t.confirmDelete}</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-semibold text-slate-500">{(t as any).confirmDeleteDesc || "Hành động này không thể hoàn tác."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl font-bold">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white"
              onClick={async () => {
                const ev = confirmDel.ev;
                setConfirmDel({ open: false });
                if (ev) await deleteEvent(ev);
              }}
            >
              {t.delete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}