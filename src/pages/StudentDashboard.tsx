import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  BookOpen, 
  Clock, 
  User, 
  Mail, 
  Phone, 
  Calendar, 
  GraduationCap, 
  Sparkles, 
  Award, 
  FileCheck2, 
  Edit3
} from "lucide-react";

export default function StudentDashboard() {
  const { t, user, profile, lang } = useApp();
  
  const [classes, setClasses] = useState<any[]>([]);
  const [schedulesByClass, setSchedulesByClass] = useState<Record<string, any[]>>({});
  const [rosterByClass, setRosterByClass] = useState<Record<string, any>>({});
  const [studentDetail, setStudentDetail] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    document.title = `${t.dashboard} — ${t.appName}`;
    if (!user) return;

    (async () => {
      setIsLoading(true);
      try {
        // 1. Fetch thông tin Profile mới nhất từ Supabase
        const { data: profData } = await (supabase as any)
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profData) {
          setUserProfile(profData);
        }

        // 2. Fetch danh sách lớp học
        const { data: members } = await (supabase as any)
          .from("class_members")
          .select("class_id")
          .eq("student_id", user.id);

        const ids = (members || []).map((m: any) => m.class_id);

        if (ids.length > 0) {
          const { data: cls } = await (supabase as any)
            .from("classes")
            .select("*")
            .in("id", ids);
          setClasses(cls || []);

          const { data: schs } = await (supabase as any)
            .from("class_schedules")
            .select("*")
            .in("class_id", ids);

          const sMap: Record<string, any[]> = {};
          (schs || []).forEach((s: any) => (sMap[s.class_id] ||= []).push(s));
          Object.values(sMap).forEach((arr) =>
            arr.sort((a: any, b: any) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time))
          );
          setSchedulesByClass(sMap);
        } else {
          setClasses([]);
        }

        // 3. Fetch dữ liệu từ bảng students
        const { data: rosters } = await (supabase as any)
          .from("students")
          .select("*")
          .eq("linked_user_id", user.id);

        const primary = (rosters || [])[0];
        if (primary) {
          setStudentDetail(primary);
          const rMap: Record<string, any> = {};
          ids.forEach((cid: string) => { rMap[cid] = primary; });
          setRosterByClass(rMap);
        }
      } catch (err) {
        console.error("Lỗi lấy dữ liệu dashboard:", err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [user?.id]);

  const fmtVnd = (n: number) => `${Number(n || 0).toLocaleString("vi-VN")} ₫`;
  const days = lang === "vi"
    ? ["Chủ Nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"]
    : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  // Ưu tiên bản fetch mới nhất của chính trang này, rồi mới tới profile
  // trong context — cả hai đều là bảng `profiles`, chỉ khác thời điểm tải.
  const activeProfile = userProfile || profile;

  // Đọc đúng tên cột mà Settings.tsx thực sự lưu vào (display_name,
  // date_of_birth, school_class...). Trước đây code đọc nhầm các cột
  // full_name/dob/grade — những cột Settings không hề ghi vào — nên khi
  // sửa thông tin trong Settings, trang này vẫn hiện dữ liệu cũ/sai.
  const studentInfo = {
    fullName:
      (activeProfile as any)?.display_name ||
      studentDetail?.name ||
      user?.user_metadata?.full_name ||
      "Học sinh",

    email: user?.email || "Chưa cập nhật",

    phone:
      (activeProfile as any)?.phone ||
      studentDetail?.phone ||
      "Chưa cập nhật",

    dob:
      (activeProfile as any)?.date_of_birth ||
      studentDetail?.date_of_birth ||
      "Chưa cập nhật",

    grade:
      (activeProfile as any)?.school_class ||
      studentDetail?.grade ||
      "Chưa cập nhật",

    parentName:
      (activeProfile as any)?.parent_name ||
      studentDetail?.parent_name ||
      "Chưa cập nhật",

    parentPhone:
      (activeProfile as any)?.parent_phone ||
      studentDetail?.parent_phone ||
      "Chưa cập nhật",
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 space-y-6">
      
      {/* BANNER CHÀO MỪNG */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-6 sm:p-8 text-white shadow-xl shadow-blue-500/10">
        <div className="absolute -right-10 -bottom-10 h-64 w-64 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-xs font-bold tracking-wide uppercase backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-yellow-300" /> Góc học tập cá nhân
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
  Chào mừng trở lại, {studentInfo.fullName}! 👋
</h1>
            <p className="text-blue-100 text-sm font-medium max-w-lg">
              Bạn đang tham gia <span className="font-bold text-yellow-300">{classes.length} lớp học</span> trực tuyến. Hãy kiểm tra lịch học để chuẩn bị bài tốt nhất!
            </p>
          </div>

          <Link to="/join">
            <Button className="h-12 px-6 rounded-2xl bg-white text-blue-600 hover:bg-blue-50 font-bold text-sm shadow-md shrink-0 flex items-center gap-2 transition-all cursor-pointer">
              <Plus className="h-4 w-4" /> Tham gia lớp học mới
            </Button>
          </Link>
        </div>
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BookOpen className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lớp đang học</p>
            <h3 className="text-2xl font-black text-slate-900">{classes.length} Lớp</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <FileCheck2 className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Trạng thái học tập</p>
            <h3 className="text-xl font-black text-emerald-600">Hoạt động</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Xếp loại chung</p>
            <h3 className="text-2xl font-black text-slate-900">Giỏi</h3>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Clock className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Lịch học</p>
            <h3 className="text-sm font-black text-slate-900">Theo tuần</h3>
          </div>
        </div>
      </div>

      {/* BỐ CỤC CHÍNH */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LỚP HỌC */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-blue-600" /> Các lớp học của bạn
            </h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-3xl border border-slate-100">
              Đang tải danh sách lớp học...
            </div>
          ) : classes.length === 0 ? (
            <div className="p-10 text-center bg-white rounded-3xl border border-slate-100 shadow-sm space-y-3">
              <p className="text-sm font-medium text-slate-400">Bạn chưa tham gia lớp học nào.</p>
              <Link to="/join">
                <Button className="rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
                  Nhập mã đăng ký lớp ngay
                </Button>
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {classes.map((c) => {
                const r = rosterByClass[c.id];
                const monthly = r?.fee_per_month || c.fee_per_month;
                const perSession = r?.fee_per_session || c.fee_per_session;
                const upcoming = monthly && Number(monthly) > 0 ? monthly : perSession;
                const upcomingLabel = monthly && Number(monthly) > 0 ? "/ tháng" : "/ buổi";
                const schs = schedulesByClass[c.id] || [];

                return (
                  <div key={c.id} className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4 hover:border-blue-200 transition-all">
                    <Link to={`/student/classes/${c.id}`} className="block space-y-2 group">
                      <div className="h-2.5 w-12 rounded-full" style={{ background: c.color || "#3b82f6" }} />
                      <h3 className="font-bold text-slate-900 text-base group-hover:text-blue-600 transition-colors">
                        {c.name}
                      </h3>
                      <p className="text-xs font-semibold text-slate-400">
                        {c.subject} {c.grade && `· ${c.grade}`}
                      </p>
                    </Link>

                    <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100/80 text-xs">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Học phí sắp tới</span>
                      <div className="font-black text-slate-900 text-sm pt-0.5">
                        {fmtVnd(upcoming)}{" "}
                        <span className="text-[10px] font-normal text-slate-400">{upcomingLabel}</span>
                      </div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Lịch học trong tuần
                      </span>
                      {schs.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Chưa sắp xếp lịch học.</p>
                      ) : (
                        <ul className="space-y-1 text-xs">
                          {schs.map((s: any) => (
                            <li key={s.id} className="flex justify-between items-center bg-slate-50 px-2.5 py-1.5 rounded-xl font-medium text-slate-700">
                              <span className="font-bold text-blue-600">{days[s.day_of_week]}</span>
                              <span>{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* CỘT THÔNG TIN CÁ NHÂN */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
                <User className="h-4 w-4 text-blue-600" /> Thông tin cá nhân
              </h3>
              <Link to="/settings">
                <Button variant="ghost" size="sm" className="h-8 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg gap-1">
                  <Edit3 className="h-3.5 w-3.5" /> Sửa
                </Button>
              </Link>
            </div>

            <div className="space-y-3 text-xs font-semibold text-slate-600">
              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-400 flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Họ và tên</span>
                <span className="font-bold text-slate-900">{studentInfo.fullName}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-400 flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> Email</span>
                <span className="font-bold text-slate-900 truncate max-w-[150px]">{studentInfo.email}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-400 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> Số điện thoại</span>
                <span className="font-bold text-slate-900">{studentInfo.phone}</span>
              </div>

              <div className="flex justify-between items-center py-1 border-b border-slate-50">
                <span className="text-slate-400 flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" /> Ngày sinh</span>
                <span className="font-bold text-slate-900">{studentInfo.dob}</span>
              </div>

              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400 flex items-center gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> Khối lớp</span>
                <span className="font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-full">{studentInfo.grade}</span>
              </div>
            </div>

            {/* Thông tin Phụ huynh */}
            <div className="pt-3 border-t border-slate-100 space-y-3">
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">Thông tin phụ huynh</h4>
              
              <div className="bg-slate-50 p-3 rounded-2xl space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">Tên phụ huynh:</span>
                  <span className="font-bold text-slate-900">{studentInfo.parentName}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 font-medium">SĐT liên hệ:</span>
                  <span className="font-bold text-slate-900">{studentInfo.parentPhone}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}