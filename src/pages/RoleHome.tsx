import { Navigate } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";

export default function RoleHome() {
  const { role, loading, user } = useApp();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  if (role === null) return null;
  if (role === "student") return <Navigate to="/student" replace />;
  return <Navigate to="/teacher" replace />;
}