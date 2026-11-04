import { useEffect, useMemo, useState, useRef } from "react";
import type { CSSProperties } from "react";
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
import { resolveStudentColor } from "@/lib/studentColor";

// Cấu hình khung giờ hiển thị của lịch tuần
const HOUR_START = 6;     // Bắt đầu từ 06:00
const HOUR_END = 23;      // Kết thúc 23:00
const HOUR_HEIGHT = 40;   // Chiều cao mỗi ô giờ
const SCHEDULE_MAX_HEIGHT = 700;

/* Design tokens: mực navy #0B1B3A · nền trắng · viền zinc mảnh · chữ xám trung tính.
   Màu của từng lớp (do người dùng chọn) là điểm nhấn chính: buổi đã có thật là khối màu đặc,
   buổi theo lịch cố định chưa tạo là khối nhạt viền nét đứt. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const FIELD = "h-10 rounded-xl border-zinc-200 bg-white text-sm shadow-none focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const LABEL = "text-sm font-medium text-zinc-700";
const DLG = `gap-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 shadow-xl ${FONT}`;
const PRIMARY = "h-10 gap-2 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white shadow-none hover:bg-[#13285a]";
const GHOST = "h-10 rounded-xl px-4 text-sm font-medium text-zinc-600 hover:bg-zinc-200/60";
const SEG = "flex items-center gap-0.5 rounded-full bg-zinc-100 p-1";
const GOOGLE_COLOR = "#4F46E5";

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền
const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#0B1B3A" : "#ffffff";
};
// Ô màu đặc, có quầng sáng cùng màu để nổi bật
const solid = (c: string): CSSProperties => ({
  background: c,
  color: inkOn(c),
  boxShadow: `0 8px 18px -8px ${c}`,
});
// Phủ một lớp màu nhạt lên nền trắng, và chữ đậm cùng tông
const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
const deep = (c: string) => `color-mix(in srgb, ${c} 62%, black)`;
// Khối buổi học: đã có thật → màu đặc; theo lịch cố định, chưa tạo → nhạt, viền nét đứt
const eventStyle = (color: string, virtual: boolean): CSSProperties =>
  virtual
    ? { background: wash(color, 16), color: deep(color), border: `1.5px dashed ${color}` }
    : { background: color, color: inkOn(color), border: `1.5px solid ${color}` };

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

/* ---------------- DIALOG THÊM SỰ KIỆN ---------------- */
// Đặt ngoài component Schedule để dữ liệu đang gõ không bị mất khi trang tải lại dữ liệu nền
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
      <DialogContent className={cn(DLG, "sm:max-w-md")}>
        <DialogHeader className="border-b border-zinc-100 px-6 py-5 text-left">
          <DialogTitle className="text-lg font-semibold text-zinc-900">{t.addEvent}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 px-6 py-5">
          <div className="space-y-1.5">
            <Label className={LABEL}>{t.class}</Label>
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger className={FIELD}><SelectValue placeholder={t.class} /></SelectTrigger>
              <SelectContent className="rounded-xl">
                {classes.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="fixed-schedule" checked={addToFixed} onCheckedChange={(v) => setAddToFixed(!!v)} className="rounded-md" />
            <Label htmlFor="fixed-schedule" className="cursor-pointer text-sm font-medium text-zinc-700">Thêm vào lịch cố định hàng tuần</Label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5"><Label className={LABEL}>{t.startDate}</Label><Input type="date" className={cn(FIELD, "px-2")} value={d} onChange={(e) => setD(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={LABEL}>Bắt đầu</Label><Input type="time" className={cn(FIELD, "px-2")} value={start} onChange={(e) => setStart(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className={LABEL}>Kết thúc</Label><Input type="time" className={cn(FIELD, "px-2")} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label className={LABEL}>{t.notes}</Label><Textarea className="rounded-xl border-zinc-200 text-sm shadow-none" value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter className="gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-4">
          <Button variant="ghost" className={GHOST} onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          <Button className={PRIMARY} onClick={submit}>{t.save}</Button>
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
  const clsColor = String(resolveStudentColor(cls?.color, cls?.id ?? event?.class_id ?? ""));

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
      <DialogContent className={cn(DLG, "max-h-[90vh] sm:max-w-lg")}>
        <div className="h-2 shrink-0" style={{ background: clsColor }} />
        <div className="flex max-h-[calc(90vh-8px)] flex-col">
          <DialogHeader className="border-b border-zinc-100 px-6 py-5 text-left">
            <DialogTitle className="text-lg font-semibold text-zinc-900">{cls?.name || event?.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1.5"><Label className={LABEL}>{t.date}</Label><Input type="date" className={cn(FIELD, "px-2")} value={evDate} onChange={(e) => setEvDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className={LABEL}>{t.startDate}</Label><Input type="time" className={cn(FIELD, "px-2")} value={start} onChange={(e) => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label className={LABEL}>{t.endDate}</Label><Input type="time" className={cn(FIELD, "px-2")} value={end} onChange={(e) => setEnd(e.target.value)} /></div>
            </div>
            <div className="space-y-2.5">
              <h3 className="text-sm font-semibold text-zinc-900">Danh sách điểm danh</h3>
              {enrolled.length === 0 ? (
                <div className="rounded-xl border border-dashed border-zinc-300 py-6 text-center text-sm text-zinc-500">{t.nothingHere}</div>
              ) : enrolled.map((s: any) => {
                const sc = String(resolveStudentColor(s.color, s.id));
                return (
                  <div key={s.id} className="space-y-2 rounded-xl border p-3" style={{ borderColor: wash(sc, 40), background: wash(sc, 5) }}>
                    <label className="flex cursor-pointer items-center gap-3 text-sm font-semibold text-zinc-900">
                      <Checkbox
                        className="rounded-md"
                        checked={rows[s.id]?.present ?? true}
                        onCheckedChange={(v) => setRows({ ...rows, [s.id]: { ...rows[s.id], present: !!v } })}
                      />
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-semibold" style={solid(sc)}>
                        {(s.name || "?").charAt(0).toUpperCase()}
                      </span>
                      {s.name}
                    </label>
                    <Textarea
                      placeholder={t.homework}
                      className="rounded-xl border-zinc-200 bg-white text-sm shadow-none"
                      value={rows[s.id]?.note || ""}
                      onChange={(e) => setRows({ ...rows, [s.id]: { ...rows[s.id], note: e.target.value } })}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-4 sm:justify-between">
            <Button variant="ghost" className="h-10 gap-2 rounded-xl px-3 text-sm font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => { onOpenChange(false); onDelete(event); }}>
              <Trash2 className="h-4 w-4" /> {t.delete}
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" className={GHOST} onClick={() => onOpenChange(false)}>{t.cancel}</Button>
              <Button className={PRIMARY} onClick={save}><Check className="h-4 w-4 text-[#FFB547]" /> {t.save}</Button>
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
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
              [data-event] { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
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

  /* ---------------- GIAO DIỆN ---------------- */
  const vi = lang === "vi";
  const colorOfEvent = (ev: any, cls: any) => (ev.source === "google" ? GOOGLE_COLOR : String(resolveStudentColor(cls?.color, cls?.id ?? ev.class_id ?? "")));
  const openEvent = (ev: any) => {
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
  };

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      {/* CSS CHUYÊN DỤNG CHO IN BẢNG THỜI KHÓA BIỂU A4 LANDSCAPE */}
      <style>{`
  @media print {
    /* 1. Ép trang in A4 Landscape gọn gàng trong 1 trang */
    @page {
      size: A4 landscape;
      margin: 6mm;
    }

    /* 2. Ẩn toàn bộ UI ứng dụng không liên quan */
    body * {
      visibility: hidden;
    }

    /* 3. Chỉ hiển thị duy nhất vùng print-area */
    .print-area, .print-area * {
      visibility: visible !important;
    }

    .print-area {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      box-shadow: none !important;
      border: none !important;
    }

    /* 4. Khôi phục layout Grid chuẩn cho A4 */
    .print-area .min-w-\\[900px\\] {
      min-width: 100% !important;
      width: 100% !important;
    }

    /* 5. Ép hiển thị các ô thẻ sự kiện sắc nét */
    [data-event] {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    /* 6. Tắt thanh cuộn để hiển thị đầy đủ các giờ */
    .overflow-y-auto, .overflow-x-auto, .print-scroll-container {
      overflow: visible !important;
      max-height: none !important;
      height: auto !important;
    }

    /* Ẩn bớt các nút thao tác / header web */
    .print-hide {
      display: none !important;
    }
  }
`}</style>

      {/* TIÊU ĐỀ */}
      <section className="print-hide flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{t.schedule}</h1>
          <p className="text-sm text-zinc-500">
            {vi ? "Quản lý lịch dạy, ca học và điểm danh học sinh." : "Manage your weekly teaching sessions and attendance."}
          </p>
        </div>
        <Button onClick={() => setEventDialog({ open: true, date: new Date() })} className={cn(PRIMARY, "shrink-0 self-start sm:self-auto")}>
          <Plus className="h-4 w-4 text-[#FFB547]" strokeWidth={2.5} /> {t.addEvent}
        </Button>
      </section>

      {/* TOOLBAR */}
      <div className="print-hide flex flex-wrap items-center gap-3">
        <div className={SEG}>
          <Button variant="ghost" size="icon" aria-label="Trước" className="h-8 w-8 rounded-full text-zinc-600 hover:bg-white" onClick={() => setAnchor(addDays(anchor, view === "week" ? -7 : -30))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[96px] px-2 text-center text-sm font-semibold text-zinc-900">{format(anchor, "MMM yyyy")}</span>
          <Button variant="ghost" size="icon" aria-label="Sau" className="h-8 w-8 rounded-full text-zinc-600 hover:bg-white" onClick={() => setAnchor(addDays(anchor, view === "week" ? 7 : 30))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className={SEG}>
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                "h-8 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                view === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
              )}
            >
              {v === "week" ? t.weekView : t.monthView}
            </button>
          ))}
        </div>

        <div className="hidden items-center gap-3 rounded-full bg-white/80 px-3 py-1.5 text-xs text-zinc-500 md:flex">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-zinc-800" /> Đã tạo buổi</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-zinc-500" /> Theo lịch cố định</span>
        </div>

        <Button onClick={handlePrint} variant="outline" className="ml-auto h-10 gap-2 rounded-xl border-zinc-200 bg-white px-4 text-sm font-medium text-zinc-700 shadow-none hover:bg-zinc-50">
          <Printer className="h-4 w-4" /> In lịch dạy
        </Button>
      </div>

      {googleCalendarBusy && (
        <div className="print-hide flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-medium text-zinc-600">
          <Clock className="h-4 w-4 animate-spin" /> Đang đồng bộ từ Google Calendar...
        </div>
      )}

      {/* TIÊU ĐỀ BẢN IN (Chỉ hiển thị khi in) */}
      <div className="mb-2 hidden text-center print:block">
        <h2 className="text-base font-black uppercase tracking-wide text-slate-900">THỜI KHÓA BIỂU GIẢNG DẠY</h2>
        <p className="mt-0.5 text-[11px] font-bold text-slate-600">
          Tuần: {format(weekDays[0], "dd/MM/yyyy")} - {format(weekDays[6], "dd/MM/yyyy")}
        </p>
      </div>

      {/* WEEK VIEW */}
      {view === "week" ? (
        <Card className="print-area gap-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-0 shadow-none print:overflow-visible">
          <div className="overflow-x-auto print:overflow-visible">
            <div className="min-w-[900px] print:min-w-full">

              {/* Header Thứ / Ngày - Loại bỏ sticky khi in */}
              <div className="sticky top-0 z-20 grid border-b border-zinc-200 bg-zinc-50 print:static" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
                <div className="border-r border-zinc-200 p-2 text-right text-xs font-medium text-zinc-400">Giờ</div>
                {weekDays.map((d, i) => {
                  const isToday = isSameDay(d, new Date());
                  return (
                    <div key={i} className="border-r border-zinc-200 p-2 text-center last:border-r-0">
                      <div className="text-xs font-medium text-zinc-500">{t.daysLong[d.getDay()]}</div>
                      <div className={cn("mx-auto mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold tabular-nums", isToday ? "bg-[#0B1B3A] text-white" : "text-zinc-800")}>
                        {format(d, "dd/MM")}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Thân bảng giờ và các lớp học */}
              <div ref={scrollContainerRef} className="print-scroll-container overflow-y-auto" style={{ maxHeight: SCHEDULE_MAX_HEIGHT }}>
                <div className="relative grid" style={{ gridTemplateColumns: "60px repeat(7, minmax(0, 1fr))" }}>
                  <div className="border-r border-zinc-200 bg-zinc-50/60" style={{ height: totalH }}>
                    {hours.map((h) => (
                      <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-zinc-100 pr-2 pt-1 text-right text-xs tabular-nums text-zinc-400">
                        {String(h).padStart(2, "0")}:00
                      </div>
                    ))}
                  </div>
                  {weekDays.map((d, di) => {
                    const evs = eventsForDay(d);
                    const laid = layoutColumns(evs as any);
                    const isToday = isSameDay(d, new Date());
                    return (
                      <div
                        key={di}
                        className={cn("group relative cursor-pointer border-r border-zinc-200 last:border-r-0", isToday && "bg-zinc-50")}
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
                          <div key={h} className="border-b border-zinc-100" style={{ height: HOUR_HEIGHT }} />
                        ))}
                        {laid.map(({ ev, col, cols }: any) => {
                          const cls = classOf(ev.class_id);
                          const isGoogleEvent = ev.source === "google";
                          const color = colorOfEvent(ev, cls);
                          const startMin = toMinutes(ev.start_time) - HOUR_START * 60;
                          const endMin = toMinutes(ev.end_time) - HOUR_START * 60;
                          const top = (startMin / 60) * HOUR_HEIGHT;
                          const height = Math.max(22, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2);
                          const widthPct = 100 / cols;
                          return (
                            <button
                              key={ev.id}
                              data-event
                              className="absolute flex cursor-pointer flex-col justify-between overflow-hidden rounded-lg p-1.5 text-left text-xs transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                              style={{
                                top,
                                height,
                                left: `calc(${col * widthPct}% + 2px)`,
                                width: `calc(${widthPct}% - 4px)`,
                                ...eventStyle(color, !!ev.virtual),
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEvent(ev);
                              }}
                            >
                              <div>
                                <div className="truncate text-[11.5px] font-semibold tracking-tight">
                                  {isGoogleEvent ? ev.title : cls?.name || ev.title}
                                </div>
                                <div className="mt-0.5 flex items-center gap-0.5 text-[10px] font-medium tabular-nums opacity-90">
                                  <Clock className="print-hide h-2.5 w-2.5 shrink-0" />
                                  <span>{ev.start_time.slice(0, 5)} - {ev.end_time.slice(0, 5)}</span>
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
        <Card className="print-area gap-0 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-none">
          <div className="grid min-w-[700px] grid-cols-7 gap-2 print:min-w-full">
            {weekDays.map((d, i) => (
              <div key={i} className="py-2 text-center text-xs font-medium text-zinc-500">
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
                    "min-h-[100px] cursor-pointer rounded-xl border p-1.5 transition-colors hover:border-zinc-400",
                    isToday ? "border-[#0B1B3A] bg-zinc-50" : "border-zinc-200 bg-white"
                  )}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("[data-event]")) return;
                    setEventDialog({ open: true, date: d });
                  }}
                >
                  <div className={cn("mb-1 text-xs font-semibold tabular-nums", isToday ? "text-[#0B1B3A]" : "text-zinc-500")}>
                    {format(d, "d/M")}
                  </div>
                  <div className="space-y-1">
                    {evs.map((ev: any) => {
                      const cls = classOf(ev.class_id);
                      const isGoogleEvent = ev.source === "google";
                      const color = colorOfEvent(ev, cls);
                      return (
                        <div
                          key={ev.id}
                          data-event
                          className="truncate rounded-md px-1.5 py-1 text-[10px] font-semibold transition-opacity hover:opacity-80"
                          style={eventStyle(color, !!ev.virtual)}
                          onClick={(e) => {
                            e.stopPropagation();
                            openEvent(ev);
                          }}
                        >
                          {ev.start_time.slice(0, 5)} {isGoogleEvent ? ev.title : cls?.name || ev.title}
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
      <EventDialog open={eventDialog.open} onOpenChange={(o: boolean) => setEventDialog({ open: o })} date={eventDialog.date} defaultHour={(eventDialog as any).event?._newHour} classes={classes.data || []} />
      <AttendanceDialog open={attDialog.open} onOpenChange={(o: boolean) => setAttDialog({ open: o })} event={attDialog.event} students={students.data || []} enrollments={enrollments.data || []} classes={classes.data || []} onDelete={requestDelete} />

      <AlertDialog open={confirmDel.open} onOpenChange={(o) => setConfirmDel({ open: o, ev: o ? confirmDel.ev : undefined })}>
        <AlertDialogContent className={cn(DLG, "sm:max-w-sm")}>
          <AlertDialogHeader className="space-y-2 px-6 py-5 text-left">
            <AlertDialogTitle className="text-lg font-semibold text-zinc-900">{(t as any).confirmDeleteTitle || t.confirmDelete}</AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-zinc-500">{(t as any).confirmDeleteDesc || "Hành động này không thể hoàn tác."}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 border-t border-zinc-100 bg-zinc-50 px-6 py-4">
            <AlertDialogCancel className="mt-0 h-10 rounded-xl border-zinc-200 px-4 text-sm font-medium shadow-none">{t.cancel}</AlertDialogCancel>
            <AlertDialogAction
              className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white shadow-none hover:bg-rose-700"
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