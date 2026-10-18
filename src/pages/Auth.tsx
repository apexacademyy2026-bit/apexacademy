import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate, Link } from "react-router-dom";
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
  Check,
  Phone,
  MessageCircle,
  Video,
  FileText,
  CalendarDays,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { resolveStudentColor } from "@/lib/studentColor";

/* =====================================================================
   NỘI DUNG TRANG: sửa ở đây, không cần đụng vào phần giao diện bên dưới.
   Lưu ý: số liệu (stats) và cảm nhận (FEEDBACKS) đang là nội dung mẫu.
   Hãy thay bằng số liệu và lời nhận xét thật của lớp bạn trước khi đăng công khai.
   Thông tin liên hệ để trống thì phần đó tự ẩn.
   ===================================================================== */
const SITE = {
  brand: "Apex Academy",
  stats: [
    { value: "5,000+", label: "Học viên theo học" },
    { value: "94.5%", label: "Đạt điểm Giỏi/Xuất sắc" },
  ],
  teacher: {
    name: "", // ví dụ: "Thầy Nguyễn Văn A"
    role: "Giáo viên Toán THPT",
    photo: "", // đường dẫn ảnh chân dung, để trống thì hiện biểu tượng ∫
  },
  // Thông tin liên hệ lấy từ trang /lop-hoc.
  // Dán link Facebook vào "facebook" để hiện mục Facebook ở chân trang (để trống thì tự ẩn).
  contact: {
    phone: "0868994242",
    zalo: "0868994242",
    facebook: "",
    address: "Buôn Ma Thuột, Đăk Lăk",
    maps: "https://maps.app.goo.gl/f8RQ6jaur4ZyfSk38", // bấm vào địa chỉ sẽ mở Google Maps
  },
};

const FEATURES = [
  { icon: Video, title: "Vào lớp học trực tuyến", body: "Tham gia lớp Live đúng lịch, có video xem lại khi cần ôn." },
  { icon: FileText, title: "Bài tập và đề thi online", body: "Làm bài ngay trên hệ thống, nộp xong xem được kết quả và lời giải chi tiết." },
  { icon: CalendarDays, title: "Lịch học rõ ràng", body: "Xem các ca học trong tuần của từng lớp, không lo nhầm giờ." },
  { icon: Receipt, title: "Học phí minh bạch", body: "Học phí từng lớp được công khai, hóa đơn cập nhật ngay trong tài khoản." },
];

type ArtProps = { className?: string };

// Hình minh họa cho từng bước (SVG nội bộ)
const ArtAssess = ({ className }: ArtProps) => (
  <svg viewBox="0 0 120 96" fill="none" className={className} aria-hidden>
    <rect x="16" y="14" width="64" height="76" rx="11" fill="#DBEAFE" />
    <rect x="37" y="6" width="26" height="15" rx="6.5" fill="#93C5FD" />
    {[34, 50, 66].map((y) => (
      <g key={y}>
        <rect x="27" y={y} width="10" height="10" rx="3" fill="#fff" stroke="#60A5FA" strokeWidth="2" />
        <rect x="44" y={y + 3} width="26" height="4" rx="2" fill="#93C5FD" />
      </g>
    ))}
    <circle cx="82" cy="62" r="17" fill="#fff" fillOpacity="0.55" stroke="#2563EB" strokeWidth="6" />
    <path d="M94 75l14 14" stroke="#1D4ED8" strokeWidth="9" strokeLinecap="round" />
    <path d="M100 18l8-6M104 26l10-2" stroke="#3B82F6" strokeWidth="3.5" strokeLinecap="round" />
  </svg>
);

const ArtLive = ({ className }: ArtProps) => (
  <svg viewBox="0 0 120 96" fill="none" className={className} aria-hidden>
    <rect x="14" y="26" width="76" height="52" rx="8" fill="#D8F3E6" stroke="#168A5B" strokeWidth="5" />
    <circle cx="52" cy="52" r="15" fill="#22A06B" />
    <path d="M47 44v16l14-8z" fill="#fff" />
    <rect x="6" y="80" width="92" height="7" rx="3.5" fill="#9AD3B7" />
    <rect x="76" y="6" width="38" height="22" rx="9" fill="#22A06B" />
    <path d="M86 28l-1 8 9-8z" fill="#22A06B" />
    {[87, 95, 103].map((x) => (
      <circle key={x} cx={x} cy="17" r="2.6" fill="#fff" />
    ))}
  </svg>
);

