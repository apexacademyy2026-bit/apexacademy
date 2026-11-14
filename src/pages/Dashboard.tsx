import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { Link } from "react-router-dom";
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
  CheckCheck,
  CalendarCheck2,
  CalendarRange,
  CalendarDays,
  Timer,
  Activity,
  ArrowRight,
  BarChart3,
  UserCheck,
  ChevronRight,
  ChevronDown,
  ArrowUpRight,
  AlertCircle,
  Sparkles,
  Clock,
  Video,
  ExternalLink,
  Calculator,
  BookOpen,
  ClipboardList,
  ClipboardCheck,
  StickyNote,
  Plus,
  X,
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
import { getBillingPeriod, getPastBillingPeriods, toISODate } from "@/lib/Billingperiod";
import { BackgroundPicker } from "@/components/DashboardBackground";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
// Nhật ký học tập: dùng đúng tên cột và cách đọc/ghi bài kiểm tra của trang Learning log và trang Hóa đơn
import { LOG, rawVal, type LogCol } from "@/lib/Learninglog";
import { EMPTY_TEST, cleanTests, isBlankTest, parseTests, serializeTests, withSpare, type TestItem } from "@/lib/Learningtests";

// Nhóm các buổi học trong popup chi tiết học phí
// (buổi đã qua mà vắng / chưa điểm danh không hiện và không tính tiền)
const SESSION_GROUPS = [
  { k: "attended", vi: "Đã học", en: "Attended", dot: "bg-emerald-500", pill: "bg-emerald-50 text-emerald-700" },
  { k: "upcoming", vi: "Chưa học", en: "Upcoming", dot: "bg-amber-400", pill: "bg-amber-50 text-amber-700" },
] as const;
const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

type SessionItem = { key: string; classId: string; className: string; date: string; start: string; end: string; eventId: string | null };

// Một dòng trong chi tiết lương mặc định: học phí tháng cố định của một lớp mà học sinh đang học
type SalaryItem = { classId: string; className: string; fee: number };

// Nhóm học sinh cùng ngày thu học phí (cột billing_day) trong popup học phí kỳ sắp tới
// key = "25" (ngày thu) hoặc "none" (chưa đặt ngày thu); dueDate = ngày thu thực tế của kỳ hiện tại (YYYY-MM-DD)
type BillingGroup = {
  key: string;
  day: number | null;
  count: number;
  fee: number; // tổng cần thu = kỳ hiện tại + các kỳ trước chưa thu
  currentFee: number;
  overdueFee: number;
  start: string;
  end: string;
  dueDate: string | null;
};

// Các buổi học của một lớp trong khoảng [from, to] (YYYY-MM-DD, gồm cả hai đầu):
// theo lịch cố định hằng tuần + buổi thêm tay, bỏ các buổi đã hủy, và nằm trong ngày bắt đầu/kết thúc của lớp
const buildClassSessions = (c: any, from: string, to: string, schedules: any[], events: any[]): SessionItem[] => {
  const list: SessionItem[] = [];
  const first = new Date(`${from}T00:00:00`);
  if (!from || !to || isNaN(first.getTime())) return list;

  const cid = String(c.id);
  const slots = schedules.filter((sc: any) => String(sc.class_id) === cid);
  const classEvents = events.filter((e: any) => String(e.class_id) === cid && e.event_date);
  const startStr = c.start_date ? String(c.start_date).slice(0, 10) : null;
  const endStr = c.end_date ? String(c.end_date).slice(0, 10) : null;

  const d = new Date(first);
  for (let i = 0; i < 800 && toISODate(d) <= to; i++, d.setDate(d.getDate() + 1)) {
    const dateStr = toISODate(d);
    if (startStr && dateStr < startStr) continue;
    if (endStr && dateStr > endStr) continue;
    const dayEvents = classEvents.filter((e: any) => String(e.event_date).slice(0, 10) === dateStr);
    if (dayEvents.length > 0) {
      // Ngày đã có buổi thực tế: chỉ tính các buổi chưa hủy
      dayEvents
        .filter((e: any) => e.notes !== "__cancelled__" && e.notes !== "__google_master__")
        .forEach((e: any) =>
          list.push({
            key: `e-${e.id}`,
            classId: cid,
            className: c.name,
            date: dateStr,
            start: String(e.start_time || "").slice(0, 5),
            end: String(e.end_time || "").slice(0, 5),
            eventId: String(e.id),
          }),
        );
    } else {
      // Chưa có buổi thực tế: tính theo lịch cố định hằng tuần
      slots
        .filter((sc: any) => sc.day_of_week === d.getDay())
        .forEach((sc: any) =>
          list.push({
            key: `v-${sc.id}-${dateStr}`,
            classId: cid,
            className: c.name,
            date: dateStr,
            start: String(sc.start_time || "").slice(0, 5),
            end: String(sc.end_time || "").slice(0, 5),
            eventId: null,
          }),
        );
    }
  }
  return list;
};

// Số tháng (theo lịch) mà khoảng [from, to] chạm tới, gồm cả tháng đầu và tháng cuối; 0 nếu khoảng không hợp lệ.
// Ví dụ 01/01 – 31/12 = 12; 15/03 – 02/04 = 2.
const monthsBetween = (from: string, to: string) => {
  const f = new Date(`${from}T00:00:00`);
  const e = new Date(`${to}T00:00:00`);
  if (isNaN(f.getTime()) || isNaN(e.getTime()) || e < f) return 0;
  return (e.getFullYear() - f.getFullYear()) * 12 + e.getMonth() - f.getMonth() + 1;
};

// Một kỳ học phí đã qua mà còn buổi chưa thu
type OverduePeriod = { start: string; end: string; fee: number; sessionList: SessionItem[] };

// Buổi học đã được thu tiền chưa: khớp theo điểm danh (attendance_id / attendance_ids)
// hoặc nằm trong khoảng period_start – period_end của một lần thanh toán (giống cách danh sách hóa đơn xác định "Đã thu")
const isSessionCollected = (studentPayments: any[], sess: SessionItem, rec: any) =>
  studentPayments.some((p: any) => {
    if (rec?.id != null) {
      if (String(p.attendance_id) === String(rec.id)) return true;
      if (Array.isArray(p.attendance_ids) && p.attendance_ids.map(String).includes(String(rec.id))) return true;
    }
    return !!(
      p.period_start &&
      p.period_end &&
      sess.date >= String(p.period_start).slice(0, 10) &&
      sess.date <= String(p.period_end).slice(0, 10)
    );
  });

/* ---------------- NHẬT KÝ HỌC TẬP TRONG ĐIỂM DANH NHANH ----------------
   Cùng dữ liệu với trang Learning log: các cột nhật ký nằm ngay trong bảng attendance (xem lib/Learninglog),
   nên hóa đơn gửi phụ huynh đọc được luôn.
   - Dùng chung cả ca: nội dung buổi học, bài tập về nhà (ghi cho mọi học sinh có mặt trong ca). Để trống thì giữ nguyên dữ liệu cũ.
   - Riêng từng học sinh: bài kiểm tra (tên + điểm, nhiều dòng) và ghi chú. Ô nào đã sửa thì ghi đúng như đang hiển thị.
   Chỉ ghi cho học sinh có mặt (giống trang Learning log). */
type ShiftLogDraft = { content?: string; homework?: string };
type StudentLogDraft = { note?: string; tests?: TestItem[] };

const LOG_FIELD =
  "rounded-xl border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#3B1553] focus-visible:ring-2 focus-visible:ring-[#3B1553]/10";

// Các cột nhật ký cần ghi cho một học sinh có mặt; null nếu không có gì để ghi
const buildLogFields = (shift: ShiftLogDraft | undefined, own: StudentLogDraft | undefined): Record<string, string | null> | null => {
  const fields: Record<string, string | null> = {};
  const content = (shift?.content ?? "").trim();
  const homework = (shift?.homework ?? "").trim();
  if (content) fields[LOG.content] = content;
  if (homework) fields[LOG.homework] = homework;
  if (own?.note !== undefined) fields[LOG.note] = own.note.trim() || null;
  if (own?.tests !== undefined) {
    const { name, score } = serializeTests(own.tests);
    fields[LOG.testName] = name || null;
    fields[LOG.testScore] = score || null;
  }
  return Object.keys(fields).length > 0 ? fields : null;
};

function LogLabel({ icon: Icon, text }: { icon: any; text: string }) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-600">
      <Icon className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
      {text}
    </div>
  );
}

/* ---------------- LỚP ONLINE ----------------
   Chưa biết chắc cột nào trong bảng lớp / buổi học lưu "online" và link vào lớp, nên dò nhiều tên cột phổ biến.
   Nếu app dùng tên cột khác, chỉ cần thêm vào ONLINE_LINK_KEYS (link) hoặc isOnlineFlag (cờ online) bên dưới. */
const ONLINE_LINK_KEYS = [
  "meeting_link", "meeting_url", "meet_link", "meet_url", "online_link", "online_url",
  "zoom_link", "zoom_url", "join_link", "join_url", "class_link", "class_url", "hangout_link", "link", "url",
];
// Chỉ nhận link http/https (link nhập tay nên không cho các kiểu như javascript:)
const toSafeUrl = (raw: any): string | null => {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const withProto = /^https?:\/\//i.test(s) ? s : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s) ? `https://${s}` : null;
  if (!withProto) return null;
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
};
const pickLink = (obj: any): string | null => {
  if (!obj) return null;
  for (const k of ONLINE_LINK_KEYS) {
    const u = toSafeUrl(obj[k]);
    if (u) return u;
  }
  return null;
};
const isOnlineFlag = (obj: any) =>
  !!obj &&
  (obj.is_online === true ||
    obj.online === true ||
    ["online", "onl", "zoom", "meet"].includes(
      String(obj.mode ?? obj.format ?? obj.class_type ?? obj.type ?? obj.delivery ?? obj.delivery_mode ?? obj.location_type ?? "").toLowerCase(),
    ));
// Tên lớp có chữ "Onl" / "Online" đứng riêng (vd. "Lớp 10 Onl Trâm")
const NAME_ONLINE_RE = /(^|[^\p{L}\p{N}])onl(ine)?([^\p{L}\p{N}]|$)/iu;
// Link ưu tiên: của riêng buổi học (vd. Google Meet đồng bộ từ lịch), sau đó tới link của lớp
const getOnlineInfo = (cls: any, ev: any): { online: boolean; url: string | null } => {
  const url = pickLink(ev) || toSafeUrl(ev?.location) || pickLink(cls);
  const online = !!url || isOnlineFlag(cls) || isOnlineFlag(ev) || NAME_ONLINE_RE.test(String(cls?.name || ev?.title || ""));
  return { online, url };
};

/* ---------------- TRẠNG THÁI CA HỌC HÔM NAY ----------------
   Dựa vào giờ hiện tại so với giờ bắt đầu / kết thúc của ca (chỉ để hiển thị, không ảnh hưởng điểm danh hay học phí). */
