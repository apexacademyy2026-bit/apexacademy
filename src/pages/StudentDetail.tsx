import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { 
  ArrowLeft, 
  Pencil, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  GraduationCap, 
  FileText,
  Receipt,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StudentDialog from "@/components/StudentDialog";
import { useConfirm } from "@/components/ConfirmProvider";
import { toast } from "sonner";

// Hàm làm sạch giá trị hiển thị
const cleanValue = (val: any) => {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (["—", "-", "null", "undefined"].includes(trimmed.toLowerCase())) return "";
  return trimmed;
};

// Chuẩn hóa SĐT để so sánh
const normalizePhone = (p: any) => {
  if (!p || typeof p !== "string") return "";
  let cleaned = p.replace(/\D/g, "");
  if (cleaned.startsWith("84")) cleaned = cleaned.slice(2);
  if (cleaned.startsWith("0")) cleaned = cleaned.slice(1);
  return cleaned;
};

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useApp();
  const qc = useQueryClient();
  const confirm = useConfirm();

  const [dialogOpen, setDialogOpen] = useState(false);

  // 1. Fetch thông tin bản ghi do GV tạo từ bảng `students`
  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["student-detail", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await (supabase as any)
        .from("students")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // 2. Fetch danh sách liên kết từ class_members hoặc enrollments (nơi chứa thông tin link account)
  const { data: enrollments = [] } = useQuery({
    queryKey: ["student-enrollments-detail", id],
    queryFn: async () => {
      if (!id) return [];
      const { data } = await (supabase as any)
        .from("enrollments")
        .select("*, classes(*)")
        .eq("student_id", id);
      return data || [];
    },
    enabled: !!id,
  });

  // 3. Fetch toàn bộ danh sách profiles để match tài khoản học sinh đã link
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list-detail"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("*");
      return data || [];
    },
  });

  // 4. BẮT CẶP TÀI KHOẢN ĐÃ LINK (Linked Account)
  const linkedProfile = useMemo(() => {
    if (!student || !profiles.length) return null;

    // Tìm user_id được link trực tiếp trong bản ghi student hoặc trong enrollments
    const linkedUserId = 
      student.linked_user_id || 
      student.user_id || 
      enrollments.find((e: any) => e.user_id)?.user_id;

    if (linkedUserId) {
      const found = profiles.find((p: any) => p.id === linkedUserId);
      if (found) return found;
    }

    // Fallback: Nếu chưa gán user_id trực tiếp, tìm theo Phone/Email trùng khớp
    const stPhoneNorm = normalizePhone(student.phone);
    const stEmailNorm = student.email?.trim().toLowerCase();

    return profiles.find((p: any) => {
      const pEmailNorm = p.email?.trim().toLowerCase();
      if (stEmailNorm && pEmailNorm && stEmailNorm === pEmailNorm) return true;

      const pPhoneNorm = normalizePhone(p.phone);
      if (stPhoneNorm && pPhoneNorm && stPhoneNorm === pPhoneNorm) return true;

      return false;
    }) as any;
  }, [student, profiles, enrollments]);

  // 5. ĐỒNG BỘ DỮ LIỆU: ƯU TIÊN TUYỆT ĐỐI THÔNG TIN DO HỌC SINH TẠO
  const displayInfo = useMemo(() => {
    const lp = linkedProfile || {};
    const st = student || {};

    // Xử lý định dạng ngày sinh
    const rawDob = cleanValue(lp.date_of_birth) || cleanValue(lp.dob) || cleanValue(st.date_of_birth) || cleanValue(st.dob);
    let formattedDob = "—";
    if (rawDob) {
      if (rawDob.includes("-")) {
        const parts = rawDob.split("-");
        if (parts.length === 3) formattedDob = `${parts[2]}/${parts[1]}/${parts[0]}`;
        else formattedDob = rawDob;
      } else {
        formattedDob = rawDob;
      }
    }

    return {
      name:
        cleanValue(lp.display_name) ||
        cleanValue(lp.full_name) ||
        cleanValue(st.name) ||
        "Chưa cập nhật tên",
      email: cleanValue(lp.email) || cleanValue(st.email) || "—",
      phone: cleanValue(lp.phone) || cleanValue(st.phone) || "—",
      dob: formattedDob,
      grade: cleanValue(lp.school_class) || cleanValue(lp.grade) || cleanValue(st.grade) || "—",
      parentName: cleanValue(lp.parent_name) || cleanValue(st.parent_name) || "—",
      parentPhone: cleanValue(lp.parent_phone) || cleanValue(st.parent_phone) || "—",
      notes: cleanValue(st.notes) || cleanValue(lp.bio) || "—",
      paymentMode: st.payment_mode === "monthly" ? "By month" : "By session",
      startDate: st.created_at
        ? new Date(st.created_at).toLocaleDateString("en-GB")
        : "—",
    };
  }, [student, linkedProfile]);

  useEffect(() => {
    if (displayInfo.name) {
      document.title = `${displayInfo.name} — ${t.appName || "Sổ Gia Sư"}`;
    }
  }, [displayInfo.name, t]);

  if (studentLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!student) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center space-y-4">
        <p className="text-slate-500">Không tìm thấy thông tin học sinh.</p>
        <Link to="/students">
          <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Quay lại</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Nút quay lại */}
      <Link to="/students" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors">
        <ArrowLeft className="h-4 w-4" /> Students
      </Link>

      {/* HEADER TỔNG QUAN HỌC SINH */}
      <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div 
              className="h-16 w-16 rounded-2xl text-white font-black text-2xl flex items-center justify-center shadow-md shrink-0"
              style={{ background: student.color || "linear-gradient(to top right, #3b82f6, #6366f1)" }}
            >
              {displayInfo.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-slate-950 tracking-tight">{displayInfo.name}</h1>
                {linkedProfile && (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px] font-bold">
                    ✓ Linked
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1.5">
                <Badge variant="secondary" className="bg-blue-50 text-blue-700 font-bold border-blue-100 flex items-center gap-1">
                  <GraduationCap className="h-3.5 w-3.5" /> Grade: {displayInfo.grade}
                </Badge>
                <Badge variant="secondary" className="bg-slate-100 text-slate-700 font-bold flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> Start date: {displayInfo.startDate}
                </Badge>
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 font-bold">
                  {displayInfo.paymentMode}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <Button 
              variant="outline" 
              onClick={() => setDialogOpen(true)}
              className="rounded-xl border-slate-200 font-bold text-xs h-9 gap-1.5"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button 
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs h-9 gap-1.5"
            >
              <Receipt className="h-3.5 w-3.5" /> View bill
            </Button>
          </div>
        </div>
      </Card>

      {/* CHI TIẾT THÔNG TIN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CỘT 1 & 2: THÔNG TIN CÁ NHÂN VÀ PHỤ HUYNH */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-5">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <User className="h-4 w-4 text-blue-600" /> THÔNG TIN CÁ NHÂN & PHỤ HUYNH
            </h2>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" /> Họ và tên
                </span>
                <span className="text-xs font-black text-slate-900">{displayInfo.name}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-400" /> Email
                </span>
                <span className="text-xs font-bold text-slate-900">{displayInfo.email}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" /> Số điện thoại
                </span>
                <span className="text-xs font-black text-blue-600">{displayInfo.phone}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-slate-400" /> Ngày sinh
                </span>
                <span className="text-xs font-bold text-slate-900">{displayInfo.dob}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-slate-400" /> Khối lớp
                </span>
                <span className="text-xs font-extrabold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                  Lớp {displayInfo.grade}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 space-y-3">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">THÔNG TIN PHỤ HUYNH</p>
              
              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <User className="h-4 w-4 text-slate-400" /> Tên phụ huynh
                </span>
                <span className="text-xs font-black text-slate-900">{displayInfo.parentName}</span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50/80">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <Phone className="h-4 w-4 text-slate-400" /> SĐT Phụ huynh
                </span>
                <span className="text-xs font-black text-emerald-600">{displayInfo.parentPhone}</span>
              </div>

              <div className="p-3 rounded-2xl bg-slate-50/80 space-y-1">
                <span className="text-xs font-bold text-slate-500 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-slate-400" /> Ghi chú
                </span>
                <p className="text-xs text-slate-700 pl-6">{displayInfo.notes}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* CỘT 3: LỚP HỌC */}
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-4">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" /> CLASSES
            </h2>

            {enrollments.length === 0 ? (
              <p className="text-xs text-slate-400 italic py-4 text-center">Chưa đăng ký lớp học nào</p>
            ) : (
              <div className="space-y-2.5">
                {enrollments.map((item: any) => (
                  <div 
                    key={item.id} 
                    className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                      <span className="font-black text-xs text-slate-900">{item.classes?.name || "Lớp học"}</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-600">
                      {item.classes?.fee ? `${item.classes.fee.toLocaleString("vi-VN")} đ` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

      </div>

      <StudentDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            qc.invalidateQueries({ queryKey: ["student-detail", id] });
            qc.invalidateQueries({ queryKey: ["profiles-list-detail"] });
          }
        }}
        student={student}
      />
    </div>
  );
}