const ArtGoal = ({ className }: ArtProps) => (
  <svg viewBox="0 0 120 96" fill="none" className={className} aria-hidden>
    <rect x="12" y="12" width="64" height="74" rx="11" fill="#ECE6FF" />
    <rect x="24" y="23" width="32" height="5" rx="2.5" fill="#C4B5FD" />
    {[40, 55, 70].map((y) => (
      <g key={y}>
        <path d={`M25 ${y}l5 5 9-10`} stroke="#7C3AED" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="46" y={y - 2} width="22" height="4.5" rx="2.25" fill="#C4B5FD" />
      </g>
    ))}
    <circle cx="86" cy="68" r="22" fill="#6D3FE0" />
    <circle cx="86" cy="68" r="15" fill="#ECE6FF" />
    <circle cx="86" cy="68" r="8.5" fill="#6D3FE0" />
    <circle cx="86" cy="68" r="3" fill="#fff" />
    <path d="M86 68l17-19" stroke="#4C1D95" strokeWidth="4" strokeLinecap="round" />
    <path d="M98 47l9-1-1 9" stroke="#4C1D95" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const STEPS = [
  { n: "1", from: "#3B82F6", to: "#2563EB", tint: "#E6EEFF", Art: ArtAssess, title: "Đánh giá năng lực đầu vào", body: "Học sinh làm bài test chuẩn hóa để thầy cô nắm chính xác phần kiến thức đang bị hổng." },
  { n: "2", from: "#2EB67D", to: "#168A5B", tint: "#DDF4E8", Art: ArtLive, title: "Học trực tuyến và chữa bài tập", body: "Tham gia lớp Live tương tác, có video xem lại và kho lời giải bài tập chi tiết dùng bất cứ lúc nào." },
  { n: "3", from: "#8B5CF6", to: "#6D3FE0", tint: "#ECE6FF", Art: ArtGoal, title: "Thi thử và tối ưu điểm số", body: "Luyện liên tục với đề thi thử đúng cấu trúc của Bộ Giáo dục, làm quen áp lực phòng thi." },
];

// Giới thiệu chương trình Toán ba khối THPT (không phải riêng các lớp đang mở).
// Màu khối 10 và 12 khớp thời khóa biểu ở trang /lop-hoc.
const GRADES = [
  {
    grade: "10",
    title: "Nền tảng Toán THPT",
    color: "#4F46E5",
    tint: "#EEF0FF",
    ink: "#2E2A9E",
    goal: "Làm quen cách học bậc THPT và xây nền vững cho cả ba năm, hiểu bản chất thay vì học thuộc dạng bài.",
    topics: ["Mệnh đề và tập hợp", "Bất phương trình bậc nhất hai ẩn", "Hệ thức lượng trong tam giác", "Vectơ", "Số đặc trưng của mẫu số liệu", "Hàm số, đồ thị và ứng dụng", "Tọa độ trong mặt phẳng", "Đại số tổ hợp", "Xác suất cổ điển"],
  },
  {
    grade: "11",
    title: "Nâng cao và mở rộng",
    color: "#E4572E",
    tint: "#FDEBE5",
    ink: "#9E3414",
    goal: "Mở rộng sang lượng giác, giới hạn, đạo hàm và hình học không gian, những phần là nền cho năm lớp 12.",
    topics: ["Hàm số lượng giác và phương trình lượng giác", "Dãy số, cấp số cộng, cấp số nhân", "Mẫu số liệu ghép nhóm", "Quan hệ song song trong không gian", "Giới hạn và hàm số liên tục", "Hàm số mũ và hàm số lôgarit", "Quan hệ vuông góc trong không gian", "Các quy tắc tính xác suất", "Đạo hàm"],
  },
  {
    grade: "12",
    title: "Chinh phục điểm 9 trở lên",
    color: "#0F9D8A",
    tint: "#E3F6F2",
    ink: "#0B6B5E",
    goal: "Ôn trọng tâm theo cấu trúc đề tốt nghiệp THPT và luyện các câu phân loại để lấy điểm 9 trở lên.",
    topics: ["Ứng dụng đạo hàm, khảo sát hàm số", "Vectơ và tọa độ trong không gian", "Số đặc trưng đo độ phân tán của mẫu số liệu ghép nhóm", "Nguyên hàm và tích phân", "Mặt phẳng, đường thẳng, mặt cầu trong không gian", "Xác suất có điều kiện"],
  },
];

const PILLARS = [
  { title: "Hiểu bản chất trước, làm bài sau", body: "Mỗi dạng bài được dẫn từ khái niệm gốc, nên học sinh tự suy ra cách làm thay vì nhớ mẹo." },
  { title: "Đề bám sát cấu trúc đề thi", body: "Bài tập và đề thi thử được chọn theo cấu trúc đề tốt nghiệp THPT hiện hành." },
  { title: "Chữa bài kỹ sau mỗi buổi", body: "Lỗi sai được phân tích cụ thể, kèm lời giải để học sinh xem lại ở nhà." },
  { title: "Đồng hành đến khi vững", body: "Học sinh mất gốc vẫn theo được nếu giữ nhịp học đều, thầy cô điều chỉnh tốc độ theo từng em." },
];

const FEEDBACKS = [
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
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2";

const StepHead = ({ n, title, icon: Icon }: { n: number; title: string; icon?: any }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#0B1B3A] text-xs font-extrabold text-white">{n}</span>
    <h4 className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
      {Icon && <Icon className="h-4 w-4 text-slate-400" />} {title}
    </h4>
  </div>
);

/* ---------------- Đồ thị y = sin x trong hero (tính một lần) ---------------- */
const GX = 34; // lề trái của vùng vẽ
const GW = 292; // chiều rộng ứng với 0 → 2π
const GY = 120; // vị trí trục hoành
const GA = 78; // biên độ
const POINTS = Array.from({ length: 65 }, (_, i) => {
  const x = (i / 64) * 2 * Math.PI;
  return [GX + (x / (2 * Math.PI)) * GW, GY - Math.sin(x) * GA] as const;
});
const toPath = (pts: readonly (readonly [number, number])[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const CURVE = toPath(POINTS);
const AREA = `M${GX},${GY} ${toPath(POINTS.slice(0, 33)).replace(/^M/, "L")} L${GX + GW / 2},${GY} Z`;

const scrollToId = (id: string) => {
  // Dự án dùng HashRouter nên không dùng link neo "#...". Cuộn bằng code.
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
};

type ContactInfo = { phone: string; zalo: string; facebook: string; address: string; maps: string };
const isUrl = (s: string) => /^https?:\/\//i.test(s.trim());
// Chuỗi trông giống đường dẫn (có tên miền); "Apex Academy" thì không phải
const looksLikeUrl = (s: string) => /^(https?:\/\/)?[^\s/]+\.[^\s]{2,}/i.test(s.trim());
const withProtocol = (s: string) => (isUrl(s) ? s.trim() : `https://${s.trim()}`);

// Biến thông tin liên hệ thô thành các link và nhãn hiển thị
const buildContact = (c: ContactInfo) => {
  const digitsOf = (s: string) => s.replace(/[^\d+]/g, "");
  const phoneHref = c.phone.trim() ? `tel:${digitsOf(c.phone)}` : "";
  const zaloHref = c.zalo.trim() ? (isUrl(c.zalo) ? c.zalo.trim() : `https://zalo.me/${digitsOf(c.zalo).replace(/^\+?84/, "0")}`) : "";
  const facebookHref = looksLikeUrl(c.facebook) ? withProtocol(c.facebook) : "";
  const addressIsUrl = isUrl(c.address);
  const mapsHref = looksLikeUrl(c.maps) ? withProtocol(c.maps) : addressIsUrl ? c.address.trim() : "";
  const addressText = addressIsUrl ? "" : c.address.trim();
  const d = c.phone.replace(/\D/g, "");
  // "0868994242" → "0868 994 242"
  const phoneLabel = d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : c.phone.trim();
  return { phoneHref, zaloHref, facebookHref, mapsHref, addressText, phoneLabel, hasContact: !!(phoneHref || zaloHref || facebookHref || addressText || mapsHref) };
};

const FacebookIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);
const FOOT_LINK = "rounded transition-colors hover:text-[#0B1B3A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2";

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function ClassLandingPage() {
  const navigate = useNavigate();

  // State quản lý đăng nhập / đăng ký
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [showConsultModal, setShowConsultModal] = useState(false);
  const [isConsultSending, setIsConsultSending] = useState(false);

  // State quản lý Form tư vấn của học sinh
  const emptyForm = {
    fullName: "",
    email: "",
    dob: "",
    city: "",
    address: "",
    schoolName: "",
    schoolCity: "",
    grade: "",
    slots: [] as { day: string; startTime: string; endTime: string; }[]
  };
  const [studentForm, setStudentForm] = useState(emptyForm);

  // Thông tin liên hệ: lấy từ trang /lop-hoc đã đăng, mục nào thiếu thì dùng giá trị mặc định trong SITE.contact.
  // Nhờ vậy sửa liên hệ ở /lop-hoc (rồi bấm "Đăng trang") là trang Auth tự cập nhật theo.
  const [contact, setContact] = useState<ContactInfo>(SITE.contact);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await (supabase as any).from("public_pages").select("content").eq("slug", "lop-hoc").maybeSingle();
        const c = data?.content;
        if (!alive || !c || typeof c !== "object") return;
        const pick = (v: unknown, d: string) => (typeof v === "string" && v.trim() ? v : d);
        let address = pick(c.address, SITE.contact.address);
        let maps = pick(c.maps, "");
        if (isUrl(address)) {
          // Địa chỉ đang là link Google Maps: giữ link, dùng địa chỉ chữ mặc định để hiển thị
          if (!maps) maps = address;
          address = isUrl(SITE.contact.address) ? "" : SITE.contact.address;
        }
        setContact({
          phone: pick(c.phone, SITE.contact.phone),
          zalo: pick(c.zalo, SITE.contact.zalo),
          facebook: pick(c.facebook, SITE.contact.facebook),
          address,
          maps: maps || SITE.contact.maps,
        });
      } catch {
        /* dùng giá trị mặc định */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  const { phoneHref, zaloHref, facebookHref, mapsHref, addressText, phoneLabel, hasContact } = useMemo(() => buildContact(contact), [contact]);

  // Esc để đóng popup, khóa cuộn nền khi popup đang mở
  useEffect(() => {
    if (!showConsultModal && !showAuthModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowConsultModal(false);
        setShowAuthModal(false);
      }
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [showConsultModal, showAuthModal]);

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

  // Gửi form học thử: lưu vào bảng class_registrations để hiện ở trang "Đăng ký học" của giáo viên
  const handleConsultSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isConsultSending) return;
    const f = studentForm;
    if (!f.fullName.trim() || !f.email.trim() || !f.dob || !f.city || !f.schoolName.trim() || !f.schoolCity || !f.grade) {
      toast.error("Vui lòng điền đầy đủ các thông tin bắt buộc!");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) {
      toast.error("Email chưa đúng định dạng");
      return;
    }
    if (f.dob > todayStr()) {
      toast.error("Ngày sinh không hợp lệ");
      return;
    }

    const slotText = f.slots
      .map((s) => `${WEEK_DAYS.find((d) => d.key === s.day)?.label ?? s.day} ${s.startTime}–${s.endTime}`)
      .join("; ");

    setIsConsultSending(true);
    try {
      const { error } = await (supabase as any).from("class_registrations").insert({
        showcase_class_id: "trial",
        class_name: "Học thử và nhận đề thi",
        full_name: f.fullName.trim(),
        email: f.email.trim().toLowerCase(),
        birth_date: f.dob,
        province: f.city,
        address: f.address.trim() || null,
        school: f.schoolName.trim(),
        grade: f.grade,
        school_province: f.schoolCity,
        note: slotText ? `Lịch rảnh mong muốn: ${slotText}`.slice(0, 1000) : null,
      });
      if (error) throw error;
      toast.success("Đăng ký thành công! Thầy cô sẽ liên hệ qua Gmail sớm nhất.");
      setStudentForm(emptyForm);
      setShowConsultModal(false);
    } catch {
      toast.error("Chưa gửi được đăng ký. Bạn thử lại sau ít phút hoặc liên hệ trực tiếp với thầy cô.");
    } finally {
      setIsConsultSending(false);
    }
  };

  const openConsult = () => setShowConsultModal(true);

  return (
    <div className="min-h-screen w-full bg-slate-50 font-['Be_Vietnam_Pro',sans-serif] text-slate-900 antialiased selection:bg-[#0B1B3A] selection:text-white">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');
        @keyframes apex-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes apex-fill { from { opacity: 0; } to { opacity: 1; } }
        .apex-curve { stroke-dasharray: 1; animation: apex-draw 1.6s cubic-bezier(.4,0,.2,1) .3s both; }
        .apex-area { animation: apex-fill .8s ease-out 1.3s both; }
        @media (prefers-reduced-motion: reduce) { .apex-curve, .apex-area { animation: none; } }
      `}</style>

      {/* 1. THANH HEADER - Đẩy xuống tránh khuất bởi Dynamic Island / Tai thỏ */}
      <header
        className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/90 backdrop-blur-md"
        style={{
          paddingTop: "max(2.5rem, env(safe-area-inset-top))", // Tạo khoảng đệm tối thiểu ở mép trên
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className={`flex items-center gap-2.5 rounded-lg ${FOCUS}`}>
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0B1B3A] text-lg font-extrabold text-[#FFB547]">A</span>
            <span className="text-xl font-extrabold tracking-tight text-[#0B1B3A]">{SITE.brand}</span>
          </button>

          <nav className="hidden items-center gap-7 text-sm font-semibold text-slate-600 lg:flex">
            <button type="button" onClick={() => scrollToId("features")} className="transition-colors hover:text-[#0B1B3A]">Hệ thống học tập</button>
            <button type="button" onClick={() => scrollToId("classes")} className="transition-colors hover:text-[#0B1B3A]">Chương trình</button>
            <button type="button" onClick={() => scrollToId("workflow")} className="transition-colors hover:text-[#0B1B3A]">Lộ trình</button>
            <button type="button" onClick={() => scrollToId("teacher")} className="transition-colors hover:text-[#0B1B3A]">Giáo viên</button>
            <button type="button" onClick={() => scrollToId("feedbacks")} className="transition-colors hover:text-[#0B1B3A]">Cảm nhận</button>
            <Link to="/lop-hoc" className="transition-colors hover:text-[#0B1B3A]">Lịch và học phí</Link>
          </nav>

          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
              className="h-10 rounded-xl border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Đăng nhập
            </Button>
            <Button onClick={openConsult} className={`h-10 rounded-xl px-5 text-sm font-bold ${PRIMARY}`}>
              Đăng ký
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* 2. HERO */}
        <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
          <div className="relative grid items-center gap-10 overflow-hidden rounded-[2rem] bg-[#0B1B3A] px-6 py-12 sm:px-12 sm:py-16 lg:grid-cols-12">
            <div className="pointer-events-none absolute -right-24 -top-28 h-96 w-96 rounded-full bg-[#FFB547]" aria-hidden />
            <div className="pointer-events-none absolute -bottom-36 left-1/3 hidden h-72 w-72 rounded-full border-[48px] border-white/[0.06] lg:block" aria-hidden />

            <div className="relative space-y-6 text-center lg:col-span-7 lg:text-left">
              <p className="text-sm font-semibold text-white/60">Lớp Toán THPT, học trực tuyến</p>
              <h1 className="text-4xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-6xl">
                Học Toán tư duy, làm chủ điểm 9, 10
              </h1>
              <p className="mx-auto max-w-xl text-base font-medium leading-relaxed text-white/70 sm:text-lg lg:mx-0">
                Không học vẹt, không học mẹo. Lớp học trực tuyến giúp học sinh rèn tư duy sâu và nắm bản chất cấu trúc đề thi, để bứt phá thứ hạng trên lớp.
              </p>
              <div className="flex flex-col items-center gap-3 pt-2 sm:flex-row lg:justify-start">
                <Button
                  onClick={openConsult}
                  className="h-14 w-full rounded-2xl bg-[#FFB547] px-8 text-base font-bold text-[#0B1B3A] shadow-lg hover:bg-[#ffc266] sm:w-auto"
                >
                  Đăng ký học thử
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-14 w-full rounded-2xl border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  <Link to="/lop-hoc">Xem lịch và học phí</Link>
                </Button>
              </div>
              <dl className="flex justify-center gap-10 pt-4 lg:justify-start">
                {SITE.stats.map((s) => (
                  <div key={s.label} className="text-left">
                    <dd className="text-2xl font-extrabold text-white">{s.value}</dd>
                    <dt className="text-xs text-white/60">{s.label}</dt>
                  </div>
                ))}
              </dl>
            </div>

            {/* Đồ thị y = sin x: diện tích dưới đường cong từ 0 đến π */}
            <div className="relative flex justify-center lg:col-span-5">
              <figure className="w-full max-w-[400px] rounded-3xl bg-white p-5 shadow-2xl">
                <svg viewBox="0 0 360 240" role="img" aria-label="Đồ thị hàm số y bằng sin x, phần diện tích từ 0 đến π được tô màu" className="block h-auto w-full">
                  {Array.from({ length: 9 }, (_, k) => (
                    <line key={`v${k}`} x1={GX + (k * GW) / 8} x2={GX + (k * GW) / 8} y1={GY - GA - 14} y2={GY + GA + 14} stroke="#E2E8F0" strokeWidth="1" />
                  ))}
                  {[-GA, -GA / 2, GA / 2, GA].map((dy) => (
                    <line key={dy} x1={GX} x2={GX + GW} y1={GY + dy} y2={GY + dy} stroke="#E2E8F0" strokeWidth="1" />
                  ))}
                  <path className="apex-area" d={AREA} fill="#FFB547" fillOpacity="0.4" />
                  <line x1={GX - 14} x2={GX + GW + 16} y1={GY} y2={GY} stroke="#0B1B3A" strokeWidth="1.5" />
                  <line x1={GX} x2={GX} y1={GY - GA - 18} y2={GY + GA + 18} stroke="#0B1B3A" strokeWidth="1.5" />
                  <path className="apex-curve" d={CURVE} pathLength={1} fill="none" stroke="#0B1B3A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1={GX + GW / 2} x2={GX + GW / 2} y1={GY - 6} y2={GY + 6} stroke="#0B1B3A" strokeWidth="1.5" />
                  <g fontSize="12" fill="#64748B" fontStyle="italic" fontFamily="Georgia, 'Times New Roman', serif">
                    <text x={GX - 12} y={GY + 16}>O</text>
                    <text x={GX + GW / 2 - 4} y={GY + 22}>π</text>
                    <text x={GX + GW - 8} y={GY + 22}>2π</text>
                    <text x={GX - 18} y={GY - GA + 4}>1</text>
                    <text x={GX - 24} y={GY + GA + 4}>−1</text>
                    <text x={GX + GW - 40} y={GY - GA - 4} fill="#0B1B3A" fontWeight="bold">y = sin x</text>
                  </g>
                </svg>
                <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-slate-100 pt-3">
                  <span className="font-serif text-xl italic text-[#0B1B3A]">
                    ∫<sub className="text-xs not-italic">0</sub>
                    <sup className="text-xs not-italic">π</sup> sin x dx = 2
                  </span>
                  <span className="text-sm text-slate-500">Diện tích dưới đường cong bằng 2</span>
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* 3. HỆ THỐNG HỌC TẬP */}
        <section id="features" className="mx-auto grid max-w-7xl scroll-mt-28 gap-10 px-4 pt-24 sm:px-6 md:grid-cols-12 md:gap-14 lg:px-8">
          <div className="md:col-span-4">
            <div className="md:sticky md:top-32">
              <h2 className="text-3xl font-extrabold leading-tight tracking-tight text-slate-950">Mọi thứ cho việc học nằm trong một tài khoản</h2>
              <p className="mt-3 max-w-sm text-base leading-relaxed text-slate-500">
                Học sinh vào lớp, làm bài, xem lịch và theo dõi học phí ngay trên cùng một nền tảng.
              </p>
            </div>
          </div>
          <ul className="divide-y divide-slate-200 border-y border-slate-200 md:col-span-8">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-5 py-7">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#0B1B3A] text-[#FFB547]">
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{f.title}</h3>
                  <p className="mt-1 max-w-lg text-sm leading-relaxed text-slate-600">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. CHƯƠNG TRÌNH BA KHỐI THPT */}
        <section id="classes" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Chương trình Toán ba khối THPT</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-500">
              Nội dung bám sát chương trình Toán lớp 10, 11 và 12. Lịch học và học phí các lớp đang mở có ở trang Lịch và học phí.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {GRADES.map((g) => (
              <article key={g.grade} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 pl-8 sm:p-8 sm:pl-10">
                <span className="absolute inset-y-0 left-0 w-2" style={{ background: g.color }} aria-hidden />
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-3xl font-extrabold tracking-tight text-slate-900">Lớp {g.grade}</h3>
                  <span className="rounded-md px-2.5 py-1 text-xs font-semibold" style={{ background: g.tint, color: g.ink }}>{g.title}</span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{g.goal}</p>

                <h4 className="mt-6 text-sm font-bold text-slate-900">Nội dung trọng tâm</h4>
                <ul className="mt-3 space-y-2">
                  {g.topics.map((t) => (
                    <li key={t} className="flex items-start gap-2.5 text-sm leading-snug text-slate-700">
                      <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: g.color }} aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={openConsult} className={`h-12 rounded-xl px-6 text-sm font-bold ${PRIMARY}`}>
              Đăng ký học thử
            </Button>
            <Button asChild variant="outline" className="h-12 rounded-xl border-slate-300 px-6 text-sm font-semibold text-slate-800 hover:bg-slate-50">
              <Link to="/lop-hoc">Xem lịch và học phí</Link>
            </Button>
          </div>
        </section>

        {/* 5. LỘ TRÌNH 3 BƯỚC */}
        <section id="workflow" className="relative mt-24 scroll-mt-28 overflow-hidden py-4">
          <div className="pointer-events-none absolute -left-32 -top-24 h-80 w-80 rounded-full bg-blue-100/70 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -right-28 bottom-0 h-80 w-80 rounded-full bg-violet-100/70 blur-3xl" aria-hidden />

          <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="relative mx-auto max-w-2xl text-center">
              <span className="mx-auto block h-1 w-24 rounded-full bg-gradient-to-r from-blue-500 to-violet-500" aria-hidden />
              <svg className="pointer-events-none absolute -left-4 top-9 hidden h-11 w-11 md:block" viewBox="0 0 44 44" fill="none" aria-hidden>
                <path d="M4 32l16-4M15 8l9 14" stroke="#3B82F6" strokeWidth="4" strokeLinecap="round" />
              </svg>
              <h2 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
                Lộ trình học{" "}
                <span className="bg-gradient-to-r from-blue-500 to-violet-600 bg-clip-text text-transparent">cá nhân hóa</span>
              </h2>
              <p className="mt-4 text-base leading-relaxed text-slate-500 sm:text-lg">
                Ba bước giúp học sinh từ mất gốc đến đạt điểm số mong muốn nhanh nhất.
              </p>
            </div>

            <ol className="mt-14 grid gap-6 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:gap-4">
              {STEPS.flatMap((st, i) => [
                <li
                  key={st.n}
                  className="group relative overflow-hidden rounded-[1.75rem] border border-white bg-white/80 p-6 shadow-[0_24px_50px_-26px_rgba(15,23,42,0.3)] ring-1 ring-slate-900/5 backdrop-blur motion-safe:transition-transform motion-safe:duration-300 motion-safe:hover:-translate-y-1 sm:p-7"
                >
                  <span className="pointer-events-none absolute -bottom-14 -right-14 h-40 w-40 rounded-full opacity-80" style={{ background: st.tint }} aria-hidden />
                  <div className="relative flex items-start justify-between gap-4">
                    <span
                      className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white"
                      style={{ background: `linear-gradient(135deg, ${st.from}, ${st.to})`, boxShadow: `0 14px 26px -12px ${st.to}` }}
                    >
                      {st.n}
                    </span>
                    <st.Art className="h-20 w-24 shrink-0 motion-safe:transition-transform motion-safe:duration-300 motion-safe:group-hover:scale-105" />
                  </div>
                  <h3 className="relative mt-6 text-lg font-bold text-slate-900">{st.title}</h3>
                  <p className="relative mt-2 text-sm leading-relaxed text-slate-600">{st.body}</p>
                </li>,
                i < STEPS.length - 1 && (
                  <li key={`arrow-${i}`} aria-hidden="true" className="hidden items-center md:flex">
                    <ArrowRight className="h-6 w-6 text-slate-300" />
                  </li>
                ),
              ])}
            </ol>
          </div>
        </section>

        {/* 6. GIÁO VIÊN */}
        <section id="teacher" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-24 sm:px-6 lg:px-8">
          <div className="grid gap-10 overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 sm:p-10 lg:grid-cols-12 lg:gap-14">
            <div className="lg:col-span-4">
              {SITE.teacher.photo ? (
                <img src={SITE.teacher.photo} alt={SITE.teacher.name || "Giáo viên"} className="aspect-[4/5] w-full rounded-3xl object-cover" />
              ) : (
                <div className="relative grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-3xl bg-[#0B1B3A]" aria-hidden>
                  <div className="absolute -bottom-16 -right-16 h-56 w-56 rounded-full bg-[#FFB547]" />
                  <span className="relative font-serif text-[9rem] italic leading-none text-white">∫</span>
                </div>
              )}
              {(SITE.teacher.name || SITE.teacher.role) && (
                <div className="mt-4">
                  {SITE.teacher.name && <p className="text-lg font-extrabold text-slate-900">{SITE.teacher.name}</p>}
                  <p className="text-sm text-slate-500">{SITE.teacher.role}</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-8">
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Dạy để học sinh tự nghĩ ra cách làm</h2>
              <div className="mt-4 max-w-2xl space-y-4 text-base leading-relaxed text-slate-600">
                <p>
                  Với thầy, học Toán không phải là nhớ thật nhiều công thức. Một bài toán khó sẽ dễ lại khi học sinh nhìn ra được bản chất của nó, và sự tự tin đến từ đó.
                </p>
                <p>
                  Lớp học nhỏ, tốc độ điều chỉnh theo từng em. Học sinh mất gốc hay đang ở mức khá đều có chỗ để tiến bộ, miễn là giữ nhịp học đều đặn.
                </p>
              </div>

              <ul className="mt-8 divide-y divide-slate-200 border-y border-slate-200">
                {PILLARS.map((p) => (
                  <li key={p.title} className="grid gap-1 py-4 sm:grid-cols-[15rem_1fr] sm:gap-6">
                    <h3 className="text-sm font-bold text-slate-900">{p.title}</h3>
                    <p className="text-sm leading-relaxed text-slate-600">{p.body}</p>
                  </li>
                ))}
              </ul>

              {(phoneHref || zaloHref || facebookHref) && (
                <div className="mt-6 flex flex-wrap gap-3">
                  {phoneHref && (
                    <a href={phoneHref} className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS}`}>
                      <Phone className="h-4 w-4" aria-hidden /> Gọi {phoneLabel}
                    </a>
                  )}
                  {zaloHref && (
                    <a href={zaloHref} target="_blank" rel="noreferrer" className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS}`}>
                      <MessageCircle className="h-4 w-4" aria-hidden /> Nhắn Zalo
                    </a>
                  )}
                  {facebookHref && (
                    <a href={facebookHref} target="_blank" rel="noreferrer" className={`inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 ${FOCUS}`}>
                      <FacebookIcon className="h-4 w-4" /> Facebook
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 7. CẢM NHẬN */}
        <section id="feedbacks" className="mx-auto max-w-7xl scroll-mt-28 px-4 pt-24 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-950">Học sinh nói gì về lớp</h2>
          </div>
          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
            {FEEDBACKS.map((f) => {
              const color = resolveStudentColor(null, f.name);
              return (
                <figure key={f.name} className="relative space-y-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 pl-8">
                  <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: color }} aria-hidden />
                  <blockquote className="text-base leading-relaxed text-slate-700">"{f.quote}"</blockquote>
                  <figcaption className="flex items-center gap-3 border-t border-slate-100 pt-4">
                    <div className={`h-10 w-10 shrink-0 rounded-xl text-sm ${BUBBLE}`} style={{ background: color }}>{f.initials}</div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">{f.name}</h3>
                      <span className="text-xs text-slate-500">{f.role}</span>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>

        {/* 8. KÊU GỌI HÀNH ĐỘNG */}
        <section className="mx-auto max-w-7xl px-4 pb-24 pt-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[2rem] bg-[#0B1B3A] px-6 py-14 text-center sm:px-12">
            <div className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#FFB547]" aria-hidden />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Bắt đầu bằng một buổi học thử</h2>
              <p className="mt-3 text-base leading-relaxed text-white/70">
                Điền form ngắn, thầy cô sẽ liên hệ qua Gmail để xếp lớp và gửi đề thi cho bạn.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button onClick={openConsult} className="h-14 w-full rounded-2xl bg-[#FFB547] px-8 text-base font-bold text-[#0B1B3A] hover:bg-[#ffc266] sm:w-auto">
                  Đăng ký học thử
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
                  className="h-14 w-full rounded-2xl border-white/30 bg-transparent px-7 text-base font-bold text-white hover:bg-white/10 hover:text-white sm:w-auto"
                >
                  Đăng nhập học viên
                </Button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 9. FOOTER */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] md:gap-12 lg:px-8">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#0B1B3A] text-lg font-extrabold text-[#FFB547]">A</span>
              <span className="text-lg font-extrabold tracking-tight text-[#0B1B3A]">{SITE.brand}</span>
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
              Lớp Toán THPT, rèn tư duy bản chất và luyện đề theo cấu trúc đề thi. Đồng hành cùng học sinh lớp 10, 11 và 12.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">Thông tin liên hệ</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
              {phoneHref && (
                <li>
                  <a href={phoneHref} className={`inline-flex items-center gap-2.5 ${FOOT_LINK}`}>
                    <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> {phoneLabel}
                  </a>
                </li>
              )}
              {zaloHref && (
                <li>
                  <a href={zaloHref} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2.5 ${FOOT_LINK}`}>
                    <MessageCircle className="h-4 w-4 shrink-0 text-slate-400" aria-hidden /> Nhắn Zalo
                  </a>
                </li>
              )}
              {facebookHref && (
                <li>
                  <a href={facebookHref} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2.5 ${FOOT_LINK}`}>
                    <FacebookIcon className="h-4 w-4 shrink-0 text-slate-400" /> Facebook
                  </a>
                </li>
              )}
              {(addressText || mapsHref) && (
                <li>
                  {mapsHref ? (
                    <a
                      href={mapsHref}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${addressText || "Địa chỉ lớp"}, mở Google Maps`}
                      className={`inline-flex items-start gap-2.5 ${FOOT_LINK}`}
                    >
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /> {addressText || "Xem trên Google Maps"}
                    </a>
                  ) : (
                    <span className="inline-flex items-start gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden /> {addressText}
                    </span>
                  )}
                </li>
              )}
              {!hasContact && <li className="text-slate-500">Liên hệ qua form đăng ký học thử ở trên.</li>}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-900">Liên kết nhanh</h3>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
              <li><button type="button" onClick={() => scrollToId("classes")} className={FOOT_LINK}>Chương trình</button></li>
              <li><button type="button" onClick={() => scrollToId("workflow")} className={FOOT_LINK}>Lộ trình học</button></li>
              <li><button type="button" onClick={() => scrollToId("teacher")} className={FOOT_LINK}>Giáo viên</button></li>
              <li><Link to="/lop-hoc" className={FOOT_LINK}>Lịch và học phí</Link></li>
              <li><button type="button" onClick={() => { setAuthMode("login"); setShowAuthModal(true); }} className={FOOT_LINK}>Đăng nhập học viên</button></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100">
          <p className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
            © {new Date().getFullYear()} {SITE.brand}{addressText && `. ${addressText}`}.
          </p>
        </div>
      </footer>

      {/* POPUP ĐĂNG KÝ HỌC THỬ */}
      {showConsultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowConsultModal(false); }}>
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
                      <Input type="date" max={todayStr()} className={FIELD} value={studentForm.dob} onChange={e => setStudentForm({ ...studentForm, dob: e.target.value })} />
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

                <Button type="submit" disabled={isConsultSending} className={`group flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold ${PRIMARY}`}>
                  {isConsultSending ? "Đang gửi..." : "Gửi đăng ký nhập học thử"}
                  {!isConsultSending && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* POPUP ĐĂNG NHẬP / ĐĂNG KÝ HỆ THỐNG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
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
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
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