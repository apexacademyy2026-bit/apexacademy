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
  Sparkles,
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
    {
      title: lang === "vi" ? "Tổng quan" : "Dashboard",
      icon: LayoutDashboard,
      to: "/teacher",
    },
    {
      title: lang === "vi" ? "Học sinh" : "Students",
      icon: Users,
      to: "/students",
    },
    {
      title: lang === "vi" ? "Lớp học" : "Classes",
      icon: GraduationCap,
      to: "/classes",
    },
    {
      title: lang === "vi" ? "Lịch dạy" : "Schedule",
      icon: CalendarDays,
      to: "/schedule",
    },
    {
      title: lang === "vi" ? "Cài đặt" : "Settings",
      icon: Settings,
      to: "/settings",
    },
  ];

  // 🌟 2. Danh sách Menu dành riêng cho HỌC SINH
  const studentNavItems = [
    {
      title: lang === "vi" ? "Trang chủ" : "Home",
      icon: LayoutDashboard,
      to: "/student",
    },
    {
      title: lang === "vi" ? "Lớp học của tôi" : "My Classes",
      icon: BookOpen,
      to: "/student/classes",
    },
    {
      title: lang === "vi" ? "Bài tập & Đề thi" : "Assignments",
      icon: FileText,
      to: "/student/assignments",
    },
    {
      title: lang === "vi" ? "Lịch học" : "Schedule",
      icon: CalendarDays,
      to: "/student/schedule",
    },
    {
      title: lang === "vi" ? "Cài đặt" : "Settings",
      icon: Settings,
      to: "/settings",
    },
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
    <Sidebar variant="sidebar" collapsible="icon" className="border-r border-slate-100 bg-white">
      {/* 1. HEADER LOGO - Thêm pt-safe để chừa khoảng trống cho Tai thỏ / Dynamic Island */}
      <SidebarHeader className="p-4 pt-safe border-b border-slate-100/60">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-black shadow-md shadow-blue-500/20 shrink-0">
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="truncate group-data-[collapsible=icon]:hidden">
            <h2 className="text-sm font-black text-slate-900 tracking-tight truncate">
              {brandName}
            </h2>
            <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="h-3 w-3 inline" /> 
              {role === "teacher" ? "TEACHER MODE" : "STUDENT MODE"}
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
              className="w-full h-9 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs border border-blue-100/80 shadow-2xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>{lang === "vi" ? "Tạo ca học mới" : "New Session"}</span>
            </Button>
          </div>
        )}

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 mb-1">
            {lang === "vi" ? "Menu chính" : "Main Menu"}
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
                          ? "bg-blue-600 text-white font-bold hover:bg-blue-700 hover:text-white shadow-md shadow-blue-600/20 rounded-xl h-10"
                          : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 font-bold rounded-xl h-10"
                      }
                    >
                      <Link to={item.to} className="flex items-center gap-3 px-3">
                        <item.icon className={`h-4 w-4 ${isActive ? "text-white" : "text-slate-400"}`} />
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

      {/* 3. FOOTER USER & LOGOUT - Thêm pb-safe để tránh thanh gạch dưới đáy iPhone */}
      <SidebarFooter className="p-3 pb-safe border-t border-slate-100 space-y-2">
        <div className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-50 border border-slate-100/80 group-data-[collapsible=icon]:hidden">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 text-white flex items-center justify-center font-black text-xs shadow-sm shrink-0">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="truncate flex-1">
            <h4 className="text-xs font-bold text-slate-900 truncate">{displayName}</h4>
            <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span className="group-data-[collapsible=icon]:hidden">
            {lang === "vi" ? "Đăng xuất" : "Log out"}
          </span>
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}