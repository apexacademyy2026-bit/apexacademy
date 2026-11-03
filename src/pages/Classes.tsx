import { useEffect, useState, useMemo } from "react";
import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  LayoutGrid,
  List as ListIcon,
  Pencil,
  Trash2,
  Users,
  Clock,
  BookOpen,
  MoreVertical,
  Search,
  ArrowUpDown,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/contexts/AppContext";
import { useClasses, useEnrollments, useClassSchedules, qk } from "@/hooks/useData";
import { fmtDate } from "@/lib/format";
import ClassDialog from "@/components/ClassDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import ColorPickerButton, { colorOf, useColorDraft } from "@/components/Colorpickerbutton";

/* Design tokens: mực navy #0B1B3A · nền trắng · viền zinc mảnh · chữ xám trung tính.
   Giao diện giữ trung tính để màu của từng lớp (do người dùng chọn) nổi bật: vạch màu trên thẻ, ô icon đặc, nền thẻ phủ sắc rất nhạt. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const FIELD =
  "h-10 rounded-xl border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const ICON_BTN = "relative z-20 h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900";
const CHIP = "inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600";
const PRIMARY = "h-10 shrink-0 gap-2 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white shadow-none hover:bg-[#13285a]";
const SEG = "inline-flex w-fit max-w-full gap-0.5 overflow-x-auto rounded-full bg-zinc-100 p-1";
const segBtn = (active: boolean) =>
  cn(
    "h-8 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
    active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
  );

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
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
// Phủ một lớp màu rất nhạt lên nền trắng, và chữ đậm cùng tông
const wash = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, white)`;
const deep = (c: string) => `color-mix(in srgb, ${c} 62%, black)`;

export default function Classes() {
  const { t, lang } = useApp();
  const classes = useClasses();
  const enrollments = useEnrollments();
  const schedules = useClassSchedules();
  const qc = useQueryClient();
  const confirm = useConfirm();
  // Màu đang kéo dở của từng lớp (xem trước ngay, chưa lưu)
  const colors = useColorDraft();

  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [cat, setCat] = useState<"all" | "math" | "english" | "none">("all");

  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "created-desc" | "created-asc" | "students-desc" | "students-asc">("name-asc");

  const catLabels: Record<string, string> =
    lang === "vi"
      ? { all: "Tất cả", math: "Toán", english: "Tiếng Anh", none: "Chưa phân loại" }
      : { all: "All", math: "Math", english: "English", none: "Unsorted" };

  const studentCount = (cid: string) => (enrollments.data || []).filter((e: any) => e.class_id === cid).length;

  const slots = (cid: string) => (schedules.data || []).filter((s: any) => s.class_id === cid);

  // Logic Tìm kiếm & Sắp xếp danh sách lớp
  const visible = useMemo(() => {
    let list = (classes.data || []).filter((c: any) => {
      const matchCat = cat === "all" ? true : cat === "none" ? !c.category : c.category === cat;
      const q = search.toLowerCase();
      const matchSearch =
        (c.name || "").toLowerCase().includes(q) ||
        (c.subject || "").toLowerCase().includes(q) ||
        (c.grade || "").toLowerCase().includes(q);
      return matchCat && matchSearch;
    });

    return list.sort((a: any, b: any) => {
      if (sortBy === "name-asc") return (a.name || "").localeCompare(b.name || "", "vi", { sensitivity: "base" });
      if (sortBy === "name-desc") return (b.name || "").localeCompare(a.name || "", "vi", { sensitivity: "base" });
      if (sortBy === "created-desc") return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (sortBy === "created-asc") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortBy === "students-desc") return studentCount(b.id) - studentCount(a.id);
      if (sortBy === "students-asc") return studentCount(a.id) - studentCount(b.id);
      return 0;
    });
  }, [classes.data, cat, search, sortBy, enrollments.data]);

  useEffect(() => {
    document.title = `${t.classes} — ${t.appName}`;
  }, [t]);

  const totalStudentsAll = (classes.data || []).reduce((sum: number, c: any) => sum + studentCount(c.id), 0);

  const handleDelete = async (id: string) => {
    if (!(await confirm({ description: t.confirmDelete, destructive: true }))) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: qk.classes });
      toast.success(t.delete);
    }
  };

  // Lưu màu tự chọn của lớp (mã #rrggbb) vào cột color
  const commitColor = async (c: any, hex: string) => {
    const { error } = await supabase.from("classes").update({ color: hex } as any).eq("id", c.id);
    if (error) toast.error(error.message);
    else await qc.invalidateQueries({ queryKey: qk.classes });
    colors.clear(c.id); // bỏ màu xem trước: lưu được thì dữ liệu mới đã có màu này, lỗi thì quay về màu cũ
  };

  const classColor = (c: any) => colors.draft[c.id] ?? colorOf(c.color, c.id);

  const colorPicker = (c: any) => (
    <ColorPickerButton
      value={classColor(c)}
      label="Chọn màu lớp"
      onPreview={(hex) => colors.set(c.id, hex)}
      onCommit={(hex) => commitColor(c, hex)}
    />
  );

  const openCreate = () => {
    setEditing(null);
    setOpen(true);
  };
  const vi = lang === "vi";

  const heroStats = [
    { label: vi ? "Lớp học" : "Classes", value: (classes.data || []).length },
    { label: vi ? "Lượt học sinh" : "Enrollments", value: totalStudentsAll },
    { label: vi ? "Ca học mỗi tuần" : "Weekly slots", value: (schedules.data || []).length },
  ];

  const rowMenu = (c: any) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Tùy chọn" className={cn(ICON_BTN, "grid place-items-center")}>
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40 rounded-xl p-1.5">
        <DropdownMenuItem
          onClick={() => {
            setEditing(c);
            setOpen(true);
          }}
          className="cursor-pointer gap-2 rounded-lg py-2 text-sm font-medium"
        >
          <Pencil className="h-4 w-4 text-zinc-500" /> {t.edit || "Chỉnh sửa"}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleDelete(c.id)}
          className="cursor-pointer gap-2 rounded-lg py-2 text-sm font-medium text-rose-600 focus:bg-rose-50 focus:text-rose-600"
        >
          <Trash2 className="h-4 w-4" /> {t.delete || "Xóa lớp"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      {/* TIÊU ĐỀ + SỐ LIỆU */}
      <section className={cn(CARD, "overflow-hidden")}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{t.classes}</h1>
            <p className="text-sm text-zinc-500">
              {vi ? "Quản lý lớp học, sĩ số và ca học trong tuần." : "Manage classes, enrolled students and weekly schedules."}
            </p>
          </div>
          <Button onClick={openCreate} className={cn(PRIMARY, "self-start sm:self-auto")}>
            <Plus className="h-4 w-4 text-[#FFB547]" strokeWidth={2.5} /> {t.addClass}
          </Button>
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

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className={SEG}>
          {(["all", "math", "english", "none"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={cat === k} onClick={() => setCat(k)} className={segBtn(cat === k)}>
              {catLabels[k]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder={vi ? "Tìm theo tên lớp, môn học..." : "Search class name, subject..."}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(FIELD, "pl-10")}
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 sm:w-52 sm:flex-none">
              <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
                <SelectTrigger className={cn(FIELD, "font-medium text-zinc-700")}>
                  <div className="flex items-center gap-2 truncate">
                    <ArrowUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
                    <SelectValue placeholder="Sắp xếp" />
                  </div>
                </SelectTrigger>
                <SelectContent className="rounded-xl text-sm">
                  <SelectItem value="name-asc">Tên lớp (A → Z)</SelectItem>
                  <SelectItem value="name-desc">Tên lớp (Z → A)</SelectItem>
                  <SelectItem value="created-desc">Mới nhất</SelectItem>
                  <SelectItem value="created-asc">Cũ nhất</SelectItem>
                  <SelectItem value="students-desc">Sĩ số (cao → thấp)</SelectItem>
                  <SelectItem value="students-asc">Sĩ số (thấp → cao)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className={cn(SEG, "shrink-0")}>
              {([["grid", LayoutGrid, "Lưới"], ["list", ListIcon, "Bảng"]] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  aria-label={label}
                  onClick={() => setView(mode)}
                  className={cn(segBtn(view === mode), "flex items-center gap-1.5")}
                >
                  <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* DANH SÁCH LỚP */}
      {visible.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100 text-zinc-400">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900">{t.nothingHere}</h3>
            <p className="text-sm text-zinc-500">
              {vi ? "Không tìm thấy lớp học phù hợp với từ khóa hoặc bộ lọc." : "No classes found matching search or filter criteria."}
            </p>
          </div>
          <Button onClick={openCreate} className={PRIMARY}>
            {t.addClass}
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((c: any) => {
            const color = classColor(c);
            const cs = slots(c.id);
            return (
              <div key={c.id} className="group relative">
                <Card
                  className="relative h-full gap-0 space-y-5 overflow-hidden rounded-2xl border bg-white p-5 pt-6 shadow-none transition-shadow group-hover:shadow-[0_14px_34px_-18px_rgb(0_0_0/0.35)]"
                  style={{ background: wash(color, 6), borderColor: wash(color, 38) }}
                >
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
                  <Link
                    to={`/classes/${c.id}`}
                    aria-label={`Xem lớp ${c.name}`}
                    className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl" style={solid(color)}>
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-[15px] font-semibold text-zinc-900">{c.name}</h3>
                        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-zinc-500">
                          <span className="truncate">{c.subject}</span>
                          {c.grade && <span className="shrink-0 rounded-md px-1.5 py-0.5 font-medium" style={{ background: wash(color, 18), color: deep(color) }}>{c.grade}</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      {colorPicker(c)}
                      {rowMenu(c)}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {cs.length === 0 ? (
                      <span className="text-xs text-zinc-400">Chưa xếp ca học</span>
                    ) : (
                      cs.map((s: any) => (
                        <span key={s.id} className={CHIP} style={{ background: wash(color, 14), borderColor: wash(color, 45), color: deep(color) }}>
                          <Clock className="h-3 w-3 opacity-60" />
                          {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                        </span>
                      ))
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-zinc-700">
                      <Users className="h-4 w-4 text-zinc-400" />
                      <span className="tabular-nums">{studentCount(c.id)}</span> {t.students.toLowerCase()}
                    </div>
                    <div className="flex items-center gap-2">
                      {(c.start_date || c.end_date) && (
                        <span className="text-xs text-zinc-400">
                          {c.start_date && fmtDate(c.start_date)} {c.end_date && `– ${fmtDate(c.end_date)}`}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-700" />
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/70 text-xs font-medium text-zinc-500">
                <tr>
                  <th className="px-6 py-3">{t.className}</th>
                  <th className="px-4 py-3">{t.students}</th>
                  <th className="px-4 py-3">{t.weeklySchedule}</th>
                  <th className="px-6 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {visible.map((c: any) => {
                  const color = classColor(c);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-zinc-50/70">
                      <td className="px-6 py-3">
                        <Link to={`/classes/${c.id}`} className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={solid(color)}>
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-zinc-900">{c.name}</p>
                            <p className="text-xs text-zinc-500">
                              {c.subject} {c.grade && `· ${c.grade}`}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 font-medium tabular-nums text-zinc-900">{studentCount(c.id)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {slots(c.id).map((s: any) => (
                            <span key={s.id} className={CHIP} style={{ background: wash(color, 14), borderColor: wash(color, 45), color: deep(color) }}>
                              {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-0.5">
                          {colorPicker(c)}
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Sửa"
                            onClick={() => {
                              setEditing(c);
                              setOpen(true);
                            }}
                            className={ICON_BTN}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Xóa" onClick={() => handleDelete(c.id)} className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600")}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ClassDialog open={open} onOpenChange={setOpen} cls={editing} />
    </div>
  );
}