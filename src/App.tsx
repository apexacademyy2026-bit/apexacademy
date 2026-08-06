import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom"; // SỬA: Đổi BrowserRouter thành HashRouter
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppProvider } from "@/contexts/AppContext";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import StudentDetail from "./pages/StudentDetail";
import StudentBill from "./pages/StudentBill";
import Classes from "./pages/Classes";
import ClassDetail from "./pages/ClassDetail";
import Schedule from "./pages/Schedule";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound.tsx";
import TestEditor from "./pages/TestEditor";
import TestTake from "./pages/TestTake";
import TestResult from "./pages/TestResult";
import JoinClass from "./pages/JoinClass";
import StudentDashboard from "./pages/StudentDashboard";
import StudentHome from "./pages/StudentHome";
import StudentClassDetail from "./pages/StudentClassDetail";
import RoleHome from "./pages/RoleHome";
import StudentProgress from "./pages/StudentProgress";
import DeleteConfirm from "./pages/DeleteConfirm";
import ClassMemberDetail from "./pages/ClassMemberDetail";
import ClassDocViewer from "./pages/ClassDocViewer";
import LessonDetail from "./pages/LessonDetail";
import StudentLessonView from "./pages/StudentLessonView";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter> {/* SỬA: Thay <BrowserRouter> bằng <HashRouter> */}
        <AppProvider>
          <ConfirmProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/account/delete-confirm" element={<DeleteConfirm />} />
            <Route element={<AppLayout />}>
              <Route path="/" element={<RoleHome />} />
              <Route path="/teacher" element={<Dashboard />} />
              <Route path="/students" element={<Students />} />
              <Route path="/students/:id" element={<StudentDetail />} />
              <Route path="/students/:id/bill" element={<StudentBill />} />
              <Route path="/classes" element={<Classes />} />
              <Route path="/classes/:id" element={<ClassDetail />} />
              <Route path="/classes/:classId/members/:userId" element={<ClassMemberDetail />} />
              <Route path="/classes/:id/docs/:docId" element={<ClassDocViewer />} />
              <Route path="/classes/:id/lessons/:lessonId" element={<LessonDetail />} />
              <Route path="/student/classes/:id/docs/:docId" element={<ClassDocViewer />} />
              <Route path="/classes/:classId/tests/new" element={<TestEditor />} />
              <Route path="/tests/:testId/edit" element={<TestEditor />} />
              <Route path="/tests/:testId/students/:studentId" element={<StudentProgress />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/join" element={<JoinClass />} />
             <Route path="/student" element={<StudentHome />} />
             <Route path="/student/lessons/:id" element={<StudentLessonView />} />
  <Route path="/student/classes/:classId/lessons/:id" element={<StudentLessonView />} />

             <Route path="/student/classes" element={<StudentDashboard />} />
             <Route path="/student/home" element={<StudentHome />} />
              <Route path="/student/classes/:id" element={<StudentClassDetail />} />
              <Route path="/student/classes/:id/lessons/:lessonId" element={<StudentLessonView />} />
              <Route path="/student/tests/:testId/take" element={<TestTake />} />
              <Route path="/student/tests/:testId/result/:attemptId" element={<TestResult />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ConfirmProvider>
        </AppProvider>
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;