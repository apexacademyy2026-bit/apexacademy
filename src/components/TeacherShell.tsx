import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { useApp } from "@/contexts/AppContext";

/* =====================================================================
   KHUNG CÓ SIDEBAR CHO CÁC TRANG ĐẶT NGOÀI LAYOUT
   - Giáo viên đã đăng nhập: trang hiện kèm thanh sidebar bên trái (AppSidebar).
   - Khách hoặc học sinh: trang hiện nguyên như cũ, không có sidebar.
   Dùng trong App.tsx:
     <Route path="/lop-hoc" element={<TeacherShell trigger="floating"><PublicClasses /></TeacherShell>} />
     <Route path="/dang-ky" element={<TeacherShell title="Đăng ký học"><Registrations /></TeacherShell>} />
   Không đặt trang đã nằm trong layout có sẵn sidebar vào khung này, nếu không sẽ hiện hai sidebar.
   ===================================================================== */

type Props = {
  children: ReactNode;
  /**
   * "bar": thanh mỏng phía trên có nút thu gọn / mở menu (hợp với trang quản lý).
   * "floating": chỉ có nút tròn nổi ở góc dưới bên trái trên điện thoại. Dùng cho trang công khai
   *             vì trang đó đã có thanh dính riêng ở trên cùng.
   */
  trigger?: "bar" | "floating";
  /** Tiêu đề nhỏ cạnh nút menu (chỉ dùng với trigger="bar"). */
  title?: string;
};

export default function TeacherShell({ children, trigger = "bar", title }: Props) {
  const { user, profile } = useApp() as any;
  const isTeacher = !!user && profile?.role === "teacher";

  if (!isTeacher) return <>{children}</>;

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="min-w-0 flex-1">
        {trigger === "bar" ? (
          <div className="sticky top-0 z-30 flex min-h-12 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 pt-safe backdrop-blur">
            <SidebarTrigger aria-label="Thu gọn hoặc mở menu" />
            {title && <span className="truncate text-sm font-semibold text-slate-700">{title}</span>}
          </div>
        ) : (
          <SidebarTrigger
            aria-label="Mở menu"
            className="fixed bottom-4 left-4 z-[60] h-11 w-11 rounded-full bg-[#0B1B3A] text-white shadow-lg hover:bg-[#13285a] hover:text-white md:hidden"
          />
        )}
        {children}
      </div>
    </SidebarProvider>
  );
}