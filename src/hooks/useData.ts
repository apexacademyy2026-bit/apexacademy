import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const qk = {
  classes: ["classes"] as const,
  students: ["students"] as const,
  schedules: (classId?: string) => ["class_schedules", classId] as const,
  events: (from?: string, to?: string) => ["events", from, to] as const,
  enrollments: ["enrollments"] as const,
  attendance: (eventId?: string) => ["attendance", eventId] as const,
  payments: (studentId?: string) => ["payments", studentId] as const,
};

export function useClasses() {
  return useQuery({
    queryKey: qk.classes,
    queryFn: async () => {
      const { data, error } = await supabase.from("classes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useStudents() {
  return useQuery({
    queryKey: qk.students,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

export function useEnrollments() {
  return useQuery({
    queryKey: qk.enrollments,
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("*");
      if (error) throw error;
      return data || [];
    },
  });
}

export function useClassSchedules(classId?: string) {
  return useQuery({
    queryKey: qk.schedules(classId),
    queryFn: async () => {
      let q = supabase.from("class_schedules").select("*");
      if (classId) q = q.eq("class_id", classId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}

export function useEvents(fromISO?: string, toISO?: string) {
  return useQuery({
    queryKey: qk.events(fromISO, toISO),
    queryFn: async () => {
      let q = supabase.from("schedule_events").select("*").order("event_date").order("start_time");
      if (fromISO) q = q.gte("event_date", fromISO);
      if (toISO) q = q.lte("event_date", toISO);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: true,
  });
}

export function useAttendance(eventId?: string) {
  return useQuery({
    queryKey: qk.attendance(eventId),
    queryFn: async () => {
      if (!eventId) return [];
      const { data, error } = await supabase.from("attendance").select("*").eq("event_id", eventId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!eventId,
  });
}

export function usePayments(studentId?: string) {
  return useQuery({
    queryKey: qk.payments(studentId),
    queryFn: async () => {
      let q = supabase.from("payments").select("*").order("paid_at", { ascending: false });
      if (studentId) q = q.eq("student_id", studentId);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });
}