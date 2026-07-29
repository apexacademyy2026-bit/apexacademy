import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Latex } from "@/components/Latex";
import { QuestionImage } from "@/components/QuestionImage";
import { ScoreGauge } from "@/components/ScoreGauge";
import { Check, X, Headset, BookOpen, FileText } from "lucide-react";

export default function TestResult() {
  const { testId, attemptId } = useParams();
  const { t, lang } = useApp();
  const [test, setTest] = useState<any>(null);
  const [attempt, setAttempt] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    document.title = (t as any).yourScore;
    if (!attemptId) return;
    (async () => {
      const { data: a } = await supabase.from("test_attempts").select("*").eq("id", attemptId).maybeSingle();
      setAttempt(a);
      if (a) {
        const { data: tst } = await supabase.from("tests").select("*").eq("id", a.test_id).maybeSingle();
        setTest(tst);
        const { data: qs } = await supabase.rpc("get_attempt_review", { _attempt_id: attemptId });
        setQuestions(qs || []);
      }
    })();
  }, [attemptId]);

  const isEnglish = true; 

  const bySection = useMemo(() => {
    const map: Record<string, any[]> = { listening: [], language: [], reading: [], writing: [] };
    for (const q of questions) {
      if (q.section && map[q.section]) {
        map[q.section].push(q);
      }
    }
    return map;
  }, [questions]);

  if (!attempt || !test) return <div className="text-muted-foreground p-6">…</div>;

  const ans = attempt.answers || {};

  const allCorrect = (q: any) => {
    const a = ans[q.id];
    if (!a) return false;
    if (q.part === "mcq") return a.choice === q.correct?.choice;
    if (q.part === "tf") {
      if (Array.isArray(q.options)) {
        return q.options.every((opt: any, idx: number) => a[idx] === opt.value);
      }
      return ["a","b","c","d"].every(k => a[k] === q.correct?.[k]);
    }
    if (q.part === "short") return (a.value || "").trim().toLowerCase() === (q.correct?.value || "").trim().toLowerCase();
    if (q.part === "long") return true; // Phần tự luận chấm tay, mặc định hiển thị xanh hoặc trung tính
    return false;
  };

  const renderOneReview = (q: any, num: number) => {
    const ok = allCorrect(q);
    const a = ans[q.id] || {};

    return (
      <Card key={q.id} className="p-5 bg-white border border-slate-100 shadow-sm rounded-xl space-y-4">
        {q.part_title && (
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-50 pb-1.5 flex items-center gap-1.5">
            {q.section === "listening" && <Headset className="h-3.5 w-3.5 text-teal-500" />}
            {q.section === "reading" && <BookOpen className="h-3.5 w-3.5 text-primary" />}
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
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 text-sm leading-relaxed whitespace-pre-wrap border-l-4 border-slate-400 font-serif text-slate-800 shadow-inner">
            {q.passage}
          </div>
        )}

        <div className="flex items-start gap-2.5">
          {q.part !== "long" && (
            ok ? <Check className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" /> : <X className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
          )}
          <div className="text-slate-950 font-medium">
            <span className="font-extrabold text-slate-900 mr-1">Question {num}.</span> 
            <Latex>{q.statement_latex}</Latex>
          </div>
        </div>

        {q.image_url && <div className="max-w-md rounded-lg overflow-hidden"><QuestionImage path={q.image_url} /></div>}

        {/* REVIEW MCQ */}
        {q.part === "mcq" && (
          <div className="grid sm:grid-cols-2 gap-3 pt-1">
            {(["A","B","C","D"] as const).map(k => {
              const sel = a.choice === k;
              const isCorrect = q.correct?.choice === k;
              
              let borderClass = "border-slate-200 bg-white text-slate-700";
              if (isCorrect) borderClass = "border-emerald-500 bg-emerald-50/60 text-emerald-950 font-semibold";
              else if (sel && !isCorrect) borderClass = "border-rose-400 bg-rose-50/60 text-rose-950 line-through";

              return (
                <div key={k} className={`flex items-start gap-3 p-3 rounded-xl border text-sm ${borderClass}`}>
                  <span className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 text-[10px] font-bold ${isCorrect ? "bg-emerald-500 text-white" : sel ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                    {k}
                  </span>
                  <span><Latex>{q.options?.[k] || ""}</Latex></span>
                </div>
              );
            })}
          </div>
        )}

        {/* REVIEW DYNAMIC TRUE/FALSE */}
        {q.part === "tf" && (
          <div className="space-y-2 pt-1 bg-slate-50/50 p-3 rounded-xl border border-slate-100">
            {Array.isArray(q.options) && q.options.map((opt: any, subIdx: number) => {
              const studentVal = a[subIdx];
              const correctVal = opt.value;
              const isSubCorrect = studentVal === correctVal;

              return (
                <div key={subIdx} className="flex flex-col sm:flex-row sm:items-center gap-3 bg-white p-2.5 rounded-lg border border-slate-100 shadow-xs">
                  <div className="flex-1 text-sm font-medium text-slate-700">
                    <span className="font-bold text-slate-400 mr-1.5">#{subIdx + 1}</span>
                    <Latex>{opt.label || ""}</Latex>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                    <span className={`text-xs px-2.5 py-0.5 rounded font-bold border ${correctVal ? "bg-emerald-50 border-emerald-200 text-emerald-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                      Keys: {correctVal ? "True" : "False"}
                    </span>
                    <span className={`text-xs px-2.5 py-0.5 rounded font-bold border ${isSubCorrect ? "bg-slate-100 border-slate-200 text-slate-600" : "bg-rose-500 border-rose-500 text-white line-through"}`}>
                      Yours: {studentVal === true ? "True" : studentVal === false ? "False" : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* REVIEW SHORT ANSWER */}
        {q.part === "short" && (
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm space-y-1">
            <div>
              <span className="text-slate-500 font-medium">{lang === "vi" ? "Bài làm của bạn: " : "Your response: "}</span>
              <span className={`font-bold ${ok ? "text-emerald-600" : "text-rose-600 line-through"}`}>{a.value || "—"}</span>
            </div>
            {!ok && (
              <div className="text-emerald-700 font-semibold">
                <span>→ {lang === "vi" ? "Đáp án đúng: " : "Correct key: "}</span>
                <span className="bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-xs">{q.correct?.value}</span>
              </div>
            )}
          </div>
        )}

        {/* REVIEW LONG ANSWER (WRITING ESSAY) */}
        {q.part === "long" && (
          <div className="space-y-2 bg-amber-50/30 p-4 rounded-xl border border-amber-100">
            <div className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1">
              <FileText className="h-3.5 w-3.5 text-amber-500" /> {lang === "vi" ? "Bài luận đã nộp của bạn" : "Your submitted essay"}
            </div>
            <div className="p-3 bg-white border border-amber-200/60 rounded-lg text-sm text-slate-800 leading-relaxed whitespace-pre-wrap font-sans shadow-xs min-h-[100px]">
              {a.long_answer || <span className="text-slate-400 italic">{lang === "vi" ? "(Bỏ trống bài làm)" : "(Empty content)"}</span>}
            </div>
            <div className="text-[11px] font-medium text-amber-600 italic">
              {lang === "vi" ? "* Phần Writing này sẽ được thầy cô chấm điểm và cập nhật tổng kết sau." : "* This writing essay requires teacher's manual evaluation."}
            </div>
          </div>
        )}
      </Card>
    );
  };

  const sections = [
    { key: "listening", label: "I. LISTENING" },
    { key: "language",  label: "II. LANGUAGE" },
    { key: "reading",   label: "III. READING" },
    { key: "writing",   label: "IV. WRITING" },
  ];
  let n = 0;

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <Card className="p-6 bg-white border border-slate-100 shadow-sm rounded-2xl flex flex-col items-center gap-4 text-center">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight uppercase">{test.title}</h1>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{lang === "vi" ? "Kết quả làm bài" : "Review Performance"}</div>
        </div>

        <ScoreGauge score={Number(attempt.score)} max={10} />

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Link to={`/student/tests/${testId}/take`}><Button variant="outline" className="rounded-xl font-bold h-10 px-5">{t.retake}</Button></Link>
          {test.class_id && (
            <Link to={`/student/classes/${test.class_id}`}><Button variant="success" className="rounded-xl font-bold h-10 px-5">← {(t as any).backToClass || "Quay lại lớp"}</Button></Link>
          )}
        </div>
      </Card>

      {/* RENDER CHI TIẾT TỪNG PHẦN TIẾNG ANH */}
      {sections.map(s => {
        const list = bySection[s.key] || [];
        if (!list.length) return null;
        return (
          <section key={s.key} className="space-y-4 pt-2">
            <h2 className="text-lg font-black text-slate-800 border-b-2 border-slate-200 pb-1.5 tracking-tight">{s.label}</h2>
            <div className="space-y-4">
              {list.map((q) => { 
                n += 1; 
                return renderOneReview(q, n); 
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}