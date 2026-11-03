import { useMemo, useState } from "react";
import type { CSSProperties } from "react";
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
  CalendarClock,
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
import ColorPickerButton, { colorOf, useColorDraft } from "@/components/Colorpickerbutton";

/* Design tokens: mực navy #0B1B3A · nền trắng · viền zinc mảnh · chữ xám trung tính.
   Giao diện giữ trung tính để màu của từng học sinh (do người dùng chọn) nổi bật: vạch màu trên thẻ, avatar đặc, nền thẻ phủ sắc rất nhạt. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const PILL = "inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700";
const FIELD =
  "h-10 rounded-xl border-zinc-200 bg-white text-sm shadow-none placeholder:text-zinc-400 focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const ICON_BTN = "relative z-20 h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900";
const PRIMARY = "h-10 shrink-0 gap-2 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white shadow-none hover:bg-[#13285a]";
const SEG = "inline-flex shrink-0 gap-0.5 rounded-full bg-zinc-100 p-1";
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
  // Màu đang kéo dở của từng học sinh (xem trước ngay, chưa lưu)
  const colors = useColorDraft();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "created-desc" | "created-asc" | "grade-asc">("name-asc");

  const { data: students = [] } = useQuery({
    queryKey: ["students-list", user?.id],
    enabled: !!user?.id,
    // Luôn tải lại khi mở trang, để các chỉnh sửa trong hồ sơ học sinh (như ngày thu học phí) hiện ngay ở đây
    staleTime: 0,
    refetchOnMount: "always",
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

      // Ngày thu học phí hằng tháng (cột billing_day), chưa đặt thì để trống
      const billingDayNum = Number(st.billing_day);
      const billingDay = billingDayNum >= 1 && billingDayNum <= 31 ? billingDayNum : null;

      return {
        ...st,
        displayName: cleaned || "Chưa đặt tên",
        initial: cleaned ? cleaned.charAt(0).toUpperCase() : "?",
        displayPhone: st.phone || "—",
        displayGrade: st.grade || "—",
        displayParentName: rawParentName !== "" ? rawParentName : null,
        displayParentPhone: rawParentPhone ? rawParentPhone : null,
        accent: colorOf(st.color, st.id ?? cleaned),
        studentClasses: classesList.filter((c: any) => cids.includes(c.id)),
        billingDay,
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

  // Màu hiển thị của học sinh: màu đang kéo dở nếu có, không thì màu đã lưu
  const accentOf = (st: any): string => colors.draft[st.id] ?? st.accent;

  // Lưu màu tự chọn của học sinh (mã #rrggbb) vào cột color
  const commitColor = async (st: any, hex: string) => {
    const { error } = await supabase.from("students").update({ color: hex } as any).eq("id", st.id);
    if (error) toast.error(error.message);
    else {
      qc.invalidateQueries({ queryKey: ["student", st.id] });
      await qc.invalidateQueries({ queryKey: ["students-list"] });
    }
    colors.clear(st.id); // bỏ màu xem trước: lưu được thì dữ liệu mới đã có màu này, lỗi thì quay về màu cũ
  };

  const colorPicker = (st: any) => (
    <ColorPickerButton
      value={accentOf(st)}
      label="Chọn màu học sinh"
      onPreview={(hex) => colors.set(st.id, hex)}
      onCommit={(hex) => commitColor(st, hex)}
    />
  );

  // Dùng hàm render thay vì component lồng nhau để tránh bị mount lại mỗi lần render
  const renderAvatar = (st: any, size: string) => (
    <div className={cn("grid shrink-0 place-items-center rounded-full font-semibold", size)} style={solid(accentOf(st))}>
      {st.initial}
    </div>
  );

  const gradePill = (st: any) => (
    <span className={PILL} style={{ background: wash(accentOf(st), 18), color: deep(accentOf(st)) }}>
      <GraduationCap className="h-3.5 w-3.5 opacity-60" /> Lớp {st.displayGrade}
    </span>
  );
  const paymentPill = (st: any) => (
    <span className={PILL} style={{ background: wash(accentOf(st), 18), color: deep(accentOf(st)) }}>{st.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}</span>
  );
  const classChips = (st: any, max = 3) => {
    const shown = st.studentClasses.slice(0, max);
    const rest = st.studentClasses.length - shown.length;
    return (
      <div className="flex flex-wrap gap-1.5">
        {shown.map((c: any) => (
          <span key={c.id} className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-600">{c.name}</span>
        ))}
        {rest > 0 && <span className="rounded-md border border-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-400">+{rest}</span>}
      </div>
    );
  };

  return (
    <div className={cn("mx-auto max-w-7xl space-y-5 pb-12", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      {/* TIÊU ĐỀ */}
      <section className={cn(CARD, "flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6")}>
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">{t.students || "Danh sách học sinh"}</h1>
          <p className="text-sm text-zinc-500">
            Quản lý thông tin, lớp học và học phí của <span className="font-medium tabular-nums text-zinc-700">{students.length}</span> học sinh.
          </p>
        </div>
        <Button onClick={openCreate} className={cn(PRIMARY, "self-start sm:self-auto")}>
          <Plus className="h-4 w-4 text-[#FFB547]" strokeWidth={2.5} /> {t.addStudent || "Thêm học sinh"}
        </Button>
      </section>

      {/* TOOLBAR */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input placeholder="Tìm theo tên học sinh, SĐT..." value={search} onChange={(e) => setSearch(e.target.value)} className={cn(FIELD, "pl-10")} />
        </div>

        <div className="flex flex-1 items-center gap-3">
          <div className="flex-1 sm:max-w-[13rem]">
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
              <SelectTrigger className={cn(FIELD, "font-medium text-zinc-700")}>
                <div className="flex items-center gap-2 truncate">
                  <ArrowUpDown className="h-4 w-4 shrink-0 text-zinc-400" />
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

          <div className={cn(SEG, "ml-auto")}>
            {([["grid", Grid2X2, "Lưới"], ["list", ListIcon, "Bảng"]] as const).map(([mode, Icon, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={viewMode === mode}
                aria-label={label}
                onClick={() => setViewMode(mode)}
                className={cn(segBtn(viewMode === mode), "flex items-center gap-1.5")}
              >
                <Icon className="h-4 w-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* NỘI DUNG */}
      {filteredStudents.length === 0 ? (
        <div className="space-y-4 rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-zinc-100 text-zinc-400">
            <Users className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-zinc-900">{search ? "Không có học sinh nào khớp" : "Chưa có học sinh nào"}</h3>
            <p className="text-sm text-zinc-500">{search ? "Thử đổi từ khóa hoặc xóa ô tìm kiếm." : "Thêm học sinh đầu tiên để bắt đầu."}</p>
          </div>
          <Button onClick={search ? () => setSearch("") : openCreate} className={PRIMARY}>
            {search ? "Xóa tìm kiếm" : t.addStudent || "Thêm học sinh"}
          </Button>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredStudents.map((st: any) => (
            <div key={st.id} className="group relative">
              <Card
                className="relative h-full gap-0 space-y-5 overflow-hidden rounded-2xl border bg-white p-5 pt-6 shadow-none transition-shadow group-hover:shadow-[0_14px_34px_-18px_rgb(0_0_0/0.35)]"
                style={{ background: wash(accentOf(st), 6), borderColor: wash(accentOf(st), 38) }}
              >
                <div className="absolute inset-x-0 top-0 h-1.5" style={{ background: accentOf(st) }} />
                <Link
                  to={`/students/${st.id}`}
                  aria-label={`Xem hồ sơ ${st.displayName}`}
                  className="absolute inset-0 z-10 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                />

                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    {renderAvatar(st, "h-12 w-12 text-lg")}
                    <div className="min-w-0">
                      <h3 className="truncate text-[15px] font-semibold text-zinc-900">{st.displayName}</h3>
                      <p className="mt-0.5 truncate text-xs tabular-nums text-zinc-500">{st.displayPhone}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-0.5 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                    {colorPicker(st)}
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

                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-zinc-100 pt-4">
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs text-zinc-500"><Users className="h-3.5 w-3.5" /> Phụ huynh</dt>
                    <dd className={cn("mt-1 truncate text-sm", st.displayParentName ? "font-medium text-zinc-900" : "text-zinc-400")}>
                      {st.displayParentName ?? "Chưa có"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="flex items-center gap-1.5 text-xs text-zinc-500"><Phone className="h-3.5 w-3.5" /> SĐT phụ huynh</dt>
                    <dd className={cn("mt-1 truncate text-sm tabular-nums", st.displayParentPhone ? "font-medium text-zinc-900" : "text-zinc-400")}>
                      {st.displayParentPhone ?? "Chưa có"}
                    </dd>
                  </div>

                  {/* Ngày đóng học phí */}
                  <div className="col-span-2 flex items-center justify-between gap-3">
                    <dt className="flex shrink-0 items-center gap-1.5 text-xs text-zinc-500">
                      <CalendarClock className="h-3.5 w-3.5" /> Ngày đóng học phí
                    </dt>
                    <dd className={cn("whitespace-nowrap text-sm", st.billingDay ? "font-medium text-zinc-900" : "text-zinc-400")}>
                      {st.billingDay ? `Ngày ${st.billingDay}` : "Chưa đặt"}
                    </dd>
                  </div>
                </dl>

                <div className="flex items-end justify-between gap-3 border-t border-zinc-100 pt-4">
                  {st.studentClasses.length === 0 ? <span className="text-xs text-zinc-400">Chưa tham gia lớp nào</span> : classChips(st)}
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-700" />
                </div>
              </Card>
            </div>
          ))}
        </div>
      ) : (
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[64rem] text-left text-sm">
              <thead className="border-b border-zinc-100 bg-zinc-50/70 text-xs font-medium text-zinc-500">
                <tr>
                  <th className="px-6 py-3">Học sinh</th>
                  <th className="px-4 py-3">Khối lớp</th>
                  <th className="px-4 py-3">Phụ huynh & SĐT</th>
                  <th className="px-4 py-3">Lớp tham gia</th>
                  <th className="px-4 py-3">Hình thức</th>
                  <th className="px-4 py-3">Ngày đóng học phí</th>
                  <th className="px-6 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {filteredStudents.map((st: any) => (
                  <tr key={st.id} className="transition-colors hover:bg-zinc-50/70">
                    <td className="px-6 py-3">
                      <Link to={`/students/${st.id}`} className="group flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]">
                        {renderAvatar(st, "h-9 w-9 text-sm")}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-zinc-900">{st.displayName}</p>
                          <p className="text-xs tabular-nums text-zinc-500">{st.displayPhone}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-4 py-3">{gradePill(st)}</td>
                    <td className="px-4 py-3">
                      <p className={cn(st.displayParentName ? "font-medium text-zinc-900" : "text-zinc-400")}>{st.displayParentName ?? "Chưa có"}</p>
                      <p className="text-xs tabular-nums text-zinc-500">{st.displayParentPhone ?? "—"}</p>
                    </td>
                    <td className="px-4 py-3">{st.studentClasses.length === 0 ? <span className="text-zinc-300">—</span> : classChips(st, 4)}</td>
                    <td className="px-4 py-3">{paymentPill(st)}</td>
                    <td className="px-4 py-3">
                      {st.billingDay ? (
                        <p className="font-medium text-zinc-900">Ngày {st.billingDay}</p>
                      ) : (
                        <span className="text-zinc-400">Chưa đặt</span>
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-0.5">
                        {colorPicker(st)}
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