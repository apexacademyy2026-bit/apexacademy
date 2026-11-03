import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  CalendarDays,
  Settings,
  LogOut,
  Plus,
  BookOpen,
  BookMarked,
  FileText,
  Globe,
  UserPlus,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveStudentColor } from "@/lib/studentColor";
import { useNewRegistrationCount } from "@/pages/Registrations";

/* Design tokens: mực navy #0B1B3A · nhấn hổ phách #FFB547 (chỉ ở logo và nút chính) · nền kính mờ trong suốt, lấy màu từ nền của website */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";

// Chọn chữ navy hay trắng để luôn đọc rõ trên màu nền do người dùng chọn
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

type NavItem = {
  title: string;
  icon: typeof LayoutDashboard;
  to: string;
  badge?: number; // số đăng ký mới, hiện chấm đỏ kèm số khi > 0
};

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, lang } = useApp();

  // 🌟 Lấy role an toàn từ profile context
  const role = (profile as any)?.role || "student";

  // 🌟 Ảnh đại diện đã đổi ở trang Cài đặt: ưu tiên ảnh trong profile, sau đó đến ảnh trong tài khoản đăng nhập.
  // Nếu chưa có ảnh hoặc ảnh lỗi thì quay về biểu tượng sách (logo) và chữ cái đầu (avatar) như cũ.
  const avatarUrl: string | null =
    (profile as any)?.avatar_url ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    null;
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    setAvatarFailed(false); // đổi ảnh mới thì thử tải lại
  }, [avatarUrl]);
  const showAvatar = !!avatarUrl && !avatarFailed;

  // Số học sinh đăng ký chưa xử lý (chỉ tải với giáo viên)
  const newRegistrations = useNewRegistrationCount(role === "teacher");

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success(lang === "vi" ? "Đã đăng xuất" : "Logged out successfully");
      navigate("/");
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // 🌟 1. Danh sách Menu dành cho GIÁO VIÊN
  const teacherNavItems: NavItem[] = [
    { title: lang === "vi" ? "Tổng quan" : "Dashboard", icon: LayoutDashboard, to: "/teacher" },
    { title: lang === "vi" ? "Học sinh" : "Students", icon: Users, to: "/students" },
    { title: lang === "vi" ? "Nhật ký học tập" : "Learning log", icon: BookMarked, to: "/nhat-ky-hoc-tap" },
    { title: lang === "vi" ? "Lớp học" : "Classes", icon: GraduationCap, to: "/classes" },
    { title: lang === "vi" ? "Lịch dạy" : "Schedule", icon: CalendarDays, to: "/schedule" },
    { title: lang === "vi" ? "Trang lớp học" : "Public page", icon: Globe, to: "/lop-hoc" },
    { title: lang === "vi" ? "Đăng ký học" : "Registrations", icon: UserPlus, to: "/dang-ky", badge: newRegistrations },
    { title: lang === "vi" ? "Cài đặt" : "Settings", icon: Settings, to: "/settings" },
  ];

  // 🌟 2. Danh sách Menu dành riêng cho HỌC SINH
  const studentNavItems: NavItem[] = [
    { title: lang === "vi" ? "Trang chủ" : "Home", icon: LayoutDashboard, to: "/student" },
    { title: lang === "vi" ? "Lớp học của tôi" : "My Classes", icon: BookOpen, to: "/student/classes" },
    { title: lang === "vi" ? "Bài tập & Đề thi" : "Assignments", icon: FileText, to: "/student/assignments" },
    { title: lang === "vi" ? "Lịch học" : "Schedule", icon: CalendarDays, to: "/student/schedule" },
    { title: lang === "vi" ? "Cài đặt" : "Settings", icon: Settings, to: "/settings" },
  ];

  // Tự động chuyển danh sách menu theo vai trò
  const navItems = role === "teacher" ? teacherNavItems : studentNavItems;

  const displayName =
    profile?.display_name ||
    (profile as any)?.full_name ||
    user?.email?.split("@")[0] ||
    "Thành viên";

  const brandName = user?.user_metadata?.brand_name || "Apex Academy";

  return (
    <Sidebar variant="sidebar" collapsible="icon" className={`border-r border-black/5 ${FONT} [&_[data-sidebar=sidebar]]:bg-white/70 [&_[data-sidebar=sidebar]]:backdrop-blur-2xl [&_[data-sidebar=sidebar]]:backdrop-saturate-150`}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      {/* 1. HEADER LOGO - pt-safe để chừa khoảng trống cho Tai thỏ / Dynamic Island */}
      <SidebarHeader className="p-4 pt-safe">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#0B1B3A] text-[#FFB547]">
            {showAvatar ? (
              <img
                src={avatarUrl!}
                alt={displayName}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <BookOpen className="h-[18px] w-[18px]" />
            )}
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <h2 className="truncate text-sm font-semibold tracking-tight text-zinc-900">{brandName}</h2>
            <p className="text-xs text-zinc-600">
              {role === "teacher" ? (lang === "vi" ? "Giáo viên" : "Teacher") : lang === "vi" ? "Học sinh" : "Student"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      {/* 2. CONTENT MENU */}
      <SidebarContent className="px-3 pb-3 pt-1">
        {/* Nút hành động nhanh - CHỈ HIỂN THỊ VỚI GIÁO VIÊN */}
        {role === "teacher" && (
          <div className="mb-3 group-data-[collapsible=icon]:hidden">
            <Button
              onClick={() => navigate("/schedule")}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#0B1B3A] text-sm font-semibold text-white shadow-none hover:bg-[#13285a]"
            >
              <Plus className="h-4 w-4 text-[#FFB547]" strokeWidth={2.5} />
              <span>{lang === "vi" ? "Tạo ca học mới" : "New session"}</span>
            </Button>
          </div>
        )}

        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu className="space-y-0.5">
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.to ||
                  (item.to !== "/teacher" && item.to !== "/student" && location.pathname.startsWith(item.to));
                const badge = item.badge ?? 0;

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={badge > 0 ? `${item.title} (${badge})` : item.title}
                      className={
                        isActive
                          ? "h-10 rounded-xl bg-white/90 font-semibold text-zinc-900 shadow-sm ring-1 ring-black/5 hover:bg-white/90 hover:text-zinc-900 data-[active=true]:bg-white/90 data-[active=true]:text-zinc-900"
                          : "h-10 rounded-xl font-medium text-zinc-700 hover:bg-white/55 hover:text-zinc-900"
                      }
                    >
                      <Link to={item.to} className="flex items-center gap-3 px-3">
                        <span className="relative shrink-0">
                          <item.icon className={`h-4 w-4 ${isActive ? "text-zinc-900" : "text-zinc-500"}`} />
                          {/* Thanh menu thu gọn: chỉ có chấm đỏ trên biểu tượng */}
                          {badge > 0 && (
                            <span
                              className="absolute -right-1 -top-1 hidden h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white group-data-[collapsible=icon]:block"
                              aria-hidden
                            />
                          )}
                        </span>
                        <span>{item.title}</span>
                        {/* Thanh menu mở rộng: chấm đỏ kèm số đăng ký mới */}
                        {badge > 0 && (
                          <>
                            <span
                              className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1.5 text-xs font-semibold tabular-nums leading-none text-white group-data-[collapsible=icon]:hidden"
                              aria-hidden
                            >
                              {badge > 99 ? "99+" : badge}
                            </span>
                            <span className="sr-only">
                              {lang === "vi" ? `${badge} đăng ký mới` : `${badge} new registrations`}
                            </span>
                          </>
                        )}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* 3. FOOTER USER & LOGOUT - pb-safe để tránh thanh gạch dưới đáy iPhone */}
      <SidebarFooter className="gap-1 border-t border-black/5 p-3 pb-safe">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/55 p-2 group-data-[collapsible=icon]:hidden">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-xs font-semibold"
            style={showAvatar ? undefined : solid(resolveStudentColor(null, user?.id ?? displayName))}
          >
            {showAvatar ? (
              <img
                src={avatarUrl!}
                alt={displayName}
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              displayName.slice(0, 2).toUpperCase()
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-semibold text-zinc-900">{displayName}</h4>
            <p className="truncate text-xs text-zinc-500">{user?.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-white/55 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30 group-data-[collapsible=icon]:justify-center"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">{lang === "vi" ? "Đăng xuất" : "Log out"}</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}