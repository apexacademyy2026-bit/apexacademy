import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import StudentDashboard from "@/pages/StudentDashboard";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  Trash2, 
  Calendar, 
  MapPin, 
  School, 
  X, 
  Sparkles, 
  ArrowRight, 
  MessageSquare,
  GraduationCap
} from "lucide-react";
import { toast } from "sonner";

// 🌟 DỮ LIỆU TĨNH
const VIETNAM_PROVINCES = [
  "An Giang", "Bà Rịa - Vũng Tàu", "Bắc Giang", "Bắc Kạn", "Bạc Liêu", "Bắc Ninh", "Bến Tre", "Bình Định", "Bình Dương", "Bình Phước", "Bình Thuận", "Cà Mau", "Cần Thơ", "Cao Bằng", "Đà Nẵng", "Đắc Lắc", "Đắc Nông", "Điện Biên", "Đồng Nai", "Đồng Tháp", "Gia Lai", "Hà Giang", "Hà Nam", "Hà Nội", "Hà Tĩnh", "Hải Dương", "Hải Phòng", "Hậu Giang", "Hòa Bình", "Hưng Yên", "Khánh Hòa", "Kiên Giang", "Kon Tum", "Lai Châu", "Lâm Đồng", "Lạng Sơn", "Lào Cai", "Long An", "Nam Định", "Nghệ An", "Ninh Bình", "Ninh Thuận", "Phú Thọ", "Phú Yên", "Quảng Bình", "Quảng Nam", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sóc Trăng", "Sơn La", "Tây Ninh", "Thái Bình", "Thái Nguyên", "Thanh Hóa", "Thừa Thiên Huế", "Tiền Giang", "TP Hồ Chí Minh", "Trà Vinh", "Tuyên Quang", "Vĩnh Long", "Vĩnh Phúc", "Yên Bái"
];

const WEEK_DAYS = [
  { key: "monday", label: "Thứ 2" },
  { key: "tuesday", label: "Thứ 3" },
  { key: "wednesday", label: "Thứ 4" },
  { key: "thursday", label: "Thứ 5" },
  { key: "friday", label: "Thứ 6" },
  { key: "saturday", label: "Thứ 7" },
  { key: "sunday", label: "Chủ Nhật" },
];

export default function ClassLandingPage() {
  const navigate = useNavigate();
  const { t, lang } = useApp(); 
  
  // State quản lý đăng nhập / đăng ký
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showConsultModal, setShowConsultModal] = useState(false);

  // State quản lý Form tư vấn của học sinh
  const [studentForm, setStudentForm] = useState({
    fullName: "",
    email: "",
    dob: "",
    city: "",
    address: "",
    schoolName: "",
    schoolCity: "",
    grade: "",
    slots: [] as { day: string; startTime: string; endTime: string; }[]
  });

  // 🌟 XỬ LÝ ĐĂNG NHẬP / ĐĂNG KÝ HOÀN CHỈNH
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // 1. Kiểm tra đầu vào
    if (!email || !password) {
      toast.error("Vui lòng điền đầy đủ email và mật khẩu");
      return;
    }

    if (authMode === "signup" && !fullName.trim()) {
      toast.error("Vui lòng nhập đầy đủ Họ và tên");
      return;
    }

    setIsAuthLoading(true);

    try {
      if (authMode === "login") {
        // --- XỬ LÝ ĐĂNG NHẬP ---
        const { data, error } = await supabase.auth.signInWithPassword({ 
          email: email.trim(), 
          password 
        });

        if (error) throw error;

        toast.success("Đăng nhập thành công!");
        setShowAuthModal(false);

        // Lấy thông tin role an toàn (tránh lỗi TypeScript)
        if (data.user) {
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("*")
            .eq("id", data.user.id)
            .maybeSingle();

          const userRole = (profile as any)?.role;

          if (userRole === "teacher") {
            navigate("/students");
          } else {
            navigate("/student");
          }
        }

      } else {
        // --- XỬ LÝ ĐĂNG KÝ THÀNH VIÊN ---
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
            }
          }
        });

        if (error) throw error;

        toast.success("Đăng ký thành công!");
        setShowAuthModal(false);

        // Nếu hệ thống cho phép đăng nhập luôn (Confirm email = OFF)
        if (data.user && data.session) {
          const { data: profile } = await (supabase as any)
            .from("profiles")
            .select("*")
            .eq("id", data.user.id)
            .maybeSingle();

          const userRole = (profile as any)?.role;

          if (userRole === "teacher") {
            navigate("/students");
          } else {
            navigate("/student");
          }
        }
      }
    } catch (error: any) {
      toast.error(error.message || "Thao tác thất bại, vui lòng thử lại");
    } finally {
      setIsAuthLoading(false);
    }
  };

