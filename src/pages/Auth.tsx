import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Plus,
  Trash2,
  Calendar,
  MapPin,
  School,
  X,
  ArrowRight,
  MessageSquare,
  GraduationCap,
  Target,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { PALETTE, resolveStudentColor } from "@/lib/studentColor";

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

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate (giống trang quản lý) */
const FIELD = "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20";
const SELECT = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm shadow-xs focus:border-[#0B1B3A] focus:outline-none focus:ring-2 focus:ring-[#0B1B3A]/20";
const LABEL = "text-sm font-medium text-slate-700";
const PRIMARY = "bg-[#0B1B3A] text-white hover:bg-[#13285a]";
const CLOSE = "absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800";
const BUBBLE = "grid place-items-center font-extrabold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]";

const StepHead = ({ n, title, icon: Icon }: { n: number; title: string; icon?: any }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#0B1B3A] text-xs font-extrabold text-white">{n}</span>
    <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
      {Icon && <Icon className="h-4 w-4 text-slate-400" />} {title}
    </h4>
  </div>
);

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

  /* ---------------- GIAO DIỆN ---------------- */
  const steps = [
    { n: "01", color: PALETTE[0], title: "Đánh giá năng lực đầu vào", body: "Học sinh được làm bài test chuẩn hóa để thầy cô nắm chính xác phần kiến thức đang bị hổng." },
    { n: "02", color: PALETTE[4], title: "Học trực tuyến & Chữa bài tập", body: "Tham gia lớp Live tương tác chất lượng cao, có video xem lại và kho giải bài tập chi tiết 24/7." },
    { n: "03", color: PALETTE[1], title: "Thi thử & Tối ưu điểm số", body: "Cọ xát liên tục với hệ thống đề thi thử form chuẩn cấu trúc bộ giáo dục, tối ưu tâm lý phòng thi." },
  ];

  const feedbacks = [
    {
      name: "Trần Tuấn Anh",
      initials: "TA",
      role: "Cựu học sinh lớp 12, đậu ĐH Bách Khoa",
      quote: "Nhờ phương pháp dạy tư duy bản chất của thầy, em từ một học sinh sợ hình không gian đã tự tin làm trọn vẹn câu phân loại trong đề thi đại học vừa rồi để đạt 9.6 điểm Toán.",
    },
    {
      name: "Lê Minh Huyền",
      initials: "MH",
      role: "Học sinh lớp 11, THPT Chuyên Hà Nội - Amsterdam",
      quote: "Giao diện lớp học siêu mượt, phần lịch học rảnh rỗi tự chọn linh hoạt giúp em cân bằng được lịch học trên trường. Tài liệu ôn tập thì sát đề thi thực tế cực kỳ ạ!",
    },
  ];

  return (
    <div className="min-h-screen w-full bg-slate-50 font-['Be_Vietnam_Pro',sans-serif] text-slate-900 antialiased selection:bg-[#0B1B3A] selection:text-white">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* 1. THANH HEADER - Đẩy xuống tránh khuất bởi Dynamic Island / Tai thỏ */}
      <header
        className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top))", // Tạo khoảng đệm tối thiểu ở mép trên
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex cursor-pointer items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[#0B1B3A] text-lg font-extrabold text-[#FFB547]">M</div>
            <span className="text-xl font-extrabold tracking-tight text-[#0B1B3A]">MathClass</span>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
            <a href="#about" className="transition-colors hover:text-[#0B1B3A]">Về lớp học</a>
            <a href="#workflow" className="transition-colors hover:text-[#0B1B3A]">Lộ trình bứt phá</a>
            <a href="#feedbacks" className="transition-colors hover:text-[#0B1B3A]">Cảm nhận thủ khoa</a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
              className="h-10 rounded-xl border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Đăng nhập
            </Button>
            <Button onClick={() => setShowConsultModal(true)} className={`h-10 rounded-xl px-5 text-sm font-bold ${PRIMARY}`}>
              Đăng ký
            </Button>
          </div>
        </div>
      </header>

      {/* 2. MAIN LANDING PAGE */}
      <main className="pb-24">
        {/* HERO */}
        <section id="about" className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="relative grid items-center gap-10 overflow-hidden rounded-[2rem] bg-[#0B1B3A] px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-12">
            <div className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#FFB547]" />
            <div className="pointer-events-none absolute -bottom-36 left-1/3 hidden h-72 w-72 rounded-full border-[48px] border-white/[0.06] lg:block" />

            <div className="relative space-y-6 text-center lg:col-span-7 lg:text-left">
              <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl">
                Học Toán Tư Duy <br />
                <span className="text-[#FFB547]">Làm Chủ Điểm 9, 10</span>
              </h1>
              <p className="mx-auto max-w-xl text-base font-medium leading-relaxed text-white/70 sm:text-lg lg:mx-0">
                Không học vẹt, không học mẹo. Lớp học trực tuyến giúp học sinh rèn luyện tư duy sâu, bản chất cấu trúc đề thi, cam kết bứt phá thứ hạng trên lớp.
              </p>
              <div className="flex flex-col items-center gap-6 pt-2 sm:flex-row lg:justify-start">
                <Button
                  onClick={() => setShowConsultModal(true)}
                  className="group h-14 w-full gap-2 rounded-2xl bg-[#FFB547] px-8 text-base font-bold text-[#0B1B3A] shadow-lg hover:bg-[#ffc266] sm:w-auto"
                >
                  Đăng ký học thử ngay
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                </Button>
                <dl className="hidden gap-8 border-l border-white/20 pl-6 text-left sm:flex">
                  <div>
                    <dd className="text-2xl font-extrabold text-white">5,000+</dd>
                    <dt className="text-xs text-white/60">Học viên theo học</dt>
                  </div>
                  <div>
                    <dd className="text-2xl font-extrabold text-white">94.5%</dd>
                    <dt className="text-xs text-white/60">Đạt điểm Giỏi/Xuất sắc</dt>
                  </div>
                </dl>
              </div>
            </div>

            <div className="relative flex justify-center lg:col-span-5">
              <div className="w-full max-w-[360px] space-y-4 rounded-3xl bg-white p-5 shadow-2xl">
                <div className="flex h-36 flex-col justify-between rounded-2xl p-4 text-white" style={{ background: PALETTE[0] }}>
                  <GraduationCap className="h-8 w-8 text-white/85" />
                  <div>
                    <span className="text-xs font-medium text-white/75">Chuyên đề trọng tâm</span>
                    <h4 className="text-lg font-bold">Hình Học Không Gian Oxyz</h4>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-800">
                    <span className="flex items-center gap-2"><Target className="h-4 w-4 text-slate-400" /> Mục tiêu: Ăn chắc điểm 9+</span>
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">Đã mở lớp</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-3 text-sm font-semibold text-slate-800">
                    <span className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" /> Thời lượng: 90 phút / ca</span>
                    <span className="shrink-0 text-xs font-medium text-slate-500">Live tương tác</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* LỘ TRÌNH ĐÀO TẠO */}
        <section id="workflow" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-xl space-y-2 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Lộ Trình Học Tập Cá Nhân Hóa</h2>
            <p className="text-sm font-medium text-slate-500">Thiết kế khoa học giúp học sinh từ mất gốc đạt điểm số kỳ vọng nhanh nhất</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
                <div className={`h-12 w-12 rounded-2xl text-base ${BUBBLE}`} style={{ background: s.color }}>{s.n}</div>
                <h4 className="text-lg font-bold text-slate-900">{s.title}</h4>
                <p className="text-sm leading-relaxed text-slate-500">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FEEDBACKS */}
        <section id="feedbacks" className="mx-auto max-w-7xl px-4 pt-20 sm:px-6 lg:px-8">
          <div className="mx-auto mb-10 max-w-xl space-y-2 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Chia Sẻ Từ Học Viên</h2>
            <p className="text-sm font-medium text-slate-500">Niềm tự hào và động lực phấn đấu mỗi ngày của MathClass</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {feedbacks.map((f) => {
              const color = resolveStudentColor(null, f.name);
              return (
                <figure key={f.name} className="relative space-y-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 pl-8 shadow-xs">
                  <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} />
                  <blockquote className="text-base leading-relaxed text-slate-700">"{f.quote}"</blockquote>
                  <figcaption className="flex items-center gap-3 border-t border-slate-100 pt-4">
                    <div className={`h-10 w-10 shrink-0 rounded-xl text-sm ${BUBBLE}`} style={{ background: color }}>{f.initials}</div>
                    <div>
                      <h5 className="text-sm font-bold text-slate-900">{f.name}</h5>
                      <span className="text-xs text-slate-500">{f.role}</span>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      </main>

      {/* 3. POPUP ĐĂNG KÝ HỌC THỬ */}
      {showConsultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Đăng ký học thử" className="relative my-8 max-h-[92vh] w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl animate-scale-up">
            <div className="h-1.5 bg-[#FFB547]" />
            <button type="button" aria-label="Đóng" className={CLOSE} onClick={() => setShowConsultModal(false)}>
              <X className="h-5 w-5" />
            </button>

            <div className="max-h-[calc(92vh-6px)] overflow-y-auto">
              <div className="space-y-1 border-b border-slate-100 px-6 py-5 pr-16 sm:px-8">
                <h2 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
                  <MessageSquare className="h-5 w-5 text-slate-400" /> Đăng Ký Học Thử & Nhận Đề Thi
                </h2>
                <p className="text-sm text-slate-500">Bứt phá điểm số cùng phương pháp học tư duy hiện đại.</p>
              </div>

              <form onSubmit={handleConsultSubmit} className="space-y-6 px-6 py-6 sm:px-8">
                <div className="space-y-3">
                  <StepHead n={1} title="Thông tin cá nhân học sinh" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Họ và tên <span className="text-rose-500">*</span></Label>
                      <Input placeholder="Ví dụ: Nguyễn Văn A" className={FIELD} value={studentForm.fullName} onChange={e => setStudentForm({ ...studentForm, fullName: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Địa chỉ Gmail <span className="text-rose-500">*</span></Label>
                      <Input type="email" placeholder="hocsinh@gmail.com" className={FIELD} value={studentForm.email} onChange={e => setStudentForm({ ...studentForm, email: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Ngày sinh <span className="text-rose-500">*</span></Label>
                      <Input type="date" className={FIELD} value={studentForm.dob} onChange={e => setStudentForm({ ...studentForm, dob: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <StepHead n={2} title="Khu vực hiện tại đang sinh sống" icon={MapPin} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Tỉnh / Thành phố <span className="text-rose-500">*</span></Label>
                      <select className={SELECT} value={studentForm.city} onChange={e => setStudentForm({ ...studentForm, city: e.target.value })}>
                        <option value="">-- Chọn Tỉnh / Thành --</option>
                        {VIETNAM_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Địa chỉ chi tiết (số nhà, đường)</Label>
                      <Input placeholder="Số 12, ngõ 34, đường Lê Lợi..." className={FIELD} value={studentForm.address} onChange={e => setStudentForm({ ...studentForm, address: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <StepHead n={3} title="Thông tin trường học" icon={School} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Tên trường đang học <span className="text-rose-500">*</span></Label>
                      <Input placeholder="Ví dụ: THPT Chuyên Nguyễn Huệ" className={FIELD} value={studentForm.schoolName} onChange={e => setStudentForm({ ...studentForm, schoolName: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Khối lớp <span className="text-rose-500">*</span></Label>
                      <select className={SELECT} value={studentForm.grade} onChange={e => setStudentForm({ ...studentForm, grade: e.target.value })}>
                        <option value="">-- Chọn khối lớp --</option>
                        {[6, 7, 8, 9, 10, 11, 12].map(num => <option key={num} value={`Lớp ${num}`}>Lớp {num}</option>)}
                        <option value="Luyện thi Đại học">Ôn thi Đại học / Khác</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Thuộc Tỉnh / Thành phố <span className="text-rose-500">*</span></Label>
                      <select className={SELECT} value={studentForm.schoolCity} onChange={e => setStudentForm({ ...studentForm, schoolCity: e.target.value })}>
                        <option value="">-- Chọn Tỉnh / Thành --</option>
                        {VIETNAM_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <StepHead n={4} title="Lịch rảnh mong muốn đăng ký" icon={Calendar} />
                    <Button type="button" variant="outline" onClick={addWeeklySlot} className="h-9 gap-1.5 rounded-xl border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                      <Plus className="h-4 w-4" /> Thêm lịch
                    </Button>
                  </div>

                  {studentForm.slots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 py-5 text-center text-sm text-slate-500">
                      Chưa đăng ký lịch biểu nào. Bấm nút Thêm lịch để tự chọn ca.
                    </p>
                  ) : (
                    <div className="max-h-[170px] space-y-2 overflow-y-auto pr-1">
                      {studentForm.slots.map((slot, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-2.5">
                          <select className={`${SELECT} h-10 min-w-[100px] flex-1 text-sm`} value={slot.day} onChange={e => updateWeeklySlot(index, "day", e.target.value)}>
                            {WEEK_DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1.5 text-sm text-slate-500">
                            <span>Từ</span>
                            <Input type="time" className={`${FIELD} h-10 w-28 px-2`} value={slot.startTime} onChange={e => updateWeeklySlot(index, "startTime", e.target.value)} />
                            <span>đến</span>
                            <Input type="time" className={`${FIELD} h-10 w-28 px-2`} value={slot.endTime} onChange={e => updateWeeklySlot(index, "endTime", e.target.value)} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" aria-label="Xóa lịch" onClick={() => removeWeeklySlot(index)} className="ml-auto h-10 w-10 rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" className={`group flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold ${PRIMARY}`}>
                  Gửi đăng ký nhập học thử
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 4. POPUP ĐĂNG NHẬP / ĐĂNG KÝ HỆ THỐNG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
          <div role="dialog" aria-modal="true" aria-label="Đăng nhập" className="relative w-full max-w-[400px] overflow-hidden rounded-3xl bg-white shadow-2xl animate-scale-up">
            <div className="h-1.5 bg-[#FFB547]" />
            <button type="button" aria-label="Đóng" className={CLOSE} onClick={() => setShowAuthModal(false)}>
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-5 px-7 py-7">
              <div className="space-y-1 text-center">
                <h3 className="text-2xl font-extrabold text-slate-900">
                  {authMode === "login" ? "Đăng nhập học tập" : "Đăng ký thành viên"}
                </h3>
                <p className="text-sm text-slate-500">Kết nối vào không gian học tập trực tuyến cá nhân</p>
              </div>

              {/* Nút Đăng nhập Google Auth */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.41 3.65 1.5 7.5l3.85 2.99C6.26 7.49 8.91 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.99 3.7-8.62z"/><path fill="#FBBC05" d="M5.35 14.51c-.24-.74-.38-1.54-.38-2.37s.14-1.63.38-2.37L1.5 6.78C.54 8.7 0 10.85 0 13s.54 4.3 1.5 6.22l3.85-2.71z"/><path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.73-2.89c-1.11.75-2.53 1.19-4.23 1.19-3.09 0-5.74-2.45-6.65-5.45L1.5 16.64C3.41 20.35 7.35 23 12 23z"/>
                </svg>
                Đăng nhập bằng Google
              </Button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="mx-3 text-xs font-medium text-slate-400">Hoặc dùng tài khoản</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                {/* Ô nhập Họ và tên (chỉ xuất hiện khi chọn Đăng ký) */}
                {authMode === "signup" && (
                  <div className="space-y-1.5">
                    <Label className={LABEL}>Họ và tên</Label>
                    <Input placeholder="Nguyễn Văn A" className={FIELD} value={fullName} onChange={e => setFullName(e.target.value)} required />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className={LABEL}>Địa chỉ email</Label>
                  <Input type="email" placeholder="name@example.com" className={FIELD} value={email} onChange={e => setEmail(e.target.value)} required />
                </div>

                <div className="space-y-1.5">
                  <Label className={LABEL}>Mật khẩu</Label>
                  <Input type="password" placeholder="••••••••" className={FIELD} value={password} onChange={e => setPassword(e.target.value)} required />
                </div>

                <Button type="submit" disabled={isAuthLoading} className={`h-11 w-full rounded-xl text-sm font-bold ${PRIMARY}`}>
                  {isAuthLoading ? "Đang xử lý..." : authMode === "login" ? "Đăng nhập" : "Đăng ký thành viên"}
                </Button>
              </form>

              <div className="text-center text-sm text-slate-500">
                {authMode === "login" ? (
                  <>
                    Chưa có tài khoản lớp học?{" "}
                    <button type="button" onClick={() => setAuthMode("signup")} className="font-bold text-[#0B1B3A] hover:underline">
                      Đăng ký
                    </button>
                  </>
                ) : (
                  <>
                    Đã có tài khoản từ trước?{" "}
                    <button type="button" onClick={() => setAuthMode("login")} className="font-bold text-[#0B1B3A] hover:underline">
                      Đăng nhập
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}