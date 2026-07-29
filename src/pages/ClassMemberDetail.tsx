import { useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { fmtDate, formatVND } from "@/lib/format";

export default function ClassMemberDetail() {
  const { classId, userId } = useParams();
  const { t } = useApp();
  const navigate = useNavigate();

  const { data: cls } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () => (await supabase.from("classes").select("*").eq("id", classId).single()).data,
    enabled: !!classId,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile", userId],
    queryFn: async () => (await supabase.from("profiles").select("*").eq("id", userId).maybeSingle()).data,
    enabled: !!userId,
  });

  const { data: member } = useQuery({
    queryKey: ["member", classId, userId],
    queryFn: async () => (await supabase.from("class_members").select("*").eq("class_id", classId).eq("student_id", userId).maybeSingle()).data,
    enabled: !!classId && !!userId,
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["class_tests", classId],
    queryFn: async () => (await supabase.from("tests").select("*").eq("class_id", classId).order("created_at", { ascending: false })).data || [],
    enabled: !!classId,
  });

  const testIds = (tests as any[]).map((x) => x.id);
  const { data: attempts = [] } = useQuery({
    queryKey: ["member_attempts", userId, testIds.join(",")],
    queryFn: async () => {
      if (!testIds.length) return [];
      const { data } = await supabase
        .from("test_attempts")
        .select("*")
        .eq("student_id", userId)
        .in("test_id", testIds)
        .order("started_at", { ascending: false });
      return data || [];
    },
    enabled: !!userId && testIds.length > 0,
  });

  useEffect(() => {
    document.title = profile?.display_name ? `${profile.display_name} — ${t.appName}` : t.appName;
  }, [profile, t]);

  const attemptsByTest = (testId: string) => (attempts as any[]).filter((a) => a.test_id === testId);

  return (
    <div className="space-y-5 max-w-3xl">
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4" /> {cls?.name || t.classes}
      </Button>

      <Card className="p-6 border-0 shadow-card">
        <h1 className="text-2xl font-bold">{profile?.display_name || "—"}</h1>
        <div className="text-sm text-muted-foreground">{t.classes}: {cls?.name}</div>
        <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
          <Info label={(t as any).phone || "Phone"} value={profile?.phone} />
          <Info label={(t as any).dateOfBirth || "Date of birth"} value={profile?.date_of_birth ? fmtDate(profile.date_of_birth) : null} />
          <Info label={(t as any).schoolClass || "School class"} value={profile?.school_class} />
          <Info label={(t as any).parentName || "Parent name"} value={profile?.parent_name} />
          <Info label={(t as any).parentPhone || "Parent phone"} value={profile?.parent_phone} />
          <Info label={(t as any).joinedAt || "Joined"} value={member?.joined_at ? fmtDate(member.joined_at) : null} />
        </div>
      </Card>

      <Card className="p-5 border-0 shadow-card">
        <h3 className="font-semibold mb-2">{(t as any).fees || "Fees"}</h3>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <Info label={(t as any).feePerMonth || "Per month"} value={cls ? formatVND(Number(cls.fee_per_month || 0)) : null} />
          <Info label={(t as any).feePerSession || "Per session"} value={cls ? formatVND(Number(cls.fee_per_session || 0)) : null} />
          <Info label={(t as any).startDate || "Start date"} value={cls?.start_date ? fmtDate(cls.start_date) : null} />
        </div>
      </Card>

      <Card className="p-5 border-0 shadow-card">
        <h3 className="font-semibold mb-3">{(t as any).trialTest || "Trial tests"}</h3>
        {(tests as any[]).length === 0 ? (
          <div className="text-sm text-muted-foreground">{t.nothingHere}</div>
        ) : (
          <ul className="space-y-2">
            {(tests as any[]).map((tst) => {
              const att = attemptsByTest(tst.id);
              const best = att.reduce((m, a) => Math.max(m, Number(a.score || 0)), 0);
              return (
                <li key={tst.id} className="p-3 rounded-lg bg-muted/30">
                  <div className="flex justify-between items-center gap-2">
                    <div>
                      <div className="font-medium">{tst.title || "(untitled)"}</div>
                      <div className="text-xs text-muted-foreground">{tst.duration_minutes} min · {att.length} {(t as any).attempts || "attempts"}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">{att.length ? best.toFixed(1) : "—"}<span className="text-xs text-muted-foreground"> / 10</span></div>
                      <Link to={`/tests/${tst.id}/students/${userId}`} className="text-xs text-primary hover:underline">
                        {(t as any).viewAttempts || "View attempts"}
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value || "—"}</div>
    </div>
  );
}