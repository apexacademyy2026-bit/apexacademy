import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  UserPlus, 
  KeyRound, 
  ArrowRight, 
  Sparkles, 
  HelpCircle, 
  BookOpenCheck,
  ShieldAlert
} from "lucide-react";

export default function JoinClass() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim().toUpperCase();

    if (!cleanCode) {
      toast.error("Vui lòng nhập mã lớp học!");
      return;
    }

    if (!user) {
      toast.error("Bạn cần đăng nhập để tham gia lớp học!");
      return;
    }

    setLoading(true);
    try {
      // 1. Tìm lớp theo mã
      const { data: cls, error: clsErr } = await (supabase as any)
        .from("classes")
        .select("id, name, code")
        .eq("code", cleanCode)
        .maybeSingle();

      if (clsErr || !cls) {
        toast.error("Mã lớp không tồn tại. Vui lòng kiểm tra lại!");
        setLoading(false);
        return;
      }

      // 2. Kiểm tra xem đã tham gia lớp chưa
      const { data: existing } = await (supabase as any)
        .from("class_members")
        .select("id")
        .eq("class_id", cls.id)
        .eq("student_id", user.id)
        .maybeSingle();

      if (existing) {
        toast.info(`Bạn đã là thành viên của lớp "${cls.name}" rồi!`);
        navigate(`/student/classes/${cls.id}`);
        return;
      }

      // 3. Thêm học sinh vào lớp
      const { error: joinErr } = await (supabase as any)
        .from("class_members")
        .insert({
          class_id: cls.id,
          student_id: user.id,
          role: "student",
        });

      if (joinErr) throw joinErr;

      toast.success(`Chúc mừng! Bạn đã tham gia thành công lớp "${cls.name}".`);
      navigate(`/student/classes/${cls.id}`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Không thể tham gia lớp lúc này.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[85vh] bg-[#f8fafc] flex flex-col items-center justify-center p-4 sm:p-6">
      
      <div className="w-full max-w-xl space-y-6">
        
        {/* 1. MAIN CARD FORM THAM GIA LỚP */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-xl shadow-slate-200/50 overflow-hidden">
          
          {/* Header Card với Gradient */}
          <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 p-8 text-white text-center relative">
            <div className="absolute -right-8 -bottom-8 h-32 w-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
            
            <div className="inline-flex p-3.5 rounded-2xl bg-white/15 backdrop-blur-md mb-3 border border-white/20 text-white shadow-inner">
              <UserPlus className="h-7 w-7" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-black tracking-tight">
              Tham gia lớp học
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm font-medium mt-1 max-w-md mx-auto">
              Nhập mã lớp do thầy cô cung cấp để tham gia vào phòng học ngay lập tức.
            </p>
          </div>

          {/* Form nhập Mã Lớp */}
          <form onSubmit={handleJoin} className="p-6 sm:p-8 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-blue-600" /> Mã đăng ký lớp học
                </span>
                <span className="text-[11px] text-slate-400 font-normal">Ví dụ: MATH12A, TOAN88...</span>
              </label>

              <div className="relative">
                <Input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="NHẬP MÃ LỚP..."
                  maxLength={12}
                  className="h-14 pl-4 pr-12 text-center text-xl sm:text-2xl font-black tracking-widest uppercase font-mono rounded-2xl border-slate-200 bg-slate-50/50 focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                />
                {code && (
                  <button
                    type="button"
                    onClick={() => setCode("")}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 bg-slate-200/60 rounded-full h-6 w-6 flex items-center justify-center"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !code.trim()}
              className="w-full h-12 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-sm shadow-lg shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <span>Đang kết nối...</span>
              ) : (
                <>
                  Tham gia lớp học ngay <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

        </div>

        {/* 2. HƯỚNG DẪN DÀNH CHO HỌC SINH */}
        <div className="bg-white/80 backdrop-blur-md rounded-2xl border border-slate-200/60 p-4 sm:p-5 text-xs text-slate-600 space-y-3">
          <div className="flex items-center gap-2 font-bold text-slate-900 border-b border-slate-100 pb-2">
            <HelpCircle className="h-4 w-4 text-blue-600" /> Hướng dẫn lấy mã lớp
          </div>

          <ul className="space-y-2 text-slate-500 font-medium leading-relaxed pl-1">
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Mã lớp học gồm từ 4 - 8 ký tự (chữ viết hoa hoặc số) được giáo viên phụ trách cung cấp.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0" />
              <span>Nếu chưa nhận được mã, vui lòng liên hệ trực tiếp với thầy cô giáo hoặc phụ huynh.</span>
            </li>
          </ul>
        </div>

      </div>

    </div>
  );
}