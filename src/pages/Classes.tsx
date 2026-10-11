import { useEffect, useState, useMemo } from "react";
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
import { resolveStudentColor } from "@/lib/studentColor";

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate (giống trang Học sinh) */
const FIELD = "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20 focus-visible:border-[#0B1B3A]";
const ICON_BTN = "relative z-20 h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900";
const CHIP = "inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700";

export default function Classes() {
  const { t, lang } = useApp();
  const classes = useClasses();
  const enrollments = useEnrollments();
  const schedules = useClassSchedules();
  const qc = useQueryClient();
  const confirm = useConfirm();

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
          <Pencil className="h-4 w-4 text-slate-500" /> {t.edit || "Chỉnh sửa"}
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
    <div className="mx-auto max-w-7xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#FFB547]" />
        <div className="pointer-events-none absolute -bottom-28 right-40 hidden h-60 w-60 rounded-full border-[36px] border-white/[0.07] sm:block" />
        <div className="relative space-y-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-lg space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.classes}</h1>
              <p className="text-sm leading-relaxed text-white/70">
                {vi ? "Quản lý lớp học, sĩ số và ca học trong tuần." : "Manage classes, enrolled students and weekly schedules."}
              </p>
            </div>
            <Button
              onClick={openCreate}
              className="h-11 shrink-0 gap-2 self-start rounded-xl bg-white px-5 text-sm font-bold text-[#0B1B3A] shadow-lg hover:bg-slate-100 sm:self-auto"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} /> {t.addClass}
            </Button>
          </div>
          <dl className="flex flex-wrap gap-x-10 gap-y-3">
            {heroStats.map((s) => (
              <div key={s.label}>
                <dd className="text-2xl font-extrabold text-white">{s.value}</dd>
                <dt className="text-xs text-white/60">{s.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
          {(["all", "math", "english", "none"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={cat === k}
              onClick={() => setCat(k)}
              className={cn(
                "h-9 shrink-0 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                cat === k ? "bg-white text-[#0B1B3A] shadow-sm" : "text-slate-500 hover:text-slate-900"
              )}
            >
              {catLabels[k]}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                <SelectTrigger className={cn(FIELD, "font-medium text-slate-700")}>
                  <div className="flex items-center gap-2 truncate">
                    <ArrowUpDown className="h-4 w-4 shrink-0 text-slate-400" />
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
            <div className="flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
              {([["grid", LayoutGrid, "Lưới"], ["list", ListIcon, "Bảng"]] as const).map(([mode, Icon, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={view === mode}
                  aria-label={label}
                  onClick={() => setView(mode)}
                  className={cn(
                    "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                    view === mode ? "bg-white text-[#0B1B3A] shadow-sm" : "text-slate-500 hover:text-slate-900"
                  )}
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
        <div className="space-y-4 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <BookOpen className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">{t.nothingHere}</h3>
            <p className="text-sm text-slate-500">
              {vi ? "Không tìm thấy lớp học phù hợp với từ khóa hoặc bộ lọc." : "No classes found matching search or filter criteria."}
            </p>
          </div>
          <Button onClick={openCreate} className="h-10 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white hover:bg-[#13285a]">
            {t.addClass}
          </Button>
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((c: any) => {
            const color = resolveStudentColor(c.color, c.id);
            const cs = slots(c.id);
            return (
              <div key={c.id} className="group relative">
                <Card className="relative h-full space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 pt-6 shadow-xs transition-all group-hover:border-slate-300 group-hover:shadow-lg group-hover:shadow-slate-900/5">
                  <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: color }} />
                  <Link
                    to={`/classes/${c.id}`}
                    aria-label={`Xem lớp ${c.name}`}
                    className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                  />

                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3.5">
                      <div
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white ring-2 ring-offset-2 ring-offset-white"
                        style={{ background: color, ["--tw-ring-color" as any]: color }}
                      >
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-bold text-slate-900">{c.name}</h3>
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500">
                          <span className="truncate">{c.subject}</span>
                          {c.grade && <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 font-semibold text-indigo-700">{c.grade}</span>}
                        </p>
                      </div>
                    </div>
                    {rowMenu(c)}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-slate-500">{t.weeklySchedule || "Lịch dạy"}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {cs.length === 0 ? (
                        <span className="text-xs text-slate-400">Chưa xếp ca học</span>
                      ) : (
                        cs.map((s: any) => (
                          <span key={s.id} className={CHIP}>
                            <Clock className="h-3 w-3 text-slate-400" />
                            {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Users className="h-4 w-4 text-slate-400" />
                      {studentCount(c.id)} {t.students.toLowerCase()}
                    </div>
                    <div className="flex items-center gap-2">
                      {(c.start_date || c.end_date) && (
                        <span className="text-xs text-slate-500">
                          {c.start_date && fmtDate(c.start_date)} {c.end_date && `– ${fmtDate(c.end_date)}`}
                        </span>
                      )}
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-700" />
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">{t.className}</th>
                  <th className="px-4 py-3.5">{t.students}</th>
                  <th className="px-4 py-3.5">{t.weeklySchedule}</th>
                  <th className="px-6 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((c: any) => {
                  const color = resolveStudentColor(c.color, c.id);
                  return (
                    <tr key={c.id} className="transition-colors hover:bg-slate-50/70">
                      <td className="px-6 py-3.5">
                        <Link to={`/classes/${c.id}`} className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: color }}>
                            <BookOpen className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900 group-hover:text-[#0B1B3A]">{c.name}</p>
                            <p className="text-xs text-slate-500">
                              {c.subject} {c.grade && `· ${c.grade}`}
                            </p>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-slate-900">{studentCount(c.id)}</td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap gap-1.5">
                          {slots(c.id).map((s: any) => (
                            <span key={s.id} className={CHIP}>
                              {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center justify-end gap-0.5">
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