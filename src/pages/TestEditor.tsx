import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Latex } from "@/components/Latex";
import { QuestionImagePreview } from "@/components/QuestionImage";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, Music } from "lucide-react";

type Q = {
  id?: string;
  part: "mcq" | "tf" | "short" | "long";
  position: number;
  statement_latex: string;
  options: any;
  correct: any;
  points: number;
  image_url?: string | null;
  section?: string | null;
  passage?: string | null;
  audio_url?: string | null;
  part_title?: string | null;
  _new?: boolean;
};

const EN_SECTIONS = [
  { key: "listening", label: "I. LISTENING" },
  { key: "language",  label: "II. LANGUAGE" },
  { key: "reading",   label: "III. READING" },
  { key: "writing",   label: "IV. WRITING" },
] as const;

export default function TestEditor() {
  const { testId, classId: classIdParam } = useParams();
  const [search] = useSearchParams();
  const classId = classIdParam || search.get("class");
  const lessonId = search.get("lesson");
  const { user, t, lang } = useApp();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [isOpen, setIsOpen] = useState(true);
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loaded, setLoaded] = useState(!testId);
  const [cls, setCls] = useState<any>(null);
  const [uploadingAudio, setUploadingAudio] = useState<Record<number, boolean>>({});

  useEffect(() => {
    (async () => {
      let cid = classId;
      if (!cid && testId) {
        const { data } = await supabase.from("tests").select("class_id").eq("id", testId).maybeSingle();
        cid = data?.class_id || null;
      }
      if (cid) {
        const { data } = await supabase.from("classes").select("*").eq("id", cid).maybeSingle();
        setCls(data);
      }
    })();
  }, [classId, testId]);

  const isEnglish = true; // Ép cấu hình hoặc dựa trên logic môn học của bạn: (cls?.category || "").toLowerCase() === "english" || (cls?.name || "").toLowerCase().includes("english");

  useEffect(() => {
    document.title = (t as any).editTest;
    if (!testId) return;
    (async () => {
      const { data: tst } = await supabase.from("tests").select("*").eq("id", testId).maybeSingle();
      if (tst) {
        setTitle(tst.title); setDuration(tst.duration_minutes); setIsOpen(tst.is_open);
      }
      const { data: qs } = await supabase.from("test_questions").select("*").eq("test_id", testId).order("position");
      setQuestions((qs || []) as any);
      setLoaded(true);
    })();
  }, [testId]);

  const addQ = (part: Q["part"]) => {
    const base: Q = {
      part,
      position: questions.length,
      statement_latex: "",
      options: part === "mcq" ? { A: "", B: "", C: "", D: "" } : part === "tf" ? [{ label: "", value: true }] : {},
      correct: part === "mcq" ? { choice: "A" } : part === "tf" ? {} : part === "short" ? { value: "" } : { long_answer: "" },
      points: 1,
      image_url: null,
      section: null,
      passage: null,
      audio_url: null,
      part_title: "",
      _new: true,
    };
    setQuestions([...questions, base]);
  };

  const addEnQ = (section: string, part: Q["part"]) => {
    const base: Q = {
      part,
      position: questions.length,
      statement_latex: "",
      options: part === "mcq" ? { A: "", B: "", C: "", D: "" } : part === "tf" ? [{ label: "", value: true }] : {},
      correct: part === "mcq" ? { choice: "A" } : part === "tf" ? {} : part === "short" ? { value: "" } : { long_answer: "" },
      points: 1,
      image_url: null,
      section,
      passage: null,
      audio_url: null,
      part_title: "",
      _new: true,
    };
    setQuestions([...questions, base]);
  };

  const updateQ = (idx: number, patch: Partial<Q>) => {
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
  };

  const removeQ = async (idx: number) => {
    const q = questions[idx];
    if (q.id) await supabase.from("test_questions").delete().eq("id", q.id);
    setQuestions(qs => qs.filter((_, i) => i !== idx));
  };

  const handleAudioUpload = async (idx: number, file: File) => {
    if (!user) return;
    setUploadingAudio(prev => ({ ...prev, [idx]: true }));
    try {
      const ext = (file.name.split(".").pop() || "mp3").toLowerCase();
      const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("test-audios").upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data } = supabase.storage.from("test-audios").getPublicUrl(path);
      updateQ(idx, { audio_url: data.publicUrl });
      toast.success(lang === "vi" ? "Tải lên file âm thanh thành công" : "Audio uploaded successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploadingAudio(prev => ({ ...prev, [idx]: false }));
    }
  };

  const addTfRow = (idx: number) => {
    const q = questions[idx];
    const currentOptions = Array.isArray(q.options) ? q.options : [];
    const newOptions = [...currentOptions, { label: "", value: true }];
    updateQ(idx, { options: newOptions });
  };

  const removeTfRow = (qIdx: number, subIdx: number) => {
    const q = questions[qIdx];
    if (!Array.isArray(q.options)) return;
    const newOptions = q.options.filter((_, i) => i !== subIdx);
    updateQ(qIdx, { options: newOptions });
  };

  const updateTfRow = (qIdx: number, subIdx: number, patch: any) => {
    const q = questions[qIdx];
    if (!Array.isArray(q.options)) return;
    const newOptions = q.options.map((opt, i) => i === subIdx ? { ...opt, ...patch } : opt);
    updateQ(qIdx, { options: newOptions });
  };

  const save = async () => {
    if (!user) return;
    let id = testId;
    if (!id) {
      if (!classId) return toast.error("Missing class");
      const { data, error } = await supabase.from("tests").insert({
        class_id: classId, teacher_id: user.id, title, duration_minutes: duration, is_open: isOpen,
        lesson_id: lessonId || null,
      }).select().single();
      if (error) return toast.error(error.message);
      id = data.id;
    } else {
      await supabase.from("tests").update({ title, duration_minutes: duration, is_open: isOpen }).eq("id", id);
    }

    let pos = 0;
    for (const q of questions) {
      const payload = {
        test_id: id, part: q.part, position: pos++,
        statement_latex: q.statement_latex, options: q.options, correct: q.correct, points: q.points,
        image_url: q.image_url || null,
        section: q.section || null,
        passage: q.passage || null,
        audio_url: q.audio_url || null,
        part_title: q.part_title || null,
      };
     if (q.id) await supabase.from("test_questions").update(payload as any).eq("id", q.id);
else await supabase.from("test_questions").insert(payload as any);
    }
    toast.success(t.save);
    navigate(`/classes/${classId || ""}`);
  };

  if (!loaded) return <div className="text-muted-foreground">…</div>;

  const uploadImage = async (idx: number, file: File) => {
    if (!user) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const { error: upErr } = await supabase.storage.from("test-images").upload(path, file, { upsert: false });
    if (upErr) return toast.error(upErr.message);
    updateQ(idx, { image_url: path });
    toast.success("Image uploaded");
  };

  const renderQ = (q: Q, idx: number) => (
    <Card key={idx} className="p-5 bg-white border border-slate-100 shadow-sm rounded-xl space-y-4">
      <div className="flex justify-between items-center border-b border-slate-50 pb-2">
        <div className="flex items-center space-x-2">
          <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-bold uppercase tracking-wide">
            {q.part === "mcq" ? "MCQ" : q.part === "tf" ? "True/False" : q.part === "short" ? "Short Ans" : "Long Ans/Writing"}
          </span>
          <Input 
            className="h-7 text-xs w-48 bg-slate-50 border-0 rounded-md font-medium" 
            placeholder={lang === "vi" ? "Tiêu đề của nhóm/câu hỏi..." : "Part heading/title..."}
            value={q.part_title || ""}
            onChange={(e) => updateQ(idx, { part_title: e.target.value })}
          />
        </div>
        <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 rounded-lg" onClick={() => removeQ(idx)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {isEnglish && (
        <div className="grid grid-cols-1 gap-3 bg-slate-50/50 p-3 rounded-lg border border-slate-100">
          {(q.section === "listening") && (
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">
                <Music className="h-3.5 w-3.5 text-teal-500" /> {lang === "vi" ? "Tải File Audio của Part này" : "Audio File for this part"}
              </Label>
              <div className="flex items-center gap-2">
                <Input 
                  type="file" 
                  accept="audio/*" 
                  className="bg-white text-xs rounded-lg border-slate-200 h-9" 
                  disabled={uploadingAudio[idx]}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleAudioUpload(idx, f);
                  }}
                />
              </div>
              {q.audio_url && (
                <div className="mt-2 p-2 bg-white rounded border border-slate-100 flex items-center gap-2">
                  <audio src={q.audio_url} controls className="h-8 w-full max-w-sm" />
                  <Button size="sm" variant="ghost" className="text-destructive text-xs h-7 px-2" onClick={() => updateQ(idx, { audio_url: null })}>{lang === "vi" ? "Xóa Audio" : "Remove"}</Button>
                </div>
              )}
            </div>
          )}
          {(q.section === "reading" || q.section === "listening") && (
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1">
                {lang === "vi" ? "Đoạn văn Passage / Script bài nghe (Hiển thị phía trên câu hỏi)" : "Passage / Script text"}
              </Label>
              <Textarea 
                rows={3} 
                className="bg-white text-sm border-slate-200 rounded-lg"
                placeholder={lang === "vi" ? "Nhập văn bản hoặc nội dung kịch bản phát..." : "Enter text passage..."}
                value={q.passage || ""} 
                onChange={(e) => updateQ(idx, { passage: e.target.value })} 
              />
            </div>
          )}
        </div>
      )}

      <div>
        <Label className="text-xs font-semibold text-slate-600 mb-1">
          {lang === "vi" ? "Nội dung câu hỏi chính (Hỗ trợ định dạng LaTeX)" : "Question Statement / Question instructions"}
        </Label>
        <Textarea 
          className="text-sm border-slate-200 rounded-lg"
          value={q.statement_latex} 
          onChange={e => updateQ(idx, { statement_latex: e.target.value })} 
          placeholder="e.g. Choose the word whose underlined part is pronounced differently." 
        />
        {q.statement_latex && (
          <div className="mt-2 p-2 rounded-lg bg-slate-50 border border-slate-100 text-sm">
            <span className="text-[10px] text-slate-400 block font-bold mb-1">PREVIEW:</span>
            <Latex>{q.statement_latex}</Latex>
          </div>
        )}
      </div>

      <div>
        <Label className="text-xs font-semibold text-slate-600 mb-1">Hình ảnh đính kèm (Không bắt buộc)</Label>
        <div className="flex items-center gap-2">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(idx, f); e.target.value = ""; }}
            className="text-xs file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:font-semibold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200"
          />
          {q.image_url && (
            <Button size="sm" variant="ghost" className="text-destructive text-xs h-7 px-2" onClick={() => updateQ(idx, { image_url: null })}>
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove Image
            </Button>
          )}
        </div>
        {q.image_url && <div className="mt-2 max-w-xs"><QuestionImagePreview path={q.image_url} /></div>}
      </div>

      {/* RENDER CÁC ĐÁP ÁN THEO DẠNG CÂU HỎI */}
      {q.part === "mcq" && (
        <div className="grid sm:grid-cols-2 gap-3 pt-2">
          {(["A","B","C","D"] as const).map(k => (
            <div key={k} className="flex items-center gap-2 bg-slate-50/50 p-2 rounded-lg border border-slate-100">
              <button type="button"
                onClick={() => updateQ(idx, { correct: { choice: k } })}
                className={`h-5 w-5 shrink-0 rounded-full border-2 transition-colors flex items-center justify-center ${q.correct.choice === k ? "bg-primary border-primary" : "border-slate-300 bg-white"}`}
                title="Mark correct"
              >
                {q.correct.choice === k && <div className="h-2 w-2 bg-white rounded-full" />}
              </button>
              <span className="font-bold text-sm text-slate-700 w-4">{k}.</span>
              <Input className="h-8 text-xs bg-white border-slate-200 rounded-md" value={q.options[k] || ""} onChange={e => updateQ(idx, { options: { ...q.options, [k]: e.target.value } })} />
            </div>
          ))}
        </div>
      )}

      {q.part === "tf" && (
        <div className="space-y-2 pt-1 bg-slate-50/40 p-3 rounded-lg border border-slate-100">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{lang === "vi" ? "Danh sách câu lựa chọn Đúng / Sai" : "True/False Statements"}</span>
            <Button size="sm" variant="outline" className="h-7 text-xs rounded-md" onClick={() => addTfRow(idx)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> {lang === "vi" ? "Thêm câu chọn" : "Add statement"}
            </Button>
          </div>
          {Array.isArray(q.options) && q.options.map((opt: any, subIdx: number) => (
            <div key={subIdx} className="flex items-center gap-3 bg-white p-2 rounded-lg border border-slate-100 shadow-xs">
              <span className="font-bold text-xs text-slate-500 shrink-0">#{subIdx + 1}</span>
              <Input 
                className="h-8 text-xs flex-1 border-slate-200 rounded-md" 
                value={opt.label || ""} 
                onChange={e => updateTfRow(idx, subIdx, { label: e.target.value })} 
                placeholder={lang === "vi" ? "Nhập nội dung mệnh đề khẳng định..." : "Enter statement text..."} 
              />
              <div className="flex items-center space-x-3 shrink-0 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name={`tf-${idx}-${subIdx}`} 
                    checked={opt.value === true} 
                    onChange={() => updateTfRow(idx, subIdx, { value: true })} 
                    className="accent-primary" 
                  />
                  True
                </label>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input 
                    type="radio" 
                    name={`tf-${idx}-${subIdx}`} 
                    checked={opt.value === false} 
                    onChange={() => updateTfRow(idx, subIdx, { value: false })} 
                    className="accent-primary" 
                  />
                  False
                </label>
              </div>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive rounded-md hover:bg-destructive/10 shrink-0" onClick={() => removeTfRow(idx, subIdx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          {(!Array.isArray(q.options) || q.options.length === 0) && (
            <div className="text-xs text-slate-400 italic text-center py-2">{lang === "vi" ? "Chưa có câu hỏi con nào. Nhấp 'Thêm câu chọn' để tạo." : "No sub-questions added yet."}</div>
          )}
        </div>
      )}

      {q.part === "short" && (
        <div className="pt-1">
          <Label className="text-xs font-semibold text-slate-600 mb-1">{lang === "vi" ? "Đáp án ngắn chính xác" : "Correct Short Answer"}</Label>
          <Input 
            className="h-9 text-sm border-slate-200 rounded-lg max-w-md font-medium"
            placeholder={lang === "vi" ? "Nhập từ khóa hoặc cụm từ đáp án chính xác..." : "Enter correct word/phrase..."}
            value={q.correct.value || ""} 
            onChange={e => updateQ(idx, { correct: { value: e.target.value } })} 
          />
        </div>
      )}

      {q.part === "long" && (
        <div className="pt-1 bg-amber-50/40 p-3 rounded-lg border border-amber-100/60">
          <Label className="text-xs font-bold text-amber-800 mb-1 block">✍️ DẠNG WRITING / LONG ANSWER (TỰ LUẬN DÀI)</Label>
          <p className="text-[11px] text-amber-600 mb-2">{lang === "vi" ? "* Học sinh sẽ được cung cấp khung hộp lớn để gõ bài luận độc lập. Phần này giáo viên sẽ chấm điểm thủ công sau." : "* Students will have a text box to write an essay. This part requires manual grading later."}</p>
        </div>
      )}
    </Card>
  );

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t.classes}
      </Button>
      
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{(t as any).editTest}</h1>
          <p className="text-xs text-slate-400 mt-1">{lang === "vi" ? "Cấu hình bài thi thử Tiếng Anh đa dạng chuyên sâu" : "Configure English comprehensive trials"}</p>
        </div>
        <Button variant="success" onClick={save} className="rounded-xl px-6 font-bold shadow-md shadow-emerald-100 shrink-0">{t.save}</Button>
      </div>

      <Card className="p-5 bg-white border border-slate-100 shadow-sm rounded-2xl space-y-4">
        <div>
          <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{(t as any).title}</Label>
          <Input className="mt-1.5 rounded-lg border-slate-200 h-10 font-medium text-slate-800" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Mid-term English Exam 1" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">{(t as any).duration} ({lang === "vi" ? "phút" : "mins"})</Label>
            <Input className="mt-1.5 rounded-lg border-slate-200 h-10" type="number" value={duration} onChange={e => setDuration(+e.target.value)} />
          </div>
          <div className="flex items-center pt-4 sm:pt-6">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-primary accent-primary" checked={isOpen} onChange={e => setIsOpen(e.target.checked)} />
              {lang === "vi" ? "Mở cho phép làm bài công khai" : "Open for testing / active"}
            </label>
          </div>
        </div>
      </Card>

      {/* RENDER BỐ CỤC CÁC PHẦN ĐỀ THI TIẾNG ANH (I -> IV) */}
      {EN_SECTIONS.map(sec => (
        <div key={sec.key} className="space-y-4 pt-2">
          <div className="flex flex-wrap justify-between items-center gap-2 border-b border-slate-200 pb-2 mt-4">
            <h2 className="text-lg font-black text-slate-800 tracking-tight">{sec.label}</h2>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
              <span className="text-[10px] font-bold text-slate-500 uppercase px-2">{lang === "vi" ? "Thêm câu hỏi:" : "Add type:"}</span>
              <Button size="sm" variant="ghost" className="h-7 text-xs font-bold hover:bg-white rounded-md px-2.5 text-slate-700" onClick={() => addEnQ(sec.key, "mcq")}>+ MCQ</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs font-bold hover:bg-white rounded-md px-2.5 text-slate-700" onClick={() => addEnQ(sec.key, "tf")}>+ T/F</Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs font-bold hover:bg-white rounded-md px-2.5 text-slate-700" onClick={() => addEnQ(sec.key, "short")}>+ Short</Button>
              {sec.key === "writing" && (
                <Button size="sm" variant="ghost" className="h-7 text-xs font-bold hover:bg-amber-500 hover:text-white rounded-md px-2.5 text-amber-700 font-extrabold" onClick={() => addEnQ(sec.key, "long")}>+ Writing Essay</Button>
              )}
            </div>
          </div>
          
          <div className="space-y-4">
            {questions.filter(q => q.section === sec.key).map(q => renderQ(q, questions.indexOf(q)))}
            {questions.filter(q => q.section === sec.key).length === 0 && (
              <div className="text-xs text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 text-center py-6 rounded-xl">
                {lang === "vi" ? `Chưa có câu hỏi nào thuộc phần ${sec.label}.` : `No questions in ${sec.label} yet.`}
              </div>
            )}
          </div>
        </div>
      ))}

      <Button variant="success" onClick={save} className="w-full h-11 text-sm font-bold rounded-xl shadow-lg mt-4">{t.save}</Button>
    </div>
  );
}