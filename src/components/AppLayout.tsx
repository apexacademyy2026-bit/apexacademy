import { useEffect, useRef } from "react";
import { Outlet, Navigate, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { useApp } from "@/contexts/AppContext";

// 1. Quản lý danh sách các cửa sổ con trên toàn ứng dụng
const activeChildWindows: Window[] = [];

/**
 * Hàm helper dùng để mở cửa sổ con ở bất kỳ đâu trong app.
 * Gọi hàm này thay cho window.open() thông thường để hệ thống tự quản lý đóng mở.
 */
export const openManagedWindow = (url: string, target = "_blank", features = "width=900,height=700") => {
  const win = window.open(url, target, features);
  if (win) {
    activeChildWindows.push(win);
  }
  return win;
};

export default function AppLayout() {
  const { user, loading } = useApp();
  const location = useLocation();

  // Hàm thực thi việc đóng tất cả các cửa sổ con đang còn mở
  const closeAllChildWindows = () => {
    activeChildWindows.forEach((win, index) => {
      if (win && !win.closed) {
        win.close();
      }
    });
    // Xóa sạch mảng sau khi đóng
    activeChildWindows.length = 0;
  };

  useEffect(() => {
    // TH1: Khi chuyển Route nội bộ React Router (ví dụ bấm từ học sinh A -> học sinh B)
    closeAllChildWindows();
  }, [location.pathname]);

  useEffect(() => {
    // TH2: Khi người dùng F5, tắt Tab, bấm Back trình duyệt, hoặc chuyển sang website khác
    const handlePageHide = () => {
      closeAllChildWindows();
    };

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-soft">
        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-soft">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
<header 
  style={{ 
    paddingTop: "calc(env(safe-area-inset-top, 0px) + 12px)",
    paddingBottom: "12px" 
  }}
  className="h-auto min-h-[3.5rem] flex items-center gap-2 px-4 border-b border-border bg-background/70 backdrop-blur no-print"
>
  <SidebarTrigger />
</header>
          <main className="flex-1 p-4 md:p-8 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}