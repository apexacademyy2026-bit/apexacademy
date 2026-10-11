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
  FileText,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { resolveStudentColor } from "@/lib/studentColor";

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, user, lang } = useApp();

  // 🌟 Lấy role an toàn từ profile context
  const role = (profile as any)?.role || "student";

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
  const teacherNavItems = [
    { title: lang === "vi" ? "Tổng quan" : "Dashboard", icon: LayoutDashboard, to: "/teacher" },
    { title: lang === "vi" ? "Học sinh" : "Students", icon: Users, to: "/students" },
    { title: lang === "vi" ? "Lớp học" : "Classes", icon: GraduationCap, to: "/classes" },
    { title: lang === "vi" ? "Lịch dạy" : "Schedule", icon: CalendarDays, to: "/schedule" },
    { title: lang === "vi" ? "Cài đặt" : "Settings", icon: Settings, to: "/settings" },
  ];

  // 🌟 2. Danh sách Menu dành riêng cho HỌC SINH
  const studentNavItems = [
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
    <Sidebar variant="sidebar" collapsible="icon" className="border-r border-slate-200 bg-white font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* 1. HEADER LOGO - pt-safe để chừa khoảng trống cho Tai thỏ / Dynamic Island */}
      <SidebarHeader className="border-b border-slate-100 p-4 pt-safe">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0B1B3A] text-[#FFB547]">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <h2 className="truncate text-sm font-extrabold tracking-tight text-slate-900">{brandName}</h2>
            <p className="text-xs font-medium text-slate-500">
              {role === "teacher" ? (lang === "vi" ? "Giáo viên" : "Teacher") : lang === "vi" ? "Học sinh" : "Student"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      {/* 2. CONTENT MENU */}
      <SidebarContent className="p-3">
        {/* Nút hành động nhanh - CHỈ HIỂN THỊ VỚI GIÁO VIÊN */}
        {role === "teacher" && (
          <div className="mb-2 group-data-[collapsible=icon]:hidden">
            <Button
              onClick={() => navigate("/schedule")}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#FFB547] text-sm font-bold text-[#0B1B3A] hover:bg-[#ffc266]"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span>{lang === "vi" ? "Tạo ca học mới" : "New session"}</span>
            </Button>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="mb-1 px-2 text-xs font-semibold text-slate-400">
            {lang === "vi" ? "Menu chính" : "Main menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  location.pathname === item.to ||
                  (item.to !== "/teacher" && item.to !== "/student" && location.pathname.startsWith(item.to));

                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                      className={
                        isActive
                          ? "h-10 rounded-xl bg-[#0B1B3A] font-semibold text-white hover:bg-[#13285a] hover:text-white data-[active=true]:bg-[#0B1B3A] data-[active=true]:text-white"
                          : "h-10 rounded-xl font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                      }
                    >
                      <Link to={item.to} className="flex items-center gap-3 px-3">
                        <item.icon className={`h-4 w-4 ${isActive ? "text-[#FFB547]" : "text-slate-400"}`} />
                        <span>{item.title}</span>
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
      <SidebarFooter className="space-y-2 border-t border-slate-100 p-3 pb-safe">
        <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5 group-data-[collapsible=icon]:hidden">
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-xs font-extrabold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]"
            style={{ background: resolveStudentColor(null, user?.id ?? displayName) }}
          >
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="truncate text-sm font-bold text-slate-900">{displayName}</h4>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">{lang === "vi" ? "Đăng xuất" : "Log out"}</span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}