const SHIFT_STATUS = {
  live: { vi: "Đang diễn ra", en: "In progress", pill: "bg-emerald-50 text-emerald-700 ring-emerald-100", dot: "bg-emerald-500" },
  soon: { vi: "Sắp tới", en: "Upcoming", pill: "bg-amber-50 text-amber-700 ring-amber-100", dot: "bg-amber-400" },
  done: { vi: "Đã kết thúc", en: "Ended", pill: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" },
  allday: { vi: "Cả ngày", en: "All day", pill: "bg-zinc-100 text-zinc-600 ring-zinc-200", dot: "bg-zinc-400" },
} as const;
type ShiftStatus = keyof typeof SHIFT_STATUS;
// "17:30" / "17:30:00" -> số phút trong ngày; null nếu không đọc được
const toMinutes = (t: any): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/* ---------------- TÍNH HỌC PHÍ ĐẾN NGÀY ----------------
   Ô "Tính học phí đến ngày": cộng học phí chưa thu của mọi học sinh từ hôm nay đến ngày đã chọn.
   Cùng quy tắc với thẻ "Tổng học phí kỳ sắp tới": lấy học phí của LỚP (không dùng fee_override),
   buổi / kỳ đã có thanh toán khớp thì không tính.
   - Theo buổi:  "đã học, chưa thu" = mọi buổi học sinh có mặt mà chưa có thanh toán khớp;
                 "sắp học" = các buổi theo lịch từ hôm nay đến ngày chọn (hôm nay đã điểm danh vắng thì không tính).
   - Theo tháng: cộng học phí tháng của mỗi kỳ có ngày thu (ngày sau khi kỳ kết thúc) không quá ngày chọn.
                 Kỳ theo ngày thu của học sinh, chưa đặt ngày thu thì theo tháng dương lịch.
                 Kỳ trước chưa thu cũng được cộng (chỉ khi học sinh có mặt ít nhất một buổi trong kỳ, như popup học phí kỳ sắp tới).
                 Kỳ hiện tại mà ngày thu rơi sau ngày chọn thì chưa tính, chỉ báo riêng ở "deferred". */
type TuitionCalcRow = {
  student: any;
  bySession: boolean;
  owed: number; // đã học / đã đến hạn nhưng chưa thu
  upcoming: number; // sắp tới, đến ngày đã chọn
  owedSessions: number;
  upcomingSessions: number;
  periods: { start: string; end: string; due: string; fee: number; overdue: boolean }[]; // chỉ học sinh theo tháng
};
type TuitionCalcResult = {
  valid: boolean;
  rows: TuitionCalcRow[];
  owedTotal: number;
  upcomingTotal: number;
  owedStudents: number;
  upcomingStudents: number;
  deferredCount: number; // số học sinh theo tháng có kỳ hiện tại thu sau ngày chọn
  deferredFee: number;
};

const computeTuitionUntil = (o: {
  target: string; // YYYY-MM-DD
  todayStr: string;
  now: Date;
  students: any[];
  classes: any[];
  enrollments: any[];
  schedules: any[];
  events: any[];
  payments: any[];
  attendance: any[];
  attendanceByKey: Map<string, any>;
  isBySession: (s: any) => boolean;
}): TuitionCalcResult => {
  const { target, todayStr, now, students, classes, enrollments, schedules, events, payments, attendance, attendanceByKey, isBySession } = o;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(target) && target >= todayStr;
  const result: TuitionCalcResult = { valid, rows: [], owedTotal: 0, upcomingTotal: 0, owedStudents: 0, upcomingStudents: 0, deferredCount: 0, deferredFee: 0 };
  if (!valid) return result;

  const shiftISO = (iso: string, days: number) => {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + days);
    return toISODate(d);
  };
  const monthPeriod = (d: Date) => ({
    start: toISODate(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: toISODate(new Date(d.getFullYear(), d.getMonth() + 1, 0)),
  });

  const classById = new Map<string, any>(classes.map((c: any) => [String(c.id), c]));
  const eventById = new Map<string, any>(events.map((e: any) => [String(e.id), e]));
  // Nhiều học sinh cùng lớp và cùng khoảng ngày thì chỉ dựng danh sách buổi một lần
  const sessionCache = new Map<string, SessionItem[]>();
  const sessionsOf = (cls: any, start: string, end: string) => {
    const key = `${cls.id}|${start}|${end}`;
    let list = sessionCache.get(key);
    if (!list) {
      list = buildClassSessions(cls, start, end, schedules, events);
      sessionCache.set(key, list);
    }
    return list;
  };
  const presentByStudent = new Map<string, any[]>();
  attendance.forEach((a: any) => {
    if (!a.present) return;
    const k = String(a.student_id);
    const arr = presentByStudent.get(k) || [];
    arr.push(a);
    presentByStudent.set(k, arr);
  });
  const paymentsByStudent = new Map<string, any[]>();
  payments.forEach((p: any) => {
    const k = String(p.student_id);
    const arr = paymentsByStudent.get(k) || [];
    arr.push(p);
    paymentsByStudent.set(k, arr);
  });

  students.forEach((s: any) => {
    const sid = String(s.id);
    const bySession = isBySession(s);
    const pays = paymentsByStudent.get(sid) || [];
    const seenClass = new Set<string>();
    const studentClasses = enrollments
      .filter((e: any) => String(e.student_id) === sid)
      .map((e: any) => classById.get(String(e.class_id)))
      .filter((c: any) => {
        if (!c || seenClass.has(String(c.id))) return false;
        seenClass.add(String(c.id));
        return true;
      });

    let owed = 0;
    let upcoming = 0;
    let owedSessions = 0;
    let upcomingSessions = 0;
    const periods: TuitionCalcRow["periods"] = [];

    if (bySession) {
      // Đã học nhưng chưa thu: mọi buổi có mặt chưa có thanh toán khớp
      (presentByStudent.get(sid) || []).forEach((a: any) => {
        const ev = eventById.get(String(a.event_id));
        if (!ev || !ev.event_date) return;
        if (ev.notes === "__cancelled__" || ev.notes === "__google_master__") return;
        const cls = classById.get(String(ev.class_id));
        if (!cls) return;
        const sess = { date: String(ev.event_date).slice(0, 10) } as SessionItem;
        if (isSessionCollected(pays, sess, a)) return;
        owed += Number(cls.fee_per_session || 0);
        owedSessions += 1;
      });
      // Sắp học: các buổi theo lịch từ hôm nay đến ngày chọn
      studentClasses.forEach((cls: any) => {
        sessionsOf(cls, todayStr, target).forEach((sess) => {
          const rec = sess.eventId ? attendanceByKey.get(`${sess.eventId}|${s.id}`) : undefined;
          if (rec?.present) return; // đã tính ở "đã học, chưa thu"
          if (sess.date === todayStr && rec) return; // hôm nay đã điểm danh mà vắng thì không tính tiền
          if (isSessionCollected(pays, sess, undefined)) return;
          upcoming += Number(cls.fee_per_session || 0);
          upcomingSessions += 1;
        });
      });
    } else {
      // Học sinh theo tháng: kỳ coi là đã thu khi có lần thanh toán phủ lên kỳ đó
      const cycles = computeMonthlyCycles(s.start_date || "2026-04-01", now);
      const paidRanges: { start: string; end: string }[] = [];
      pays.forEach((p: any) => {
        if (p.period_start && p.period_end) {
          paidRanges.push({ start: String(p.period_start).slice(0, 10), end: String(p.period_end).slice(0, 10) });
        } else if (p.cycle_label) {
          cycles
            .filter((c: any) => p.cycle_label === c.label || p.cycle_label?.includes(c.label))
            .forEach((c: any) => paidRanges.push({ start: toISODate(c.start), end: toISODate(c.end) }));
        }
      });
      const isPaid = (start: string, end: string) => paidRanges.some((r) => r.start <= end && r.end >= start);
      const monthlyFee = studentClasses.reduce((sum: number, cls: any) => sum + Number(cls.fee_per_month || 0), 0);
      const billingDay = Number(s.billing_day);
      const hasBillingDay = billingDay >= 1 && billingDay <= 31;
      const notBefore = String(s.start_date || s.created_at || "").slice(0, 10) || null;
      const periodOf = (d: Date) => (hasBillingDay ? getBillingPeriod(billingDay, d) : monthPeriod(d));

      // Các kỳ trước còn chưa thu (chỉ khi học sinh có ngày thu)
      if (hasBillingDay) {
        getPastBillingPeriods(billingDay, now, notBefore).forEach((per) => {
          if (isPaid(per.start, per.end)) return;
          let fee = 0;
          studentClasses.forEach((cls: any) => {
            const monthly = Number(cls.fee_per_month || 0);
            if (monthly <= 0) return;
            const attended = sessionsOf(cls, per.start, per.end).filter(
              (sess) =>
                (!notBefore || sess.date >= notBefore) &&
                !!(sess.eventId ? attendanceByKey.get(`${sess.eventId}|${s.id}`) : undefined)?.present,
            );
            if (attended.length > 0) fee += monthly;
          });
          if (fee > 0) {
            owed += fee;
            periods.push({ start: per.start, end: per.end, due: shiftISO(per.end, 1), fee, overdue: true });
          }
        });
      }

      // Kỳ hiện tại và các kỳ kế tiếp có ngày thu không quá ngày đã chọn
      let cur = periodOf(now);
      for (let i = 0; i < 24; i++) {
        const due = shiftISO(cur.end, 1);
        const paid = isPaid(cur.start, cur.end);
        if (due > target) {
          if (i === 0 && !paid && monthlyFee > 0) {
            result.deferredCount += 1;
            result.deferredFee += monthlyFee;
          }
          break;
        }
        if (!paid && monthlyFee > 0) {
          upcoming += monthlyFee;
          periods.push({ start: cur.start, end: cur.end, due, fee: monthlyFee, overdue: false });
        }
        const next = periodOf(new Date(`${due}T00:00:00`));
        if (next.start <= cur.start) break; // phòng trường hợp không tiến được sang kỳ sau
        cur = next;
      }
    }

    if (owed > 0 || upcoming > 0) {
      result.rows.push({
        student: s,
        bySession,
        owed,
        upcoming,
        owedSessions,
        upcomingSessions,
        periods: periods.sort((a, b) => a.start.localeCompare(b.start)),
      });
    }
  });

  result.owedTotal = result.rows.reduce((n, r) => n + r.owed, 0);
  result.upcomingTotal = result.rows.reduce((n, r) => n + r.upcoming, 0);
  result.owedStudents = result.rows.filter((r) => r.owed > 0).length;
  result.upcomingStudents = result.rows.filter((r) => r.upcoming > 0).length;
  return result;
};

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG ----------------
   Ngôn ngữ thiết kế "Aurora + Bento":
   - Phần chào là khối mận đậm sâu có ba quầng sáng aurora trôi chậm, kèm thẻ kính mờ "Ca tiếp theo" đếm ngược theo phút.
   - Dải lịch 7 ngày tới chọn được từng ngày; điểm danh hôm nay dạng dòng thời gian có vạch "Bây giờ".
   - Phần tổng quan xếp kiểu bento: thẻ lớn nổi bật, thẻ vừa, biểu đồ nhỏ (phân bổ theo ngày thu, điểm danh 14 ngày).
   - Số tiền / số đếm chạy lên khi tải; thẻ có ánh sáng đi theo con trỏ chuột (spotlight); mọi chuyển động tắt khi
     người dùng bật "giảm chuyển động".
   Bảng màu: mận đậm #3B1553 · hổ phách #FFB547 · tím hồng / hồng cho aurora.
   Đỏ chỉ dành cho khoản chưa thu từ kỳ trước, xanh lục chỉ dành cho trạng thái đã thu / có mặt / đang diễn ra.
   Mọi chữ nằm trong thẻ trắng đặc hoặc khối mận đậm nên đọc rõ dù hình nền toàn ứng dụng là gì. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
// Số giờ / đồng hồ dùng chữ đơn cách (mono) cho cảm giác "bảng điều khiển"
const MONO = "font-['JetBrains_Mono',ui-monospace,monospace]";
const CARD =
  "rounded-[28px] border border-zinc-200/70 bg-white shadow-[0_1px_2px_rgba(59,21,83,0.04),0_18px_44px_-22px_rgba(59,21,83,0.22)]";
// Kính mờ đặt trên nền mận đậm / aurora
const GLASS = "border border-white/15 bg-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-xl";
const CHIP = "inline-flex h-9 items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 text-sm font-medium text-white backdrop-blur-md";
const CHIP_BTN = `${CHIP} transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50`;
const SEG = "flex w-fit max-w-full flex-wrap gap-0.5 rounded-3xl bg-zinc-100 p-1";
const modalShell = `flex max-h-[92vh] flex-col gap-0 overflow-hidden rounded-[28px] border border-zinc-200 bg-white p-0 shadow-2xl sm:max-w-2xl ${FONT}`;

// Màu các phần trong biểu đồ phân bổ theo ngày thu
const GROUP_COLORS = ["#FFB547", "#818CF8", "#22D3EE", "#F472B6", "#34D399", "#A78BFA"];

// Nền gradient mận đậm (phần chào + các khối nổi bật)
const HERO_BG: CSSProperties = {
  backgroundImage: "linear-gradient(140deg, #1F0A30 0%, #3B1553 52%, #5A2179 100%)",
};
const DEEP_BG: CSSProperties = {
  backgroundImage:
    "radial-gradient(100% 100% at 100% 0%, rgba(255,181,71,0.26) 0%, rgba(255,181,71,0) 60%), linear-gradient(145deg, #3B1553 0%, #4F1C6B 100%)",
};
const ICON_TILE_BG: CSSProperties = { backgroundImage: "linear-gradient(145deg, #3B1553 0%, #6B2A8F 100%)" };
// Lưới chấm mờ phủ lên nền mận đậm, mờ dần về phía góc trái dưới
const DOT_BG: CSSProperties = {
  backgroundImage: "radial-gradient(rgba(255,255,255,0.16) 1px, transparent 1px)",
  backgroundSize: "22px 22px",
  WebkitMaskImage: "radial-gradient(80% 110% at 100% 0%, #000 0%, transparent 70%)",
  maskImage: "radial-gradient(80% 110% at 100% 0%, #000 0%, transparent 70%)",
};

// CSS dùng chung: chữ, chuyển động aurora, hiệu ứng xuất hiện, spotlight
const DASH_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap');
@keyframes dash-drift-a { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(9%,10%,0) scale(1.14); } }
@keyframes dash-drift-b { 0%,100% { transform: translate3d(0,0,0) scale(1.05); } 50% { transform: translate3d(-10%,12%,0) scale(0.92); } }
@keyframes dash-drift-c { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(12%,-9%,0) scale(1.18); } }
@keyframes dash-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes dash-sheen { from { background-position: 0% 50%; } to { background-position: 200% 50%; } }
.dash-aurora-a { animation: dash-drift-a 20s ease-in-out infinite; }
.dash-aurora-b { animation: dash-drift-b 24s ease-in-out infinite; }
.dash-aurora-c { animation: dash-drift-c 28s ease-in-out infinite; }
.dash-rise { animation: dash-rise .6s cubic-bezier(.2,.7,.2,1) backwards; animation-delay: var(--d, 0ms); }
.dash-sheen { background-size: 200% 100%; animation: dash-sheen 7s linear infinite; }
.dash-spot .dash-spot-glow { opacity: 0; transition: opacity .25s ease; }
.dash-spot:hover .dash-spot-glow { opacity: 1; }
@media (prefers-reduced-motion: reduce) {
  .dash-aurora-a, .dash-aurora-b, .dash-aurora-c, .dash-rise, .dash-sheen { animation: none !important; }
  .dash-spot .dash-spot-glow { transition: none; }
}
`;

// Sắc riêng của từng thẻ số liệu: ô icon + quầng sáng góc thẻ
const TONES: Record<string, { tile: string; glow: string }> = {
  students: { tile: "bg-sky-50 text-sky-600", glow: "#38BDF8" },
  classes: { tile: "bg-violet-50 text-violet-600", glow: "#A78BFA" },
  tuition: { tile: "bg-amber-50 text-amber-600", glow: "#FFB547" },
  payments: { tile: "bg-indigo-50 text-indigo-600", glow: "#818CF8" },
  avg: { tile: "bg-cyan-50 text-cyan-600", glow: "#22D3EE" },
};

// Chọn chữ mận đậm hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
const inkOn = (c: string) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const lum = 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return lum > 170 ? "#3B1553" : "#ffffff";
};
// Ô màu đặc, có quầng sáng cùng màu để nổi bật
const solid = (c: string): CSSProperties => ({
  background: c,
  color: inkOn(c),
  boxShadow: `0 8px 18px -8px ${c}`,
});

// Số chạy lên từ giá trị đang hiển thị tới giá trị mới (tắt khi người dùng bật "giảm chuyển động")
function useCountUp(target: number, duration = 800) {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    const safe = Number.isFinite(target) ? target : 0;
    const reduce = typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = safe;
      setVal(safe);
      return;
    }
    const from = fromRef.current;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = from + (safe - from) * eased;
      fromRef.current = v;
      setVal(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}
function CountMoney({ value }: { value: number }) {
  const v = useCountUp(value);
  return <>{formatVND(Math.round(v))}</>;
}
function CountNum({ value }: { value: number }) {
  const v = useCountUp(value, 600);
  return <>{Math.round(v)}</>;
}

// Thẻ có ánh sáng đi theo con trỏ chuột (chỉ trang trí, không chặn thao tác)
function Spot({
  className,
  children,
  tint = "rgba(99,102,241,0.09)",
  style,
}: {
  className?: string;
  children: ReactNode;
  tint?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn("dash-spot relative", className)}
      style={style}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
    >
      {children}
      <div
        aria-hidden
        className="dash-spot-glow pointer-events-none absolute inset-0 rounded-[inherit]"
        style={{ background: `radial-gradient(340px circle at var(--mx, 50%) var(--my, 0%), ${tint}, transparent 65%)` }}
      />
    </div>
  );
}

// Vòng tiến độ có gradient hổ phách (dùng cho tỉ lệ có mặt hôm nay)
function ProgressRing({ pct, size = 76, stroke = 7, id = "dash-ring" }: { pct: number; size?: number; stroke?: number; id?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safe = Math.min(100, Math.max(0, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFD27A" />
          <stop offset="100%" stopColor="#FF8A5B" />
        </linearGradient>
      </defs>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * safe) / 100}
        className="transition-all duration-700 motion-reduce:transition-none"
      />
    </svg>
  );
}

// Đầu popup: ô icon mận đậm + tiêu đề + tổng tiền lớn, quầng hổ phách mờ ở góc
function ModalHead({
  icon: Icon,
  title,
  total,
  children,
}: {
  icon: any;
  title: string;
  total: string;
  children?: ReactNode;
}) {
  return (
    <DialogHeader className="relative shrink-0 space-y-4 overflow-hidden border-b border-zinc-100 bg-gradient-to-b from-zinc-50/80 to-white px-6 py-6 text-left">
      <div className="relative flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-2xl text-[#FFB547] shadow-lg shadow-[#3B1553]/25" style={ICON_TILE_BG}>
          <Icon className="h-[18px] w-[18px]" />
        </div>
        <DialogTitle className="text-sm font-medium text-zinc-500">{title}</DialogTitle>
      </div>
      <div className="relative text-4xl font-extrabold tabular-nums tracking-tight text-zinc-900">{total}</div>
      {children && <div className="relative">{children}</div>}
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-[#FFB547]/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-40 w-40 rounded-full bg-fuchsia-400/10 blur-3xl" />
    </DialogHeader>
  );
}

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
  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [showExpectedModal, setShowExpectedModal] = useState(false);
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  // Lọc popup học phí kỳ sắp tới theo ngày thu: "all" | "none" | "25" ...
  const [billingFilter, setBillingFilter] = useState<string>("all");
  // Nhật ký học tập ghi nhanh trong phần điểm danh: bản nháp dùng chung cả ca (khoá = id ca)
  // và riêng từng học sinh (khoá = "id ca:id học sinh"); openLog / openStudentLog là trạng thái đóng mở các ô
  const [shiftLogDraft, setShiftLogDraft] = useState<Record<string, ShiftLogDraft>>({});
  const [studentLogDraft, setStudentLogDraft] = useState<Record<string, StudentLogDraft>>({});
  const [openLog, setOpenLog] = useState<Record<string, boolean>>({});
  const [openStudentLog, setOpenStudentLog] = useState<Record<string, boolean>>({});

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
  // Ô "Tính học phí đến ngày": ngày cần tính tới (mặc định cuối tháng này) và có cộng các buổi đã học chưa thu không
  const [calcDate, setCalcDate] = useState<string>(toISO(endOfThisMonth()));
  const [calcIncludeOwed, setCalcIncludeOwed] = useState(true);
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

  // Gom nhóm ca học hôm nay theo Khung giờ & Lớp (xếp theo giờ bắt đầu, ca cả ngày xuống cuối)
  const todayShiftGroups = useMemo(() => {
    if (!todayEvents.length || !students) return [];
    return todayEvents
      .map((ev: any) => {
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
      })
      .sort((a: any, b: any) =>
        String(a.event.start_time || "99:99").localeCompare(String(b.event.start_time || "99:99")),
      );
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

  // Đánh dấu có mặt / bỏ chọn cả ca chỉ bằng một chạm
  const setShiftAllAttendance = (group: any, value: boolean) => {
    const eId = String(group.event.id);
    setAttendanceMap((prev) => {
      const next = { ...(prev[eId] || {}) };
      group.students.forEach((s: any) => {
        next[String(s.id)] = value;
      });
      return { ...prev, [eId]: next };
    });
  };

  const handleSaveAllAttendance = async () => {
    if (!user || todayShiftGroups.length === 0) return;
    setSavingAttendance(true);
    try {
      const allUpdates: any[] = [];
      const logWrites: { eventId: any; studentId: string; fields: Record<string, string | null> }[] = [];
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
        // Nhật ký học tập của các học sinh có mặt trong ca này (chỉ những ô đã nhập / đã sửa)
        const shiftDraft = shiftLogDraft[String(group.event.id)];
        group.students.forEach((s: any) => {
          if (!shiftAttMap[String(s.id)]) return;
          const fields = buildLogFields(shiftDraft, studentLogDraft[`${group.event.id}:${s.id}`]);
          if (fields) logWrites.push({ eventId: targetEventId, studentId: String(s.id), fields });
        });
      }
      if (allUpdates.length > 0) {
        const { error } = await supabase.from("attendance").upsert(allUpdates, { onConflict: "event_id,student_id" });
        if (error) throw error;
      }

      // Nhật ký ghi riêng bằng update theo (ca, học sinh), KHÔNG gộp vào upsert ở trên: upsert nhiều dòng
      // sẽ ghi null vào các cột bị thiếu và làm mất nhật ký đã có của những học sinh không nhập gì.
      let logError: string | null = null;
      if (logWrites.length > 0) {
        const results = await Promise.all(
          logWrites.map((w) =>
            supabase.from("attendance").update(w.fields as any).eq("event_id", w.eventId).eq("student_id", w.studentId),
          ),
        );
        const failed = results.find((r) => r.error);
        if (failed?.error) logError = failed.error.message || "error";
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["attendance"] }),
        queryClient.invalidateQueries({ queryKey: ["events"] }),
        queryClient.invalidateQueries({ queryKey: ["learning-log"] }),
        queryClient.invalidateQueries({ queryKey: ["student-bill-attendance"] }),
      ]);

      if (logError) {
        // Điểm danh đã lưu xong; giữ nguyên chữ đang nhập để bấm lưu lại
        toast.error(
          lang === "vi" ? "Đã lưu điểm danh nhưng chưa lưu được nhật ký học tập" : "Attendance saved, but the learning log could not be saved",
          { description: logError },
        );
        return;
      }
      setShiftLogDraft({});
      setStudentLogDraft({});
      toast.success(
        logWrites.length > 0
          ? lang === "vi" ? "Đã lưu điểm danh và nhật ký học tập!" : "Attendance and learning log saved!"
          : lang === "vi" ? "Đã lưu điểm danh tất cả các ca học!" : "Attendance saved for all shifts!",
      );
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

  // Học sinh đang chọn tính học phí theo buổi hay theo tháng
  const isBySessionStudent = (s: any) =>
    s.billing_type === "session" ||
    s.billing_type === "by_session" ||
    s.fee_type === "session" ||
    s.fee_type === "by_session" ||
    s.payment_mode === "by_session" ||
    s.payment_mode === "per_session" ||
    s.payment_type === "session" ||
    s.payment_mode === "session";

  // Số tháng nằm trong khoảng thời gian đang lọc: Tháng này / Tháng trước = 1, 3 tháng gần nhất = 3, Năm nay = 12.
  // Dùng cho thẻ "Lương mặc định" và cho học sinh tính theo tháng mà chưa đặt ngày thu (ở thẻ "Tổng học phí kỳ sắp tới").
  const monthsInRange = useMemo(() => Math.max(1, monthsBetween(fromDate, toDate)), [fromDate, toDate]);

  // Tra cứu nhanh điểm danh theo (buổi học, học sinh)
  const attendanceByKey = useMemo(() => {
    const m = new Map<string, any>();
    (attendanceAll.data || []).forEach((a: any) => m.set(`${a.event_id}|${a.student_id}`, a));
    return m;
  }, [attendanceAll.data]);

  // 🌟 HỌC PHÍ KỲ SẮP TỚI: mỗi học sinh có kỳ riêng theo ngày thu học phí (cột billing_day của bảng students).
  // Ví dụ ngày thu 25: hôm nay 14/10 thì kỳ là 25/09 – 24/10, từ 25/10 chuyển sang 25/10 – 24/11.
  // Học phí lấy từ các LỚP học sinh đang học, tính theo lựa chọn của từng học sinh:
  //  - Theo buổi: học phí 1 buổi của lớp × số buổi trong kỳ của học sinh đó
  //  - Theo tháng: học phí tháng của lớp × 1 kỳ
  // Trong kỳ hiện tại, các buổi đã qua mà vắng / chưa điểm danh không hiện và không tính tiền.
  // Buổi (học theo buổi) hoặc kỳ (học theo tháng) đã có thanh toán khớp thì cũng không hiện và không tính tiền,
  // ở cả kỳ hiện tại lẫn các kỳ trước.
  // Ngoài kỳ hiện tại, các kỳ trước (từ ngày học sinh bắt đầu học) mà còn buổi chưa thu cũng được cộng thêm vào.
  // Các kỳ trước chỉ tính những buổi học sinh đã có mặt (buổi vắng / chưa điểm danh không tính tiền).
  // Một buổi/kỳ được coi là đã thu khi có lần thanh toán khớp (cùng cách danh sách hóa đơn sắp tới (popup "Học phí dự kiến trong kỳ") xác định "Đã thu").
  // Học sinh chưa đặt ngày thu thì tạm dùng khoảng ngày đang lọc ở bộ lọc thời gian và không có kỳ trước.
  type StudentUpcoming = {
    fee: number; // tổng cần thu = kỳ hiện tại + các kỳ trước chưa thu
    currentFee: number;
    overdueFee: number;
    sessions: number; // số buổi của kỳ hiện tại
    sessionList: SessionItem[];
    overdue: OverduePeriod[]; // các kỳ trước còn buổi chưa thu, kỳ cũ nhất đứng trước
    start: string;
    end: string;
    hasBillingDay: boolean;
    billingDay: number | null; // ngày thu học phí hằng tháng (1–31), null nếu chưa đặt
  };
  const upcomingByStudent = useMemo(
    () => {
      const classById = new Map<string, any>((classes.data || []).map((c: any) => [String(c.id), c]));
      const scheduleRows = schedules.data || [];
      const eventRows = events.data || [];
      // Nhiều học sinh có cùng ngày thu và cùng lớp thì chỉ tính danh sách buổi một lần
      const sessionCache = new Map<string, SessionItem[]>();
      const sessionsOf = (cls: any, start: string, end: string) => {
        const key = `${cls.id}|${start}|${end}`;
        let list = sessionCache.get(key);
        if (!list) {
          list = buildClassSessions(cls, start, end, scheduleRows, eventRows);
          sessionCache.set(key, list);
        }
        return list;
      };
      const byDateTime = (a: SessionItem, b: SessionItem) => (a.date + a.start).localeCompare(b.date + b.start);

      // Buổi đã qua mà học sinh không có mặt (vắng hoặc chưa điểm danh): không hiện, không tính tiền.
      // Buổi hôm nay chưa điểm danh vẫn được coi là "chưa học".
      const isMissedSession = (sess: SessionItem, studentId: any) => {
        const rec = sess.eventId ? attendanceByKey.get(`${sess.eventId}|${studentId}`) : undefined;
        if (rec?.present) return false;
        return sess.date < todayStr || (sess.date === todayStr && !!rec);
      };

      const paymentsByStudent = new Map<string, any[]>();
      (payments.data || []).forEach((p: any) => {
        const key = String(p.student_id);
        paymentsByStudent.set(key, [...(paymentsByStudent.get(key) || []), p]);
      });

      const now = new Date();
      const result = new Map<string, StudentUpcoming>();
      students.forEach((s: any) => {
        const billingDay = Number(s.billing_day);
        const hasBillingDay = billingDay >= 1 && billingDay <= 31;
        const { start, end } = hasBillingDay ? getBillingPeriod(billingDay, now) : { start: fromDate, end: toDate };
        const bySession = isBySessionStudent(s);
        const months = hasBillingDay ? 1 : monthsInRange;
        const studentClasses = (enrollments.data || [])
          .filter((e: any) => String(e.student_id) === String(s.id))
          .map((e: any) => classById.get(String(e.class_id)))
          .filter(Boolean);

        // Các lần thanh toán của học sinh này: dùng để loại buổi / kỳ ĐÃ THU ở cả kỳ hiện tại lẫn các kỳ trước
        const pays = paymentsByStudent.get(String(s.id)) || [];

        // Học sinh tính theo tháng: kỳ coi là đã thu khi có lần thanh toán phủ lên kỳ đó
        const paidRanges: { start: string; end: string }[] = [];
        if (!bySession) {
          const cycles = computeMonthlyCycles(s.start_date || "2026-04-01", now);
          pays.forEach((p: any) => {
            if (p.period_start && p.period_end) {
              paidRanges.push({ start: String(p.period_start).slice(0, 10), end: String(p.period_end).slice(0, 10) });
            } else if (p.cycle_label) {
              cycles
                .filter((c: any) => p.cycle_label === c.label || p.cycle_label?.includes(c.label))
                .forEach((c: any) => paidRanges.push({ start: toISODate(c.start), end: toISODate(c.end) }));
            }
          });
        }

        // Kỳ hiện tại: bỏ các buổi vắng / chưa điểm danh đã qua VÀ bỏ các buổi / kỳ đã thu tiền
        const sessionList: SessionItem[] = [];
        let currentFee = 0;
        const currentPeriodPaid = !bySession && paidRanges.some((r) => r.start <= end && r.end >= start);
        studentClasses.forEach((cls: any) => {
          let list = sessionsOf(cls, start, end).filter((sess) => !isMissedSession(sess, s.id));
          if (bySession) {
            // Theo buổi: buổi đã có thanh toán khớp (attendance_id / attendance_ids / khoảng ngày) thì không tính nữa
            list = list.filter((sess) => {
              const rec = sess.eventId ? attendanceByKey.get(`${sess.eventId}|${s.id}`) : undefined;
              return !isSessionCollected(pays, sess, rec);
            });
            currentFee += Number(cls.fee_per_session || 0) * list.length;
          } else {
            // Theo tháng: kỳ hiện tại đã có thanh toán phủ lên thì không còn gì cần thu
            if (currentPeriodPaid) return;
            currentFee += Number(cls.fee_per_month || 0) * months;
          }
          sessionList.push(...list);
        });
        sessionList.sort(byDateTime);

        // Các kỳ trước còn buổi chưa thu
        const overdue: OverduePeriod[] = [];
        let overdueFee = 0;
        if (hasBillingDay) {
          const notBefore = String(s.start_date || s.created_at || "").slice(0, 10) || null;

          getPastBillingPeriods(billingDay, now, notBefore).forEach((per) => {
            let perFee = 0;
            const perSessions: SessionItem[] = [];
            studentClasses.forEach((cls: any) => {
              const list = sessionsOf(cls, per.start, per.end).filter((sess) => !notBefore || sess.date >= notBefore);
              if (bySession) {
                // Kỳ trước chỉ tính các buổi học sinh đã có mặt; buổi vắng / chưa điểm danh không tính tiền
                const owed = list.filter((sess) => {
                  const rec = sess.eventId ? attendanceByKey.get(`${sess.eventId}|${s.id}`) : undefined;
                  return !!rec?.present && !isSessionCollected(pays, sess, rec);
                });
                perSessions.push(...owed);
                perFee += Number(cls.fee_per_session || 0) * owed.length;
              } else if (Number(cls.fee_per_month || 0) > 0 && !paidRanges.some((r) => r.start <= per.end && r.end >= per.start)) {
                // Theo tháng: kỳ trước chỉ tính khi học sinh có ít nhất một buổi có mặt trong kỳ đó
                const attended = list.filter((sess) => !!(sess.eventId ? attendanceByKey.get(`${sess.eventId}|${s.id}`) : undefined)?.present);
                if (attended.length > 0) {
                  perSessions.push(...attended);
                  perFee += Number(cls.fee_per_month || 0);
                }
              }
            });
            if (perSessions.length > 0 && perFee > 0) {
              perSessions.sort(byDateTime);
              overdue.push({ start: per.start, end: per.end, fee: perFee, sessionList: perSessions });
              overdueFee += perFee;
            }
          });
          overdue.reverse(); // kỳ cũ nhất lên đầu
        }

        result.set(String(s.id), {
          fee: currentFee + overdueFee,
          currentFee,
          overdueFee,
          sessions: sessionList.length,
          sessionList,
          overdue,
          start,
          end,
          hasBillingDay,
          billingDay: hasBillingDay ? billingDay : null,
        });
      });
      return result;
    },
    [students, classes.data, enrollments.data, schedules.data, events.data, payments.data, attendanceByKey, fromDate, toDate, monthsInRange, todayStr],
  );

  const totalUpcomingFee = useMemo(
    () => Array.from(upcomingByStudent.values()).reduce((sum, v) => sum + v.fee, 0),
    [upcomingByStudent],
  );

  // Phần trong tổng trên là học phí các kỳ trước chưa thu
  const totalOverdueFee = useMemo(
    () => Array.from(upcomingByStudent.values()).reduce((sum, v) => sum + v.overdueFee, 0),
    [upcomingByStudent],
  );

  // Ô "Tính học phí đến ngày": không phụ thuộc bộ lọc thời gian, chỉ phụ thuộc ngày đã chọn (xem computeTuitionUntil)
  const tuitionCalc = useMemo(
    () =>
      computeTuitionUntil({
        target: calcDate,
        todayStr,
        now: new Date(),
        students,
        classes: classes.data || [],
        enrollments: enrollments.data || [],
        schedules: schedules.data || [],
        events: events.data || [],
        payments: payments.data || [],
        attendance: attendanceAll.data || [],
        attendanceByKey,
        isBySession: isBySessionStudent,
      }),
    [calcDate, todayStr, students, classes.data, enrollments.data, schedules.data, events.data, payments.data, attendanceAll.data, attendanceByKey],
  );

  // Lương mặc định theo từng học sinh: học phí tháng cố định của mỗi lớp học sinh đó đang học × số tháng trong khoảng lọc
  // (Tháng này = ×1, 3 tháng gần nhất = ×3, Năm nay = ×12...).
  // Không phụ thuộc kỳ thu, lịch học hay điểm danh.
  const salaryByStudent = useMemo(() => {
    const classById = new Map<string, any>((classes.data || []).map((c: any) => [String(c.id), c]));
    const studentIds = new Set(students.map((s: any) => String(s.id)));
    const seen = new Set<string>();
    const map = new Map<string, { total: number; items: SalaryItem[] }>();
    (enrollments.data || []).forEach((e: any) => {
      const sid = String(e.student_id);
      if (!studentIds.has(sid)) return;
      const pairKey = `${sid}|${e.class_id}`;
      if (seen.has(pairKey)) return; // tránh cộng trùng nếu một học sinh bị ghi danh hai lần vào cùng lớp
      seen.add(pairKey);
      const cls = classById.get(String(e.class_id));
      if (!cls) return;
      const fee = Number(cls.fee_per_month || 0) * monthsInRange;
      const entry = map.get(sid) || { total: 0, items: [] };
      entry.total += fee;
      entry.items.push({ classId: String(cls.id), className: cls.name || "Lớp học", fee });
      map.set(sid, entry);
    });
    return map;
  }, [students, classes.data, enrollments.data, monthsInRange]);

  // Tổng lương mặc định = tổng của tất cả học sinh ở trên
  const defaultSalary = useMemo(
    () => Array.from(salaryByStudent.values()).reduce((sum, v) => sum + v.total, 0),
    [salaryByStudent],
  );

  // Danh sách trong popup lương mặc định: học sinh nhiều tiền nhất lên đầu, bằng nhau thì xếp theo tên
  const salaryStudentList = useMemo(
    () =>
      students
        .map((s: any) => {
          const info = salaryByStudent.get(String(s.id));
          return { student: s, total: info?.total || 0, items: info?.items || [] };
        })
        .sort(
          (a: any, b: any) =>
            b.total - a.total || String(a.student.name || "").localeCompare(String(b.student.name || ""), "vi"),
        ),
    [students, salaryByStudent],
  );

  // Danh sách học sinh trong popup, sắp xếp theo ngày thu học phí sắp tới (kỳ kết thúc sớm nhất lên đầu).
  // Học sinh chưa đặt ngày thu xếp cuối; cùng ngày thu thì xếp theo tên.
  const studentsByBillingDate = useMemo(
    () =>
      [...students].sort((a: any, b: any) => {
        const ia = upcomingByStudent.get(String(a.id));
        const ib = upcomingByStudent.get(String(b.id));
        const ha = !!ia?.hasBillingDay;
        const hb = !!ib?.hasBillingDay;
        if (ha !== hb) return ha ? -1 : 1;
        if (ha && hb && ia!.end !== ib!.end) return ia!.end < ib!.end ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""), "vi");
      }),
    [students, upcomingByStudent],
  );

  // Gom học sinh theo ngày thu học phí: mỗi nhóm có số học sinh và tổng tiền sẽ nhận được đến ngày thu.
  // Nhóm sắp đến ngày thu nhất đứng đầu; nhóm chưa đặt ngày thu đứng cuối.
  const billingGroups = useMemo<BillingGroup[]>(() => {
    const map = new Map<string, BillingGroup>();
    students.forEach((s: any) => {
      const info = upcomingByStudent.get(String(s.id));
      if (!info) return;
      const key = info.billingDay ? String(info.billingDay) : "none";
      let g = map.get(key);
      if (!g) {
        let dueDate: string | null = null;
        if (info.hasBillingDay) {
          // Kỳ kết thúc ngày 24/10 thì ngày thu là 25/10 (ngày kế tiếp)
          const d = new Date(`${info.end}T00:00:00`);
          d.setDate(d.getDate() + 1);
          dueDate = toISODate(d);
        }
        g = { key, day: info.billingDay, count: 0, fee: 0, currentFee: 0, overdueFee: 0, start: info.start, end: info.end, dueDate };
        map.set(key, g);
      }
      g.count += 1;
      g.fee += info.fee;
      g.currentFee += info.currentFee;
      g.overdueFee += info.overdueFee;
    });
    return Array.from(map.values()).sort((a, b) => {
      if ((a.day == null) !== (b.day == null)) return a.day == null ? 1 : -1;
      return a.end.localeCompare(b.end) || (a.day || 0) - (b.day || 0);
    });
  }, [students, upcomingByStudent]);

  // Nhóm đang được chọn (null = tất cả, hoặc nhóm đã chọn không còn tồn tại)
  const activeGroup = billingFilter === "all" ? null : billingGroups.find((g) => g.key === billingFilter) || null;
  const activeGroupKey = activeGroup?.key ?? null;

  // Danh sách học sinh hiển thị trong popup sau khi lọc (giữ nguyên thứ tự theo ngày thu)
  const visibleStudents = useMemo(
    () =>
      activeGroupKey === null
        ? studentsByBillingDate
        : studentsByBillingDate.filter((s: any) => {
            const info = upcomingByStudent.get(String(s.id));
            return (info?.billingDay ? String(info.billingDay) : "none") === activeGroupKey;
          }),
    [studentsByBillingDate, upcomingByStudent, activeGroupKey],
  );

  // Gom các buổi trong kỳ hiện tại của một học sinh: đã học (có mặt) / chưa học (sắp tới)
  // (sessionList đã loại sẵn các buổi vắng / chưa điểm danh)
  const studentSessionGroups = (student: any) => {
    const sessions = upcomingByStudent.get(String(student.id))?.sessionList || [];
    const groups: Record<"attended" | "upcoming", SessionItem[]> = { attended: [], upcoming: [] };
    sessions.forEach((sess) => {
      const rec = sess.eventId ? attendanceByKey.get(`${sess.eventId}|${student.id}`) : undefined;
      if (rec?.present) groups.attended.push(sess);
      else groups.upcoming.push(sess);
    });
    return groups;
  };

  // Trạng thái điểm danh của một buổi đã qua (dùng cho danh sách buổi chưa thu của kỳ trước)
  const sessionStatusLabel = (sess: SessionItem, studentId: any) => {
    const rec = sess.eventId ? attendanceByKey.get(`${sess.eventId}|${studentId}`) : undefined;
    const isVi = lang === "vi";
    if (rec?.present) return isVi ? "Đã học" : "Attended";
    return rec ? (isVi ? "Vắng" : "Absent") : isVi ? "Chưa điểm danh" : "Not marked";
  };

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

  const activeStudentIds = new Set<string>();
  filteredPayments.forEach((p: any) => p.student_id && activeStudentIds.add(p.student_id));
  filteredAttendance.forEach((a: any) => a.student_id && activeStudentIds.add(a.student_id));
  const activeStudents = activeStudentIds.size;

  const activeClassIds = new Set<string>();
  filteredEvents.forEach((e: any) => e.class_id && activeClassIds.add(e.class_id));
  const activeClasses = activeClassIds.size;

  const paymentsCount = filteredPayments.length;

  // Lấy danh sách hóa đơn
  const rawUpcoming: { studentId: string; studentName: string; due: Date; label: string; amount: number; paid: boolean }[] = [];
  const today = new Date();
  const evList = events.data || [];
  const allPresentAttendance = (attendanceAll.data || []).filter((a: any) => a.present);
  const payList = payments.data || [];

  students.forEach((s: any) => {
    const isBySession = isBySessionStudent(s);

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

  // 🌟 HỌC PHÍ DỰ KIẾN TRONG KỲ (thẻ "Học phí dự kiến trong kỳ"): CỐ ĐỊNH, không phụ thuộc bộ lọc thời gian.
  // = tổng các hóa đơn CHƯA THU trong danh sách hóa đơn sắp tới (rawUpcoming ở trên), cộng tất cả học sinh.
  // Ví dụ: Thư 640.000 + Cua 1.000.000 + ... = tổng hiện trên thẻ.
  const expectedTotal = rawUpcoming.filter((u) => !u.paid).reduce((sum, u) => sum + u.amount, 0);
  // Số học sinh còn hóa đơn chưa thu (hiện phụ trên thẻ nổi bật)
  const unpaidStudentCount = new Set(rawUpcoming.filter((u) => !u.paid).map((u) => String(u.studentId))).size;
  // Tổng của danh sách đang hiển thị trong popup (theo tab Chưa thu / Đã thu / Tất cả)
  const billsListTotal = groupedUpcoming.reduce((sum, g) => sum + g.totalAmount, 0);

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

  /* ---------------- GIAO DIỆN ----------------
     Bố cục (từ trên xuống):
       1. Phần chào aurora + thẻ kính mờ "Ca tiếp theo" (đếm ngược theo phút, nút vào lớp, tỉ lệ có mặt hôm nay).
       2. Lịch 7 ngày tới: chọn từng ngày để xem các ca.
       3. Hàng chính: điểm danh nhanh dạng dòng thời gian (vạch "Bây giờ", nhật ký học tập) + ô "Tính học phí đến ngày".
       4. Tổng quan theo kỳ lọc kiểu bento: thẻ lớn học phí dự kiến + phân bổ theo ngày thu, học phí kỳ sắp tới,
          lương mặc định, biểu đồ có mặt 14 ngày, ba thẻ đếm gọn.
       5. Thanh lưu nổi ở đáy màn hình khi còn thay đổi chưa lưu.
     Chữ nào cũng nằm trong thẻ trắng đặc hoặc khối mận đậm nên đọc rõ trên mọi hình nền. */
  const vi = lang === "vi";

  // Màu riêng của từng học sinh, dùng chung bảng màu với trang Học sinh
  const studentColorMap = useMemo(
    () => new Map<string, string>(students.map((s: any) => [String(s.id), resolveStudentColor(s.color, s.id)])),
    [students],
  );
  const colorOf = (id: any) => studentColorMap.get(String(id)) || resolveStudentColor(null, String(id));
  const avatarBase = "grid shrink-0 place-items-center font-semibold";

  const DOW_SHORT = vi ? ["CN", "T2", "T3", "T4", "T5", "T6", "T7"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Ca học hôm nay có phải lớp online không, và link vào lớp (nếu có)
  const onlineOf = (group: any) => {
    const cls = (classes.data || []).find((c: any) => String(c.id) === String(group.event.class_id));
    return getOnlineInfo(cls, group.event);
  };

  // Ca đang diễn ra / sắp tới / đã kết thúc theo giờ hiện tại
  // Đồng hồ làm mới mỗi phút để trạng thái ca học và đếm ngược luôn đúng mà không cần tải lại trang
  const [, setClockTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClockTick((n) => n + 1), 60000);
    return () => window.clearInterval(id);
  }, []);
  const clockNow = new Date();
  const nowMinutes = clockNow.getHours() * 60 + clockNow.getMinutes();
  const shiftStatusOf = (ev: any): ShiftStatus => {
    const s = toMinutes(ev.start_time);
    const e = toMinutes(ev.end_time);
    if (s == null) return "allday";
    if (e != null && nowMinutes >= e) return "done";
    if (nowMinutes >= s) return "live";
    return "soon";
  };

  // ---- Nhật ký học tập ghi nhanh ngay trong thẻ ca học ----
  const sk = (evId: any, sid: any) => `${evId}:${sid}`;
  const existingText = (evId: any, sid: any, col: LogCol): string => {
    const rec = attendanceByKey.get(`${evId}|${sid}`);
    return rec ? String(rawVal(rec, col) ?? "") : "";
  };
  const existingTests = (evId: any, sid: any): TestItem[] => {
    const rec = attendanceByKey.get(`${evId}|${sid}`);
    return rec ? parseTests(rawVal(rec, LOG.testName), rawVal(rec, LOG.testScore)) : [];
  };
  // Danh sách đang hiển thị: bản nháp nếu có, không thì dữ liệu đã lưu. Luôn có ít nhất 1 dòng để nhập.
  const testsOf = (evId: any, sid: any): TestItem[] => withSpare(studentLogDraft[sk(evId, sid)]?.tests ?? existingTests(evId, sid));
  const noteOf = (evId: any, sid: any): string => studentLogDraft[sk(evId, sid)]?.note ?? existingText(evId, sid, LOG.note);
  const mutateTests = (evId: any, sid: any, fn: (items: TestItem[]) => TestItem[]) =>
    setStudentLogDraft((d) => {
      const k = sk(evId, sid);
      return { ...d, [k]: { ...d[k], tests: fn(withSpare(d[k]?.tests ?? existingTests(evId, sid))) } };
    });
  const setShiftField = (evId: string, field: keyof ShiftLogDraft, value: string) =>
    setShiftLogDraft((d) => ({ ...d, [evId]: { ...d[evId], [field]: value } }));
  // Giá trị chung của một ô dùng chung cả ca: có sẵn nếu mọi học sinh có mặt đang cùng một nội dung;
  // khác nhau (mixed) thì để trống và nhắc rằng nhập mới sẽ ghi đè cho cả ca
  const sharedOf = (evId: string, present: any[], col: LogCol) => {
    const vals = new Set<string>();
    present.forEach((s: any) => {
      const v = existingText(evId, s.id, col).trim();
      if (v) vals.add(v);
    });
    return { value: vals.size === 1 ? Array.from(vals)[0] : "", mixed: vals.size > 1 };
  };

  const renderShiftLog = (group: any) => {
    if (group.students.length === 0) return null;
    const evId = String(group.event.id);
    const shiftMap = attendanceMap[evId] || {};
    const present = group.students.filter((s: any) => !!shiftMap[String(s.id)]);
    const open = !!openLog[evId];
    const loggedN = present.filter((s: any) => existingText(evId, s.id, LOG.content).trim() !== "").length;
    const draft = shiftLogDraft[evId];
    const hasDraft =
      !!(draft?.content || "").trim() ||
      !!(draft?.homework || "").trim() ||
      Object.keys(studentLogDraft).some((k) => k.startsWith(`${evId}:`));
    const contentShared = sharedOf(evId, present, LOG.content);
    const homeworkShared = sharedOf(evId, present, LOG.homework);

    return (
      <div className="border-t border-zinc-100">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpenLog((o) => ({ ...o, [evId]: !o[evId] }))}
          className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-zinc-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3B1553]/40"
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold text-zinc-800">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-100 text-zinc-500">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
            </span>
            {vi ? "Nhật ký học tập" : "Learning log"}
            {present.length > 0 && (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums",
                  loggedN === present.length ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500",
                )}
              >
                {loggedN}/{present.length} {vi ? "đã ghi" : "logged"}
              </span>
            )}
            {hasDraft && (
              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">{vi ? "Chưa lưu" : "Unsaved"}</span>
            )}
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", open && "rotate-180")} />
        </button>

        {open && (
          <div className="space-y-4 border-t border-zinc-100 bg-zinc-50/60 p-4">
            {present.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-4 py-5 text-center text-xs text-zinc-500">
                {vi ? "Chạm tên học sinh có mặt ở trên để ghi nhật ký." : "Mark students as present above to write their log."}
              </div>
            ) : (
              <>
                <p className="text-xs text-zinc-500">
                  {vi
                    ? `Nội dung và bài tập áp dụng chung cho ${present.length} học sinh có mặt, hiện trong hóa đơn gửi phụ huynh.`
                    : `Lesson content and homework apply to all ${present.length} present students and appear on the parent invoice.`}
                </p>

                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <LogLabel icon={BookOpen} text={vi ? "Nội dung buổi học" : "Lesson content"} />
                    <Textarea
                      rows={3}
                      aria-label={vi ? "Nội dung buổi học" : "Lesson content"}
                      placeholder={vi ? "Hôm nay học gì..." : "What was taught today..."}
                      className={cn("min-h-[84px] resize-y", LOG_FIELD)}
                      value={draft?.content ?? contentShared.value}
                      onChange={(e) => setShiftField(evId, "content", e.target.value)}
                    />
                    {contentShared.mixed && draft?.content === undefined && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        {vi
                          ? "Các học sinh đang có nội dung khác nhau, nhập ở đây sẽ ghi đè cho cả ca."
                          : "Students currently have different entries; typing here overwrites them for the whole shift."}
                      </p>
                    )}
                  </div>
                  <div>
                    <LogLabel icon={ClipboardList} text={vi ? "Bài tập về nhà" : "Homework"} />
                    <Textarea
                      rows={3}
                      aria-label={vi ? "Bài tập về nhà" : "Homework"}
                      placeholder={vi ? "Bài tập giao cho buổi sau..." : "Homework for the next session..."}
                      className={cn("min-h-[84px] resize-y", LOG_FIELD)}
                      value={draft?.homework ?? homeworkShared.value}
                      onChange={(e) => setShiftField(evId, "homework", e.target.value)}
                    />
                    {homeworkShared.mixed && draft?.homework === undefined && (
                      <p className="mt-1 text-[11px] text-amber-700">
                        {vi
                          ? "Các học sinh đang có bài tập khác nhau, nhập ở đây sẽ ghi đè cho cả ca."
                          : "Students currently have different entries; typing here overwrites them for the whole shift."}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  {present.map((student: any) => {
                    const key = sk(evId, student.id);
                    const defaultOpen = present.length <= 2;
                    const sOpen = openStudentLog[key] ?? defaultOpen;
                    const tests = testsOf(evId, student.id);
                    const lastBlank = isBlankTest(tests[tests.length - 1]);
                    const testN = cleanTests(tests).length;
                    const note = noteOf(evId, student.id);
                    return (
                      <div key={student.id} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
                        <button
                          type="button"
                          aria-expanded={sOpen}
                          onClick={() => setOpenStudentLog((o) => ({ ...o, [key]: !(o[key] ?? defaultOpen) }))}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#3B1553]/40"
                        >
                          <span className="flex min-w-0 flex-wrap items-center gap-2">
                            <span className={cn(avatarBase, "h-8 w-8 rounded-full text-xs")} style={solid(colorOf(student.id))}>
                              {student.name ? student.name.slice(0, 1).toUpperCase() : "?"}
                            </span>
                            <span className="truncate text-sm font-semibold text-zinc-900">{student.name}</span>
                            {testN > 0 && (
                              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-700">
                                {testN} {vi ? "bài kiểm tra" : testN > 1 ? "tests" : "test"}
                              </span>
                            )}
                            {note.trim() !== "" && (
                              <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">{vi ? "Có ghi chú" : "Has note"}</span>
                            )}
                          </span>
                          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", sOpen && "rotate-180")} />
                        </button>

                        {sOpen && (
                          <div className="grid gap-3 border-t border-zinc-100 p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                            <div className="min-w-0">
                              <LogLabel icon={ClipboardCheck} text={vi ? "Bài kiểm tra" : "Tests"} />
                              <div className="space-y-2">
                                {tests.map((tItem, i) => (
                                  <div key={i} className="flex gap-2">
                                    <Input
                                      type="text"
                                      aria-label={`${vi ? "Tên bài kiểm tra" : "Test name"} ${i + 1}`}
                                      placeholder={vi ? "Tên bài kiểm tra" : "Test name"}
                                      className={cn("h-9 min-w-0 flex-1", LOG_FIELD)}
                                      value={tItem.name}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        mutateTests(evId, student.id, (items) => items.map((x, j) => (j === i ? { ...x, name: v } : x)));
                                      }}
                                    />
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      aria-label={`${vi ? "Điểm kiểm tra" : "Test score"} ${i + 1}`}
                                      placeholder={vi ? "Điểm" : "Score"}
                                      className={cn("h-9 w-16 shrink-0 text-center font-semibold tabular-nums", LOG_FIELD)}
                                      value={tItem.score}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        mutateTests(evId, student.id, (items) => items.map((x, j) => (j === i ? { ...x, score: v } : x)));
                                      }}
                                    />
                                    <button
                                      type="button"
                                      aria-label={`${vi ? "Xóa bài kiểm tra" : "Remove test"} ${i + 1}`}
                                      onClick={() => mutateTests(evId, student.id, (items) => items.filter((_, j) => j !== i))}
                                      className={cn(
                                        "grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-zinc-200 text-zinc-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30",
                                        tests.length > 1 || !isBlankTest(tItem) ? "" : "invisible",
                                      )}
                                    >
                                      <X className="h-4 w-4" aria-hidden="true" />
                                    </button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  disabled={lastBlank}
                                  onClick={() => mutateTests(evId, student.id, (items) => [...items, { ...EMPTY_TEST }])}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-dashed border-zinc-300 px-3 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
                                >
                                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                                  {vi ? "Thêm bài kiểm tra" : "Add test"}
                                </button>
                              </div>
                            </div>
                            <div className="min-w-0">
                              <LogLabel icon={StickyNote} text={vi ? "Ghi chú" : "Note"} />
                              <Input
                                type="text"
                                aria-label={vi ? "Ghi chú" : "Note"}
                                placeholder={vi ? "Nhận xét thêm cho phụ huynh..." : "Extra comments for parents..."}
                                className={cn("h-9", LOG_FIELD)}
                                value={note}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setStudentLogDraft((d) => ({ ...d, [key]: { ...d[key], note: v } }));
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <p className="text-[11px] text-zinc-400">
                  {vi
                    ? "Bấm “Lưu điểm danh” để lưu cùng lúc. Nội dung và bài tập chung để trống thì giữ nguyên dữ liệu cũ."
                    : "Press “Save attendance” to save everything at once. Leaving shared content or homework empty keeps the existing entries."}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // Tiến độ điểm danh hôm nay (cộng tất cả các ca)
  const todayTotalStudents = todayShiftGroups.reduce((n, g) => n + g.students.length, 0);
  const todayPresentTotal = todayShiftGroups.reduce(
    (n, g) => n + g.students.filter((s: any) => !!(attendanceMap[g.event.id] || {})[String(s.id)]).length,
    0,
  );
  const todayPct = todayTotalStudents > 0 ? Math.round((todayPresentTotal / todayTotalStudents) * 100) : 0;

  // Điểm danh đang chọn khác với dữ liệu đã lưu? (ca mới chưa có bản ghi thì chỉ "khác" khi có người được đánh dấu có mặt)
  const attendanceDirty = useMemo(
    () =>
      todayShiftGroups.some((g) => {
        const shiftMap = attendanceMap[String(g.event.id)];
        if (!shiftMap) return false;
        return g.students.some((s: any) => {
          const sid = String(s.id);
          const saved = g.event.virtual ? undefined : attendanceByKey.get(`${g.event.id}|${sid}`);
          return !!shiftMap[sid] !== !!saved?.present;
        });
      }),
    [todayShiftGroups, attendanceMap, attendanceByKey],
  );
  const unsavedLogs =
    Object.values(shiftLogDraft).some((d) => !!(d?.content || "").trim() || !!(d?.homework || "").trim()) ||
    Object.keys(studentLogDraft).length > 0;
  const hasPending = todayShiftGroups.length > 0 && (attendanceDirty || unsavedLogs);

  // Ô "Tính học phí đến ngày": danh sách hiển thị (tắt "gồm buổi đã học chưa thu" thì bỏ phần đó khỏi từng dòng và tổng)
  const fullDate = (d: string) => (d && d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "");
  const calcRows = tuitionCalc.rows
    .map((r) => ({ ...r, total: r.upcoming + (calcIncludeOwed ? r.owed : 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || String(a.student.name || "").localeCompare(String(b.student.name || ""), "vi"));
  const calcTotal = calcRows.reduce((n, r) => n + r.total, 0);
  const calcPresets = [
    { k: "eom", vi: "Hết tháng này", en: "End of month", date: toISO(endOfThisMonth()) },
    { k: "nom", vi: "Đầu tháng sau", en: "Next month", date: toISO(new Date(today.getFullYear(), today.getMonth() + 1, 1)) },
    { k: "d30", vi: "30 ngày tới", en: "Next 30 days", date: toISO(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)) },
  ];

  // Một dòng buổi học trong popup: ô ngày + lớp & giờ + học phí (status chỉ dùng cho các kỳ trước)
  const renderSessionRow = (sess: SessionItem, student: any, status?: string) => {
    const dow = new Date(`${sess.date}T00:00:00`).getDay();
    return (
      <div key={sess.key} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-white px-2.5 py-2">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-zinc-100 text-center leading-none">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500">{DOW_SHORT[dow]}</div>
            <div className="mt-1 text-xs font-semibold tabular-nums text-zinc-900">{shortDate(sess.date)}</div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">{sess.className}</div>
          <div className="truncate text-xs tabular-nums text-zinc-500">
            {sess.start} – {sess.end}
            {status ? ` · ${status}` : ""}
          </div>
        </div>
        {isBySessionStudent(student) && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-zinc-900">
            {formatVND(Number((classes.data || []).find((c: any) => String(c.id) === sess.classId)?.fee_per_session || 0))}
          </span>
        )}
      </div>
    );
  };

  const greeting =
    today.getHours() < 11
      ? vi ? "Chào buổi sáng" : "Good morning"
      : today.getHours() < 14
      ? vi ? "Chào buổi trưa" : "Good midday"
      : today.getHours() < 18
      ? vi ? "Chào buổi chiều" : "Good afternoon"
      : vi ? "Chào buổi tối" : "Good evening";
  const dateLabel = today.toLocaleDateString(vi ? "vi-VN" : "en-US", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  const displayName = (profile as any)?.brand_name || profile?.display_name || brandName;

  /* ---------------- DỮ LIỆU CHO CÁC KHỐI MỚI ---------------- */

  // Ca tiếp theo (hoặc đang diễn ra) trong hôm nay, kèm số phút còn lại tới lúc bắt đầu / kết thúc
  const shiftsDone = todayShiftGroups.filter((g) => shiftStatusOf(g.event) === "done").length;
  const nextUp = (() => {
    const live = todayShiftGroups.find((g) => shiftStatusOf(g.event) === "live");
    if (live) return { group: live, status: "live" as const };
    const soon = todayShiftGroups.find((g) => shiftStatusOf(g.event) === "soon");
    if (soon) return { group: soon, status: "soon" as const };
    return null;
  })();
  const nextStart = nextUp ? toMinutes(nextUp.group.event.start_time) : null;
  const nextEnd = nextUp ? toMinutes(nextUp.group.event.end_time) : null;
  const nextMins = nextUp ? (nextUp.status === "live" ? (nextEnd != null ? nextEnd - nowMinutes : null) : nextStart != null ? nextStart - nowMinutes : null) : null;
  const nextOnline = nextUp ? onlineOf(nextUp.group) : null;
  const heroSub =
    todayShiftGroups.length === 0
      ? vi
        ? "Hôm nay không có ca học nào, tranh thủ rà lại học phí nhé."
        : "No classes today, a good moment to review tuition."
      : vi
      ? `Hôm nay có ${todayShiftGroups.length} ca học với ${todayTotalStudents} lượt học sinh${shiftsDone > 0 ? `, đã xong ${shiftsDone} ca` : ""}.`
      : `${todayShiftGroups.length} classes today with ${todayTotalStudents} student slots${shiftsDone > 0 ? `, ${shiftsDone} done` : ""}.`;
  // Số lớn + đơn vị nhỏ: "42 phút" hoặc "1 giờ 05 phút"
  const renderDur = (m: number) => {
    const mm = Math.max(m, 0);
    const h = Math.floor(mm / 60);
    const r = mm % 60;
    const unit = (txt: string) => <span className="ml-1 mr-2 text-sm font-medium text-white/55">{txt}</span>;
    return (
      <span className={cn(MONO, "text-4xl font-bold tabular-nums tracking-tight text-[#FFD27A]")}>
        {h > 0 && (
          <>
            {h}
            {unit(vi ? "giờ" : "h")}
          </>
        )}
        {h > 0 ? String(r).padStart(2, "0") : Math.max(r, 1)}
        {unit(vi ? "phút" : "min")}
      </span>
    );
  };
  const scrollToAttendance = () => document.getElementById("diem-danh")?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Dải lịch 7 ngày tới: các buổi theo lịch cố định + buổi thêm tay (cùng quy tắc với phần tính học phí), bỏ buổi đã hủy
  const [weekSel, setWeekSel] = useState<string | null>(null);
  const weekDays = useMemo(() => {
    const out: { date: string; dow: number; day: string; sessions: SessionItem[] }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const date = toISO(d);
      const sessions: SessionItem[] = [];
      (classes.data || []).forEach((c: any) => sessions.push(...buildClassSessions(c, date, date, schedules.data || [], events.data || [])));
      sessions.sort((a, b) => a.start.localeCompare(b.start));
      out.push({ date, dow: d.getDay(), day: String(d.getDate()), sessions });
    }
    return out;
  }, [classes.data, schedules.data, events.data]);
  const selDay = weekDays.find((d) => d.date === weekSel) || weekDays[0];
  const weekTotal = weekDays.reduce((n, d) => n + d.sessions.length, 0);

  // Lượt có mặt 14 ngày gần nhất (đã lưu trong bảng điểm danh)
  const attendance14 = useMemo(() => {
    const dateOfEvent = new Map<string, string>();
    (events.data || []).forEach((e: any) => {
      if (e.event_date) dateOfEvent.set(String(e.id), String(e.event_date).slice(0, 10));
    });
    const counts = new Map<string, number>();
    (attendanceAll.data || []).forEach((a: any) => {
      if (!a.present) return;
      const d = dateOfEvent.get(String(a.event_id));
      if (d) counts.set(d, (counts.get(d) || 0) + 1);
    });
    const out: { date: string; dow: number; day: string; n: number; isToday: boolean }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      const date = toISO(d);
      out.push({ date, dow: d.getDay(), day: String(d.getDate()), n: counts.get(date) || 0, isToday: i === 0 });
    }
    return out;
  }, [events.data, attendanceAll.data]);
  const att14Total = attendance14.reduce((n, d) => n + d.n, 0);
  const att14Max = Math.max(1, ...attendance14.map((d) => d.n));
  const att14ActiveDays = attendance14.filter((d) => d.n > 0).length;
  const att14Avg = att14ActiveDays > 0 ? Math.round((att14Total / att14ActiveDays) * 10) / 10 : 0;

  // Học sinh còn hóa đơn chưa thu (dùng cho chồng avatar ở thẻ nổi bật)
  const unpaidIds = new Set(rawUpcoming.filter((u) => !u.paid).map((u) => String(u.studentId)));
  const unpaidStudents = students.filter((s: any) => unpaidIds.has(String(s.id)));

  // Phân bổ học phí theo ngày thu (mỗi nhóm một màu) + cơ cấu kỳ hiện tại / chưa thu kỳ trước
  const groupsColored = billingGroups.map((g, i) => ({ ...g, color: GROUP_COLORS[i % GROUP_COLORS.length] }));
  const groupLabel = (g: BillingGroup) => (g.day ? (vi ? `Ngày ${g.day}` : `Day ${g.day}`) : vi ? "Chưa đặt ngày" : "Not set");
  const currentOnly = Math.max(0, totalUpcomingFee - totalOverdueFee);
  const overduePct = totalUpcomingFee > 0 ? Math.round((totalOverdueFee / totalUpcomingFee) * 100) : 0;

  // Vị trí vạch "Bây giờ" trên dòng thời gian: trước ca đầu tiên chưa kết thúc (không hiện khi đang có ca diễn ra)
  const firstOpenIdx = todayShiftGroups.findIndex((g) => shiftStatusOf(g.event) !== "done");
  const nowIdx = firstOpenIdx === -1 ? todayShiftGroups.length : firstOpenIdx;
  const showNowMarker = todayShiftGroups.length > 0 && !(firstOpenIdx !== -1 && shiftStatusOf(todayShiftGroups[firstOpenIdx].event) === "live");
  const nowLabel = `${String(clockNow.getHours()).padStart(2, "0")}:${String(clockNow.getMinutes()).padStart(2, "0")}`;

  const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553] focus-visible:ring-offset-2 focus-visible:ring-offset-white";
  const rise = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;

  // Thẻ đếm gọn ở hàng cuối của phần tổng quan
  const renderCounter = (key: "students" | "classes" | "payments", to: string, label: string, value: number, sub: string, Icon: any, delay: number) => {
    const tone = TONES[key];
    return (
      <Link key={key} to={to} className={cn("group block rounded-[28px] lg:col-span-4", focusRing)}>
        <Spot
          tint="rgba(99,102,241,0.08)"
          className={cn(CARD, "dash-rise flex h-full items-center gap-4 overflow-hidden p-4 transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(59,21,83,0.05),0_22px_44px_-18px_rgba(59,21,83,0.3)] sm:p-5")}
          style={rise(delay)}
        >
          <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", tone.tile)}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-zinc-500">{label}</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tabular-nums tracking-tight text-zinc-900">
                {loading ? <Skeleton className="inline-block h-7 w-12 align-middle" /> : <CountNum value={value} />}
              </span>
              <span className="truncate text-xs text-zinc-400">{sub}</span>
            </div>
          </div>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-zinc-100 text-zinc-400 transition-colors duration-200 group-hover:bg-[#3B1553] group-hover:text-[#FFB547]">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </Spot>
      </Link>
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
      "h-8 rounded-full px-3.5 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30",
      active ? "bg-[#3B1553] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900"
    );
  const datePill = "flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm focus-within:border-[#3B1553] focus-within:ring-2 focus-within:ring-[#3B1553]/10";

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", hasPending && "pb-28", FONT)}>
      <style>{DASH_CSS}</style>

      {/* ========== 1. PHẦN CHÀO (aurora) + CA TIẾP THEO ========== */}
      <section
        className="dash-rise relative isolate overflow-hidden rounded-[36px] p-6 text-white shadow-[0_30px_60px_-30px_rgba(59,21,83,0.85)] sm:p-9"
        style={HERO_BG}
      >
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          <div className="dash-aurora-a absolute -left-24 -top-32 h-96 w-96 rounded-full bg-fuchsia-500/60 blur-[90px]" />
          <div className="dash-aurora-b absolute -right-16 -top-10 h-[26rem] w-[26rem] rounded-full bg-[#FFB547]/40 blur-[100px]" />
          <div className="dash-aurora-c absolute -bottom-44 left-1/3 h-96 w-96 rounded-full bg-pink-400/30 blur-[100px]" />
          <div className="absolute inset-0" style={DOT_BG} />
        </div>

        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-stretch">
          <div className="flex min-w-0 flex-col justify-between gap-8">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-[#FFB547] ring-1 ring-white/10">
                  <Sparkles className="h-3.5 w-3.5" />
                  {t.dashboard || (vi ? "Bảng điều khiển" : "Dashboard")}
                </span>
                <span className="text-xs font-medium text-white/60 first-letter:uppercase">{dateLabel}</span>
              </div>
              <h1 className="text-4xl font-extrabold leading-[1.08] tracking-tight sm:text-5xl">
                {greeting},
                <br />
                <span className="dash-sheen bg-gradient-to-r from-[#FFD27A] via-[#FF9A6B] to-[#FFD27A] bg-clip-text text-transparent">{displayName}</span>
              </h1>
              <p className="max-w-md text-sm leading-relaxed text-white/65">{heroSub}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setShowExpectedModal(true)}
                className={cn(
                  CHIP_BTN,
                  unpaidStudentCount > 0 && "border-[#FFB547]/40 bg-[#FFB547]/15 text-[#FFD9A0] hover:bg-[#FFB547]/25",
                )}
              >
                {unpaidStudentCount > 0 ? (
                  <>
                    <Hourglass className="h-4 w-4 text-[#FFB547]" />
                    <span className="tabular-nums">
                      {vi ? "Chưa thu" : "Unpaid"} {formatVND(expectedTotal)}
                    </span>
                    <span className="text-white/50">·</span>
                    <span className="tabular-nums">
                      {unpaidStudentCount} {vi ? "HS" : "students"}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    {vi ? "Đã thu đủ học phí" : "All tuition collected"}
                  </>
                )}
              </button>
              <span className={CHIP}>
                <Clock className="h-4 w-4 text-[#FFB547]" />
                {vi ? `${todayShiftGroups.length} ca học hôm nay` : `${todayShiftGroups.length} classes today`}
              </span>
              <BackgroundPicker vi={vi} className={CHIP_BTN} />
            </div>
          </div>

          {/* Thẻ kính mờ: ca đang diễn ra / sắp tới + tỉ lệ có mặt hôm nay */}
          <div className={cn(GLASS, "relative flex min-w-0 flex-col justify-between gap-6 overflow-hidden rounded-[28px] p-5 sm:p-6")}>
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/60">
                {nextUp?.status === "live" ? (
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/70 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                  </span>
                ) : (
                  <Timer className="h-3.5 w-3.5" />
                )}
                {nextUp
                  ? nextUp.status === "live"
                    ? vi ? "Đang diễn ra" : "Happening now"
                    : vi ? "Ca tiếp theo" : "Up next"
                  : vi ? "Hôm nay" : "Today"}
              </span>
              {nextUp && nextOnline?.online && nextOnline.url && (
                <a
                  href={nextOnline.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FFB547] px-3.5 text-xs font-semibold text-[#3B1553] shadow-sm shadow-[#FFB547]/40 transition-colors hover:bg-[#ffa726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <Video className="h-3.5 w-3.5" />
                  {vi ? "Vào lớp" : "Join class"}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              )}
            </div>

            {nextUp ? (
              <div className="space-y-4">
                <div className="min-w-0">
                  <div className="truncate text-xl font-bold tracking-tight">{nextUp.group.className}</div>
                  <div className={cn(MONO, "mt-1 text-sm text-white/60")}>{nextUp.group.timeLabel}</div>
                </div>
                {nextMins != null && (
                  <div className="flex flex-wrap items-baseline gap-x-1">
                    {renderDur(nextMins)}
                    <span className="text-sm text-white/55">
                      {nextUp.status === "live" ? (vi ? "nữa kết thúc" : "left") : vi ? "nữa bắt đầu" : "to start"}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10 text-[#FFD27A] ring-1 ring-white/10">
                  {todayShiftGroups.length === 0 ? <CalendarCheck2 className="h-6 w-6" /> : <CheckCheck className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold leading-snug">
                    {todayShiftGroups.length === 0
                      ? vi ? "Hôm nay không có ca học" : "No classes today"
                      : vi ? "Đã xong các ca hôm nay" : "All done for today"}
                  </div>
                  <div className="text-sm text-white/60">
                    {todayShiftGroups.length === 0
                      ? vi ? "Một ngày nhẹ nhàng." : "A light day."
                      : vi ? `${shiftsDone} ca đã kết thúc` : `${shiftsDone} classes finished`}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-white/10 pt-4">
              <div className="relative grid shrink-0 place-items-center">
                <ProgressRing pct={todayPct} size={56} stroke={5} />
                <span className="absolute text-xs font-bold tabular-nums">{todayPct}%</span>
              </div>
              <div className="min-w-[9rem] flex-1">
                <div className="whitespace-nowrap text-xs font-medium text-white/60">{vi ? "Điểm danh hôm nay" : "Today's attendance"}</div>
                <div className="whitespace-nowrap text-lg font-bold tabular-nums">
                  {todayPresentTotal}
                  <span className="text-sm font-medium text-white/50">
                    /{todayTotalStudents} {vi ? "có mặt" : "present"}
                  </span>
                </div>
              </div>
              {todayShiftGroups.length > 0 && (
                <button
                  type="button"
                  onClick={scrollToAttendance}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  {vi ? "Điểm danh" : "Mark"}
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ========== 2. LỊCH 7 NGÀY TỚI ========== */}
      <section className={cn(CARD, "dash-rise p-4 sm:p-5")} style={rise(80)}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-1 pb-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-600">
              <CalendarDays className="h-[18px] w-[18px]" />
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{vi ? "Lịch dạy" : "Schedule"}</div>
              <h2 className="text-base font-bold leading-tight text-zinc-900">{vi ? "7 ngày tới" : "Next 7 days"}</h2>
            </div>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium tabular-nums text-zinc-600">
            {weekTotal} {vi ? "ca học" : "classes"}
          </span>
        </div>

        <div className="grid grid-cols-7 gap-1.5 sm:gap-2.5">
          {weekDays.map((d, i) => {
            const active = d.date === selDay.date;
            return (
              <button
                key={d.date}
                type="button"
                aria-pressed={active}
                onClick={() => setWeekSel(d.date)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/40 sm:py-3.5",
                  active
                    ? "border-[#3B1553] bg-[#3B1553] text-white shadow-lg shadow-[#3B1553]/25"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  i === 0 && !active && "ring-2 ring-[#FFB547]/60",
                )}
              >
                <span className={cn("text-[10px] font-semibold uppercase tracking-wide", active ? "text-white/60" : "text-zinc-400")}>
                  {DOW_SHORT[d.dow]}
                </span>
                <span className="text-lg font-extrabold leading-none tabular-nums sm:text-2xl">{d.day}</span>
                <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                  {d.sessions.slice(0, 4).map((s, k) => (
                    <span key={`${s.key}-${k}`} className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-[#FFB547]" : "bg-violet-400")} />
                  ))}
                </span>
                <span className={cn("text-[10px] font-medium tabular-nums", active ? "text-white/70" : "text-zinc-500")}>
                  {d.sessions.length > 0 ? `${d.sessions.length} ${vi ? "ca" : "cls"}` : "—"}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl bg-zinc-50 p-3">
          {selDay.sessions.length === 0 ? (
            <span className="px-1 text-xs text-zinc-500">
              {vi ? `Không có ca học ngày ${shortDate(selDay.date)}` : `No classes on ${shortDate(selDay.date)}`}
            </span>
          ) : (
            selDay.sessions.map((s) => (
              <span key={s.key} className="inline-flex max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white py-1 pl-1 pr-3 text-xs shadow-sm">
                <span className={cn(MONO, "shrink-0 rounded-full bg-[#3B1553] px-2.5 py-1 text-[11px] font-semibold text-white")}>{s.start}</span>
                <span className="truncate font-medium text-zinc-800">{s.className}</span>
              </span>
            ))
          )}
        </div>
      </section>

      {/* ========== 3. HÔM NAY: ĐIỂM DANH NHANH + TÍNH HỌC PHÍ ĐẾN NGÀY ========== */}
      <div className="grid items-start gap-4 lg:grid-cols-12">
        {/* ĐIỂM DANH NHANH (dòng thời gian) */}
        <section id="diem-danh" className={cn(CARD, "dash-rise scroll-mt-4 space-y-5 p-5 sm:p-6 lg:col-span-8")} style={rise(120)}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[#FFB547] shadow-lg shadow-[#3B1553]/20" style={ICON_TILE_BG}>
                <UserCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900">{vi ? "Điểm danh nhanh hôm nay" : "Today's quick attendance"}</h2>
                <p className="max-w-md text-xs leading-relaxed text-zinc-500">
                  {vi
                    ? "Chạm vào tên học sinh có mặt, ghi nhanh nhật ký học tập nếu cần, rồi lưu một lần cho tất cả ca"
                    : "Tap the students who are present, jot down the learning log if needed, then save once for all shifts"}
                </p>
              </div>
            </div>
            {todayShiftGroups.length > 0 && (
              <Button
                onClick={handleSaveAllAttendance}
                disabled={savingAttendance}
                className="h-10 shrink-0 gap-2 rounded-xl bg-[#3B1553] px-4 text-sm font-semibold text-white shadow-md shadow-[#3B1553]/25 hover:bg-[#521F70]"
              >
                <CheckCircle2 className="h-4 w-4 text-[#FFB547]" />
                {savingAttendance ? (vi ? "Đang lưu..." : "Saving...") : vi ? "Lưu điểm danh" : "Save attendance"}
              </Button>
            )}
          </div>

          {attendanceAll.isLoading && todayShiftGroups.length > 0 ? (
            <div className="space-y-3">
              <Skeleton className="h-44 w-full rounded-3xl" />
              <Skeleton className="h-44 w-full rounded-3xl" />
            </div>
          ) : todayShiftGroups.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 py-12 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-white text-zinc-400 shadow-sm ring-1 ring-zinc-200">
                <CalendarCheck2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-zinc-800">{vi ? "Hôm nay không có ca học nào" : "No classes scheduled today"}</p>
                <p className="text-xs text-zinc-500">{vi ? "Bạn có thể nghỉ ngơi, hoặc xem lại lịch các lớp." : "Enjoy the break, or review your class schedules."}</p>
              </div>
              <Link
                to="/classes"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30"
              >
                {vi ? "Xem các lớp" : "View classes"}
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ) : (
            <div className="relative space-y-4">
              <div aria-hidden className="absolute bottom-4 left-[11px] top-4 w-px bg-gradient-to-b from-zinc-200 via-zinc-200 to-transparent" />
              {todayShiftGroups.map((group, idx) => {
                const evId = group.event.id;
                const shiftMap = attendanceMap[evId] || {};
                const total = group.students.length;
                const presentCount = group.students.filter((s: any) => !!shiftMap[String(s.id)]).length;
                const allPresent = total > 0 && presentCount === total;
                const shiftPct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
                const online = onlineOf(group);
                const st = shiftStatusOf(group.event);
                const stCfg = SHIFT_STATUS[st];
                return (
                  <Fragment key={evId}>
                    {showNowMarker && idx === nowIdx && (
                      <div className="relative pl-8 sm:pl-9">
                        <span className="absolute left-[7px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-rose-500 ring-4 ring-rose-100" />
                        <div className="flex items-center gap-3">
                          <span className={cn(MONO, "rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-semibold text-white")}>{nowLabel}</span>
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">{vi ? "Bây giờ" : "Now"}</span>
                          <span className="h-px flex-1 bg-gradient-to-r from-rose-300 to-transparent" />
                        </div>
                      </div>
                    )}
                    <div className="relative pl-8 sm:pl-9">
                      <span className="absolute left-0 top-6 grid h-6 w-6 place-items-center rounded-full bg-white ring-2 ring-zinc-200">
                        <span className={cn("h-2.5 w-2.5 rounded-full", stCfg.dot, st === "live" && "animate-pulse motion-reduce:animate-none")} />
                      </span>
                      <div
                        className={cn(
                          "overflow-hidden rounded-3xl border bg-white transition-shadow",
                          st === "live" ? "border-emerald-300 shadow-[0_0_0_4px_rgba(16,185,129,0.08)]" : "border-zinc-200/80",
                          st === "done" && "opacity-90",
                        )}
                      >
                        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-100 bg-zinc-50/60 p-3 sm:p-4">
                          <div
                            className="grid h-14 w-16 shrink-0 place-items-center rounded-2xl text-white shadow-md shadow-[#3B1553]/20"
                            style={ICON_TILE_BG}
                          >
                            {group.event.start_time ? (
                              <div className="text-center leading-none">
                                <div className={cn(MONO, "text-sm font-semibold tabular-nums")}>{String(group.event.start_time).slice(0, 5)}</div>
                                {group.event.end_time && (
                                  <div className={cn(MONO, "mt-1.5 text-[10px] tabular-nums text-white/55")}>{String(group.event.end_time).slice(0, 5)}</div>
                                )}
                              </div>
                            ) : (
                              <CalendarCheck2 className="h-5 w-5 text-[#FFB547]" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1 basis-[10rem] space-y-1.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                to={`/classes/${group.event.class_id}`}
                                className="truncate text-base font-bold text-zinc-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30"
                              >
                                {group.className}
                              </Link>
                              <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1", stCfg.pill)}>
                                <span className={cn("h-1.5 w-1.5 rounded-full", stCfg.dot, st === "live" && "animate-pulse motion-reduce:animate-none")} />
                                {vi ? stCfg.vi : stCfg.en}
                              </span>
                              {online.online && (
                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 ring-1 ring-sky-100">Online</span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <div className="h-1.5 w-28 overflow-hidden rounded-full bg-zinc-200">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-300 motion-reduce:transition-none"
                                  style={{ width: `${shiftPct}%` }}
                                />
                              </div>
                              <span className="whitespace-nowrap text-xs font-medium tabular-nums text-zinc-500">
                                {presentCount}/{total} {vi ? "có mặt" : "present"}
                              </span>
                            </div>
                          </div>

                          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                            {online.online &&
                              (online.url ? (
                                <a
                                  href={online.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#FFB547] px-3.5 text-xs font-semibold text-[#3B1553] shadow-sm shadow-[#FFB547]/40 transition-colors hover:bg-[#ffa726] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/40"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  {vi ? "Vào lớp" : "Join class"}
                                  <ExternalLink className="h-3 w-3 opacity-60" />
                                </a>
                              ) : (
                                <Link
                                  to={`/classes/${group.event.class_id}`}
                                  className="inline-flex h-8 items-center gap-1.5 rounded-full border border-dashed border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-900"
                                >
                                  <Video className="h-3.5 w-3.5" />
                                  {vi ? "Thêm link lớp" : "Add class link"}
                                </Link>
                              ))}
                            {total > 0 && (
                              <button
                                type="button"
                                onClick={() => setShiftAllAttendance(group, !allPresent)}
                                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30"
                              >
                                <CheckCheck className="h-3.5 w-3.5 text-zinc-500" />
                                {allPresent ? (vi ? "Bỏ chọn tất cả" : "Clear all") : vi ? "Có mặt tất cả" : "All present"}
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 p-4">
                          {total === 0 ? (
                            <span className="text-xs text-zinc-500">{vi ? "Lớp chưa có học sinh" : "No students enrolled"}</span>
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
                                    "inline-flex min-h-11 select-none items-center gap-2.5 rounded-full border py-1 pl-1 pr-4 text-sm font-medium transition-all active:scale-95 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/40",
                                    isPresent
                                      ? "border-transparent"
                                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                                  )}
                                  style={isPresent ? { ...solid(color), borderColor: color } : undefined}
                                >
                                  <span
                                    className={cn(avatarBase, "h-9 w-9 rounded-full text-sm", isPresent && "bg-white/25")}
                                    style={isPresent ? { color: inkOn(color) } : solid(color)}
                                  >
                                    {student.name ? student.name.slice(0, 1).toUpperCase() : "?"}
                                  </span>
                                  <span className="max-w-[10rem] truncate">{student.name}</span>
                                  {isPresent ? (
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                  ) : (
                                    <span aria-hidden className="h-4 w-4 shrink-0 rounded-full border-2 border-zinc-300" />
                                  )}
                                </button>
                              );
                            })
                          )}
                        </div>

                        {renderShiftLog(group)}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
              {showNowMarker && nowIdx === todayShiftGroups.length && (
                <div className="relative pl-8 sm:pl-9">
                  <span className="absolute left-[7px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-rose-500 ring-4 ring-rose-100" />
                  <div className="flex items-center gap-3">
                    <span className={cn(MONO, "rounded-full bg-rose-500 px-2.5 py-0.5 text-[11px] font-semibold text-white")}>{nowLabel}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">{vi ? "Bây giờ" : "Now"}</span>
                    <span className="h-px flex-1 bg-gradient-to-r from-rose-300 to-transparent" />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* TÍNH HỌC PHÍ ĐẾN MỘT NGÀY BẤT KỲ (không phụ thuộc bộ lọc thời gian bên dưới) */}
        <section className={cn(CARD, "dash-rise space-y-4 p-5 sm:p-6 lg:col-span-4")} style={rise(160)}>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-[#FFB547] shadow-lg shadow-[#3B1553]/20" style={ICON_TILE_BG}>
              <Calculator className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-zinc-900">{vi ? "Tính học phí đến ngày" : "Tuition calculator"}</h2>
              <p className="text-xs leading-relaxed text-zinc-500">
                {vi
                  ? "Cộng học phí chưa thu của tất cả học sinh, từ hôm nay đến ngày bạn chọn"
                  : "Add up everyone's unpaid tuition, from today until the date you pick"}
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            <label className={cn(datePill, "w-full justify-between")}>
              <span className="text-zinc-500">{vi ? "Đến ngày" : "Until"}</span>
              <input
                type="date"
                min={todayStr}
                value={calcDate}
                onChange={(e) => setCalcDate(e.target.value)}
                className="bg-transparent font-medium text-zinc-900 focus:outline-none"
              />
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-100 p-1">
              {calcPresets.map((p) => (
                <button
                  key={p.k}
                  type="button"
                  aria-pressed={calcDate === p.date}
                  onClick={() => setCalcDate(p.date)}
                  className={cn(
                    "h-9 rounded-xl px-1 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30",
                    calcDate === p.date ? "bg-[#3B1553] text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900",
                  )}
                >
                  {vi ? p.vi : p.en}
                </button>
              ))}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={calcIncludeOwed}
              onClick={() => setCalcIncludeOwed((v) => !v)}
              className="flex w-full items-center gap-2.5 rounded-full py-1 text-left text-sm font-medium text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30"
            >
              <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", calcIncludeOwed ? "bg-[#3B1553]" : "bg-zinc-300")}>
                <span
                  className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", calcIncludeOwed ? "left-[18px]" : "left-0.5")}
                />
              </span>
              {vi ? "Gồm các buổi đã học nhưng chưa thu" : "Include attended but unpaid"}
            </button>
          </div>

          <div className="relative flex flex-col gap-5 overflow-hidden rounded-3xl p-5 text-white" style={DEEP_BG}>
            <div aria-hidden className="dash-aurora-b pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[#FFB547]/25 blur-3xl" />
            <div aria-hidden className="dash-aurora-a pointer-events-none absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-fuchsia-500/30 blur-3xl" />
            <Calculator aria-hidden className="pointer-events-none absolute -bottom-8 -right-6 h-32 w-32 -rotate-12 text-white/[0.06]" />
            <div className="relative space-y-1.5">
              <div className="text-sm font-medium text-white/70">
                {vi ? "Tổng học phí đến" : "Total tuition until"}{" "}
                <span className={cn(MONO, "font-semibold text-[#FFB547]")}>{tuitionCalc.valid ? fullDate(calcDate) : "—"}</span>
              </div>
              <div className="truncate text-3xl font-extrabold tabular-nums tracking-tight">
                <CountMoney value={calcTotal} />
              </div>
              <div className="text-xs text-white/60">
                {tuitionCalc.valid
                  ? `${calcRows.length} ${vi ? "học sinh" : "students"}`
                  : vi
                  ? "Chọn một ngày từ hôm nay trở đi"
                  : "Pick a date from today onward"}
              </div>
            </div>

            {tuitionCalc.valid && (
              <div className="relative space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-sm">
                    <div className="text-[11px] font-medium text-white/60">{vi ? "Đã học, chưa thu" : "Attended, unpaid"}</div>
                    <div
                      className={cn(
                        "truncate text-sm font-bold tabular-nums",
                        calcIncludeOwed ? "text-white" : "text-white/40 line-through",
                      )}
                    >
                      {formatVND(tuitionCalc.owedTotal)}
                    </div>
                    <div className="text-[11px] text-white/50">
                      {tuitionCalc.owedStudents} {vi ? "học sinh" : "students"}
                    </div>
                  </div>
                  <div className="rounded-2xl bg-white/10 px-3 py-2.5 ring-1 ring-white/10 backdrop-blur-sm">
                    <div className="text-[11px] font-medium text-white/60">{vi ? "Sắp tới" : "Upcoming"}</div>
                    <div className="truncate text-sm font-bold tabular-nums text-[#FFB547]">{formatVND(tuitionCalc.upcomingTotal)}</div>
                    <div className="text-[11px] text-white/50">
                      {tuitionCalc.upcomingStudents} {vi ? "học sinh" : "students"}
                    </div>
                  </div>
                </div>
                {tuitionCalc.deferredFee > 0 && (
                  <p className="text-[11px] leading-relaxed text-white/60">
                    {vi
                      ? `${tuitionCalc.deferredCount} học sinh theo tháng có kỳ thu sau ngày này nên chưa tính (${formatVND(tuitionCalc.deferredFee)}).`
                      : `${tuitionCalc.deferredCount} monthly student${tuitionCalc.deferredCount > 1 ? "s" : ""} are billed after this date and are not counted (${formatVND(tuitionCalc.deferredFee)}).`}
                  </p>
                )}
              </div>
            )}
          </div>

          {!tuitionCalc.valid ? (
            <div className="flex min-h-[8rem] items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 text-center text-sm text-zinc-500">
              {vi ? "Chọn ngày từ hôm nay trở đi để xem học phí từng học sinh." : "Pick a date from today onward to see each student's tuition."}
            </div>
          ) : calcRows.length === 0 ? (
            <div className="flex min-h-[8rem] items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 px-4 text-center text-sm text-zinc-500">
              {vi ? "Không có khoản học phí nào cần thu đến ngày này." : "No tuition to collect by this date."}
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
              {calcRows.map((r) => (
                <Link
                  key={r.student.id}
                  to={`/students/${r.student.id}`}
                  className="group flex items-center justify-between gap-2.5 rounded-2xl border border-zinc-200 bg-white p-2.5 transition-all hover:border-zinc-300 hover:bg-zinc-50/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={cn(avatarBase, "h-10 w-10 rounded-full text-xs")} style={solid(colorOf(r.student.id))}>
                      {r.student.name ? r.student.name.slice(0, 2).toUpperCase() : "HS"}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">{r.student.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
                        {r.bySession ? (
                          <>
                            {calcIncludeOwed && r.owedSessions > 0 && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                                {r.owedSessions} {vi ? "buổi đã học chưa thu" : "attended, unpaid"}
                              </span>
                            )}
                            {r.upcomingSessions > 0 && (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600">
                                {r.upcomingSessions} {vi ? "buổi sắp học" : "upcoming"}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">{vi ? "Theo tháng" : "Monthly"}</span>
                            {r.periods
                              .filter((per) => calcIncludeOwed || !per.overdue)
                              .map((per) => (
                                <span key={per.start} className={cn("tabular-nums", per.overdue ? "text-rose-600" : "text-zinc-500")}>
                                  {shortDate(per.start)} – {shortDate(per.end)}
                                </span>
                              ))}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-sm font-bold tabular-nums text-zinc-900">+{formatVND(r.total)}</span>
                    <ChevronRight className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ========== 4. TỔNG QUAN THEO KỲ LỌC (bento) ========== */}
      <section className="space-y-4">
        <div className={cn(CARD, "dash-rise flex flex-col gap-4 p-4 sm:p-5 xl:flex-row xl:items-center xl:justify-between")} style={rise(60)}>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 text-zinc-600">
              <CalendarRange className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">{vi ? "Tổng quan" : "Overview"}</div>
              <h2 className="text-lg font-bold leading-tight tracking-tight text-zinc-900">{periodLabel}</h2>
              <p className={cn(MONO, "text-xs tabular-nums text-zinc-500")}>
                {fullDate(fromDate)} – {fullDate(toDate)}
              </p>
            </div>
          </div>
          <div className="flex flex-col gap-2.5 lg:flex-row lg:flex-wrap lg:items-center">
            <div className={SEG}>
              {presets.map((p) => (
                <button key={p.k} type="button" aria-pressed={preset === p.k} onClick={() => applyPreset(p.k)} className={segBtn(preset === p.k)}>
                  {vi ? p.vi : p.en}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className={datePill}>
                <span className="text-zinc-500">{vi ? "Từ" : "From"}</span>
                <input type="date" value={fromDate} onChange={(e) => onCustomChange("from", e.target.value)} className="bg-transparent font-medium text-zinc-900 focus:outline-none" />
              </label>
              <label className={datePill}>
                <span className="text-zinc-500">{vi ? "Đến" : "To"}</span>
                <input type="date" value={toDate} onChange={(e) => onCustomChange("to", e.target.value)} className="bg-transparent font-medium text-zinc-900 focus:outline-none" />
              </label>
              {preset === "custom" && (
                <Button variant="ghost" onClick={() => applyPreset("thisMonth")} className="h-9 rounded-full px-4 text-sm font-medium text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                  {vi ? "Đặt lại" : "Reset"}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-12">
          {/* A. Thẻ lớn: học phí dự kiến trong kỳ (cố định) + phân bổ theo ngày thu */}
          <Spot
            tint="rgba(255,181,71,0.14)"
            className="dash-rise relative flex min-h-[22rem] flex-col justify-between gap-8 overflow-hidden rounded-[32px] p-6 text-white shadow-[0_26px_54px_-26px_rgba(59,21,83,0.75)] sm:col-span-2 sm:p-7 lg:col-span-5 lg:row-span-2"
            style={{ ...HERO_BG, ...rise(100) }}
          >
            <div aria-hidden className="dash-aurora-b pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-[#FFB547]/30 blur-[80px]" />
            <div aria-hidden className="dash-aurora-a pointer-events-none absolute -bottom-24 -left-16 h-60 w-60 rounded-full bg-fuchsia-500/35 blur-[80px]" />
            <div aria-hidden className="pointer-events-none absolute inset-0" style={DOT_BG} />

            <div className="relative flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#FFB547]/15 text-[#FFB547] ring-1 ring-[#FFB547]/30">
                  <Hourglass className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium leading-snug text-white/70">{vi ? "Học phí dự kiến trong kỳ" : "Upcoming in period"}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowExpectedModal(true)}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-semibold text-white ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
              >
                {vi ? "Chi tiết" : "Details"}
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="relative space-y-4">
              <div className="break-words text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
                <CountMoney value={expectedTotal} />
              </div>
              <div className="flex items-center gap-3">
                {unpaidStudents.length > 0 ? (
                  <>
                    <div className="flex -space-x-2">
                      {unpaidStudents.slice(0, 5).map((s: any) => (
                        <span
                          key={s.id}
                          title={s.name}
                          className={cn(avatarBase, "h-8 w-8 rounded-full text-[11px] ring-2 ring-[#3B1553]")}
                          style={solid(colorOf(s.id))}
                        >
                          {s.name ? String(s.name).slice(0, 1).toUpperCase() : "?"}
                        </span>
                      ))}
                      {unpaidStudents.length > 5 && (
                        <span className="grid h-8 min-w-8 place-items-center rounded-full bg-white/15 px-1.5 text-[11px] font-semibold ring-2 ring-[#3B1553]">
                          +{unpaidStudents.length - 5}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-medium text-white/70">
                      {unpaidStudentCount} {vi ? "học sinh chưa thu" : "students unpaid"}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-300">
                    <CheckCircle2 className="h-4 w-4" />
                    {vi ? "Đã thu đủ học phí" : "All tuition collected"}
                  </span>
                )}
              </div>
            </div>

            <div className="relative space-y-3">
              {groupsColored.length > 0 && totalUpcomingFee > 0 ? (
                <>
                  <div className="flex items-center justify-between gap-3 text-xs font-medium text-white/60">
                    <span className="inline-flex items-center gap-1.5">
                      <BarChart3 className="h-3.5 w-3.5" />
                      {vi ? "Phân bổ học phí kỳ sắp tới theo ngày thu" : "Upcoming tuition by billing day"}
                    </span>
                    <span className="tabular-nums">{formatVND(totalUpcomingFee)}</span>
                  </div>
                  <div className="flex h-3.5 gap-1">
                    {groupsColored
                      .filter((g) => g.fee > 0)
                      .map((g) => (
                        <button
                          key={g.key}
                          type="button"
                          title={`${groupLabel(g)} · ${g.count} ${vi ? "HS" : "students"} · ${formatVND(g.fee)}`}
                          aria-label={`${groupLabel(g)}: ${formatVND(g.fee)}`}
                          onClick={() => {
                            setBillingFilter(g.key);
                            setShowCollectedModal(true);
                          }}
                          className="h-full min-w-[8px] rounded-full transition-all hover:scale-y-125 hover:brightness-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                          style={{ width: `${(g.fee / totalUpcomingFee) * 100}%`, background: g.color }}
                        />
                      ))}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {groupsColored.map((g) => (
                      <span key={g.key} className="inline-flex items-center gap-1.5 text-xs text-white/65">
                        <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />
                        {groupLabel(g)}
                        <span className="font-semibold tabular-nums text-white">{formatVND(g.fee)}</span>
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-xs leading-relaxed text-white/55">
                  {vi
                    ? "Con số này cố định, không đổi theo bộ lọc thời gian."
                    : "This number is fixed and does not change with the date filter."}
                </p>
              )}
            </div>
          </Spot>

          {/* B. Học phí kỳ sắp tới */}
          <Spot tint="rgba(255,181,71,0.12)" className={cn(CARD, "dash-rise overflow-hidden lg:col-span-4")} style={rise(160)}>
            <button
              type="button"
              onClick={() => setShowCollectedModal(true)}
              className={cn("group flex h-full min-h-[11rem] w-full flex-col justify-between gap-5 rounded-[28px] p-5 text-left sm:p-6", focusRing)}
            >
              <div className="flex items-center gap-3">
                <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", TONES.tuition.tile)}>
                  <Wallet className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium leading-snug text-zinc-500">{vi ? "Tổng học phí kỳ sắp tới" : "Upcoming period tuition"}</span>
                <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" />
              </div>
              <div className="space-y-3">
                <div className="truncate text-3xl font-extrabold tabular-nums tracking-tight text-zinc-900">
                  {loading ? <Skeleton className="h-9 w-32" /> : <CountMoney value={totalUpcomingFee} />}
                </div>
                {totalUpcomingFee > 0 ? (
                  <div className="space-y-2">
                    <div className="flex h-2 gap-1 overflow-hidden rounded-full bg-zinc-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#3B1553] to-[#9B4DDB]" style={{ width: `${100 - overduePct}%` }} />
                      {totalOverdueFee > 0 && <div className="h-full min-w-[6px] rounded-full bg-rose-500" style={{ width: `${overduePct}%` }} />}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                      <span className="inline-flex items-center gap-1.5 text-zinc-500">
                        <span className="h-2 w-2 rounded-full bg-[#3B1553]" />
                        {vi ? "Kỳ hiện tại" : "Current"}
                        <b className="font-semibold tabular-nums text-zinc-800">{formatVND(currentOnly)}</b>
                      </span>
                      {totalOverdueFee > 0 && (
                        <span className="inline-flex items-center gap-1 font-medium text-rose-600">
                          <AlertCircle className="h-3 w-3" />
                          {vi ? "Chưa thu kỳ trước" : "Overdue"}
                          <b className="font-semibold tabular-nums">{formatVND(totalOverdueFee)}</b>
                        </span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">{vi ? "Theo ngày thu của từng học sinh" : "By each student's billing day"}</p>
                )}
              </div>
            </button>
          </Spot>

          {/* C. Lương mặc định */}
          <Spot tint="rgba(34,211,238,0.12)" className={cn(CARD, "dash-rise overflow-hidden lg:col-span-3")} style={rise(220)}>
            <button
              type="button"
              onClick={() => setShowSalaryModal(true)}
              className={cn("group flex h-full min-h-[11rem] w-full flex-col justify-between gap-5 rounded-[28px] p-5 text-left sm:p-6", focusRing)}
            >
              <div className="flex items-center gap-3">
                <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", TONES.avg.tile)}>
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className="text-sm font-medium leading-snug text-zinc-500">{vi ? "Lương mặc định" : "Default salary"}</span>
                <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" />
              </div>
              <div className="space-y-3">
                <div className="truncate text-3xl font-extrabold tabular-nums tracking-tight text-zinc-900">
                  {loading ? <Skeleton className="h-9 w-32" /> : <CountMoney value={defaultSalary} />}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1" aria-hidden>
                    {Array.from({ length: 12 }).map((_, i) => (
                      <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < Math.min(12, monthsInRange) ? "bg-cyan-500" : "bg-zinc-200")} />
                    ))}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {vi ? `Học phí tháng × ${monthsInRange} tháng` : `Monthly fees × ${monthsInRange} month${monthsInRange > 1 ? "s" : ""}`}
                  </p>
                </div>
              </div>
            </button>
          </Spot>

          {/* D. Biểu đồ lượt có mặt 14 ngày gần nhất */}
          <Spot tint="rgba(16,185,129,0.10)" className={cn(CARD, "dash-rise overflow-hidden p-5 sm:col-span-2 sm:p-6 lg:col-span-7")} style={rise(280)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-medium text-zinc-500">{vi ? "Lượt có mặt · 14 ngày qua" : "Attendance · last 14 days"}</div>
                  <div className="text-3xl font-extrabold tabular-nums tracking-tight text-zinc-900">
                    <CountNum value={att14Total} />
                  </div>
                </div>
              </div>
              <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium tabular-nums text-zinc-600">
                {vi ? `TB ${att14Avg} / ngày có lớp` : `Avg ${att14Avg} / class day`}
              </span>
            </div>
            {attendanceAll.isLoading ? (
              <Skeleton className="mt-5 h-36 w-full rounded-2xl" />
            ) : (
              <div
                className="mt-5 flex items-end gap-1.5 sm:gap-2.5"
                role="img"
                aria-label={vi ? `${att14Total} lượt có mặt trong 14 ngày qua` : `${att14Total} present records in the last 14 days`}
              >
                {attendance14.map((d) => {
                  const h = d.n > 0 ? Math.max(10, Math.round((d.n / att14Max) * 100)) : 5;
                  return (
                    <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5" title={`${shortDate(d.date)} · ${d.n} ${vi ? "lượt có mặt" : "present"}`}>
                      <span className={cn("text-[10px] font-semibold tabular-nums", d.n > 0 ? "text-zinc-600" : "text-transparent")}>{d.n || 0}</span>
                      <div className="flex h-24 w-full items-end">
                        <div
                          className={cn(
                            "w-full rounded-t-lg rounded-b-sm transition-all duration-500 motion-reduce:transition-none",
                            d.isToday
                              ? "bg-gradient-to-t from-[#FF9A3D] to-[#FFC56B]"
                              : d.n > 0
                              ? "bg-gradient-to-t from-[#3B1553] to-[#9B4DDB]"
                              : "bg-zinc-100",
                          )}
                          style={{ height: `${h}%` }}
                        />
                      </div>
                      <span className={cn("text-[10px] tabular-nums", d.isToday ? "font-bold text-[#c77700]" : "text-zinc-400")}>{d.day}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Spot>

          {/* E. Ba thẻ đếm gọn */}
          {renderCounter("students", "/students", vi ? "Học sinh hoạt động" : "Active students", activeStudents, vi ? `/ ${students.length} học sinh` : `of ${students.length}`, Users, 320)}
          {renderCounter("classes", "/classes", vi ? "Lớp có hoạt động" : "Active classes", activeClasses, vi ? `/ ${(classes.data || []).length} lớp` : `of ${(classes.data || []).length}`, GraduationCap, 360)}
          {renderCounter("payments", "/students", vi ? "Số lần thanh toán" : "Payments count", paymentsCount, vi ? "trong khoảng chọn" : "in range", CalendarClock, 400)}
        </div>
      </section>

      {/* ========== THANH LƯU NỔI: chỉ hiện khi còn thay đổi chưa lưu ========== */}
      {hasPending && (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div
            role="status"
            className="dash-rise pointer-events-auto relative flex w-full max-w-xl items-center justify-between gap-3 overflow-hidden rounded-full border border-white/15 p-2 pl-5 text-white shadow-2xl shadow-[#3B1553]/50 backdrop-blur-xl"
            style={DEEP_BG}
          >
            <div className="flex min-w-0 items-center gap-3">
              <span className="relative grid h-2.5 w-2.5 shrink-0 place-items-center">
                <span className="absolute h-2.5 w-2.5 animate-ping rounded-full bg-[#FFB547]/60 motion-reduce:animate-none" />
                <span className="h-2 w-2 rounded-full bg-[#FFB547]" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{vi ? "Có thay đổi chưa lưu" : "You have unsaved changes"}</div>
                <div className="truncate text-xs tabular-nums text-white/60">
                  {todayPresentTotal}/{todayTotalStudents} {vi ? "có mặt" : "present"}
                  {unsavedLogs ? (vi ? " · kèm nhật ký học tập" : " · with learning log") : ""}
                </div>
              </div>
            </div>
            <Button
              onClick={handleSaveAllAttendance}
              disabled={savingAttendance}
              className="h-11 shrink-0 gap-2 rounded-full bg-[#FFB547] px-5 text-sm font-semibold text-[#3B1553] hover:bg-[#ffa726]"
            >
              <CheckCircle2 className="h-4 w-4" />
              {savingAttendance ? (vi ? "Đang lưu..." : "Saving...") : vi ? "Lưu ngay" : "Save now"}
            </Button>
          </div>
        </div>
      )}

      {/* ========== POPUP CHI TIẾT HỌC PHÍ KỲ SẮP TỚI ========== */}
      <Dialog
        open={showCollectedModal}
        onOpenChange={(open) => {
          setShowCollectedModal(open);
          if (!open) setBillingFilter("all");
        }}
      >
        <DialogContent className={modalShell}>
          <ModalHead
            icon={Wallet}
            title={vi ? "Chi tiết học phí kỳ sắp tới" : "Upcoming tuition details"}
            total={formatVND(totalUpcomingFee)}
          >
            {totalOverdueFee > 0 && (
              <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full bg-rose-50 px-3 py-1 text-xs font-medium text-rose-600 ring-1 ring-rose-100">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                {vi ? `Gồm ${formatVND(totalOverdueFee)} chưa thu từ các kỳ trước` : `Includes ${formatVND(totalOverdueFee)} unpaid from previous periods`}
              </span>
            )}
          </ModalHead>

          {/* BỘ LỌC THEO NGÀY THU HỌC PHÍ */}
          {billingGroups.length > 1 && (
            <div className="shrink-0 space-y-3 border-b border-zinc-100 bg-zinc-50/60 px-6 py-4">
              <div className="text-sm font-semibold text-zinc-900">{vi ? "Lọc theo ngày thu học phí" : "Filter by billing day"}</div>
              <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto p-0.5">
                {[
                  { key: "all", label: vi ? "Tất cả" : "All", count: students.length, fee: totalUpcomingFee },
                  ...billingGroups.map((g) => ({
                    key: g.key,
                    label: g.day ? (vi ? `Ngày ${g.day}` : `Day ${g.day}`) : vi ? "Chưa đặt ngày" : "Not set",
                    count: g.count,
                    fee: g.fee,
                  })),
                ].map((c) => {
                  const active = (activeGroupKey ?? "all") === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setBillingFilter(c.key)}
                      className={cn(
                        "rounded-2xl border px-3.5 py-2 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]/30",
                        active
                          ? "border-[#3B1553] bg-[#3B1553] text-white shadow-md shadow-[#3B1553]/25"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50",
                      )}
                    >
                      <div className="whitespace-nowrap text-xs font-semibold">
                        {c.label}
                        <span className={cn("font-medium", active ? "text-white/60" : "text-zinc-400")}>
                          {` · ${c.count} ${vi ? "HS" : "students"}`}
                        </span>
                      </div>
                      <div className={cn("whitespace-nowrap text-xs font-semibold tabular-nums", active ? "text-[#FFB547]" : "text-zinc-900")}>
                        {formatVND(c.fee)}
                      </div>
                    </button>
                  );
                })}
              </div>

              {activeGroup && (
                <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5 text-white" style={DEEP_BG}>
                  <div className="min-w-0 space-y-0.5">
                    <div className="text-xs font-medium text-white/80">
                      {activeGroup.dueDate
                        ? vi
                          ? `Tổng nhận được đến ngày ${shortDate(activeGroup.dueDate)}`
                          : `Total to collect by ${shortDate(activeGroup.dueDate)}`
                        : vi
                        ? "Học sinh chưa đặt ngày thu học phí"
                        : "Students without a billing day"}
                    </div>
                    <div className="text-xs text-white/60">
                      {activeGroup.count} {vi ? "học sinh" : "students"}
                      {` · ${vi ? "kỳ" : "period"} ${shortDate(activeGroup.start)} – ${shortDate(activeGroup.end)}`}
                    </div>
                    {activeGroup.overdueFee > 0 && (
                      <div className="text-xs font-medium text-rose-300">
                        {vi
                          ? `Gồm ${formatVND(activeGroup.overdueFee)} chưa thu từ các kỳ trước`
                          : `Includes ${formatVND(activeGroup.overdueFee)} unpaid from previous periods`}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-xl font-semibold tabular-nums text-[#FFB547]">+{formatVND(activeGroup.fee)}</div>
                </div>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 py-5">
            {visibleStudents.length > 0 ? (
              visibleStudents.map((student: any) => {
                const info = upcomingByStudent.get(String(student.id));
                const fee = info?.fee || 0;
                const open = expandedStudent === String(student.id);
                const groups = open ? studentSessionGroups(student) : null;
                const bySess = isBySessionStudent(student);
                return (
                  <div
                    key={student.id}
                    className={cn(
                      "rounded-2xl border bg-white transition-shadow",
                      open ? "border-zinc-300 shadow-md" : "border-zinc-200 hover:shadow-sm",
                    )}
                  >
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => setExpandedStudent(open ? null : String(student.id))}
                      className="flex w-full items-center justify-between gap-3 rounded-2xl p-3 text-left transition-colors hover:bg-zinc-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className={cn(avatarBase, "h-11 w-11 rounded-full text-sm")} style={solid(colorOf(student.id))}>
                          {student.name ? student.name.slice(0, 2).toUpperCase() : "HS"}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <div className="truncate text-sm font-semibold text-zinc-900">{student.name}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                bySess ? "bg-violet-50 text-violet-700" : "bg-sky-50 text-sky-700",
                              )}
                            >
                              {bySess ? (vi ? `Theo buổi, ${info?.sessions || 0} buổi` : `Per session, ${info?.sessions || 0} sessions`) : vi ? "Theo tháng" : "Monthly"}
                            </span>
                            {info?.hasBillingDay && (
                              <span className="tabular-nums">
                                {shortDate(info.start)} – {shortDate(info.end)}
                              </span>
                            )}
                          </div>
                          {info && info.overdueFee > 0 && (
                            <div className="flex items-center gap-1 truncate text-xs font-medium text-rose-600">
                              <AlertCircle className="h-3 w-3 shrink-0" />
                              <span className="truncate">
                                {vi
                                  ? `Gồm ${formatVND(info.overdueFee)} chưa thu từ các kỳ trước`
                                  : `Includes ${formatVND(info.overdueFee)} unpaid from previous periods`}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums text-zinc-900">+{formatVND(fee)}</span>
                        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", open && "rotate-180")} />
                      </div>
                    </button>

                    {open && groups && (
                      <div className="space-y-4 rounded-b-2xl border-t border-zinc-100 bg-zinc-50/70 p-3">
                        {info && info.overdue.length > 0 && (
                          <div className="space-y-3 rounded-2xl border border-rose-200 bg-rose-50/60 p-3">
                            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-rose-700">
                              <span className="inline-flex items-center gap-1.5">
                                <AlertCircle className="h-4 w-4" />
                                {vi ? "Chưa thu từ các kỳ trước" : "Unpaid from previous periods"}
                              </span>
                              <span className="tabular-nums">+{formatVND(info.overdueFee)}</span>
                            </div>
                            {info.overdue.map((per) => (
                              <div key={per.start} className="space-y-1.5">
                                <div className="flex items-center justify-between gap-2 text-xs font-medium text-zinc-700">
                                  <span>
                                    {shortDate(per.start)} – {shortDate(per.end)} · {per.sessionList.length} {vi ? "buổi" : "sessions"}
                                  </span>
                                  <span className="tabular-nums">{formatVND(per.fee)}</span>
                                </div>
                                {per.sessionList.map((sess) => renderSessionRow(sess, student, sessionStatusLabel(sess, student.id)))}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-xs text-zinc-500">
                          {vi ? "Các buổi trong kỳ hiện tại:" : "Sessions in current period:"} {shortDate(info?.start || fromDate)} – {shortDate(info?.end || toDate)}
                          {!info?.hasBillingDay && (
                            <span className="ml-1 text-zinc-400">
                              {vi ? "(chưa đặt ngày thu, đang dùng khoảng ngày đang lọc)" : "(no billing day set, using the dashboard date range)"}
                            </span>
                          )}
                        </p>
                        {SESSION_GROUPS.map((g) => {
                          const list = groups[g.k];
                          return (
                            <div key={g.k} className="space-y-1.5">
                              <div className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                                <span className={cn("h-2 w-2 rounded-full", g.dot)} />
                                {vi ? g.vi : g.en}
                                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium tabular-nums", g.pill)}>{list.length}</span>
                              </div>
                              {list.length === 0 ? (
                                <p className="pl-4 text-xs text-zinc-400">{vi ? "Không có buổi nào" : "No sessions"}</p>
                              ) : (
                                <div className="space-y-1.5">{list.map((sess: SessionItem) => renderSessionRow(sess, student))}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="py-4 text-center text-sm text-zinc-500">{vi ? "Chưa có dữ liệu học sinh" : "No student data yet"}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== POPUP CHI TIẾT LƯƠNG MẶC ĐỊNH ========== */}
      <Dialog open={showSalaryModal} onOpenChange={setShowSalaryModal}>
        <DialogContent className={modalShell}>
          <ModalHead
            icon={TrendingUp}
            title={vi ? "Chi tiết lương mặc định" : "Default salary details"}
            total={formatVND(defaultSalary)}
          >
            <p className="text-xs leading-relaxed text-zinc-500">
              {`${salaryStudentList.length} ${vi ? "học sinh" : "students"} · `}
              {vi
                ? `Học phí tháng cố định của các lớp mỗi học sinh đang học × ${monthsInRange} tháng (${periodLabel.toLowerCase()}).`
                : `Fixed monthly fee of every class each student is enrolled in × ${monthsInRange} month${monthsInRange > 1 ? "s" : ""} (${periodLabel.toLowerCase()}).`}
            </p>
          </ModalHead>
          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 py-5">
            {salaryStudentList.length > 0 ? (
              salaryStudentList.map(({ student, total, items }: any) => (
                <Link
                  key={student.id}
                  to={`/students/${student.id}`}
                  onClick={() => setShowSalaryModal(false)}
                  className="group flex items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition-all hover:border-zinc-300 hover:bg-zinc-50/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn(avatarBase, "h-11 w-11 rounded-full text-sm")} style={solid(colorOf(student.id))}>
                      {student.name ? student.name.slice(0, 2).toUpperCase() : "HS"}
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="truncate text-sm font-semibold text-zinc-900">{student.name}</div>
                      {items.length === 0 ? (
                        <div className="text-xs text-zinc-400">{vi ? "Chưa ghi danh lớp nào" : "Not enrolled in any class"}</div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 text-xs text-zinc-500">
                          {items.map((it: SalaryItem) => (
                            <span key={it.classId} className="rounded-full bg-zinc-100 px-2 py-0.5">
                              {it.className}: <span className="font-semibold tabular-nums text-zinc-700">{formatVND(it.fee)}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-sm font-semibold tabular-nums text-zinc-900">{formatVND(total)}</span>
                    <ChevronRight className="h-4 w-4 text-zinc-300 transition-transform group-hover:translate-x-0.5 group-hover:text-zinc-600" />
                  </div>
                </Link>
              ))
            ) : (
              <div className="py-4 text-center text-sm text-zinc-500">{vi ? "Chưa có dữ liệu học sinh" : "No student data yet"}</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ========== POPUP CHI TIẾT HỌC PHÍ DỰ KIẾN TRONG KỲ (danh sách hóa đơn sắp tới, không phụ thuộc bộ lọc thời gian) ========== */}
      <Dialog
        open={showExpectedModal}
        onOpenChange={(open) => {
          setShowExpectedModal(open);
          if (!open) setPayFilter("unpaid");
        }}
      >
        <DialogContent className={modalShell}>
          <ModalHead
            icon={Hourglass}
            title={vi ? "Chi tiết học phí dự kiến trong kỳ" : "Upcoming in period details"}
            total={formatVND(billsListTotal)}
          >
            <p className="text-xs leading-relaxed text-zinc-500">
              {`${groupedUpcoming.length} ${vi ? "học sinh" : "students"} · `}
              {vi
                ? "Học phí tổng hợp, gộp theo từng học sinh. Con số trên thẻ là tổng các hóa đơn chưa thu, cố định và không thay đổi theo bộ lọc thời gian."
                : "Aggregated fees, grouped by student. The card shows the total of unpaid bills, fixed and not affected by the date filter."}
            </p>
          </ModalHead>

          <div className="shrink-0 border-b border-zinc-100 bg-zinc-50/60 px-6 py-3">
            <div className={SEG}>
              {(["unpaid", "paid", "all"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={payFilter === k} onClick={() => setPayFilter(k)} className={segBtn(payFilter === k)}>
                  {k === "unpaid" ? (vi ? "Chưa thu" : "Unpaid") : k === "paid" ? (vi ? "Đã thu" : "Paid") : vi ? "Tất cả" : "All"}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto px-6 py-5">
            {groupedUpcoming.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 py-10 text-center text-sm text-zinc-500">{t.nothingHere}</div>
            ) : (
              groupedUpcoming.map((item) => (
                <Link
                  to={`/students/${item.studentId}`}
                  key={item.studentId}
                  onClick={() => setShowExpectedModal(false)}
                  className="group flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-3 transition-all hover:border-zinc-300 hover:bg-zinc-50/70 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B1553]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={cn(avatarBase, "h-11 w-11 rounded-full text-sm")} style={solid(colorOf(item.studentId))}>
                      {item.studentName ? item.studentName.slice(0, 2).toUpperCase() : "HS"}
                    </div>
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-zinc-900">{item.studentName}</h4>
                      <p className="truncate text-xs text-zinc-500">
                        {vi
                          ? `Gộp ${item.cycles.length} kỳ (${item.cycles.join(", ")})`
                          : `${item.cycles.length} period${item.cycles.length > 1 ? "s" : ""} combined (${item.cycles.join(", ")})`}
                      </p>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="text-sm font-semibold tabular-nums text-zinc-900">{formatVND(item.totalAmount)}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                        item.isPaid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                      )}
                    >
                      {item.isPaid ? <CheckCircle2 className="h-3 w-3" /> : <Hourglass className="h-3 w-3" />}
                      {item.isPaid ? (vi ? "Đã thu" : "Paid") : vi ? "Chưa thu" : "Unpaid"}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}