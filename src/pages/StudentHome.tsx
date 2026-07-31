import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  Clock, 
  FileCheck2, 
  Edit3, 
  ExternalLink,
  ShieldCheck,
  Zap,
  ArrowUpRight
} from "lucide-react";

export default function StudentHome() {
  const { t, user, profile } = useApp();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [tests, setTests] = useState<Record<string, any>>({});
  const [studentDetail, setStudentDetail] = useState<any>(null);

  useEffect(() => { 
    document.title = `${(t as any)?.home || "Trang chủ"} — ${t?.appName || "Sổ Gia Sư"}`; 
  }, [t]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      // 1. Lấy lịch sử làm bài
      const { data: at } = await supabase
        .from("test_attempts")
        .select("*")
        .eq("student_id", user.id)
        .order("started_at", { ascending: false });
      setAttempts(at || []);

      const ids = Array.from(new Set((at || []).map((a: any) => a.test_id)));
      if (ids.length) {
        const { data: ts } = await supabase.from("tests").select("id,title,class_id").in("id", ids);
        const map: Record<string, any> = {};
        (ts || []).forEach((x: any) => (map[x.id] = x));
        setTests(map);
      }

      // 2. Lấy thông tin sinh viên từ Supabase
      const { data: st } = await (supabase as any)
        .from("students")
        .select("*")
        .or(`user_id.eq.${user.id},linked_user_id.eq.${user.id},email.eq.${user.email}`)
        .maybeSingle();

      if (st) setStudentDetail(st);
    })();
  }, [user?.id, user?.email]);

  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("vi-VN") : "—");

  const cleanName = (val: any) => {
    if (!val || typeof val !== "string") return "";
    const trimmed = val.trim();
    if (["game", "vi", "en"].includes(trimmed.toLowerCase())) return "";
    return trimmed;
  };

  // Lấy tên hiển thị mặc định từ Google Meta, Email hoặc hiển thị Học sinh
  const defaultDisplayName = 
    user?.user_metadata?.full_name || 
    user?.user_metadata?.name || 
    user?.email?.split('@')[0] || 
    "Học sinh";

  // KHÔNG DÙNG MOCK DATA MẶC ĐỊNH LÀM FALLBACK NỮA
  const studentInfo = {
    fullName: 
      cleanName(studentDetail?.name) || 
      cleanName((profile as any)?.full_name) || 
      cleanName(profile?.display_name) || 
      defaultDisplayName,

    email: user?.email || studentDetail?.email || "Chưa cập nhật",

    phone: 
      studentDetail?.phone || 
      (profile as any)?.phone || 
      "Chưa cập nhật",

    dob: 
      studentDetail?.dob || 
      studentDetail?.date_of_birth || 
      (profile as any)?.date_of_birth || 
      "Chưa cập nhật",

    grade: 
      studentDetail?.grade || 
      (profile as any)?.school_class || 
      (profile as any)?.grade || 
      "Chưa chọn",

    parentName: 
      cleanName(studentDetail?.parent_name) || 
      cleanName((profile as any)?.parent_name) || 
      "Chưa cập nhật",

    parentPhone: 
      studentDetail?.parent_phone || 
      (profile as any)?.parent_phone || 
      "Chưa cập nhật",
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-8 space-y-6 max-w-6xl mx-auto">
      
      {/* 1. THẺ PROFILE VIP HEADER */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden">
        
        {/* Banner Cover Gradient */}
        <div className="h-36 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 relative p-6">
          <div className="absolute top-4 right-4 bg-white/20 backdrop-blur-md px-3.5 py-1.5 rounded-full text-white text-xs font-bold flex items-center gap-1.5 shadow-sm">
            <ShieldCheck className="h-4 w-4 text-emerald-300" /> Tài khoản Học sinh
          </div>
        </div>

        {/* Nội dung Profile */}
        <div className="px-6 pb-6 relative">
          
          {/* Avatar Nổi Bật & Tên */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 -mt-14 mb-6">
            <div className="flex items-end gap-4">
              <div className="h-28 w-28 rounded-3xl bg-white p-1.5 shadow-xl shrink-0">
                <div className="h-full w-full rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-black text-4xl flex items-center justify-center shadow-inner">
                  {studentInfo.fullName.charAt(0).toUpperCase()}
                </div>
              </div>

              <div className="space-y-1 mb-1">
                <div className="flex items-center gap-2.5">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {studentInfo.fullName}
                  </h1>
                  <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 font-extrabold text-xs border border-blue-100">
                    Lớp {studentInfo.grade}
                  </span>
                </div>
                <p className="text-xs font-semibold text-slate-400 flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-slate-400" /> {studentInfo.email}
                </p>
              </div>
            </div>

            <Link to="/settings">
              <Button variant="outline" className="rounded-xl border-slate-200 font-bold text-xs h-10 px-4 gap-1.5 hover:bg-slate-50 shadow-xs">
                <Edit3 className="h-3.5 w-3.5 text-blue-600" /> Chỉnh sửa hồ sơ
              </Button>
            </Link>
          </div>

          {/* Lưới Thông tin chi tiết cá nhân & phụ huynh */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100 text-xs">
            
            <div className="bg-slate-50/80 p-3.5 rounded-2xl space-y-1 border border-slate-100">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-blue-500" /> Số điện thoại
              </span>
              <p className={`font-extrabold text-sm ${studentInfo.phone === "Chưa cập nhật" ? "text-slate-400 italic font-medium" : "text-slate-800"}`}>
                {studentInfo.phone}
              </p>
            </div>

            <div className="bg-slate-50/80 p-3.5 rounded-2xl space-y-1 border border-slate-100">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-indigo-500" /> Ngày sinh
              </span>
              <p className={`font-extrabold text-sm ${studentInfo.dob === "Chưa cập nhật" ? "text-slate-400 italic font-medium" : "text-slate-800"}`}>
                {studentInfo.dob}
              </p>
            </div>

            <div className="bg-slate-50/80 p-3.5 rounded-2xl space-y-1 border border-slate-100">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <User className="h-3 w-3 text-purple-500" /> Phụ huynh
              </span>
              <p className={`font-extrabold text-sm ${studentInfo.parentName === "Chưa cập nhật" ? "text-slate-400 italic font-medium" : "text-slate-800"}`}>
                {studentInfo.parentName}
              </p>
            </div>

            <div className="bg-slate-50/80 p-3.5 rounded-2xl space-y-1 border border-slate-100">
              <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                <Phone className="h-3 w-3 text-emerald-500" /> SĐT Phụ huynh
              </span>
              <p className={`font-extrabold text-sm ${studentInfo.parentPhone === "Chưa cập nhật" ? "text-slate-400 italic font-medium" : "text-slate-800"}`}>
                {studentInfo.parentPhone}
              </p>
            </div>

          </div>

        </div>
      </div>

      {/* 2. KHU VỰC THAO TÁC NHANH & LỊCH SỬ LÀM BÀI */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Banner lối vào lớp học */}
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-6 rounded-3xl text-white shadow-md flex flex-col justify-between space-y-4 relative overflow-hidden border border-slate-800">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <Zap className="h-32 w-32" />
          </div>

          <div className="space-y-2 z-10">
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-md border border-indigo-800/50">
              Lớp học trực tuyến
            </span>
            <h3 className="text-lg font-black tracking-tight">Học tập & Lớp học của tôi</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Truy cập danh sách các lớp học đã tham gia, theo dõi lịch học và làm bài tập trực tuyến từ gia sư.
            </p>
          </div>

          <Link to="/student/classes" className="z-10">
            <Button className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs h-11 rounded-xl shadow-md gap-1.5">
              Đến phòng học ngay <ArrowUpRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>

        {/* Khung Lịch sử làm bài */}
        <div className="md:col-span-2 bg-white p-6 rounded-3xl border border-slate-200/80 shadow-sm space-y-4 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <FileCheck2 className="h-5 w-5 text-blue-600" /> Lịch sử làm bài & Đề thi
              </h3>
              <span className="text-xs font-bold px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg">
                Đã hoàn thành {attempts.length} bài
              </span>
            </div>

            {attempts.length === 0 ? (
              <div className="p-10 text-center text-slate-400 bg-slate-50/60 rounded-2xl border border-dashed border-slate-200 space-y-2">
                <Clock className="h-10 w-10 mx-auto text-slate-300 mb-1" />
                <p className="text-xs font-bold text-slate-600">Chưa có dữ liệu bài làm.</p>
                <p className="text-[11px] text-slate-400">Các bài kiểm tra trực tuyến sau khi hoàn thành sẽ hiển thị chi tiết tại đây.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {attempts.map((a) => (
                  <div key={a.id} className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 hover:bg-slate-100/80 transition-colors text-xs border border-slate-100">
                    <div className="space-y-0.5">
                      <h4 className="font-bold text-slate-900">{tests[a.test_id]?.title || "Bài kiểm tra"}</h4>
                      <p className="text-[10px] text-slate-400">{fmt(a.submitted_at || a.started_at)}</p>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-black text-blue-600 text-sm bg-blue-50 px-2.5 py-1 rounded-lg">
                        {a.submitted_at ? `${Number(a.score).toFixed(1)} / ${Number(a.max_score).toFixed(1)}` : "Đang làm"}
                      </span>
                      {a.submitted_at && (
                        <Link 
                          to={`/student/tests/${a.test_id}/result/${a.id}`}
                          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all shadow-xs"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}