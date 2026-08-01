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
  BookOpen,
  CheckCircle2,
  XCircle,
  Clock,
  Printer,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import StudentDialog from "@/components/StudentDialog";

// Hàm làm sạch giá trị hiển thị
const cleanValue = (val: any) => {
  if (!val || typeof val !== "string") return "";
  const trimmed = val.trim();
  if (["—", "-", "null", "undefined"].includes(trimmed.toLowerCase())) return "";
  return trimmed;
};

export default function StudentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useApp();
  const qc = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

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

  // 2. Fetch danh sách enrollments
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

  // 3. Fetch toàn bộ danh sách profiles
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-list-detail"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("profiles").select("*");
      return data || [];
    },
  });

  // 4. Fetch lịch sử điểm danh của học sinh
  const { data: attendanceHistory = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["student-attendance-history", id],
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await (supabase as any)
        .from("attendance")
        .select("*, sessions(*, classes(*))")
        .eq("student_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!id,
  });

  // 5. BẮT CẶP TÀI KHOẢN ĐÃ LINK (Chỉ nhận nếu linked_user_id hợp lệ và KHÔNG PHẢI TEACHER)
  const linkedProfile = useMemo(() => {
    if (!student || !profiles.length) return null;

    const linkedUserId = student.linked_user_id || student.user_id;
    if (!linkedUserId) return null;

    const foundProfile = profiles.find((p: any) => p.id === linkedUserId);
    if (!foundProfile) return null;

    if (foundProfile.role === "teacher" || foundProfile.is_teacher) return null;

    return foundProfile;
  }, [student, profiles]);

  // 6. HIỂN THỊ DỮ LIỆU chuẩn hóa
  const displayInfo = useMemo(() => {
    const st = student || {};
    const lp = linkedProfile || {};

    const rawDob = cleanValue(st.date_of_birth) || cleanValue(st.dob) || cleanValue(lp.date_of_birth) || cleanValue(lp.dob);
    let formattedDob = "Chưa cập nhật";
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
      name: cleanValue(st.name) || "Chưa cập nhật tên",
      email: cleanValue(st.email) || cleanValue(lp.email) || "Chưa cập nhật",
      phone: cleanValue(st.phone) || cleanValue(lp.phone) || "Chưa cập nhật",
      dob: formattedDob,
      grade: cleanValue(st.grade) || cleanValue(lp.school_class) || cleanValue(lp.grade) || "—",
      parentName: cleanValue(st.parent_name) || cleanValue(lp.parent_name) || "Chưa cập nhật",
      parentPhone: cleanValue(st.parent_phone) || cleanValue(lp.parent_phone) || "Chưa cập nhật",
      notes: cleanValue(st.notes) || cleanValue(lp.bio) || "Chưa có ghi chú",
      paymentMode: st.payment_mode === "monthly" ? "Theo tháng" : "Theo buổi",
      startDate: st.created_at
        ? new Date(st.created_at).toLocaleDateString("vi-VN")
        : "—",
    };
  }, [student, linkedProfile]);

  // Tính tổng học phí các lớp đang tham gia
  const totalFee = useMemo(() => {
    return enrollments.reduce((sum: number, item: any) => {
      return sum + (item.classes?.fee || 0);
    }, 0);
  }, [enrollments]);

  useEffect(() => {
    if (displayInfo.name) {
      document.title = `${displayInfo.name} — ${t.appName || "Apex Academy"}`;
    }
  }, [displayInfo.name, t]);

  const handlePrint = () => {
    window.print();
  };

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
              onClick={() => setBillOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs h-9 gap-1.5"
            >
              <Receipt className="h-3.5 w-3.5" /> View bill
            </Button>
          </div>
        </div>
      </Card>

      {/* CHI TIẾT THÔNG TIN */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* CỘT 1 & 2: THÔNG TIN CÁ NHÂN & ĐIỂM DANH */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* 1. THÔNG TIN CÁ NHÂN VÀ PHỤ HUYNH */}
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

          {/* 2. LỊCH SỬ ĐIỂM DANH (ATTENDANCE) */}
          <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" /> LỊCH SỬ ĐIỂM DANH ({attendanceHistory.length})
              </h2>
            </div>

            {attendanceLoading ? (
              <p className="text-xs text-slate-400 py-4 text-center">Đang tải điểm danh...</p>
            ) : attendanceHistory.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <p className="text-xs text-slate-400 italic">Chưa có dữ liệu điểm danh cho học sinh này.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                {attendanceHistory.map((att: any) => {
                  const sessionDate = att.sessions?.date 
                    ? new Date(att.sessions.date).toLocaleDateString("vi-VN") 
                    : new Date(att.created_at).toLocaleDateString("vi-VN");
                  const className = att.sessions?.classes?.name || "Lớp học";
                  const status = att.status || "present";

                  return (
                    <div 
                      key={att.id} 
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-xs text-slate-900">{className}</span>
                          <span className="text-[10px] font-bold text-slate-400">({sessionDate})</span>
                        </div>
                        {att.notes && (
                          <p className="text-[11px] text-slate-500 italic">Ghi chú: {att.notes}</p>
                        )}
                      </div>

                      <div>
                        {status === "present" && (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-emerald-200 text-[10px] font-bold flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Có mặt
                          </Badge>
                        )}
                        {status === "absent" && (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-rose-200 text-[10px] font-bold flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Vắng
                          </Badge>
                        )}
                        {status === "late" && (
                          <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 text-[10px] font-bold flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Đi trễ
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

        </div>

        {/* CỘT 3: LỚP HỌC */}
        <div className="space-y-6">
          <Card className="p-6 border border-slate-200/80 rounded-3xl shadow-xs bg-white space-y-4">
            <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-600" /> LỚP HỌC ĐANG THAM GIA
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

      {/* DIALOG EDIT HỌC SINH */}
      <StudentDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            qc.invalidateQueries({ queryKey: ["student-detail", id] });
            qc.invalidateQueries({ queryKey: ["students-list"] });
            qc.invalidateQueries({ queryKey: ["profiles-list-detail"] });
          }
        }}
        student={student}
      />

      {/* MODAL IN HÓA ĐƠN HỌC PHÍ (VIEW BILL) */}
      <Dialog open={billOpen} onOpenChange={setBillOpen}>
        <DialogContent className="max-w-lg rounded-3xl p-6 bg-white print:p-0 print:border-none print:shadow-none">
          <DialogHeader>
            <DialogTitle className="text-lg font-black text-slate-900 flex items-center gap-2 print:hidden">
              <Receipt className="h-5 w-5 text-emerald-600" /> Hóa Đơn Học Phí
            </DialogTitle>
          </DialogHeader>

          {/* NỘI DUNG HÓA ĐƠN ĐỂ IN */}
          <div className="space-y-6 pt-2 print:pt-6" id="printable-bill">
            <div className="text-center pb-4 border-b border-slate-100">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">HÓA ĐƠN HỌC PHÍ</h2>
              <p className="text-xs text-slate-500 mt-0.5">{t.appName || "Lớp Học Phương Anh"}</p>
              <p className="text-[10px] text-slate-400">Ngày xuất: {new Date().toLocaleDateString("vi-VN")}</p>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Họ tên học sinh:</span>
                <span className="font-bold text-slate-900">{displayInfo.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Khối lớp:</span>
                <span className="font-bold text-slate-900">Lớp {displayInfo.grade}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Phụ huynh:</span>
                <span className="font-bold text-slate-900">{displayInfo.parentName} ({displayInfo.parentPhone})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500 font-medium">Hình thức thu:</span>
                <span className="font-bold text-slate-900">{displayInfo.paymentMode}</span>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 font-bold text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="p-3">Lớp học</th>
                    <th className="p-3 text-right">Học phí</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {enrollments.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-3 text-center text-slate-400 italic">Chưa đăng ký lớp</td>
                    </tr>
                  ) : (
                    enrollments.map((item: any) => (
                      <tr key={item.id}>
                        <td className="p-3 font-semibold text-slate-800">{item.classes?.name || "Lớp học"}</td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          {item.classes?.fee ? `${item.classes.fee.toLocaleString("vi-VN")} đ` : "0 đ"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center p-3.5 bg-emerald-50 rounded-2xl border border-emerald-100">
              <span className="text-xs font-bold text-emerald-900">TỔNG CỘNG HỌC PHÍ</span>
              <span className="text-base font-black text-emerald-700">{totalFee.toLocaleString("vi-VN")} đ</span>
            </div>

            <div className="text-center text-[10px] text-slate-400 pt-4 border-t border-slate-100">
              <p>Cảm ơn quý phụ huynh và học sinh!</p>
            </div>
          </div>

          {/* NÚT IN VÀ HỦY */}
          <div className="flex justify-end gap-2 mt-4 print:hidden">
            <Button variant="outline" onClick={() => setBillOpen(false)} className="rounded-xl font-bold text-xs">
              Đóng
            </Button>
            <Button onClick={handlePrint} className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs gap-1.5">
              <Printer className="h-4 w-4" /> In hóa đơn
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
    </div>
  );
}