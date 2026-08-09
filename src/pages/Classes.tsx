import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  Plus, 
  LayoutGrid, 
  List as ListIcon, 
  Pencil, 
  Trash2, 
  Users, 
  Calendar, 
  GraduationCap, 
  Clock, 
  BookOpen, 
  MoreVertical,
  Sparkles,
  Search,
  ArrowUpDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/contexts/AppContext";
import { useClasses, useEnrollments, useClassSchedules, qk } from "@/hooks/useData";
import { fmtDate } from "@/lib/format";
import ClassDialog from "@/components/ClassDialog";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";

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

  // 🌟 States mới phục vụ Lọc & Sắp xếp
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name-asc" | "name-desc" | "created-desc" | "created-asc" | "students-desc" | "students-asc">("name-asc");

  const catLabels: Record<string, string> = lang === "vi"
    ? { all: "Tất cả", math: "Toán", english: "Tiếng Anh", none: "Chưa phân loại" }
    : { all: "All", math: "Math", english: "English", none: "Unsorted" };

  const studentCount = (cid: string) =>
    (enrollments.data || []).filter((e: any) => e.class_id === cid).length;

  const slots = (cid: string) =>
    (schedules.data || []).filter((s: any) => s.class_id === cid);

  // 🌟 Logic Tìm kiếm & Sắp xếp danh sách lớp
  const visible = useMemo(() => {
    let list = (classes.data || []).filter((c: any) => {
      // 1. Lọc theo Tab Danh mục
      const matchCat = cat === "all" ? true : cat === "none" ? !c.category : c.category === cat;
      
      // 2. Lọc theo từ khóa Tìm kiếm (Tên lớp, Môn học, Khối lớp)
      const q = search.toLowerCase();
      const matchSearch = 
        (c.name || "").toLowerCase().includes(q) ||
        (c.subject || "").toLowerCase().includes(q) ||
        (c.grade || "").toLowerCase().includes(q);

      return matchCat && matchSearch;
    });

    // 3. Thực hiện Sắp xếp
    return list.sort((a: any, b: any) => {
      if (sortBy === "name-asc") {
        return (a.name || "").localeCompare(b.name || "", "vi", { sensitivity: "base" });
      }
      if (sortBy === "name-desc") {
        return (b.name || "").localeCompare(a.name || "", "vi", { sensitivity: "base" });
      }
      if (sortBy === "created-desc") {
        return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
      }
      if (sortBy === "created-asc") {
        return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime();
      }
      if (sortBy === "students-desc") {
        return studentCount(b.id) - studentCount(a.id);
      }
      if (sortBy === "students-asc") {
        return studentCount(a.id) - studentCount(b.id);
      }
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

  return (
    <div className="p-2 sm:p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-300">
      
      {/* 1. HEADER VÀ NÚT TẠO LỚP */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            {t.classes}
            <Badge variant="secondary" className="rounded-xl px-2.5 py-0.5 text-blue-600 bg-blue-50 border border-blue-100 font-bold text-xs">
              {(classes.data || []).length} {lang === "vi" ? "lớp" : "classes"}
            </Badge>
          </h1>
          <p className="text-xs font-semibold text-slate-400 mt-1">
            {lang === "vi" 
              ? "Quản lý danh sách lớp học, số lượng học sinh và ca học tuần" 
              : "Manage class schedules, enrolled students, and subjects"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Toggle Grid/List */}
          <div className="flex items-center bg-slate-100/80 p-1 rounded-2xl border border-slate-200/50">
            <button
              onClick={() => setView("grid")}
              className={cn(
                "p-2 rounded-xl transition-all cursor-pointer",
                view === "grid" ? "bg-white text-blue-600 shadow-xs font-bold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              className={cn(
                "p-2 rounded-xl transition-all cursor-pointer",
                view === "list" ? "bg-white text-blue-600 shadow-xs font-bold" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <ListIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Nút Thêm Lớp */}
          <Button 
            onClick={() => { setEditing(null); setOpen(true); }}
            className="h-11 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-lg shadow-blue-600/20 flex items-center gap-2 transition-all cursor-pointer active:scale-95"
          >
            <Plus className="h-4 w-4" /> 
            {t.addClass}
          </Button>
        </div>
      </div>

      {/* 2. CÁC THẺ THỐNG KÊ TỔNG QUAN */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="rounded-3xl border-slate-100/80 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <GraduationCap className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400">{lang === "vi" ? "Tổng số lớp học" : "Total Classes"}</p>
            <p className="text-2xl font-black text-slate-900">{(classes.data || []).length}</p>
          </div>
        </Card>

        <Card className="rounded-3xl border-slate-100/80 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400">{lang === "vi" ? "Tổng lượt học sinh" : "Total Enrollments"}</p>
            <p className="text-2xl font-black text-slate-900">{totalStudentsAll}</p>
          </div>
        </Card>

        <Card className="rounded-3xl border-slate-100/80 bg-white p-5 shadow-xs flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Calendar className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400">{lang === "vi" ? "Ca học hoạt động" : "Active Schedules"}</p>
            <p className="text-2xl font-black text-slate-900">{(schedules.data || []).length}</p>
          </div>
        </Card>
      </div>

      {/* 🌟 3. THANH CÔNG CỤ: TÌM KIẾM, SẮP XẾP VÀ TABS MÔN HỌC */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        
        {/* Lựa chọn Tab môn học */}
        <div className="flex items-center gap-1.5 bg-slate-100/80 p-1 rounded-xl w-full md:w-auto overflow-x-auto shrink-0">
          {(["all", "math", "english", "none"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setCat(k)}
              className={cn(
                "px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap cursor-pointer",
                cat === k
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-900"
              )}
            >
              {catLabels[k]}
            </button>
          ))}
        </div>

        {/* Tìm kiếm và Bộ lọc Sắp xếp */}
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full md:w-auto flex-1 md:justify-end">
          {/* Ô Tìm kiếm */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input 
              placeholder={lang === "vi" ? "Tìm theo tên lớp, môn học..." : "Search class name, subject..."} 
              value={search} 
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-slate-50 border-slate-200 rounded-xl text-xs h-9 focus:bg-white transition-all"
            />
          </div>

          {/* Dropdown Sắp xếp */}
          <div className="w-full sm:w-48">
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
              <SelectTrigger className="bg-slate-50 border-slate-200 rounded-xl text-xs h-9 text-slate-700 font-semibold focus:ring-0">
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <SelectValue placeholder="Sắp xếp" />
                </div>
              </SelectTrigger>
              <SelectContent className="rounded-xl text-xs">
                <SelectItem value="name-asc" className="text-xs font-medium">Tên lớp (A → Z)</SelectItem>
                <SelectItem value="name-desc" className="text-xs font-medium">Tên lớp (Z → A)</SelectItem>
                <SelectItem value="created-desc" className="text-xs font-medium">Mới nhất (Ngày tạo)</SelectItem>
                <SelectItem value="created-asc" className="text-xs font-medium">Cũ nhất (Ngày tạo)</SelectItem>
                <SelectItem value="students-desc" className="text-xs font-medium">Sĩ số (Cao → Thấp)</SelectItem>
                <SelectItem value="students-asc" className="text-xs font-medium">Sĩ số (Thấp → Cao)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      </div>

      {/* 4. HIỂN THỊ DANH SÁCH LỚP HỌC */}
      {visible.length === 0 ? (
        <Card className="bg-white rounded-3xl border border-dashed border-slate-200 p-12 text-center space-y-4 max-w-md mx-auto my-8">
          <div className="h-16 w-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto">
            <Sparkles className="h-8 w-8" />
          </div>
          <div>
            <h3 className="text-base font-black text-slate-900">{t.nothingHere}</h3>
            <p className="text-xs font-semibold text-slate-400 mt-1">
              {lang === "vi" 
                ? "Không tìm thấy lớp học phù hợp với từ khóa hoặc bộ lọc." 
                : "No classes found matching search or filter criteria."}
            </p>
          </div>
          <Button 
            onClick={() => { setEditing(null); setOpen(true); }} 
            className="h-10 px-6 rounded-2xl bg-blue-600 text-white font-bold text-xs shadow-md"
          >
            + {t.addClass}
          </Button>
        </Card>
      ) : view === "grid" ? (
        /* DẠNG DÒNG CỘT (GRID VIEW) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {visible.map((c: any) => (
            <Card
              key={c.id}
              className="group rounded-3xl border-slate-100 bg-white shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative"
            >
              <CardContent className="p-6 space-y-5">
                
                {/* Header Thẻ: Icon + Tên Lớp + Dropdown Menu */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div 
                      className="h-12 w-12 rounded-2xl text-white flex items-center justify-center font-black shadow-md shrink-0"
                      style={{ background: c.color || "#2563eb" }}
                    >
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link to={`/classes/${c.id}`} className="block">
                        <h3 className="font-black text-slate-900 text-base group-hover:text-blue-600 transition-colors truncate">
                          {c.name}
                        </h3>
                      </Link>
                      <p className="text-[11px] font-bold text-slate-400 flex items-center gap-1.5 mt-0.5 truncate">
                        <span>{c.subject}</span>
                        {c.grade && (
                          <>
                            <span>•</span>
                            <span className="text-blue-600">{c.grade}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Menu 3 chấm Sửa/Xóa */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-2xl p-2 w-36">
                      <DropdownMenuItem 
                        onClick={() => { setEditing(c); setOpen(true); }}
                        className="rounded-xl font-semibold text-xs gap-2 py-2 cursor-pointer"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-500" />
                        {t.edit || "Chỉnh sửa"}
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => handleDelete(c.id)}
                        className="rounded-xl font-semibold text-xs gap-2 py-2 text-red-600 cursor-pointer focus:bg-red-50 focus:text-red-600"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t.delete || "Xóa lớp"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                {/* Nội dung: Lịch học & Số học sinh */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  {/* Các ca học trong tuần */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      {t.weeklySchedule || "Lịch dạy"}
                    </span>
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {slots(c.id).length === 0 ? (
                        <span className="text-xs text-slate-400 italic">Chưa xếp ca học</span>
                      ) : (
                        slots(c.id).map((s: any) => (
                          <span
                            key={s.id}
                            className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-blue-50 text-blue-700 border border-blue-100/60"
                          >
                            <Clock className="h-3 w-3 text-blue-500" />
                            {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {/* Sĩ số học sinh & Ngày học */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-slate-700">
                      <Users className="h-4 w-4 text-emerald-500" />
                      <span>{studentCount(c.id)} {t.students.toLowerCase()}</span>
                    </div>

                    {(c.start_date || c.end_date) && (
                      <span className="text-[10px] font-bold text-slate-400">
                        {c.start_date && fmtDate(c.start_date)} {c.end_date && `– ${fmtDate(c.end_date)}`}
                      </span>
                    )}
                  </div>
                </div>

                {/* Nút Xem Chi Tiết */}
                <Button 
                  asChild
                  variant="outline" 
                  className="w-full h-10 rounded-2xl border-slate-200 text-slate-700 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 font-bold text-xs transition-all cursor-pointer"
                >
                  <Link to={`/classes/${c.id}`}>Xem chi tiết lớp</Link>
                </Button>

              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* DẠNG DANH SÁCH (LIST VIEW) */
        <Card className="rounded-3xl border-slate-100 bg-white shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-100 text-slate-400 font-bold uppercase tracking-wider">
                <tr>
                  <th className="p-4">{t.className}</th>
                  <th className="p-4">{t.students}</th>
                  <th className="p-4">{t.weeklySchedule}</th>
                  <th className="p-4 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {visible.map((c: any) => (
                  <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-4">
                      <Link to={`/classes/${c.id}`} className="font-bold text-slate-900 hover:text-blue-600 flex items-center gap-2.5">
                        <span className="h-3 w-3 rounded-full shrink-0" style={{ background: c.color || "#2563eb" }} />
                        <span className="truncate">{c.name}</span>
                      </Link>
                      <p className="text-[10px] text-slate-400 font-medium pl-5.5">{c.subject} {c.grade && `· ${c.grade}`}</p>
                    </td>
                    <td className="p-4 font-bold text-slate-900">
                      {studentCount(c.id)}
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {slots(c.id).map((s: any) => (
                          <span key={s.id} className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                            {t.days[s.day_of_week]} {s.start_time.slice(0, 5)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => { setEditing(c); setOpen(true); }}
                          className="h-8 w-8 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => handleDelete(c.id)}
                          className="h-8 w-8 rounded-xl text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* COMPONENT DIALOG THÊM / SỬA LỚP */}
      <ClassDialog open={open} onOpenChange={setOpen} cls={editing} />
    </div>
  );
}