import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Latex } from "@/components/Latex";
import { QuestionImage } from "@/components/QuestionImage";
import { useConfirm } from "@/components/ConfirmProvider";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Headset, BookOpen, FileText } from "lucide-react";

type Q = any;

export default function TestTake() {
  const { testId } = useParams();
  const { user, t, lang } = useApp();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [test, setTest] = useState<any>(null);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [endsAt, setEndsAt] = useState<number>(0);
  const [now, setNow] = useState(Date.now());
  const submittedRef = useRef(false);

  useEffect(() => {
    document.title = (t as any).trialTest;
    if (!testId || !user) return;
    (async () => {
      const { data: tst } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
      const { data: qs } = await supabase.rpc("get_test_questions_for_student", { _test_id: testId });
      setTest(tst); setQuestions((qs || []) as any);
      const { data: att } = await supabase.from("test_attempts").insert({
        test_id: testId, student_id: user.id, answers: {},
      }).select().single();
      if (att) {
        setAttemptId(att.id);
        setEndsAt(new Date(att.started_at).getTime() + (tst?.duration_minutes || 30) * 60_000);
      }
    })();
  }, [testId, user?.id]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);

  const remaining = Math.max(0, endsAt - now);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000);

  const submit = async (auto = false) => {
    if (submittedRef.current || !attemptId) return;
    if (!auto) {
      const ok = await confirm({ title: (t as any).submit, description: (t as any).confirmDeleteDesc, confirmText: (t as any).submit });
      if (!ok) return;
    }
    submittedRef.current = true;
    const { error } = await supabase.rpc("submit_test_attempt", { _attempt_id: attemptId, _answers: answers });
    if (error) { toast.error(error.message); submittedRef.current = false; return; }
    navigate(`/student/tests/${testId}/result/${attemptId}`);
  };

  useEffect(() => {
    if (endsAt && remaining <= 0 && !submittedRef.current && attemptId) submit(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, attemptId]);

  const grouped = useMemo(() => ({
    mcq: questions.filter(q => q.part === "mcq"),
    tf: questions.filter(q => q.part === "tf"),
    short: questions.filter(q => q.part === "short"),
  }), [questions]);

  const isEnglish = true; // Ép cấu hình hoặc: useMemo(() => questions.some(q => q.section), [questions]);
  
  const bySection = useMemo(() => {
    const map: Record<string, any[]> = { listening: [], language: [], reading: [], writing: [] };
    for (const q of questions) if (q.section && map[q.section]) map[q.section].push(q);
    return map;
  }, [questions]);

  const isAnswered = (q: Q) => {
    const a = answers[q.id]; if (!a) return false;
    if (q.part === "mcq") return !!a.choice;
    if (q.part === "tf") {
      if (Array.isArray(q.options)) {
        return q.options.some((_: any, i: number) => a[i] !== undefined);
      }
      return ["a","b","c","d"].some(k => a[k] !== undefined);
    }
    if (q.part === "short") return !!(a.value || "").trim().length;
    if (q.part === "long") return !!(a.long_answer || "").trim().length;
    return false;
  };

  if (!test) return <div className="text-muted-foreground p-6">…</div>;

  const renderOne = (q: any, num: number) => (
    <Card key={q.id} className="p-5 bg-white border border-slate-100 shadow-sm rounded-xl space-y-4">
      {q.part_title && (
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-1.5 flex items-center gap-1.5">
          {q.part === "listening" && <Headset className="h-3.5 w-3.5 text-teal-500" />}
          {q.part === "reading" && <BookOpen className="h-3.5 w-3.5 text-primary" />}
          {q.part_title}
        </div>
      )}

      {q.audio_url && (
        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 block mb-1">AUDIO TRACK:</span>
          <audio controls src={q.audio_url} className="w-full h-9" />
        </div>
      )}

      {q.passage && (
        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-sm leading-relaxed whitespace-pre-wrap border-l-4 border-primary font-serif text-slate-800 shadow-inner">
          {q.passage}
        </div>
      )}

      <div className="text-slate-950 font-medium">
        <span className="font-extrabold text-slate-900 mr-1">Question {num}.</span> 
        <Latex>{q.statement_latex}</Latex>
      </div>

      {q.image_url && <div className="max-w-md rounded-lg overflow-hidden"><QuestionImage path={q.image_url} /></div>}

      {/* RENDER MCQ */}
      {q.part === "mcq" && (
        <div className="grid sm:grid-cols-2 gap-3 pt-1">
          {(["A","B","C","D"] as const).map(k => {
            const sel = answers[q.id]?.choice === k;
            return (
              <button key={k} type="button"
                onClick={() => setAnswers(a => ({ ...a, [q.id]: { choice: k } }))}
                className={`flex items-start gap-3 p-3 rounded-xl border transition-all text-left group ${sel ? "bg-primary/5 border-primary shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <span className={`h-5 w-5 rounded-full border-2 mt-0.5 shrink-0 transition-colors flex items-center justify-center ${sel ? "bg-primary border-primary" : "border-slate-300 group-hover:border-slate-400"}`}>
                  {sel && <div className="h-2 w-2 bg-white rounded-full" />}
                </span>
                <div className="text-sm">
                  <span className="font-bold text-slate-800 mr-1">{k}.</span>
                  <span className="text-slate-700"><Latex>{q.options?.[k] || ""}</Latex></span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* RENDER DYNAMIC TRUE/FALSE */}
      {q.part === "tf" && (
        <div className="space-y-2 pt-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
          {Array.isArray(q.options) ? (
            q.options.map((opt: any, subIdx: number) => {
              const v = answers[q.id]?.[subIdx];
              return (
                <div key={subIdx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-2.5 rounded-lg border border-slate-100 shadow-xs">
                  <div className="flex-1 text-sm font-medium text-slate-700">
                    <span className="font-bold text-slate-400 mr-1.5">#{subIdx + 1}</span>
                    <Latex>{opt.label || ""}</Latex>
                  </div>
                  <div className="flex items-center space-x-4 shrink-0 bg-slate-50 px-3 py-1.5 rounded-md border border-slate-100 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [subIdx]: true } }))}
                      className={`px-3 py-0.5 rounded text-xs font-bold border transition-colors ${v === true ? "bg-teal-500 border-teal-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      True
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id] || {}), [subIdx]: false } }))}
                      className={`px-3 py-0.5 rounded text-xs font-bold border transition-colors ${v === false ? "bg-rose-500 border-rose-500 text-white" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                    >
                      False
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            // Dự phòng cho dữ liệu dạng cũ (a,b,c,d) nếu có
            (["a","b","c","d"] as const).map(k => {
              const v = answers[q.id]?.[k];
              return (
                <div key={k} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100 text-sm">
                  <span className="font-bold text-slate-400 w-5">{k})</span>
                  <span className="flex-1 text-slate-700"><Latex>{q.options?.[k] || ""}</Latex></span>
                  <div className="flex gap-2">
                    <label className="flex items-center gap-1 text-xs font-medium cursor-pointer"><input type="radio" checked={v === true} onChange={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id]||{}), [k]: true } }))} /> T</label>
                    <label className="flex items-center gap-1 text-xs font-medium cursor-pointer"><input type="radio" checked={v === false} onChange={() => setAnswers(a => ({ ...a, [q.id]: { ...(a[q.id]||{}), [k]: false } }))} /> F</label>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* RENDER SHORT ANSWER */}
      {q.part === "short" && (
        <input
          value={answers[q.id]?.value || ""}
          onChange={(e) => setAnswers(a => ({ ...a, [q.id]: { value: e.target.value } }))}
          className="w-full h-10 px-3 border border-slate-200 rounded-lg focus:border-primary focus:ring-1 focus:ring-primary text-sm outline-none bg-slate-50/50"
          placeholder={lang === "vi" ? "Nhập đáp án của bạn tại đây..." : "Type your answer here..."}
        />
      )}

      {/* RENDER LONG ANSWER (WRITING / ESSAY) */}
      {q.part === "long" && (
        <div className="space-y-1.5">
          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-amber-500" /> Your Essay Response</Label>
          <Textarea
            rows={8}
            value={answers[q.id]?.long_answer || ""}
            onChange={(e) => setAnswers(a => ({ ...a, [q.id]: { long_answer: e.target.value } }))}
            className="w-full border-slate-200 rounded-xl focus-visible:ring-primary text-sm p-3 leading-relaxed"
            placeholder={lang === "vi" ? "Gõ bài viết luận tự luận của bạn vào đây..." : "Write your essay text content here..."}
          />
        </div>
      )}
    </Card>
  );

  if (isEnglish) {
    const sections = [
      { key: "listening", label: "I. LISTENING" },
      { key: "language",  label: "II. LANGUAGE" },
      { key: "reading",   label: "III. READING" },
      { key: "writing",   label: "IV. WRITING" },
    ];
    let n = 0;
    return (
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-6 max-w-5xl pb-16">
        <div className="space-y-6">
          <div className="flex justify-between items-center sticky top-0 bg-slate-50/90 backdrop-blur-md py-3 z-10 border-b border-slate-100 px-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">{test.title}</h1>
            <div className={`text-2xl font-black font-mono tabular-nums px-3 py-1 rounded-xl shadow-xs bg-white border ${remaining < 60000 ? "text-rose-600 bg-rose-50 border-rose-100 animate-pulse" : "text-slate-800 border-slate-100"}`}>
              {String(mm).padStart(2,"0")}:{String(ss).padStart(2,"0")}
            </div>
          </div>
          
          {sections.map(s => {
            const list = bySection[s.key] || [];
            if (!list.length) return null;
            return (
              <section key={s.key} className="space-y-4 pt-2">
                <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-1.5 tracking-tight">{s.label}</h2>
                {list.map((q) => { n += 1; return renderOne(q, n); })}
              </section>
            );
          })}
          <Button variant="success" className="w-full h-11 text-sm font-bold rounded-xl shadow-md shadow-emerald-100 mt-6" onClick={() => submit(false)}>{(t as any).submit}</Button>
        </div>

        {/* BẢNG TIẾN ĐỘ LÀM BÀI (STICKY SIDEBAR) */}
        <aside className="lg:sticky lg:top-4 lg:self-start order-first lg:order-last">
          <Card className="p-4 bg-white border border-slate-100 shadow-sm rounded-2xl space-y-4">
            <div className="font-bold text-xs text-slate-400 uppercase tracking-wider border-b border-slate-50 pb-2">{(t as any).progressOf || "Questions Overview"}</div>
            {sections.map(s => {
              const list = bySection[s.key] || [];
              if (!list.length) return null;
              return (
                <div key={s.key} className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-600">{s.key.toUpperCase()}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((q, i) => (
                      <div key={q.id} className={`h-7 w-7 rounded-lg border flex items-center justify-center text-xs font-bold transition-all ${isAnswered(q) ? "bg-primary border-primary text-white shadow-xs" : "border-slate-200 text-slate-500 bg-slate-50"}`}>{i+1}</div>
                    ))}
                  </div>
                </div>
              );
            })}
          </Card>
        </aside>
      </div>
    );
  }

  // Khối Math/Toán học mặc định ban đầu nếu có
  return (
    <div className="text-muted-foreground p-6">Loading standard layout...</div>
  );
}