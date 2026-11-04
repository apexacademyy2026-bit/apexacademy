import { useEffect, useMemo, useState, type CSSProperties } from "react";
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
  GraduationCap,
  ArrowUpRight,
  CheckCircle2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { resolveStudentColor } from "@/lib/studentColor";
import { cn } from "@/lib/utils";

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

const STEPS = [
  { n: "1", title: "Đánh giá năng lực đầu vào", body: "Học sinh làm bài test chuẩn hóa để thầy cô nắm chính xác phần kiến thức đang bị hổng." },
  { n: "2", title: "Học trực tuyến và chữa bài tập", body: "Tham gia lớp Live tương tác, có video xem lại và kho lời giải bài tập chi tiết dùng bất cứ lúc nào." },
  { n: "3", title: "Thi thử và tối ưu điểm số", body: "Luyện liên tục với đề thi thử đúng cấu trúc của Bộ Giáo dục, làm quen áp lực phòng thi." },
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

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG (cùng hệ với trang Dashboard) ----------------
   Bảng màu: mực navy #0B1B3A · nền trắng đặc · viền zinc mảnh · nhấn hổ phách #FFB547 (chỉ trên nền navy).
   Thẻ phẳng, không đổ bóng. Chip, nút chuyển và ô chọn nhỏ bo tròn hết cỡ. Mảng navy đặc chỉ dùng cho hero.
   Thẻ nền trắng đặc nên vẫn đọc tốt nếu sau này trang có hình nền. */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const CARD_HOVER = "transition-colors hover:border-zinc-400/60";
const CHIP = "inline-flex h-9 items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700";
const CHIP_BTN = `${CHIP} transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30`;
const EYEBROW = "inline-flex h-8 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-600";
const DARK_CHIP = "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 text-xs font-medium text-white/80";
const NAV_LINK = "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30";
// Thanh chuyển hai trạng thái (Đăng nhập / Đăng ký), cùng kiểu với bộ lọc thời gian ở Dashboard
const SEG = "flex w-full gap-0.5 rounded-full bg-zinc-100 p-1";
const segBtn = (active: boolean) =>
  cn(
    "h-9 flex-1 rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
    active ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-900"
  );
// Nút chọn một trong nhiều (khối lớp)
const pillBtn = (active: boolean) =>
  cn(
    "h-9 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
    active ? "border-[#0B1B3A] bg-[#0B1B3A] text-white" : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
  );
const SECTION = "mx-auto max-w-7xl scroll-mt-28 px-4 pt-20 sm:px-6 sm:pt-24 lg:px-8";
const BLOCK = "space-y-4 rounded-2xl border border-zinc-200 p-4 sm:p-5";
const FIELD = "h-11 rounded-xl border-zinc-200 bg-white text-sm shadow-none focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10";
const SELECT = "h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm focus:border-[#0B1B3A] focus:outline-none focus:ring-2 focus:ring-[#0B1B3A]/10";
const LABEL = "text-sm font-medium text-zinc-700";
const PRIMARY = "bg-[#0B1B3A] text-white shadow-none hover:bg-[#13285a]";
const OUTLINE = "border-zinc-200 bg-white text-zinc-700 shadow-none hover:bg-zinc-50";
const CLOSE = "absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2";
const MODAL = "relative w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl animate-scale-up";
const H2 = "text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl";
const ICON_TILE = "grid shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700";

// Các mục trên thanh điều hướng (cuộn tới phần tương ứng)
const NAV = [
  { id: "features", label: "Hệ thống học tập" },
  { id: "classes", label: "Chương trình" },
  { id: "workflow", label: "Lộ trình" },
  { id: "teacher", label: "Giáo viên" },
  { id: "feedbacks", label: "Cảm nhận" },
];
// Biểu tượng cho các thẻ số liệu ở đầu trang (theo thứ tự SITE.stats)
const STAT_ICONS = [Users, CheckCircle2, GraduationCap, Receipt];
// Khối lớp trong form học thử. Giá trị lưu giữ nguyên như bản chọn trong danh sách cũ.
const GRADE_OPTIONS = [
  ...[6, 7, 8, 9, 10, 11, 12].map((n) => ({ value: `Lớp ${n}`, label: `Lớp ${n}` })),
  { value: "Luyện thi Đại học", label: "Ôn thi Đại học / Khác" },
];

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền bất kỳ
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

// Đầu mỗi bước trong form: số thứ tự + tiêu đề
const StepHead = ({ n, title, icon: Icon }: { n: number; title: string; icon?: any }) => (
  <div className="flex items-center gap-2.5">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#0B1B3A] text-xs font-semibold text-white">{n}</span>
    <h4 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900">
      {Icon && <Icon className="h-4 w-4 text-zinc-400" />} {title}
    </h4>
  </div>
);

// Đầu mỗi phần của trang: nhãn nhỏ có icon, tiêu đề, mô tả
const SectionHead = ({ icon: Icon, eyebrow, title, body }: { icon: any; eyebrow: string; title: string; body?: string }) => (
  <div className="max-w-2xl">
    <span className={EYEBROW}>
      <Icon className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> {eyebrow}
    </span>
    <h2 className={`${H2} mt-4`}>{title}</h2>
    {body && <p className="mt-3 text-base leading-relaxed text-zinc-500">{body}</p>}
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
    <div className={cn("relative isolate min-h-screen w-full bg-zinc-50 text-zinc-900 antialiased selection:bg-[#0B1B3A] selection:text-white", FONT)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');
        @keyframes apex-draw { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
        @keyframes apex-fill { from { opacity: 0; } to { opacity: 1; } }
        .apex-curve { stroke-dasharray: 1; animation: apex-draw 1.6s cubic-bezier(.4,0,.2,1) .3s both; }
        .apex-area { animation: apex-fill .8s ease-out 1.3s both; }
        /* Giấy kẻ ô mờ ở đầu trang, gợi hệ trục tọa độ, tan dần xuống dưới */
        .apex-grid {
          background-image:
            linear-gradient(to right, rgb(24 24 27 / .055) 1px, transparent 1px),
            linear-gradient(to bottom, rgb(24 24 27 / .055) 1px, transparent 1px);
          background-size: 40px 40px;
          -webkit-mask-image: radial-gradient(ellipse 75% 100% at 50% 0%, #000 35%, transparent 78%);
          mask-image: radial-gradient(ellipse 75% 100% at 50% 0%, #000 35%, transparent 78%);
        }
        /* Khoảng đệm phía trên thanh header: trên điện thoại giữ tối thiểu 2.5rem để không bị tai thỏ / Dynamic Island che */
        .apex-safe-top { padding-top: max(0.75rem, env(safe-area-inset-top)); }
        @media (max-width: 767px) { .apex-safe-top { padding-top: max(2.5rem, env(safe-area-inset-top)); } }
        @media (prefers-reduced-motion: reduce) { .apex-curve, .apex-area { animation: none; } }
      `}</style>

      <div aria-hidden className="apex-grid pointer-events-none absolute inset-x-0 top-0 -z-10 h-[36rem]" />

      {/* 1. HEADER: thanh nổi bo tròn, nền trắng mờ */}
      <header className="apex-safe-top sticky top-0 z-40 w-full px-3 pb-2 sm:px-4">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 rounded-full border border-zinc-200 bg-white/90 px-2 backdrop-blur-md sm:pl-3">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className={cn("flex items-center gap-2.5 rounded-full py-1 pr-2", FOCUS)}
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0B1B3A] text-base font-semibold text-[#FFB547]">A</span>
            <span className="hidden text-base font-semibold tracking-tight text-zinc-900 min-[420px]:inline">{SITE.brand}</span>
          </button>

          <nav className="hidden items-center gap-0.5 lg:flex">
            {NAV.map((n) => (
              <button key={n.id} type="button" onClick={() => scrollToId(n.id)} className={NAV_LINK}>
                {n.label}
              </button>
            ))}
            <Link to="/lop-hoc" className={NAV_LINK}>Lịch và học phí</Link>
          </nav>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
              className={cn("h-10 rounded-full px-4 text-sm font-semibold", OUTLINE)}
            >
              Đăng nhập
            </Button>
            <Button onClick={openConsult} className={cn("h-10 rounded-full px-4 text-sm font-semibold", PRIMARY)}>
              Đăng ký
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* 2. HERO: khối navy duy nhất của trang + thẻ đồ thị + ba thẻ số liệu */}
        <section className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="grid gap-4 lg:grid-cols-12">
            <div className="relative flex flex-col justify-center overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-12 sm:px-10 sm:py-14 lg:col-span-7 lg:px-12 lg:py-16">
              <span
                aria-hidden
                className="pointer-events-none absolute -bottom-24 -right-4 hidden select-none font-serif text-[22rem] italic leading-none text-white/[0.04] sm:block"
              >
                ∫
              </span>
              <div className="relative space-y-6">
                <span className={DARK_CHIP}>Lớp Toán THPT, học trực tuyến</span>
                <h1 className="max-w-2xl text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl">
                  Học Toán tư duy, làm chủ điểm 9, 10
                </h1>
                <p className="max-w-xl text-base leading-relaxed text-white/70 sm:text-lg">
                  Không học vẹt, không học mẹo. Lớp học trực tuyến giúp học sinh rèn tư duy sâu và nắm bản chất cấu trúc đề thi, để bứt phá thứ hạng trên lớp.
                </p>
                <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                  <Button
                    onClick={openConsult}
                    className="h-12 w-full rounded-full bg-[#FFB547] px-7 text-base font-semibold text-[#0B1B3A] shadow-none hover:bg-[#ffc266] sm:w-auto"
                  >
                    Đăng ký học thử
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    className="h-12 w-full rounded-full border-white/25 bg-transparent px-6 text-base font-semibold text-white shadow-none hover:bg-white/10 hover:text-white sm:w-auto"
                  >
                    <Link to="/lop-hoc">Xem lịch và học phí</Link>
                  </Button>
                </div>
                <ul className="flex flex-wrap gap-2 pt-2">
                  {[`Lớp ${GRADES.map((g) => g.grade).join(", ")}`, "Học trực tuyến", "Có video xem lại"].map((c) => (
                    <li key={c} className={DARK_CHIP}>
                      <Check className="h-3.5 w-3.5 text-[#FFB547]" aria-hidden /> {c}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Đồ thị y = sin x: diện tích dưới đường cong từ 0 đến π */}
            <figure className={cn(CARD, "flex flex-col justify-center p-5 sm:p-7 lg:col-span-5")}>
              <svg viewBox="0 0 360 240" role="img" aria-label="Đồ thị hàm số y bằng sin x, phần diện tích từ 0 đến π được tô màu" className="mx-auto block h-auto w-full max-w-[440px]">
                {Array.from({ length: 9 }, (_, k) => (
                  <line key={`v${k}`} x1={GX + (k * GW) / 8} x2={GX + (k * GW) / 8} y1={GY - GA - 14} y2={GY + GA + 14} stroke="#E4E4E7" strokeWidth="1" />
                ))}
                {[-GA, -GA / 2, GA / 2, GA].map((dy) => (
                  <line key={dy} x1={GX} x2={GX + GW} y1={GY + dy} y2={GY + dy} stroke="#E4E4E7" strokeWidth="1" />
                ))}
                <path className="apex-area" d={AREA} fill="#FFB547" fillOpacity="0.4" />
                <line x1={GX - 14} x2={GX + GW + 16} y1={GY} y2={GY} stroke="#0B1B3A" strokeWidth="1.5" />
                <line x1={GX} x2={GX} y1={GY - GA - 18} y2={GY + GA + 18} stroke="#0B1B3A" strokeWidth="1.5" />
                <path className="apex-curve" d={CURVE} pathLength={1} fill="none" stroke="#0B1B3A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <line x1={GX + GW / 2} x2={GX + GW / 2} y1={GY - 6} y2={GY + 6} stroke="#0B1B3A" strokeWidth="1.5" />
                <g fontSize="12" fill="#71717A" fontStyle="italic" fontFamily="Georgia, 'Times New Roman', serif">
                  <text x={GX - 12} y={GY + 16}>O</text>
                  <text x={GX + GW / 2 - 4} y={GY + 22}>π</text>
                  <text x={GX + GW - 8} y={GY + 22}>2π</text>
                  <text x={GX - 18} y={GY - GA + 4}>1</text>
                  <text x={GX - 24} y={GY + GA + 4}>−1</text>
                  <text x={GX + GW - 40} y={GY - GA - 4} fill="#0B1B3A" fontWeight="bold">y = sin x</text>
                </g>
              </svg>
              <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-zinc-100 pt-4">
                <span className="font-serif text-xl italic text-[#0B1B3A]">
                  ∫<sub className="text-xs not-italic">0</sub>
                  <sup className="text-xs not-italic">π</sup> sin x dx = 2
                </span>
                <span className="text-sm text-zinc-500">Diện tích dưới đường cong bằng 2</span>
              </figcaption>
            </figure>
          </div>

          {/* Thẻ số liệu: cùng kiểu thẻ số liệu của Dashboard */}
          <div className="mt-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(14rem, 1fr))" }}>
            {SITE.stats.map((s, i) => {
              const Icon = STAT_ICONS[i % STAT_ICONS.length];
              return (
                <dl key={s.label} className={cn(CARD, "flex flex-col justify-between gap-6 p-5 sm:p-6")}>
                  <dt className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-500">
                    {s.label}
                    <Icon className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                  </dt>
                  <dd className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-900">{s.value}</dd>
                </dl>
              );
            })}
            <Link to="/lop-hoc" className={cn("group block rounded-2xl", FOCUS)}>
              <div className={cn(CARD, CARD_HOVER, "flex h-full flex-col justify-between gap-6 p-5 sm:p-6")}>
                <div className="flex items-center justify-between gap-3 text-sm font-medium text-zinc-500">
                  Lịch và học phí
                  <CalendarDays className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-2xl font-semibold leading-9 tracking-tight text-zinc-900">Xem các lớp đang mở</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-900" aria-hidden />
                </div>
              </div>
            </Link>
          </div>
        </section>

        {/* 3. HỆ THỐNG HỌC TẬP */}
        <section id="features" className={SECTION}>
          <SectionHead
            icon={Video}
            eyebrow="Hệ thống học tập"
            title="Mọi thứ cho việc học nằm trong một tài khoản"
            body="Học sinh vào lớp, làm bài, xem lịch và theo dõi học phí ngay trên cùng một nền tảng."
          />
          <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <li key={f.title} className={cn(CARD, CARD_HOVER, "flex flex-col gap-5 p-6")}>
                <span className={cn(ICON_TILE, "h-11 w-11")}>
                  <f.icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 className="text-base font-semibold text-zinc-900">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* 4. CHƯƠNG TRÌNH BA KHỐI THPT */}
        <section id="classes" className={SECTION}>
          <SectionHead
            icon={GraduationCap}
            eyebrow="Chương trình"
            title="Chương trình Toán ba khối THPT"
            body="Nội dung bám sát chương trình Toán lớp 10, 11 và 12. Lịch học và học phí các lớp đang mở có ở trang Lịch và học phí."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {GRADES.map((g) => (
              <article key={g.grade} className={cn(CARD, CARD_HOVER, "overflow-hidden")}>
                <div className="flex items-center gap-3.5 px-6 py-5 sm:px-7" style={{ background: g.tint }}>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl text-lg font-semibold tabular-nums" style={solid(g.color)}>
                    {g.grade}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-xl font-semibold tracking-tight" style={{ color: g.ink }}>Lớp {g.grade}</h3>
                    <p className="text-sm font-medium" style={{ color: g.ink }}>{g.title}</p>
                  </div>
                </div>

                <div className="p-6 sm:p-7">
                  <p className="text-sm leading-relaxed text-zinc-500">{g.goal}</p>

                  <h4 className="mt-6 text-sm font-semibold text-zinc-900">Nội dung trọng tâm</h4>
                  <ul className="mt-3 space-y-2">
                    {g.topics.map((t) => (
                      <li key={t} className="flex items-start gap-2.5 text-sm leading-snug text-zinc-700">
                        <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: g.color }} aria-hidden />
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button onClick={openConsult} className={cn("h-11 rounded-full px-6 text-sm font-semibold", PRIMARY)}>
              Đăng ký học thử
            </Button>
            <Button asChild variant="outline" className={cn("h-11 rounded-full px-6 text-sm font-semibold", OUTLINE)}>
              <Link to="/lop-hoc">Xem lịch và học phí</Link>
            </Button>
          </div>
        </section>

        {/* 5. LỘ TRÌNH 3 BƯỚC */}
        <section id="workflow" className={SECTION}>
          <SectionHead
            icon={CalendarDays}
            eyebrow="Lộ trình"
            title="Lộ trình học cá nhân hóa"
            body="Ba bước giúp học sinh từ mất gốc đến đạt điểm số mong muốn nhanh nhất."
          />

          <ol className="mt-10 grid gap-4 md:grid-cols-3">
            {STEPS.map((st, i) => (
              <li key={st.n} className={cn(CARD, CARD_HOVER, "flex flex-col gap-5 p-6 sm:p-7")}>
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-full bg-[#0B1B3A] text-sm font-semibold text-[#FFB547]">{st.n}</span>
                  <span className="flex gap-1" aria-hidden>
                    {STEPS.map((_, k) => (
                      <span key={k} className={cn("h-1.5 w-8 rounded-full", k <= i ? "bg-[#0B1B3A]" : "bg-zinc-200")} />
                    ))}
                  </span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-zinc-900">{st.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-500">{st.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 6. GIÁO VIÊN */}
        <section id="teacher" className={SECTION}>
          <div className={cn(CARD, "grid gap-8 overflow-hidden p-5 sm:p-8 lg:grid-cols-12 lg:gap-12")}>
            <div className="lg:col-span-4">
              {SITE.teacher.photo ? (
                <img src={SITE.teacher.photo} alt={SITE.teacher.name || "Giáo viên"} className="aspect-[4/5] w-full rounded-2xl object-cover" />
              ) : (
                <div className="grid aspect-[4/5] w-full place-items-center overflow-hidden rounded-2xl bg-zinc-100" aria-hidden>
                  <span className="font-serif text-[9rem] italic leading-none text-zinc-300">∫</span>
                </div>
              )}
              {(SITE.teacher.name || SITE.teacher.role) && (
                <div className="mt-4">
                  {SITE.teacher.name && <p className="text-lg font-semibold text-zinc-900">{SITE.teacher.name}</p>}
                  <p className="text-sm text-zinc-500">{SITE.teacher.role}</p>
                </div>
              )}
            </div>

            <div className="lg:col-span-8">
              <span className={EYEBROW}>
                <Users className="h-3.5 w-3.5 text-zinc-400" aria-hidden /> Giáo viên
              </span>
              <h2 className={`${H2} mt-4`}>Dạy để học sinh tự nghĩ ra cách làm</h2>
              <div className="mt-4 max-w-2xl space-y-4 text-base leading-relaxed text-zinc-500">
                <p>
                  Với thầy, học Toán không phải là nhớ thật nhiều công thức. Một bài toán khó sẽ dễ lại khi học sinh nhìn ra được bản chất của nó, và sự tự tin đến từ đó.
                </p>
                <p>
                  Lớp học nhỏ, tốc độ điều chỉnh theo từng em. Học sinh mất gốc hay đang ở mức khá đều có chỗ để tiến bộ, miễn là giữ nhịp học đều đặn.
                </p>
              </div>

              <ul className="mt-8 grid gap-3 sm:grid-cols-2">
                {PILLARS.map((p) => (
                  <li key={p.title} className="rounded-xl border border-zinc-200 p-4">
                    <h3 className="text-sm font-semibold text-zinc-900">{p.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-zinc-500">{p.body}</p>
                  </li>
                ))}
              </ul>

              {(phoneHref || zaloHref || facebookHref) && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {phoneHref && (
                    <a href={phoneHref} className={CHIP_BTN}>
                      <Phone className="h-4 w-4 text-zinc-400" aria-hidden /> Gọi {phoneLabel}
                    </a>
                  )}
                  {zaloHref && (
                    <a href={zaloHref} target="_blank" rel="noreferrer" className={CHIP_BTN}>
                      <MessageCircle className="h-4 w-4 text-zinc-400" aria-hidden /> Nhắn Zalo
                    </a>
                  )}
                  {facebookHref && (
                    <a href={facebookHref} target="_blank" rel="noreferrer" className={CHIP_BTN}>
                      <FacebookIcon className="h-4 w-4 text-zinc-400" /> Facebook
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 7. CẢM NHẬN */}
        <section id="feedbacks" className={SECTION}>
          <SectionHead icon={MessageSquare} eyebrow="Cảm nhận" title="Học sinh nói gì về lớp" />
          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
            {FEEDBACKS.map((f) => {
              const color = String(resolveStudentColor(null, f.name));
              return (
                <figure key={f.name} className={cn(CARD, CARD_HOVER, "flex flex-col justify-between gap-5 p-6 sm:p-7")}>
                  <div>
                    <span aria-hidden className="block font-serif text-6xl leading-none text-zinc-300">“</span>
                    <blockquote className="-mt-2 text-base leading-relaxed text-zinc-700">{f.quote}</blockquote>
                  </div>
                  <figcaption className="flex items-center gap-3 border-t border-zinc-100 pt-4">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-semibold" style={solid(color)}>{f.initials}</div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-zinc-900">{f.name}</h3>
                      <span className="text-xs text-zinc-500">{f.role}</span>
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </section>

        {/* 8. KÊU GỌI HÀNH ĐỘNG */}
        <section className="mx-auto max-w-7xl px-4 pb-6 pt-20 sm:px-6 sm:pt-24 lg:px-8">
          <div className={cn(CARD, "flex flex-col gap-8 p-6 sm:p-10 lg:flex-row lg:items-center lg:justify-between")}>
            <div className="max-w-xl">
              <h2 className={H2}>Bắt đầu bằng một buổi học thử</h2>
              <p className="mt-3 text-base leading-relaxed text-zinc-500">
                Điền form ngắn, thầy cô sẽ liên hệ qua Gmail để xếp lớp và gửi đề thi cho bạn.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
              <Button onClick={openConsult} className={cn("h-12 w-full rounded-full px-7 text-base font-semibold sm:w-auto", PRIMARY)}>
                Đăng ký học thử
              </Button>
              <Button
                variant="outline"
                onClick={() => { setAuthMode("login"); setShowAuthModal(true); }}
                className={cn("h-12 w-full rounded-full px-6 text-base font-semibold sm:w-auto", OUTLINE)}
              >
                Đăng nhập học viên
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* 9. FOOTER: thẻ bo góc cùng kiểu các khối khác */}
      <footer className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8">
        <div className={cn(CARD, "overflow-hidden")}>
          <div className="grid gap-10 p-6 sm:p-10 md:grid-cols-[1.4fr_1fr_1fr] md:gap-12">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[#0B1B3A] text-base font-semibold text-[#FFB547]">A</span>
                <span className="text-lg font-semibold tracking-tight text-zinc-900">{SITE.brand}</span>
              </div>
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-zinc-500">
                Lớp Toán THPT, rèn tư duy bản chất và luyện đề theo cấu trúc đề thi. Đồng hành cùng học sinh lớp 10, 11 và 12.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Thông tin liên hệ</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-600">
                {phoneHref && (
                  <li>
                    <a href={phoneHref} className={`inline-flex items-center gap-2.5 ${FOOT_LINK}`}>
                      <Phone className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden /> {phoneLabel}
                    </a>
                  </li>
                )}
                {zaloHref && (
                  <li>
                    <a href={zaloHref} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2.5 ${FOOT_LINK}`}>
                      <MessageCircle className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden /> Nhắn Zalo
                    </a>
                  </li>
                )}
                {facebookHref && (
                  <li>
                    <a href={facebookHref} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-2.5 ${FOOT_LINK}`}>
                      <FacebookIcon className="h-4 w-4 shrink-0 text-zinc-400" /> Facebook
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
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden /> {addressText || "Xem trên Google Maps"}
                      </a>
                    ) : (
                      <span className="inline-flex items-start gap-2.5">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" aria-hidden /> {addressText}
                      </span>
                    )}
                  </li>
                )}
                {!hasContact && <li className="text-zinc-500">Liên hệ qua form đăng ký học thử ở trên.</li>}
              </ul>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-zinc-900">Liên kết nhanh</h3>
              <ul className="mt-4 space-y-2.5 text-sm text-zinc-600">
                <li><button type="button" onClick={() => scrollToId("classes")} className={FOOT_LINK}>Chương trình</button></li>
                <li><button type="button" onClick={() => scrollToId("workflow")} className={FOOT_LINK}>Lộ trình học</button></li>
                <li><button type="button" onClick={() => scrollToId("teacher")} className={FOOT_LINK}>Giáo viên</button></li>
                <li><Link to="/lop-hoc" className={FOOT_LINK}>Lịch và học phí</Link></li>
                <li><button type="button" onClick={() => { setAuthMode("login"); setShowAuthModal(true); }} className={FOOT_LINK}>Đăng nhập học viên</button></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-zinc-100 px-6 py-4 sm:px-10">
            <p className="text-center text-xs text-zinc-500">
              © {new Date().getFullYear()} {SITE.brand}{addressText && `. ${addressText}`}.
            </p>
          </div>
        </div>
      </footer>

      {/* POPUP ĐĂNG KÝ HỌC THỬ */}
      {showConsultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowConsultModal(false); }}>
          <div role="dialog" aria-modal="true" aria-label="Đăng ký học thử" className={cn(MODAL, "my-8 max-h-[92vh] max-w-2xl")}>
            <button type="button" aria-label="Đóng" className={CLOSE} onClick={() => setShowConsultModal(false)}>
              <X className="h-5 w-5" />
            </button>

            <div className="max-h-[92vh] overflow-y-auto">
              <div className="flex items-center gap-3 border-b border-zinc-100 px-6 py-5 pr-16 sm:px-8">
                <div className={cn(ICON_TILE, "h-10 w-10")}>
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-zinc-900">Đăng ký học thử và nhận đề thi</h2>
                  <p className="text-sm text-zinc-500">Bứt phá điểm số cùng phương pháp học tư duy hiện đại.</p>
                </div>
              </div>

              <form onSubmit={handleConsultSubmit} className="space-y-4 bg-zinc-50/60 px-4 py-5 sm:px-6">
                <div className={cn(BLOCK, "bg-white")}>
                  <StepHead n={1} title="Thông tin cá nhân học sinh" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Họ và tên <span className="text-rose-500">*</span></Label>
                      <Input autoComplete="name" placeholder="Ví dụ: Nguyễn Văn A" className={FIELD} value={studentForm.fullName} onChange={e => setStudentForm({ ...studentForm, fullName: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Địa chỉ Gmail <span className="text-rose-500">*</span></Label>
                      <Input type="email" autoComplete="email" placeholder="hocsinh@gmail.com" className={FIELD} value={studentForm.email} onChange={e => setStudentForm({ ...studentForm, email: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Ngày sinh <span className="text-rose-500">*</span></Label>
                      <Input type="date" max={todayStr()} className={FIELD} value={studentForm.dob} onChange={e => setStudentForm({ ...studentForm, dob: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div className={cn(BLOCK, "bg-white")}>
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

                <div className={cn(BLOCK, "bg-white")}>
                  <StepHead n={3} title="Thông tin trường học" icon={School} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Tên trường đang học <span className="text-rose-500">*</span></Label>
                      <Input placeholder="Ví dụ: THPT Chuyên Nguyễn Huệ" className={FIELD} value={studentForm.schoolName} onChange={e => setStudentForm({ ...studentForm, schoolName: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className={LABEL}>Thuộc Tỉnh / Thành phố <span className="text-rose-500">*</span></Label>
                      <select className={SELECT} value={studentForm.schoolCity} onChange={e => setStudentForm({ ...studentForm, schoolCity: e.target.value })}>
                        <option value="">-- Chọn Tỉnh / Thành --</option>
                        {VIETNAM_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className={LABEL}>Khối lớp <span className="text-rose-500">*</span></Label>
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Khối lớp">
                      {GRADE_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={studentForm.grade === o.value}
                          onClick={() => setStudentForm({ ...studentForm, grade: o.value })}
                          className={pillBtn(studentForm.grade === o.value)}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className={cn(BLOCK, "bg-white")}>
                  <div className="flex items-center justify-between gap-3">
                    <StepHead n={4} title="Lịch rảnh mong muốn đăng ký" icon={Calendar} />
                    <button type="button" onClick={addWeeklySlot} className={CHIP_BTN}>
                      <Plus className="h-4 w-4" /> Thêm lịch
                    </button>
                  </div>

                  {studentForm.slots.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-zinc-300 py-5 text-center text-sm text-zinc-500">
                      Chưa đăng ký lịch biểu nào. Bấm nút Thêm lịch để tự chọn ca.
                    </p>
                  ) : (
                    <div className="max-h-[170px] space-y-2 overflow-y-auto pr-1">
                      {studentForm.slots.map((slot, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5">
                          <select className={cn(SELECT, "h-10 min-w-[100px] flex-1 text-sm")} value={slot.day} onChange={e => updateWeeklySlot(index, "day", e.target.value)}>
                            {WEEK_DAYS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                          </select>
                          <div className="flex items-center gap-1.5 text-sm text-zinc-500">
                            <span>Từ</span>
                            <Input type="time" className={cn(FIELD, "h-10 w-28 px-2")} value={slot.startTime} onChange={e => updateWeeklySlot(index, "startTime", e.target.value)} />
                            <span>đến</span>
                            <Input type="time" className={cn(FIELD, "h-10 w-28 px-2")} value={slot.endTime} onChange={e => updateWeeklySlot(index, "endTime", e.target.value)} />
                          </div>
                          <Button type="button" variant="ghost" size="icon" aria-label="Xóa lịch" onClick={() => removeWeeklySlot(index)} className="ml-auto h-10 w-10 rounded-full text-zinc-400 hover:bg-rose-50 hover:text-rose-600">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={isConsultSending} className={cn("group flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold", PRIMARY)}>
                  {isConsultSending ? "Đang gửi..." : "Gửi đăng ký nhập học thử"}
                  {!isConsultSending && <ArrowRight className="h-4 w-4 text-[#FFB547] transition-transform group-hover:translate-x-1" />}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* POPUP ĐĂNG NHẬP / ĐĂNG KÝ HỆ THỐNG */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-zinc-950/50 p-4 backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAuthModal(false); }}>
          <div role="dialog" aria-modal="true" aria-label={authMode === "login" ? "Đăng nhập" : "Đăng ký thành viên"} className={cn(MODAL, "my-8 max-w-[420px]")}>
            <button type="button" aria-label="Đóng" className={CLOSE} onClick={() => setShowAuthModal(false)}>
              <X className="h-5 w-5" />
            </button>

            <div className="space-y-6 px-6 pb-7 pt-9 sm:px-8">
              <div className="space-y-4 text-center">
                <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-[#0B1B3A] text-xl font-semibold text-[#FFB547]">A</span>
                <div className="space-y-1">
                  <h3 className="text-xl font-semibold tracking-tight text-zinc-900">
                    {authMode === "login" ? "Đăng nhập học tập" : "Đăng ký thành viên"}
                  </h3>
                  <p className="text-sm text-zinc-500">Kết nối vào không gian học tập trực tuyến cá nhân</p>
                </div>
              </div>

              {/* Chuyển giữa đăng nhập và đăng ký */}
              <div className={SEG} role="group" aria-label="Chế độ">
                <button type="button" aria-pressed={authMode === "login"} onClick={() => setAuthMode("login")} className={segBtn(authMode === "login")}>
                  Đăng nhập
                </button>
                <button type="button" aria-pressed={authMode === "signup"} onClick={() => setAuthMode("signup")} className={segBtn(authMode === "signup")}>
                  Đăng ký
                </button>
              </div>

              {/* Nút Đăng nhập Google Auth */}
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                className={cn("flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold", OUTLINE)}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
                  <path fill="#EA4335" d="M12 5.04c1.66 0 3.2.57 4.38 1.69l3.27-3.27C17.67 1.54 14.98 1 12 1 7.35 1 3.41 3.65 1.5 7.5l3.85 2.99C6.26 7.49 8.91 5.04 12 5.04z"/><path fill="#4285F4" d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.29 1.48-1.14 2.73-2.4 3.58l3.73 2.89c2.18-2.01 3.7-4.99 3.7-8.62z"/><path fill="#FBBC05" d="M5.35 14.51c-.24-.74-.38-1.54-.38-2.37s.14-1.63.38-2.37L1.5 6.78C.54 8.7 0 10.85 0 13s.54 4.3 1.5 6.22l3.85-2.71z"/><path fill="#34A853" d="M12 23c3.24 0 5.97-1.07 7.96-2.92l-3.73-2.89c-1.11.75-2.53 1.19-4.23 1.19-3.09 0-5.74-2.45-6.65-5.45L1.5 16.64C3.41 20.35 7.35 23 12 23z"/>
                </svg>
                Đăng nhập bằng Google
              </Button>

              <div className="relative flex items-center">
                <div className="flex-grow border-t border-zinc-200"></div>
                <span className="mx-3 text-xs font-medium text-zinc-400">Hoặc dùng tài khoản</span>
                <div className="flex-grow border-t border-zinc-200"></div>
              </div>

              <form className="space-y-4" onSubmit={handleAuthSubmit}>
                {/* Ô nhập Họ và tên (chỉ xuất hiện khi chọn Đăng ký) */}
                {authMode === "signup" && (
                  <div className="space-y-1.5">
                    <Label className={LABEL}>Họ và tên</Label>
                    <Input autoComplete="name" placeholder="Nguyễn Văn A" className={FIELD} value={fullName} onChange={e => setFullName(e.target.value)} required />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className={LABEL}>Địa chỉ email</Label>
                  <Input type="email" autoComplete="email" placeholder="name@example.com" className={FIELD} value={email} onChange={e => setEmail(e.target.value)} required />
                </div>

                <div className="space-y-1.5">
                  <Label className={LABEL}>Mật khẩu</Label>
                  <Input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} placeholder="••••••••" className={FIELD} value={password} onChange={e => setPassword(e.target.value)} required />
                </div>

                <Button type="submit" disabled={isAuthLoading} className={cn("h-11 w-full rounded-full text-sm font-semibold", PRIMARY)}>
                  {isAuthLoading ? "Đang xử lý..." : authMode === "login" ? "Đăng nhập" : "Đăng ký thành viên"}
                </Button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}