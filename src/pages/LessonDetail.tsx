import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Upload,
  FileText,
  Trash2,
  Eye,
  Plus,
  Sparkles,
  Volume2,
  BookOpen,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export default function LessonDetail() {
  const { id: classId, lessonId } = useParams();
  const { t, lang, user } = useApp();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: cls } = useQuery({
    queryKey: ["class", classId],
    queryFn: async () =>
      (await supabase.from("classes").select("*").eq("id", classId).maybeSingle()).data,
    enabled: !!classId,
  });

  const { data: lesson } = useQuery({
    queryKey: ["lesson", lessonId],
    queryFn: async () =>
      (
        await supabase
          .from("lessons")
          .select("*, chapters(name, class_id)")
          .eq("id", lessonId)
          .maybeSingle()
      ).data,
    enabled: !!lessonId,
  });

  const { data: docs = [] } = useQuery({
    queryKey: ["lesson_docs", lessonId],
    queryFn: async () =>
      (
        await supabase
          .from("class_documents")
          .select("*")
          .eq("lesson_id", lessonId)
          .order("created_at", { ascending: false })
      ).data || [],
    enabled: !!lessonId,
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["lesson_tests", lessonId],
    queryFn: async () =>
      (
        await supabase
          .from("tests")
          .select("*")
          .eq("lesson_id", lessonId)
          .order("created_at", { ascending: false })
      ).data || [],
    enabled: !!lessonId,
  });

  const { data: vocab = [] } = useQuery({
    queryKey: ["lesson_vocab", lessonId],
    queryFn: async () =>
      (
        await supabase
          .from("vocabulary")
          .select("*")
          .eq("lesson_id", lessonId)
          .order("position")
          .order("created_at")
      ).data || [],
    enabled: !!lessonId,
  });

  const [uploading, setUploading] = useState(false);
  const [newWord, setNewWord] = useState("");
  const [busyWord, setBusyWord] = useState<string | null>(null);

  const isEnglish = (cls?.category || "").toLowerCase() === "english";

  const uploadDoc = async (file: File) => {
    if (!classId || !lessonId || !user) return;
    setUploading(true);
    try {
      const path = `${classId}/${lessonId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("class-docs")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error: insErr } = await supabase.from("class_documents").insert({
        class_id: classId,
        lesson_id: lessonId,
        uploaded_by: user.id,
        name: file.name,
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (insErr) throw insErr;
      toast.success(t?.save || "Saved");
      qc.invalidateQueries({ queryKey: ["lesson_docs", lessonId] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (d: any) => {
    await supabase.storage.from("class-docs").remove([d.storage_path]);
    await supabase.from("class_documents").delete().eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["lesson_docs", lessonId] });
  };

  const addVocab = async (word: string) => {
    if (!word.trim() || !user) return;
    const { data, error } = await supabase
      .from("vocabulary")
      .insert({
        lesson_id: lessonId,
        user_id: user.id,
        word: word.trim(),
      })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setNewWord("");
    qc.invalidateQueries({ queryKey: ["lesson_vocab", lessonId] });
    aiFill(data.id, word.trim());
  };

  const aiFill = async (id: string, word: string) => {
    setBusyWord(id);
    try {
      const { data, error } = await supabase.functions.invoke("vocab-ai", {
        body: { word },
      });
      if (error) throw error;
      await supabase
        .from("vocabulary")
        .update({
          word_class: data.word_class,
          meaning_en: data.meaning_en,
          meaning_vi: data.meaning_vi,
          phonetic_uk: data.phonetic_uk || null,
          phonetic_us: data.phonetic_us || null,
          audio_uk_url: data.audio_uk_url || null,
          audio_us_url: data.audio_us_url || null,
          example: data.example || null,
        })
        .eq("id", id);
      qc.invalidateQueries({ queryKey: ["lesson_vocab", lessonId] });
    } catch (e: any) {
      toast.error(e.message || "AI failed");
    } finally {
      setBusyWord(null);
    }
  };

  const playAudio = (url: string | null, word: string, accent: "uk" | "us") => {
    if (url) {
      const a = new Audio(url.startsWith("//") ? "https:" + url : url);
      a.play().catch(() => speak(word, accent));
    } else speak(word, accent);
  };

  const speak = (word: string, accent: "uk" | "us") => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(word);
    u.lang = accent === "uk" ? "en-GB" : "en-US";
    window.speechSynthesis.speak(u);
  };

  const updateVocab = async (id: string, patch: any) => {
    await supabase.from("vocabulary").update(patch).eq("id", id);
    qc.invalidateQueries({ queryKey: ["lesson_vocab", lessonId] });
  };

  const deleteVocab = async (id: string) => {
    await supabase.from("vocabulary").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["lesson_vocab", lessonId] });
  };

  useEffect(() => {
    document.title = lesson ? `${lesson.name} — ${t?.appName || "Class"}` : (t?.appName || "Class");
  }, [lesson, t]);

  if (!lesson)
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading...
      </div>
    );

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-2 sm:p-4">
      {/* Top Navigation */}
      <div>
        <Button
          variant="ghost"
          onClick={() => navigate(-1)}
          className="-ml-2 mb-2 h-8 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> {t?.classes || "Classes"}
        </Button>
        <div className="space-y-1">
          {(lesson as any).chapters?.name && (
            <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-primary/10 text-primary">
              <BookOpen className="h-3 w-3" />
              {(lesson as any).chapters?.name}
            </div>
          )}
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-foreground">
            {lesson.name}
          </h1>
        </div>
      </div>

      {/* 1. Documents Section */}
      <Card className="p-5 border shadow-sm rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-semibold text-base text-foreground">
            {(t as any)?.documents || "Documents"}
          </h3>
          <label className="cursor-pointer">
            <input
              type="file"
              className="hidden"
              accept="application/pdf,image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadDoc(f);
                e.currentTarget.value = "";
              }}
            />
            <span className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-all shadow-sm">
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {uploading ? "Uploading..." : (t as any)?.upload || "Upload"}
            </span>
          </label>
        </div>

        {docs.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center italic">
            {t?.nothingHere || "Nothing here yet."}
          </div>
        ) : (
          <ul className="grid gap-2">
            {docs.map((d: any) => (
              <li
                key={d.id}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-all border border-transparent hover:border-border"
              >
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                    <FileText className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium truncate">{d.name}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link to={`/classes/${classId}/docs/${d.id}`}>
                    <Button size="sm" variant="outline" className="h-8 text-xs">
                      <Eye className="h-3.5 w-3.5 mr-1" /> View
                    </Button>
                  </Link>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => deleteDoc(d)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 2. Trial Test Section */}
      <Card className="p-5 border shadow-sm rounded-2xl space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="font-semibold text-base text-foreground">
            {(t as any)?.trialTest || "Trial Test"}
          </h3>
          <Link to={`/classes/${classId}/tests/new?lesson=${lessonId}`}>
            <Button size="sm" variant="success" className="h-8 text-xs">
              <Plus className="h-3.5 w-3.5 mr-1" />
              {(t as any)?.createTest || "Create test"}
            </Button>
          </Link>
        </div>

        {tests.length === 0 ? (
          <div className="text-xs text-muted-foreground py-6 text-center italic">
            {t?.nothingHere || "Nothing here yet."}
          </div>
        ) : (
          <ul className="grid gap-2">
            {tests.map((tst: any) => (
              <li
                key={tst.id}
                className="flex items-center justify-between p-3 rounded-xl bg-muted/40 hover:bg-muted/70 transition-all border border-transparent hover:border-border"
              >
                <Link to={`/tests/${tst.id}/edit`} className="flex-1 min-w-0 pr-2">
                  <div className="text-sm font-medium hover:text-primary truncate flex items-center gap-1.5">
                    {tst.title || "(Untitled test)"}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {tst.duration_minutes} min ·{" "}
                    <span className={tst.is_open ? "text-emerald-600 font-medium" : ""}>
                      {tst.is_open ? (t as any)?.open || "Open" : (t as any)?.closed || "Closed"}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 3. Vocabulary Section */}
      {isEnglish && (
        <Card className="p-5 border shadow-sm rounded-2xl space-y-4">
          <div className="border-b pb-3">
            <h3 className="font-semibold text-base text-foreground">
              {(t as any)?.vocabulary || "Vocabulary"}
            </h3>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Type an English word..."
              value={newWord}
              onChange={(e) => setNewWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addVocab(newWord);
              }}
              className="text-sm h-9"
            />
            <Button
              variant="success"
              size="sm"
              onClick={() => addVocab(newWord)}
              className="h-9 whitespace-nowrap"
            >
              <Sparkles className="h-3.5 w-3.5 mr-1" /> Add + AI
            </Button>
          </div>

          {vocab.length === 0 ? (
            <div className="text-xs text-muted-foreground py-6 text-center italic">
              {t?.nothingHere || "Nothing here yet."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/50 text-left text-xs font-semibold text-muted-foreground">
                  <tr>
                    <th className="py-2.5 px-3 min-w-[140px]">Word</th>
                    <th className="py-2.5 px-3 w-28">Class</th>
                    <th className="py-2.5 px-3 w-28">UK</th>
                    <th className="py-2.5 px-3 w-28">US</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Meaning (EN)</th>
                    <th className="py-2.5 px-3 min-w-[160px]">Meaning (VI)</th>
                    <th className="py-2.5 px-2 w-20 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vocab.map((v: any) => (
                    <tr key={v.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2">
                        <Input
                          value={v.word}
                          onChange={(e) => updateVocab(v.id, { word: e.target.value })}
                          className="h-8 text-xs font-medium border-transparent focus:border-input"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={v.word_class || ""}
                          placeholder="n, v, adj..."
                          onChange={(e) =>
                            updateVocab(v.id, { word_class: e.target.value })
                          }
                          className="h-8 text-xs border-transparent focus:border-input"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-sky-600 hover:text-sky-700 hover:bg-sky-50"
                            title="Listen UK"
                            onClick={() => playAudio(v.audio_uk_url, v.word, "uk")}
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-[11px] text-muted-foreground font-mono truncate">
                            {v.phonetic_uk || ""}
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                            title="Listen US"
                            onClick={() => playAudio(v.audio_us_url, v.word, "us")}
                          >
                            <Volume2 className="h-3.5 w-3.5" />
                          </Button>
                          <span className="text-[11px] text-muted-foreground font-mono truncate">
                            {v.phonetic_us || ""}
                          </span>
                        </div>
                      </td>
                      <td className="p-2">
                        <Input
                          value={v.meaning_en || ""}
                          onChange={(e) =>
                            updateVocab(v.id, { meaning_en: e.target.value })
                          }
                          className="h-8 text-xs border-transparent focus:border-input"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={v.meaning_vi || ""}
                          onChange={(e) =>
                            updateVocab(v.id, { meaning_vi: e.target.value })
                          }
                          className="h-8 text-xs border-transparent focus:border-input"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-amber-600 hover:bg-amber-50"
                            disabled={busyWord === v.id}
                            onClick={() => aiFill(v.id, v.word)}
                            title="AI Fill details"
                          >
                            <Sparkles
                              className={`h-3.5 w-3.5 ${
                                busyWord === v.id ? "animate-spin text-amber-500" : ""
                              }`}
                            />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            onClick={() => deleteVocab(v.id)}
                            title="Delete"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}