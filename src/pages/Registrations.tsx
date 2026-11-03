import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { BookOpen, ChevronDown, Inbox, Mail, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import { resolveStudentColor } from "@/lib/studentColor";

/* =====================================================================
   TRANG "ĐĂNG KÝ HỌC" TRONG DASHBOARD
   - Hiện các đăng ký học học sinh gửi từ trang công khai /lop-hoc.
   - Đăng ký mới xuất hiện ngay (realtime) kèm thông báo.
   - Đặt route TRONG layout cần đăng nhập, ví dụ:
       <Route path="/dang-ky" element={<Registrations />} />
   - Dùng useNewRegistrationCount() để hiện số đăng ký mới ở menu bên trái.
   ===================================================================== */

const sb: any = supabase;

/* Design tokens: mực navy #0B1B3A · nền trắng · viền zinc mảnh. Màu chỉ dùng cho dữ liệu:
   trạng thái đăng ký (vạch trên thẻ) và màu avatar của từng học sinh. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const CHIP = "inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50";
const ICON_BTN = "grid h-8 w-8 place-items-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30";
const SEG = "inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-zinc-100 p-1";
const segBtn = (active: boolean) =>
  cn(
    "inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors",
    FOCUS,
    active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900",
  );

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

type Status = "new" | "contacted" | "enrolled" | "declined";

type Reg = {
  id: string;
  created_at: string;
  class_name: string;
  class_schedule: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string;
  province: string;
  address: string | null;
  school: string;
  grade: string;
  school_province: string;
  note: string | null;
  status: Status;
};

// badge: màu ô chọn trạng thái · bar: dải màu trên đầu thẻ
const STATUS: Record<Status, { label: string; badge: string; bar: string }> = {
  new: { label: "Mới", badge: "bg-amber-100 text-amber-900", bar: "#FFB547" },
  contacted: { label: "Đã liên hệ", badge: "bg-[#0B1B3A]/10 text-[#0B1B3A]", bar: "#0B1B3A" },
  enrolled: { label: "Đã nhận vào lớp", badge: "bg-emerald-100 text-emerald-800", bar: "#10B981" },
  declined: { label: "Từ chối", badge: "bg-zinc-100 text-zinc-500", bar: "#D4D4D8" },
};
const STATUS_ORDER: Status[] = ["new", "contacted", "enrolled", "declined"];

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-");
  return y && m && day ? `${day}/${m}/${y}` : d;
};

/** Số đăng ký chưa xử lý, dùng làm huy hiệu ở menu. */
export function useNewRegistrationCount(enabled = true) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) {
      setN(0);
      return;
    }
    let alive = true;
    const load = async () => {
      const { count } = await sb.from("class_registrations").select("id", { count: "exact", head: true }).eq("status", "new");
      if (alive) setN(count ?? 0);
    };
    void load();
    const ch = sb
      .channel("reg-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "class_registrations" }, () => void load())
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, [enabled]);
  return n;
}

