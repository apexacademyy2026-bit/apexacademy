import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { 
  Plus, 
  Search, 
  Grid2X2, 
  List as ListIcon, 
  GraduationCap, 
  ChevronRight, 
  Trash2, 
  Pencil, 
  User, 
  FileText 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEnrollments, useClasses } from "@/hooks/useData";
import StudentDialog from "@/components/StudentDialog";
import { useConfirm } from "@/components/ConfirmProvider";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const cleanName = (val: any) => {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (["game", "vi", "en"].includes(trimmed.toLowerCase())) return "";
  return trimmed;
};

export default function Students() {
  const { t } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();
  const enrollmentsQuery = useEnrollments();
  const classesQuery = useClasses();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  // 1. Lấy danh sách học sinh từ bảng students
  // 1. Lấy thông tin user hiện tại từ AppContext
  const { user } = useApp();

  // 2. Lấy danh sách học sinh (Lấy của user hiện tại + các dữ liệu cũ chưa có user_id)
  const { data: students = [] } = useQuery({
    queryKey: ["students-list", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        // Lấy học sinh thuộc user này HOẶC chưa có user_id
        .or(`user_id.eq.${user.id},user_id.is.null`) 
        .order("name");

      if (error) throw error;
      return data || [];
    },
  });

  // ✅ TRẢ VỀ NULL NẾU CHƯA ĐĂNG KÝ TÊN PHỤ HUYNH VÀ SĐT
  const enrichedStudents = useMemo(() => {
    const enrollmentsList = Array.isArray(enrollmentsQuery?.data) ? enrollmentsQuery.data : Array.isArray(enrollmentsQuery) ? enrollmentsQuery : [];
    const classesList = Array.isArray(classesQuery?.data) ? classesQuery.data : Array.isArray(classesQuery) ? classesQuery : [];

    return students.map((st: any) => {
      const name = cleanName(st.name) || "Chưa đặt tên";
      const phone = st.phone || "—";
      const grade = st.grade || "—";
      
      // ✅ Nếu không nhập (hoặc rỗng) -> TRẢ VỀ NULL TRỰC TIẾP
      const rawParentName = cleanName(st.parent_name);
      const rawParentPhone = st.parent_phone?.trim();

      const parentName = rawParentName !== "" ? rawParentName : null;
      const parentPhone = rawParentPhone ? rawParentPhone : null;

      // Lọc danh sách lớp học
      const cids = enrollmentsList
        .filter((e: any) => e.student_id === st.id)
        .map((e: any) => e.class_id);
      
      const studentClasses = classesList.filter((c: any) => cids.includes(c.id));

      return {
        ...st,
        displayName: name,
        displayPhone: phone,
        displayGrade: grade,
        displayParentName: parentName, // value: string | null
        displayParentPhone: parentPhone, // value: string | null
        studentClasses,
      };
    });
  }, [students, enrollmentsQuery, classesQuery]);

  const filteredStudents = useMemo(() => {
    return enrichedStudents.filter((st: any) => {
      const q = search.toLowerCase();
      return (
        st.displayName.toLowerCase().includes(q) ||
        st.displayPhone.toLowerCase().includes(q) ||
        (st.displayParentName && st.displayParentName.toLowerCase().includes(q)) ||
        (st.displayParentPhone && st.displayParentPhone.toLowerCase().includes(q))
      );
    });
  }, [enrichedStudents, search]);

  const handleDelete = async (e: React.MouseEvent, st: any) => {
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

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      
      {/* HEADER PAGE */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm">
        <div>
          <h1 className="text-2xl font-black text-slate-950 tracking-tight">{t.students || "Danh sách học sinh"}</h1>
          <p className="text-xs font-semibold text-slate-400 mt-0.5">Quản lý thông tin, lớp học và học phí của toàn bộ học sinh.</p>
        </div>

        <Button 
          onClick={() => { setSelectedStudent(null); setDialogOpen(true); }}
          className="bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs h-10 px-4 rounded-xl shadow-md gap-1.5 shrink-0"
        >
          <Plus className="h-4 w-4" /> {t.addStudent || "Thêm học sinh"}
        </Button>
      </div>

      {/* SEARCH & VIEW MODE TOOLBAR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Tìm theo tên học sinh, SĐT..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-slate-50 border-slate-200 rounded-xl text-xs h-10 focus:bg-white transition-all"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-100 p-1 rounded-xl border border-slate-200/60">
          <button
            onClick={() => setViewMode("grid")}
            className={cn("p-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5", viewMode === "grid" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-900")}
          >
            <Grid2X2 className="h-4 w-4" /> Lưới
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={cn("p-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5", viewMode === "list" ? "bg-white text-blue-600 shadow-xs" : "text-slate-500 hover:text-slate-900")}
          >
            <ListIcon className="h-4 w-4" /> Bảng
          </button>
        </div>
      </div>

      {/* DANH SÁCH TRỐNG */}
      {filteredStudents.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-12 text-center space-y-3">
          <User className="h-12 w-12 mx-auto text-slate-300" />
          <h3 className="text-sm font-bold text-slate-700">Không tìm thấy học sinh nào</h3>
          <p className="text-xs text-slate-400">Hãy thêm học sinh mới hoặc thay đổi từ khóa tìm kiếm.</p>
        </div>
      ) : viewMode === "grid" ? (
        /* GIAO DIỆN DẠNG LƯỚI CARD */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStudents.map((st: any) => (
            <Link key={st.id} to={`/students/${st.id}`} className="group">
              <Card className="p-5 border border-slate-200/80 shadow-xs hover:shadow-md transition-all rounded-3xl bg-white space-y-4 relative overflow-hidden group-hover:border-blue-300">
                <div className="absolute top-0 left-0 right-0 h-2" style={{ background: st.color || "#3b82f6" }} />

                <div className="flex items-start justify-between gap-3 pt-1">
                  <div className="flex items-center gap-3.5">
                    <div 
                      className="h-12 w-12 rounded-2xl text-white font-black text-xl flex items-center justify-center shadow-md shrink-0"
                      style={{ background: st.color || "linear-gradient(to top right, #2563eb, #4f46e5)" }}
                    >
                      {st.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-black text-slate-950 text-base group-hover:text-blue-600 transition-colors">
                        {st.displayName}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md flex items-center gap-1">
                          <GraduationCap className="h-3 w-3 text-blue-600" /> Lớp {st.displayGrade}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {st.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => { e.preventDefault(); setSelectedStudent(st); setDialogOpen(true); }}
                      className="h-8 w-8 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={(e) => handleDelete(e, st)}
                      className="h-8 w-8 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {/* ✅ HIỂN THỊ THÔNG TIN PHỤ HUYNH & SĐT (XỬ LÝ ĐÚNG NULL) */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                  <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Phụ huynh</span>
                    <p className={cn("font-extrabold truncate", st.displayParentName ? "text-slate-800" : "text-slate-400 italic")}>
                      {st.displayParentName ?? "—"}
                    </p>
                  </div>
                  <div className="bg-slate-50 p-2.5 rounded-xl space-y-0.5">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">SĐT Phụ huynh</span>
                    <p className={cn("font-extrabold truncate", st.displayParentPhone ? "text-emerald-600" : "text-slate-400 italic")}>
                      {st.displayParentPhone ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Danh sách lớp học tham gia */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex flex-wrap gap-1">
                    {st.studentClasses.length === 0 ? (
                      <span className="text-[11px] text-slate-400 italic">Chưa tham gia lớp nào</span>
                    ) : (
                      st.studentClasses.map((c: any) => (
                        <span key={c.id} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {c.name}
                        </span>
                      ))
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        /* GIAO DIỆN DẠNG BẢNG (TABLE) */
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200/80 text-slate-400 uppercase font-black tracking-wider text-[10px]">
                <tr>
                  <th className="py-3.5 px-6">Học sinh</th>
                  <th className="py-3.5 px-4">Khối lớp</th>
                  <th className="py-3.5 px-4">Phụ huynh & SĐT</th>
                  <th className="py-3.5 px-4">Lớp tham gia</th>
                  <th className="py-3.5 px-4">Hình thức</th>
                  <th className="py-3.5 px-6 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredStudents.map((st: any) => (
                  <tr key={st.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="py-4 px-6">
                      <Link to={`/students/${st.id}`} className="flex items-center gap-3">
                        <div 
                          className="h-10 w-10 rounded-xl text-white font-black text-sm flex items-center justify-center shadow-xs shrink-0"
                          style={{ background: st.color || "#3b82f6" }}
                        >
                          {st.displayName.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-black text-slate-900 group-hover:text-blue-600 transition-colors text-sm">{st.displayName}</p>
                          <p className="text-[11px] text-slate-400">{st.displayPhone}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 px-4 font-bold text-slate-700">
                      <Badge variant="outline" className="bg-slate-100 text-slate-700 border-slate-200 font-bold">
                        Lớp {st.displayGrade}
                      </Badge>
                    </td>
                    <td className="py-4 px-4">
                      <p className={cn("font-extrabold", st.displayParentName ? "text-slate-800" : "text-slate-400 italic")}>
                        {st.displayParentName ?? "—"}
                      </p>
                      <p className={cn("text-[11px] font-semibold", st.displayParentPhone ? "text-emerald-600" : "text-slate-400 italic")}>
                        {st.displayParentPhone ?? "—"}
                      </p>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex flex-wrap gap-1">
                        {st.studentClasses.map((c: any) => (
                          <span key={c.id} className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-4 px-4 font-bold text-slate-600">
                      {st.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi"}
                    </td>
                    <td className="py-4 px-6 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link to={`/students/${st.id}`}>
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50">
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => { setSelectedStudent(st); setDialogOpen(true); }}
                          className="h-8 w-8 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={(e) => handleDelete(e, st)}
                          className="h-8 w-8 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50"
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
        </div>
      )}

      {/* STUDENT DIALOG THÊM / SỬA HỌC SINH */}
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