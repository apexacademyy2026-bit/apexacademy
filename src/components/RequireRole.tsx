import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";

interface RequireRoleProps {
  role: "teacher" | "student";
}

// Wrap a group of routes with this to restrict them to one role. Must sit
// INSIDE <AppLayout> so it can assume the user is already known to be
// logged in — AppLayout itself keeps handling the "not logged in" redirect
// and the loading screen. Because AppContext's `loading` now stays true
// until `role` has actually finished resolving (see AppContext.tsx), by the
// time this component renders at all, `role` is trustworthy — no separate
// loading check needed here.
export default function RequireRole({ role }: RequireRoleProps) {
  const { role: userRole } = useApp();

  if (userRole !== role) {
    // Send them to wherever they DO belong instead of a dead end.
    const fallback = userRole === "teacher" ? "/teacher" : userRole === "student" ? "/student" : "/";
    return <Navigate to={fallback} replace />;
  }

  return <Outlet />;
}