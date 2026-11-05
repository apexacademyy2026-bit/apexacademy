import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowRight, HelpCircle, KeyRound, UserPlus, X } from "lucide-react";

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG (cùng ngôn ngữ với Dashboard) ----------------
   Bảng màu: mực navy #0B1B3A · nền trắng · viền zinc mảnh · nhấn hổ phách #FFB547 (chỉ trên nền navy). */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const TILE = "grid shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700";

export default function JoinClass() {
  const { user } = useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleJoin = async (e: FormEvent) => {
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
      // 1. Tìm lớp theo mã (Đã sửa "code" thành "join_code")
      const { data: cls, error: clsErr } = await (supabase as any)
        .from("classes")
        .select("id, name, join_code")
        .eq("join_code", cleanCode)
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
    <div className={cn("flex min-h-[85vh] w-full flex-col items-center justify-center bg-zinc-50 p-4 sm:p-8", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      <div className="w-full max-w-xl space-y-4">
        {/* THẺ FORM THAM GIA LỚP */}
        <section className={cn(CARD, "overflow-hidden")}>
          <header className="flex items-center gap-4 border-b border-zinc-100 px-5 py-5 sm:px-7">
            <div className={cn(TILE, "h-11 w-11")}>
              <UserPlus className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Tham gia lớp học</h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                Nhập mã lớp do thầy cô cung cấp để tham gia vào phòng học ngay lập tức.
              </p>
            </div>
          </header>

          <form onSubmit={handleJoin} className="space-y-5 px-5 py-6 sm:px-7">
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <label htmlFor="class-code" className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                  <KeyRound className="h-4 w-4 text-zinc-400" aria-hidden="true" />
                  Mã đăng ký lớp học
                </label>
                <span className="text-xs text-zinc-500">Ví dụ: MATH12A, TOAN88...</span>
              </div>

              <div className="relative">
                <Input
                  id="class-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="NHẬP MÃ LỚP..."
                  maxLength={12}
                  autoComplete="off"
                  spellCheck={false}
                  className="h-14 rounded-xl border-zinc-200 bg-white pl-4 pr-12 text-center font-mono text-xl font-semibold uppercase tracking-widest text-zinc-900 shadow-none placeholder:text-zinc-300 focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/10 focus-visible:ring-offset-0 sm:text-2xl"
                />
                {code && (
                  <button
                    type="button"
                    onClick={() => setCode("")}
                    aria-label="Xóa mã lớp"
                    className="absolute right-3 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !code.trim()}
              className="h-12 w-full gap-2 rounded-xl bg-[#0B1B3A] px-4 text-sm font-semibold text-white shadow-none hover:bg-[#13285a] disabled:opacity-50"
            >
              {loading ? (
                <span>Đang kết nối...</span>
              ) : (
                <>
                  Tham gia lớp học ngay <ArrowRight className="h-4 w-4 text-[#FFB547]" aria-hidden="true" />
                </>
              )}
            </Button>
          </form>
        </section>

        {/* HƯỚNG DẪN DÀNH CHO HỌC SINH */}
        <section className={cn(CARD, "space-y-4 p-5 sm:p-6")}>
          <div className="flex items-center gap-3">
            <div className={cn(TILE, "h-10 w-10")}>
              <HelpCircle className="h-5 w-5" aria-hidden="true" />
            </div>
            <h2 className="text-base font-semibold text-zinc-900">Hướng dẫn lấy mã lớp</h2>
          </div>

          <ul className="space-y-2.5 rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-600">
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
              <span>Mã lớp học gồm từ 4 - 8 ký tự (chữ viết hoa hoặc số) được giáo viên phụ trách cung cấp.</span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400" />
              <span>Nếu chưa nhận được mã, vui lòng liên hệ trực tiếp với thầy cô giáo hoặc phụ huynh.</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}