const handleGoogleSignIn = async () => {
  try {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: 'select_account', // BẮT BUỘC: Ép Google hiện bảng chọn tài khoản
        },
      },
    });
    if (error) throw error;
  } catch (error: any) {
    toast.error(error.message || "Không thể kết nối với Google Auth");
  }
};

  // Các hàm thao tác với lịch tư vấn
  const addWeeklySlot = () => {
    setStudentForm(prev => ({
      ...prev,
      slots: [...prev.slots, { day: "monday", startTime: "19:30", endTime: "21:30" }]
    }));
  };

  const removeWeeklySlot = (index: number) => {
    setStudentForm(prev => ({
      ...prev,
      slots: prev.slots.filter((_, i) => i !== index)
    }));
  };

  const updateWeeklySlot = (index: number, field: string, value: string) => {
    setStudentForm(prev => {
      const newSlots = [...prev.slots];
      newSlots[index] = { ...newSlots[index], [field]: value };
      return { ...prev, slots: newSlots };
    });
  };

  const handleConsultSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentForm.fullName || !studentForm.email || !studentForm.city || !studentForm.schoolName || !studentForm.grade) {
      toast.error("Vui lòng điền đầy đủ các thông tin bắt buộc!");
      return;
    }
    toast.success("Đăng ký nhận lớp học thành công! Thầy cô sẽ liên hệ qua Gmail sớm nhất.");
    setShowConsultModal(false);
  };

  return (
    <div className="min-h-screen w-full bg-[#f6f7fb] text-slate-900 font-sans antialiased selection:bg-blue-600 selection:text-white">
      
      {/* 1. THANH HEADER */}
      <header className="sticky top-0 z-40 w-full bg-white/90 border-b border-slate-100 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5 cursor-pointer">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-black text-white text-lg shadow-md">
              M
            </div>
            <span className="font-black text-2xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
              MathClass
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-8 text-sm font-bold text-slate-600">
            <a href="#about" className="hover:text-blue-600 transition-colors">Về lớp học</a>
            <a href="#workflow" className="hover:text-blue-600 transition-colors">Lộ trình bứt phá</a>
            <a href="#feedbacks" className="hover:text-blue-600 transition-colors">Cảm nhận thủ khoa</a>
          </nav>

          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              onClick={() => { 
                setAuthMode("login"); 
                setShowAuthModal(true); 
              }}
              className="text-slate-700 font-bold text-sm hover:bg-slate-100 rounded-xl px-4 h-10 border border-slate-200"
            >
              Đăng nhập
            </Button>

            <Button 
              onClick={() => setShowConsultModal(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm h-10 px-5 rounded-xl shadow-sm transition-all"
            >
              Đăng ký
            </Button>
          </div>
        </div>
      </header>

      {/* 2. MAIN LANDING PAGE */}
      <main className="pb-24">
        <section id="about" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#3b82f6/6%,transparent_40%)] pointer-events-none" />
          
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-blue-600 bg-blue-500/10 px-3 py-1.5 rounded-full uppercase">
              <Sparkles className="h-3.5 w-3.5" /> Khóa Học Online Tương Tác Cấp Độ Cao
            </span>
            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-slate-950 leading-[1.15]">
              Học Toán Tư Duy <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                Làm Chủ Điểm 9, 10
              </span>
            </h1>
            <p className="text-base sm:text-lg text-slate-500 font-medium max-w-xl mx-auto lg:mx-0">
              Không học vẹt, không học mẹo. Lớp học trực tuyến giúp học sinh rèn luyện tư duy sâu, bản chất cấu trúc đề thi, cam kết bứt phá thứ hạng trên lớp.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start items-center pt-2">
              <Button 
                onClick={() => setShowConsultModal(true)}
                className="w-full sm:w-auto h-14 px-8 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-500/20 group transition-all"
              >
                Đăng ký học thử ngay
                <ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" />
              </Button>
              <div className="flex items-center gap-6 text-xs font-bold text-slate-500 border-l border-slate-200 pl-6 hidden sm:flex">
                <div><span className="block text-xl font-black text-slate-900">5,000+</span>Học viên theo học</div>
                <div><span className="block text-xl font-black text-slate-900">94.5%</span>Đạt điểm Giỏi/Xuất sắc</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 relative flex justify-center">
            <div className="w-72 h-72 bg-gradient-to-tr from-blue-400 to-indigo-500 rounded-full blur-[80px] absolute opacity-20 top-10" />
            <div className="relative bg-white border border-slate-100 p-6 rounded-3xl shadow-xl w-full max-w-[360px] space-y-4 transform hover:-translate-y-2 transition-transform duration-300">
              <div className="h-36 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl flex flex-col justify-between p-4 text-white">
                <GraduationCap className="h-8 w-8 text-white/80" />
                <div>
                  <span className="text-xs text-white/60 font-medium">Chuyên đề trọng tâm</span>
                  <h4 className="text-lg font-bold">Hình Học Không Gian Oxyz</h4>
                </div>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-700">
                  <span>🎯 Mục tiêu: Ăn chắc điểm 9+</span>
                  <span className="text-blue-600">Đã mở lớp</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-700">
                  <span>⏱️ Thời lượng: 90 phút / ca</span>
                  <span className="text-slate-400">Live tương tác</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B: LỘ TRÌNH ĐÀO TẠO */}
        <section id="workflow" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 bg-white rounded-[40px] border border-slate-100 shadow-sm">
          <div className="text-center max-w-xl mx-auto space-y-2 mb-12">
            <h2 className="text-3xl font-black text-slate-950">Lộ Trình Học Tập Cá Nhân Hóa</h2>
            <p className="text-sm font-medium text-slate-400">Thiết kế khoa học giúp học sinh từ mất gốc đạt điểm số kỳ vọng nhanh nhất</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
            <div className="space-y-3 p-4">
              <div className="h-10 w-10 bg-blue-100 text-blue-600 font-bold rounded-xl flex items-center justify-center text-sm">01</div>
              <h4 className="text-lg font-bold text-slate-900">Đánh giá năng lực đầu vào</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Học sinh được làm bài test chuẩn hóa để thầy cô nắm chính xác phần kiến thức đang bị hổng.</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="h-10 w-10 bg-emerald-100 text-emerald-600 font-bold rounded-xl flex items-center justify-center text-sm">02</div>
              <h4 className="text-lg font-bold text-slate-900">Học trực tuyến & Chữa bài tập</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Tham gia lớp Live tương tác chất lượng cao, có video xem lại và kho giải bài tập chi tiết 24/7.</p>
            </div>
            <div className="space-y-3 p-4">
              <div className="h-10 w-10 bg-purple-100 text-purple-600 font-bold rounded-xl flex items-center justify-center text-sm">03</div>
              <h4 className="text-lg font-bold text-slate-900">Thi thử & Tối ưu điểm số</h4>
              <p className="text-xs text-slate-500 leading-relaxed">Cọ xát liên tục với hệ thống đề thi thử form chuẩn cấu trúc bộ giáo dục, tối ưu tâm lý phòng thi.</p>
            </div>
          </div>
        </section>

        {/* SECTION C: FEEDBACKS */}
        <section id="feedbacks" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16">
          <div className="text-center max-w-xl mx-auto space-y-2 mb-12">
            <h2 className="text-3xl font-black text-slate-950">Chia Sẻ Từ Học Viên</h2>
            <p className="text-sm font-medium text-slate-400">Niềm tự hào và động lực phấn đấu mỗi ngày của MathClass</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <p className="text-xs font-medium text-slate-600 italic">"Nhờ phương pháp dạy tư duy bản chất của thầy, em từ một học sinh sợ hình không gian đã tự tin làm trọn vẹn câu phân loại trong đề thi đại học vừa rồi để đạt 9.6 điểm Toán."</p>
              <div className="flex items-center gap-3 border-t border-slate-50 pt-3">
                <div className="h-9 w-9 rounded-full bg-slate-200 font-bold text-xs flex items-center justify-center text-slate-600">TA</div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900">Trần Tuấn Anh</h5>
                  <span className="text-[10px] font-semibold text-slate-400">Cựu học sinh lớp 12 - Đậu ĐH Bách Khoa</span>
                </div>
              </div>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
              <p className="text-xs font-medium text-slate-600 italic">"Giao diện lớp học siêu mượt, phần lịch học rảnh rỗi tự chọn linh hoạt giúp em cân bằng được lịch học trên trường. Tài liệu ôn tập thì sát đề thi thực tế cực kỳ ạ!"</p>
              <div className="flex items-center gap-3 border-t border-slate-50 pt-3">
                <div className="h-9 w-9 rounded-full bg-slate-200 font-bold text-xs flex items-center justify-center text-slate-600">MH</div>
                <div>
                  <h5 className="text-xs font-bold text-slate-900">Lê Minh Huyền</h5>
                  <span className="text-[10px] font-semibold text-slate-400">Học sinh lớp 11 trường THPT Chuyên Hà Nội - Amsterdam</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 3. MODAL ĐĂNG KÝ HỌC THỬ */}
      {showConsultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm overflow-y-auto">
          <div className="bg-[#f6f7fb] w-full max-w-2xl rounded-3xl shadow-2xl p-4 sm:p-6 relative my-8 animate-scale-up max-h-[92vh] overflow-y-auto">
            
            <button 
              type="button"
              className="absolute right-5 top-5 p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-all z-10" 
              onClick={() => setShowConsultModal(false)}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="text-center space-y-3 pb-4 pt-4">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold tracking-wide text-blue-600 bg-blue-500/10 px-3 py-1 rounded-full uppercase">
                <Sparkles className="h-3.5 w-3.5" /> Khóa Học Online Tương Tác Chất Lượng Cao
              </span>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-950 max-w-xl mx-auto leading-tight">
                Bứt Phá Điểm Số Cùng Phương Pháp Học Tư Duy Hiện Đại
              </h1>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 sm:p-8 space-y-6">
              <div className="space-y-1.5 border-b border-slate-100 pb-3">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-600" /> Đăng Ký Học Thử & Nhận Đề Thi
                </h2>
              </div>

              <form onSubmit={handleConsultSubmit} className="space-y-5">
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600">1. Thông tin cá nhân học sinh</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Họ và tên <span className="text-red-500">*</span></Label>
                      <Input placeholder="Ví dụ: Nguyễn Văn A" className="h-11 rounded-xl" value={studentForm.fullName} onChange={e => setStudentForm({...studentForm, fullName: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Địa chỉ Gmail <span className="text-red-500">*</span></Label>
                      <Input type="email" placeholder="hocsinh@gmail.com" className="h-11 rounded-xl" value={studentForm.email} onChange={e => setStudentForm({...studentForm, email: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Ngày tháng năm sinh <span className="text-red-500">*</span></Label>
                      <Input type="date" className="h-11 rounded-xl" value={studentForm.dob} onChange={e => setStudentForm({...studentForm, dob: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1"><MapPin className="h-4 w-4" /> 2. Khu vực hiện tại đang sinh sống</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Tỉnh / Thành phố <span className="text-red-500">*</span></Label>
                      <select 
                        className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={studentForm.city} onChange={e => setStudentForm({...studentForm, city: e.target.value})}
                      >
                        <option value="">-- Chọn Tỉnh / Thành --</option>
                        {VIETNAM_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Địa chỉ chi tiết (Số nhà/ Đường)</Label>
                      <Input placeholder="Số 12, ngõ 34, đường Lê Lợi..." className="h-11 rounded-xl" value={studentForm.address} onChange={e => setStudentForm({...studentForm, address: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1"><School className="h-4 w-4" /> 3. Thông tin trường học</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Tên trường đang học <span className="text-red-500">*</span></Label>
                      <Input placeholder="Ví dụ: THPT Chuyên Nguyễn Huệ" className="h-11 rounded-xl" value={studentForm.schoolName} onChange={e => setStudentForm({...studentForm, schoolName: e.target.value})} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Khối lớp <span className="text-red-500">*</span></Label>
                      <select 
                        className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={studentForm.grade} onChange={e => setStudentForm({...studentForm, grade: e.target.value})}
                      >
                        <option value="">-- Chọn khối lớp --</option>
                        {[6, 7, 8, 9, 10, 11, 12].map(num => <option key={num} value={`Lớp ${num}`}>Lớp {num}</option>)}
                        <option value="Luyện thi Đại học">Ôn thi Đại học / Khác</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-bold text-slate-700">Thuộc Tỉnh / Thành phố <span className="text-red-500">*</span></Label>
                      <select 
                        className="w-full h-11 px-3 rounded-xl border border-input bg-background text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        value={studentForm.schoolCity} onChange={e => setStudentForm({...studentForm, schoolCity: e.target.value})}
                      >
                        <option value="">-- Chọn Tỉnh / Thành --</option>
                        {VIETNAM_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-1">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-600 flex items-center gap-1"><Calendar className="h-4 w-4" /> 4. Lịch rảnh mong muốn đăng ký</h4>
                    <Button type="button" variant="outline" size="sm" onClick={addWeeklySlot} className="h-8 rounded-lg text-xs border-blue-200 text-blue-600 hover:bg-blue-50 gap-1 font-bold">
                      <Plus className="h-3.5 w-3.5" /> Thêm lịch
                    </Button>
                  </div>

                  {studentForm.slots.length === 0 ? (
                    <p className="text-xs text-slate-400 italic text-center py-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      Chưa đăng ký lịch biểu nào. Bấm nút Thêm lịch để tự chọn ca.
                    </p>
                  ) : (
                    <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                      {studentForm.slots.map((slot, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <select 
                            className="flex-1 min-w-[95px] h-9 px-2 rounded-lg border bg-white text-xs font-medium"
                            value={slot.day} onChange={e => updateWeeklySlot(index, "day", e.target.value)}
                          >
                            {WEEK_DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1 text-xs text-slate-500 font-medium">
                            <span>Từ</span>
                            <Input type="time" className="w-24 h-9 bg-white rounded-lg text-xs px-2" value={slot.startTime} onChange={e => updateWeeklySlot(index, "startTime", e.target.value)} />
                            <span>Đến</span>
                            <Input type="time" className="w-24 h-9 bg-white rounded-lg text-xs px-2" value={slot.endTime} onChange={e => updateWeeklySlot(index, "endTime", e.target.value)} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeWeeklySlot(index)} className="h-9 w-9 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 group transition-all">
                  Gửi đăng ký nhập học thử
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </form>
            </div>

          </div>
        </div>
      )}

      {/* 4. MODAL ĐĂNG NHẬP / ĐĂNG KÝ HỆ THỐNG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-[400px] rounded-3xl shadow-2xl p-7 relative space-y-5 animate-scale-up">
            <button 
              type="button" 
              className="absolute right-5 top-5 p-1.5 rounded-full hover:bg-slate-100 text-slate-400" 
              onClick={() => setShowAuthModal(false)}
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="text-center space-y-1">
              <h3 className="text-2xl font-black text-slate-900">
                {authMode === "login" ? "Đăng nhập học tập" : "Đăng ký thành viên"}
              </h3>
              <p className="text-xs font-medium text-slate-400">
                Kết nối vào không gian học tập trực tuyến cá nhân
              </p>
            </div>

            {/* Nút Đăng nhập Google Auth */}
            <Button 
              type="button" 
              variant="outline" 
              onClick={handleGoogleSignIn} 
              className="w-full h-11 rounded-xl font-bold text-sm gap-2 hover:bg-slate-50 transition-all flex items-center justify-center border-slate-200 text-slate-700"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.41 3.65 1.5 7.5l3.85 2.99C6.26 7.49 8.91 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.99 3.7-8.62z"/><path fill="#FBBC05" d="M5.35 14.51c-.24-.74-.38-1.54-.38-2.37s.14-1.63.38-2.37L1.5 6.78C.54 8.7 0 10.85 0 13s.54 4.3 1.5 6.22l3.85-2.71z"/><path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.73-2.89c-1.11.75-2.53 1.19-4.23 1.19-3.09 0-5.74-2.45-6.65-5.45L1.5 16.64C3.41 20.35 7.35 23 12 23z"/>
              </svg>
              Sign in with Google
            </Button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-100"></div>
              <span className="mx-3 text-[9px] text-slate-400 font-bold uppercase tracking-wider">Hoặc tài khoản</span>
              <div className="flex-grow border-t border-slate-100"></div>
            </div>

            <form className="space-y-3.5" onSubmit={handleAuthSubmit}>
              {/* Ô nhập Họ và tên (chỉ xuất hiện khi chọn Đăng ký) */}
              {authMode === "signup" && (
                <div className="space-y-1.5">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Họ và tên</Label>
                  <Input 
                    placeholder="Nguyễn Văn A" 
                    className="h-11 rounded-xl" 
                    value={fullName} 
                    onChange={e => setFullName(e.target.value)} 
                    required 
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Địa chỉ Email</Label>
                <Input type="email" placeholder="name@example.com" className="h-11 rounded-xl" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>

              <div className="space-y-1.5">
                <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mật khẩu</Label>
                <Input type="password" placeholder="••••••••" className="h-11 rounded-xl" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>

              <Button 
                type="submit" 
                disabled={isAuthLoading} 
                className="w-full h-11 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-sm text-white shadow-md transition-all cursor-pointer"
              >
                {isAuthLoading ? "Đang xử lý..." : authMode === "login" ? "Đăng nhập" : "Đăng ký thành viên"}
              </Button>
            </form>

            <div className="text-center text-xs font-semibold text-slate-500">
              {authMode === "login" ? (
                <>
                  Chưa có tài khoản lớp học?{" "}
                  <button type="button" onClick={() => setAuthMode("signup")} className="text-blue-600 font-bold hover:underline">
                    Đăng ký
                  </button>
                </>
              ) : (
                <>
                  Đã có tài khoản từ trước?{" "}
                  <button type="button" onClick={() => setAuthMode("login")} className="text-blue-600 font-bold hover:underline">
                    Đăng nhập
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}