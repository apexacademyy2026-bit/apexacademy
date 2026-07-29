import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";

export default function StudentProgress() {
  const { testId, studentId } = useParams();
  const { t } = useApp();
  const [attempts, setAttempts] = useState<any[]>([]);
  const [test, setTest] = useState<any>(null);

  useEffect(() => {
    if (!testId || !studentId) return;
    (async () => {
      const { data: tst } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
      setTest(tst);
      const { data } = await supabase.from("test_attempts").select("*").eq("test_id", testId).eq("student_id", studentId).order("started_at", { ascending: false });
      setAttempts(data || []);
    })();
  }, [testId, studentId]);

  return (
    <div className="space-y-4 max-w-2xl">
      <h1 className="text-2xl font-bold">{test?.title} — {(t as any).attempts}</h1>
      <Card className="p-4 border-0 shadow-card">
        {attempts.length === 0 ? (
          <div className="text-sm text-muted-foreground">{t.nothingHere}</div>
        ) : (
          <ul className="space-y-2">
            {attempts.map(a => (
              <li key={a.id} className="flex justify-between p-2 rounded bg-muted/30">
                <span>{new Date(a.started_at).toLocaleString()}</span>
                <span className="font-bold">{Number(a.score).toFixed(1)} / 10</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}