export default function Registrations() {
  const confirm = useConfirm();
  const [rows, setRows] = useState<Reg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data, error: err } = await sb.from("class_registrations").select("*").order("created_at", { ascending: false });
      if (!alive) return;
      if (err) setError(err.message || "Không tải được danh sách");
      else setRows((data || []) as Reg[]);
      setLoading(false);
    })();
    const ch = sb
      .channel("reg-page")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "class_registrations" }, (p: any) => {
        const r = p.new as Reg;
        setRows((prev) => (prev.some((x) => x.id === r.id) ? prev : [r, ...prev]));
        toast.success(`Đăng ký mới: ${r.full_name} – ${r.class_name}`);
      })
      .subscribe();
    return () => {
      alive = false;
      sb.removeChannel(ch);
    };
  }, []);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    STATUS_ORDER.forEach((s) => (m[s] = rows.filter((r) => r.status === s).length));
    return m;
  }, [rows]);

  const shown = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);

  const setStatus = async (id: string, status: Status) => {
    const before = rows;
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    const { error: err } = await sb.from("class_registrations").update({ status }).eq("id", id);
    if (err) {
      setRows(before);
      toast.error("Chưa cập nhật được trạng thái");
    }
  };

  const remove = async (r: Reg) => {
    if (!(await confirm({ description: `Xóa đăng ký của ${r.full_name}?`, destructive: true }))) return;
    const before = rows;
    setRows((prev) => prev.filter((x) => x.id !== r.id));
    const { error: err } = await sb.from("class_registrations").delete().eq("id", r.id);
    if (err) {
      setRows(before);
      toast.error("Chưa xóa được đăng ký");
    }
  };

  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const tabs: { key: Status | "all"; label: string }[] = [
    { key: "all", label: "Tất cả" },
    ...STATUS_ORDER.map((s) => ({ key: s, label: STATUS[s].label })),
  ];

  const heroStats = [
    { label: "Đăng ký mới", value: counts.new ?? 0 },
    { label: "Đã liên hệ", value: counts.contacted ?? 0 },
    { label: "Đã nhận vào lớp", value: counts.enrolled ?? 0 },
  ];

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      {/* TIÊU ĐỀ + SỐ LIỆU */}
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="space-y-1 p-5 sm:p-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">Đăng ký học</h1>
          <p className="max-w-xl text-sm text-zinc-500">
            Học sinh đăng ký từ trang lớp học công khai. Đăng ký mới hiện ở đây ngay khi được gửi.
          </p>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-zinc-100 border-t border-zinc-100">
          {heroStats.map((s) => (
            <div key={s.label} className="px-5 py-4 sm:px-6">
              <dt className="text-xs text-zinc-500">{s.label}</dt>
              <dd className="mt-1 text-xl font-semibold tabular-nums text-zinc-900">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* LỌC THEO TRẠNG THÁI */}
      <div className={SEG} role="tablist" aria-label="Lọc theo trạng thái">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={filter === tab.key}
            onClick={() => setFilter(tab.key)}
            className={segBtn(filter === tab.key)}
          >
            {tab.label}
            <span className={cn("text-xs tabular-nums", filter === tab.key ? "text-zinc-500" : "text-zinc-400")}>{counts[tab.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {/* DANH SÁCH ĐĂNG KÝ */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-zinc-100" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm">
          <p className="font-semibold text-rose-700">Chưa tải được danh sách đăng ký</p>
          <p className="mt-1 text-zinc-600">
            {error}. Nếu đây là lần đầu, hãy chạy file <b>class_registrations.sql</b> trong Supabase SQL Editor rồi tải lại trang.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100 text-zinc-400">
            <Inbox className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900">{rows.length === 0 ? "Chưa có đăng ký nào" : "Không có đăng ký ở trạng thái này"}</h3>
            <p className="text-sm text-zinc-500">
              {rows.length === 0 ? "Khi học sinh gửi form đăng ký ở trang lớp học, thông tin sẽ hiện ở đây." : "Chọn trạng thái khác để xem."}
            </p>
          </div>
        </div>
      ) : (
        <ul className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 lg:grid-cols-3">
          {shown.map((r) => {
            const isOpen = openIds.has(r.id);
            const st = STATUS[r.status];
            const color = resolveStudentColor(null, r.id);
            return (
              <li key={r.id} className={cn(CARD, "relative space-y-5 overflow-hidden p-5 pt-6")}>
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: st.bar }} />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-semibold" style={solid(color)} aria-hidden>
                      {(r.full_name || "?").trim().slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-[15px] font-semibold text-zinc-900">{r.full_name}</h2>
                      <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500">{fmtTime(r.created_at)}</p>
                    </div>
                  </div>
                  <select
                    aria-label={`Trạng thái đăng ký của ${r.full_name}`}
                    value={r.status}
                    onChange={(e) => void setStatus(r.id, e.target.value as Status)}
                    className={cn("h-8 max-w-[8.5rem] shrink-0 cursor-pointer rounded-lg border-0 px-2.5 text-xs font-semibold", FOCUS, st.badge)}
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    <a href={`mailto:${r.email}`} className={cn(CHIP, FOCUS)}>
                      <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                      <span className="truncate">{r.email}</span>
                    </a>
                    {r.phone && (
                      <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className={cn(CHIP, FOCUS)}>
                        <Phone className="h-3.5 w-3.5 shrink-0 text-zinc-400" aria-hidden />
                        <span className="tabular-nums">{r.phone}</span>
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-zinc-500">
                    {r.grade}, {r.school}
                  </p>
                </div>

                <div className="flex items-center gap-3 rounded-xl border border-zinc-200 px-3 py-2.5">
                  <BookOpen className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">{r.class_name}</p>
                    {r.class_schedule && <p className="truncate text-xs text-zinc-500">{r.class_schedule}</p>}
                  </div>
                </div>

                {isOpen && (
                  <dl className="grid gap-x-6 gap-y-3 border-t border-zinc-100 pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-zinc-500">Ngày sinh</dt>
                      <dd className="mt-0.5 text-zinc-900">{fmtDate(r.birth_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Đang sinh sống</dt>
                      <dd className="mt-0.5 text-zinc-900">{[r.address, r.province].filter(Boolean).join(", ")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-zinc-500">Trường</dt>
                      <dd className="mt-0.5 text-zinc-900">
                        {r.school}, {r.school_province}
                      </dd>
                    </div>
                    {r.note && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-zinc-500">Ghi chú của học sinh</dt>
                        <dd className="mt-0.5 whitespace-pre-line text-zinc-900">{r.note}</dd>
                      </div>
                    )}
                  </dl>
                )}

                <div className="flex items-center justify-between border-t border-zinc-100 pt-3">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-expanded={isOpen}
                    className={cn("-ml-2 inline-flex h-8 items-center gap-1 rounded-lg px-2 text-sm font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900", FOCUS)}
                  >
                    {isOpen ? "Thu gọn" : "Xem đầy đủ"}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r)}
                    aria-label={`Xóa đăng ký của ${r.full_name}`}
                    className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600", FOCUS)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}