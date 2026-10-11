import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Plus,
  Search,
  Grid2X2,
  List as ListIcon,
  GraduationCap,
  ChevronRight,
  Trash2,
  ArrowUpDown,
  Pencil,
  FileText,
  Phone,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEnrollments, useClasses } from "@/hooks/useData";
import StudentDialog from "@/components/StudentDialog";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { resolveStudentColor } from "@/lib/studentColor";

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate */
const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold";
const FIELD = "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20 focus-visible:border-[#0B1B3A]";
const ICON_BTN = "relative z-20 h-8 w-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-900";

const cleanName = (val: any) => {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (["game", "vi", "en"].includes(trimmed.toLowerCase())) return "";
  return trimmed;
};

export default function Students() {
  const { t, user } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const enrollmentsQuery = useEnrollments();
  const classesQuery = useClasses();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "created-desc" | "created-asc" | "grade-asc">("name-asc");

  const { data: students = [] } = useQuery({
    queryKey: ["students-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("user_id", user.id).order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const enrichedStudents = useMemo(() => {
    const enrollmentsList = Array.isArray(enrollmentsQuery?.data) ? enrollmentsQuery.data : Array.isArray(enrollmentsQuery) ? enrollmentsQuery : [];
    const classesList = Array.isArray(classesQuery?.data) ? classesQuery.data : Array.isArray(classesQuery) ? classesQuery : [];

    return students.map((st: any) => {
      const cleaned = cleanName(st.name);
      const rawParentName = cleanName(st.parent_name);
      const rawParentPhone = st.parent_phone?.trim();
      const cids = enrollmentsList.filter((e: any) => e.student_id === st.id).map((e: any) => e.class_id);

      return {
        ...st,
        displayName: cleaned || "Chưa đặt tên",
        initial: cleaned ? cleaned.charAt(0).toUpperCase() : "?",
        displayPhone: st.phone || "—",
        displayGrade: st.grade || "—",
        displayParentName: rawParentName !== "" ? rawParentName : null,
        displayParentPhone: rawParentPhone ? rawParentPhone : null,
        accent: resolveStudentColor(st.color, st.id ?? cleaned),
        studentClasses: classesList.filter((c: any) => cids.includes(c.id)),
      };
    });
  }, [students, enrollmentsQuery, classesQuery]);

  const filteredStudents = useMemo(() => {
    const q = search.toLowerCase();
    const list = enrichedStudents.filter(
      (st: any) =>
        st.displayName.toLowerCase().includes(q) ||
        String(st.displayPhone).toLowerCase().includes(q) ||
        (st.displayParentName && st.displayParentName.toLowerCase().includes(q)) ||
        (st.displayParentPhone && st.displayParentPhone.toLowerCase().includes(q))
    );
    return list.sort((a: any, b: any) => {
      if (sortBy === "name-asc") return a.displayName.localeCompare(b.displayName, "vi", { sensitivity: "base" });
      if (sortBy === "name-desc") return b.displayName.localeCompare(a.displayName, "vi", { sensitivity: "base" });
      if (sortBy === "created-desc") return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      if (sortBy === "created-asc") return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      if (sortBy === "grade-asc") return (parseInt(a.displayGrade) || 0) - (parseInt(b.displayGrade) || 0);
      return 0;
    });
  }, [enrichedStudents, search, sortBy]);

  const openCreate = () => {
    setSelectedStudent(null);
    setDialogOpen(true);
  };
  const openEdit = (e: React.MouseEvent, st: any) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedStudent(st);
    setDialogOpen(true);
  };
  const handleDelete = async (e: React.MouseEvent, st: any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirm({ description: t.confirmDelete, destructive: true }))) return;
    const { error } = await supabase.from("students").delete().eq("id", st.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t.save);
    qc.invalidateQueries({ queryKey: ["students-list"] });
  };

  const Avatar = ({ st, size }: { st: any; size: string }) => (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-2xl font-extrabold text-white ring-2 ring-offset-2 ring-offset-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]",
        size
      )}
      style={{ background: st.accent, ["--tw-ring-color" as any]: st.accent }}
    >
      {st.initial}
    </div>
  );

  const gradePill = (st: any) => (
    <span className={cn(PILL, "bg-indigo-50 text-indigo-700")}>
      <GraduationCap className="h-3.5 w-3.5" /> Lớp {st.displayGrade}
    </span>
  );
  const paymentPill = (st: any) => (
    <span className={cn(PILL, st.payment_mode === "monthly" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
      {st.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}
    </span>
  );
  const classChips = (st: any, max = 3) => {
    const shown = st.studentClasses.slice(0, max);
    const rest = st.studentClasses.length - shown.length;
    return (
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c: any) => (
          <span key={c.id} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{c.name}</span>
        ))}
        {rest > 0 && <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">+{rest}</span>}
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#FFB547]" />
        <div className="pointer-events-none absolute -bottom-28 right-40 hidden h-60 w-60 rounded-full border-[36px] border-white/[0.07] sm:block" />
        <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-lg space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.students || "Danh sách học sinh"}</h1>
            <p className="text-sm leading-relaxed text-white/70">
              Quản lý thông tin, lớp học và học phí của {students.length} học sinh.
            </p>
          </div>
          <Button
            onClick={openCreate}
            className="h-11 shrink-0 gap-2 self-start rounded-xl bg-white px-5 text-sm font-bold text-[#0B1B3A] shadow-lg hover:bg-slate-100 sm:self-auto"
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} /> {t.addStudent || "Thêm học sinh"}
          </Button>
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Tìm theo tên học sinh, SĐT..." value={search} onChange={(e) => setSearch(e.target.value)} className={cn(FIELD, "pl-10")} />
        </div>

        <div className="flex flex-1 items-center gap-3">
          <div className="flex-1 sm:max-w-[13rem]">
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
              <SelectTrigger className={cn(FIELD, "font-medium text-slate-700")}>
                <div className="flex items-center gap-2 truncate">
                  <ArrowUpDown className="h-4 w-4 shrink-0 text-slate-400" />
                  <SelectValue placeholder="Sắp xếp" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl text-sm">
                <SelectItem value="name-asc">Tên (A → Z)</SelectItem>
                <SelectItem value="name-desc">Tên (Z → A)</SelectItem>
                <SelectItem value="created-desc">Mới nhất</SelectItem>
                <SelectItem value="created-asc">Cũ nhất</SelectItem>
                <SelectItem value="grade-asc">Khối lớp (tăng dần)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="ml-auto flex shrink-0 gap-1 rounded-xl bg-slate-100 p-1">
            {([["grid", Grid2X2, "Lưới"], ["list", ListIcon, "Bảng"]] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                onClick={() => setViewMode(mode)}
                className={cn(
                  "flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                  viewMode === mode ? "bg-white text-[#0B1B3A] shadow-sm" : "text-slate-500 hover:text-slate-900"
                )}
              >
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* NỘI DUNG */}
      {filteredStudents.length === 0 ? (
        <div className="space-y-4 rounded-3xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900">{search ? "Không có học sinh nào khớp" : "Chưa có học sinh nào"}</h3>
            <p className="text-sm text-slate-500">{search ? "Thử đổi từ khóa hoặc xóa ô tìm kiếm." : "Thêm học sinh đầu tiên để bắt đầu."}</p>
          </div>
          <Button onClick={search ? () => setSearch("") : openCreate} className="h-10 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white hover:bg-[#13285a]">
            {search ? "Xóa tìm kiếm" : t.addStudent || "Thêm học sinh"}
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filteredStudents.map((st: any) => (
            <div key={st.id} className="group relative">
              <Card className="relative h-full space-y-4 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 pt-6 shadow-xs transition-all group-hover:border-slate-300 group-hover:shadow-lg group-hover:shadow-slate-900/5">
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: st.accent }} />
                <Link
                  to={`/students/${st.id}`}
                  aria-label={`Xem hồ sơ ${st.displayName}`}
                  className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <Avatar st={st} size="h-12 w-12 text-lg" />
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-bold text-slate-900">{st.displayName}</h3>
                      <p className="truncate text-xs text-slate-500">{st.displayPhone}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    <Button variant="ghost" size="icon" aria-label="Sửa" onClick={(e) => openEdit(e, st)} className={ICON_BTN}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Xóa" onClick={(e) => handleDelete(e, st)} className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600")}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {gradePill(st)}
                  {paymentPill(st)}
                </div>

                <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><Users className="h-3.5 w-3.5" /> Phụ huynh</p>
                    <p className={cn("mt-0.5 truncate text-sm font-semibold", st.displayParentName ? "text-slate-900" : "font-normal text-slate-400")}>
                      {st.displayParentName ?? "Chưa có"}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 text-xs text-slate-500"><Phone className="h-3.5 w-3.5" /> SĐT phụ huynh</p>
                    <p className={cn("mt-0.5 truncate text-sm font-semibold", st.displayParentPhone ? "text-slate-900" : "font-normal text-slate-400")}>
                      {st.displayParentPhone ?? "Chưa có"}
                    </p>
                  </div>
                </div>

                <div className="flex items-end justify-between gap-3">
                  {st.studentClasses.length === 0 ? <span className="text-xs text-slate-400">Chưa tham gia lớp nào</span> : classChips(st)}
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-700" />
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-6 py-3.5">Học sinh</th>
                  <th className="px-4 py-3.5">Khối lớp</th>
                  <th className="px-4 py-3.5">Phụ huynh & SĐT</th>
                  <th className="px-4 py-3.5">Lớp tham gia</th>
                  <th className="px-4 py-3.5">Hình thức</th>
                  <th className="px-6 py-3.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st: any) => (
                  <tr key={st.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <Link to={`/students/${st.id}`} className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]">
                        <Avatar st={st} size="h-10 w-10 text-base" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 group-hover:text-[#0B1B3A]">{st.displayName}</p>
                          <p className="text-xs text-slate-500">{st.displayPhone}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">{gradePill(st)}</td>
                    <td className="px-4 py-3.5">
                      <p className={cn("font-semibold", st.displayParentName ? "text-slate-900" : "font-normal text-slate-400")}>{st.displayParentName ?? "Chưa có"}</p>
                      <p className="text-xs text-slate-500">{st.displayParentPhone ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3.5">{st.studentClasses.length === 0 ? <span className="text-slate-300">—</span> : classChips(st, 4)}</td>
                    <td className="px-4 py-3.5">{paymentPill(st)}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button asChild variant="ghost" size="icon" aria-label="Xem hồ sơ" className={ICON_BTN}>
                          <Link to={`/students/${st.id}`}><FileText className="h-4 w-4" /></Link>
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Sửa" onClick={(e) => openEdit(e, st)} className={ICON_BTN}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" aria-label="Xóa" onClick={(e) => handleDelete(e, st)} className={cn(ICON_BTN, "hover:bg-rose-50 hover:text-rose-600")}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <StudentDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            setSelectedStudent(null);
            qc.invalidateQueries({ queryKey: ["students-list"] });
          }
        }}
        student={selectedStudent}
      />
    </div>
  );
}