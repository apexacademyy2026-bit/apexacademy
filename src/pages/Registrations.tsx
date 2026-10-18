import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Mail, Phone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/* =====================================================================
   TRANG "ĐĂNG KÝ HỌC" TRONG DASHBOARD
   - Hiện các đăng ký học học sinh gửi từ trang công khai /lop-hoc.
   - Đăng ký mới xuất hiện ngay (realtime) kèm thông báo.
   - Đặt route TRONG layout cần đăng nhập, ví dụ:
       <Route path="/dang-ky" element={<Registrations />} />
   - Dùng useNewRegistrationCount() để hiện số đăng ký mới ở menu bên trái.
   ===================================================================== */

const sb: any = supabase;

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

const STATUS: Record<Status, { label: string; badge: string }> = {
  new: { label: "Mới", badge: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300" },
  contacted: { label: "Đã liên hệ", badge: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300" },
  enrolled: { label: "Đã nhận vào lớp", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300" },
  declined: { label: "Từ chối", badge: "bg-muted text-muted-foreground" },
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
    if (!window.confirm(`Xóa đăng ký của ${r.full_name}?`)) return;
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Đăng ký học</h1>
        <p className="mt-1 text-sm text-muted-foreground">Học sinh đăng ký từ trang lớp học công khai. Đăng ký mới hiện ở đây ngay khi được gửi.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Lọc theo trạng thái">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={filter === t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              filter === t.key ? "border-foreground bg-foreground text-background" : "border-border bg-background hover:bg-muted",
            )}
          >
            {t.label}
            <span className={cn("tabular-nums", filter === t.key ? "opacity-80" : "text-muted-foreground")}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
          <p className="font-semibold">Chưa tải được danh sách đăng ký</p>
          <p className="mt-1 text-muted-foreground">
            {error}. Nếu đây là lần đầu, hãy chạy file <b>class_registrations.sql</b> trong Supabase SQL Editor rồi tải lại trang.
          </p>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center">
          <p className="font-semibold">{rows.length === 0 ? "Chưa có đăng ký nào" : "Không có đăng ký ở trạng thái này"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {rows.length === 0 ? "Khi học sinh gửi form đăng ký ở trang lớp học, thông tin sẽ hiện ở đây." : "Chọn trạng thái khác để xem."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            const isOpen = openIds.has(r.id);
            return (
              <li key={r.id} className={cn("rounded-2xl border bg-card p-4 md:p-5", r.status === "new" && "border-amber-300 dark:border-amber-500/50")}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold">{r.full_name}</h2>
                      <span className={cn("rounded-md px-2 py-0.5 text-xs font-semibold", STATUS[r.status].badge)}>{STATUS[r.status].label}</span>
                    </div>
                    <p className="mt-1 text-sm">
                      Đăng ký lớp <b>{r.class_name}</b>
                      {r.class_schedule && <span className="text-muted-foreground">, {r.class_schedule}</span>}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{fmtTime(r.created_at)}</p>
                  </div>
                  <select
                    aria-label={`Trạng thái đăng ký của ${r.full_name}`}
                    value={r.status}
                    onChange={(e) => void setStatus(r.id, e.target.value as Status)}
                    className="h-9 rounded-lg border bg-background px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {STATUS_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {STATUS[s].label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                  <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden /> {r.email}
                  </a>
                  {r.phone && (
                    <a href={`tel:${r.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                      <Phone className="h-4 w-4 text-muted-foreground" aria-hidden /> {r.phone}
                    </a>
                  )}
                  <span className="text-muted-foreground">
                    {r.grade}, {r.school}
                  </span>
                </div>

                {isOpen && (
                  <dl className="mt-4 grid gap-x-6 gap-y-3 border-t pt-4 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Ngày sinh</dt>
                      <dd>{fmtDate(r.birth_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Đang sinh sống</dt>
                      <dd>{[r.address, r.province].filter(Boolean).join(", ")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-muted-foreground">Trường</dt>
                      <dd>
                        {r.school}, {r.school_province}
                      </dd>
                    </div>
                    {r.note && (
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-semibold text-muted-foreground">Ghi chú của học sinh</dt>
                        <dd className="whitespace-pre-line">{r.note}</dd>
                      </div>
                    )}
                  </dl>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => toggle(r.id)}
                    aria-expanded={isOpen}
                    className="inline-flex h-8 items-center gap-1 rounded-lg px-2 -ml-2 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {isOpen ? "Thu gọn" : "Xem đầy đủ"}
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(r)}
                    aria-label={`Xóa đăng ký của ${r.full_name}`}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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