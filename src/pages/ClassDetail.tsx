import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Copy, RefreshCw, Plus, Link2, Upload, FileText, Trash2, Eye, BookOpen, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useClassSchedules } from "@/hooks/useData";
import { fmtDate } from "@/lib/format";
import ClassDialog from "@/components/ClassDialog";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";

export default function ClassDetail() {
  const { id } = useParams();
  const { t, lang } = useApp();
  const navigate = useNavigate();
  const schedules = useClassSchedules(id);
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);

  const { data: cls } = useQuery({
    queryKey: ["class", id],
    queryFn: async () => (await supabase.from("classes").select("*").eq("id", id).single()).data,
    enabled: !!id,
  });

  const { data: tests = [] } = useQuery({
    queryKey: ["tests", id],
    queryFn: async () => (await supabase.from("tests").select("*").eq("class_id", id).order("created_at", { ascending: false })).data || [],
    enabled: !!id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["class_members", id],
    queryFn: async () => (await supabase.from("class_members").select("*").eq("class_id", id)).data || [],
    enabled: !!id,
  });

  const memberIds = (members as any[]).map((m: any) => m.student_id);
  const { data: memberProfiles = [] } = useQuery({
    queryKey: ["class_member_profiles", id, memberIds.join(",")],
    queryFn: async () => {
      if (!memberIds.length) return [];
      const { data } = await supabase.from("profiles").select("id, display_name, phone").in("id", memberIds);
      return data || [];
    },
    enabled: memberIds.length > 0,
  });

  // Teacher's roster enrolled in this class (for linking)
  const { data: rosterInClass = [] } = useQuery({
    queryKey: ["roster_in_class", id],
    queryFn: async () => {
      const { data: enr } = await supabase.from("enrollments").select("student_id").eq("class_id", id);
      const sids = (enr || []).map((e: any) => e.student_id);
      if (!sids.length) return [];
      const { data } = await supabase.from("students").select("*").in("id", sids);
      return data || [];
    },
    enabled: !!id,
  });

  const [linkChoice, setLinkChoice] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [newChapter, setNewChapter] = useState("");
  const [newLessonName, setNewLessonName] = useState<Record<string, string>>({});
  const [openChapter, setOpenChapter] = useState<Record<string, boolean>>({});

  const { data: chapters = [] } = useQuery({
    queryKey: ["chapters", id],
    queryFn: async () =>
      (await supabase.from("chapters").select("*").eq("class_id", id).order("position").order("created_at")).data || [],
    enabled: !!id,
  });

  const chapterIds = (chapters as any[]).map((c: any) => c.id);
  const { data: lessons = [] } = useQuery({
    queryKey: ["lessons", id, chapterIds.join(",")],
    queryFn: async () => {
      if (!chapterIds.length) return [];
      const { data } = await supabase.from("lessons").select("*").in("chapter_id", chapterIds).order("position").order("created_at");
      return data || [];
    },
    enabled: chapterIds.length > 0,
  });

  const addChapter = async () => {
    if (!newChapter.trim() || !id) return;
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { error } = await supabase.from("chapters").insert({ class_id: id, user_id: u.id, name: newChapter.trim() });
    if (error) return toast.error(error.message);
    setNewChapter("");
    qc.invalidateQueries({ queryKey: ["chapters", id] });
  };
  const deleteChapter = async (cid: string) => {
    await supabase.from("chapters").delete().eq("id", cid);
    qc.invalidateQueries({ queryKey: ["chapters", id] });
    qc.invalidateQueries({ queryKey: ["lessons", id] });
  };
  const addLesson = async (chapterId: string) => {
    const name = (newLessonName[chapterId] || "").trim();
    if (!name) return;
    const { data: { user: u } } = await supabase.auth.getUser();
    if (!u) return;
    const { error } = await supabase.from("lessons").insert({ chapter_id: chapterId, user_id: u.id, name });
    if (error) return toast.error(error.message);
    setNewLessonName({ ...newLessonName, [chapterId]: "" });
    qc.invalidateQueries({ queryKey: ["lessons", id] });
  };
  const deleteLesson = async (lid: string) => {
    await supabase.from("lessons").delete().eq("id", lid);
    qc.invalidateQueries({ queryKey: ["lessons", id] });
  };

  const { data: docs = [] } = useQuery({
    queryKey: ["class_docs", id],
    queryFn: async () => (await supabase.from("class_documents").select("*").eq("class_id", id).order("created_at", { ascending: false })).data || [],
    enabled: !!id,
  });

  const uploadDoc = async (file: File) => {
    if (!id || !cls) return;
    setUploading(true);
    try {
      const path = `${id}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("class-docs").upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: insErr } = await supabase.from("class_documents").insert({
        class_id: id, uploaded_by: user!.id, name: file.name, storage_path: path,
        mime_type: file.type, size_bytes: file.size,
      });
      if (insErr) throw insErr;
      toast.success(t.save);
      qc.invalidateQueries({ queryKey: ["class_docs", id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (d: any) => {
    await supabase.storage.from("class-docs").remove([d.storage_path]);
    await supabase.from("class_documents").delete().eq("id", d.id);
    qc.invalidateQueries({ queryKey: ["class_docs", id] });
  };

  const linkedUserIds = new Set(
    (rosterInClass as any[]).map((r: any) => r.linked_user_id).filter(Boolean),
  );
  const pendingMembers = (memberProfiles as any[]).filter((p: any) => !linkedUserIds.has(p.id));
  const availableRoster = (rosterInClass as any[]).filter((r: any) => !r.linked_user_id);

  const linkAccount = async (userId: string) => {
    const rosterId = linkChoice[userId];
    if (!rosterId) return;
    const { error } = await supabase
      .from("students")
      .update({ linked_user_id: userId })
      .eq("id", rosterId);
    if (error) return toast.error(error.message);
    toast.success(t.save);
    qc.invalidateQueries({ queryKey: ["roster_in_class", id] });
  };

  const unlinkRoster = async (rosterId: string) => {
    const { error } = await supabase
      .from("students")
      .update({ linked_user_id: null })
      .eq("id", rosterId);
    if (error) return toast.error(error.message);
    toast.success(t.save);
    qc.invalidateQueries({ queryKey: ["roster_in_class", id] });
  };

  const regenCode = async () => {
    const code = Math.random().toString(36).slice(2, 8).toUpperCase();
    const { error } = await supabase.from("classes").update({ join_code: code }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(t.save); qc.invalidateQueries({ queryKey: ["class", id] }); }
  };

  const copyCode = async () => {
    if (!cls?.join_code) return;
    await navigator.clipboard.writeText(cls.join_code);
    toast.success("Copied");
  };

  useEffect(() => { document.title = cls ? `${cls.name} — ${t.appName}` : t.appName; }, [cls, t]);

  if (!cls) return <div className="text-muted-foreground">…</div>;

  return (
    <div className="space-y-6 max-w-5xl pb-12">
      {/* Nút quay lại */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4 mr-1" /> {t.classes}
      </Button>

      {/* --- 1. HEADER LỚP HỌC MỚI --- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between p-6 sm:p-8 bg-white rounded-2xl shadow-sm border border-slate-100 gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-white font-bold text-xl shadow-md shadow-inner" style={{ background: cls.color || '#0ea5e9' }}>
            {cls.subject ? cls.subject.charAt(0).toUpperCase() : 'M'}
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight uppercase">{cls.name}</h1>
            <div className="text-slate-500 font-medium mt-0.5">
              {cls.subject} {cls.grade && `· ${lang === "vi" ? "Lớp" : "Grade"} ${cls.grade}`}
            </div>
            {cls.start_date && (
              <div className="text-xs text-slate-400 mt-1">
                {fmtDate(cls.start_date)} {cls.end_date && `– ${fmtDate(cls.end_date)}`}
              </div>
            )}
          </div>
        </div>
        <Button variant="outline" onClick={() => setEditing(true)} className="rounded-xl border-slate-200 hover:bg-slate-50 self-start sm:self-center">
          <Pencil className="h-4 w-4 mr-2 text-slate-500" /> {t.edit}
        </Button>
      </div>

      {/* --- 2. BỐ CỤC LƯỚI 3 CỘT: MÃ, HỌC PHÍ, LỊCH HỌC --- */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        
        {/* Cột 1: Mã tham gia (Join Code) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between min-h-[160px]">
          <div>
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{(t as any).joinCode}</h3>
            <div className="text-3xl font-black text-slate-900 font-mono tracking-wider mt-2 mb-4">
              {cls.join_code || "—"}
            </div>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={copyCode} className="flex-1 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border-0">
              <Copy className="h-4 w-4 mr-1.5 text-slate-500" />
              {(t as any).copyCode}
            </Button>
            <Button variant="outline" size="sm" onClick={regenCode} className="rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-600 border-0" title={(t as any).regenerateCode}>
              <RefreshCw className="h-4 w-4 text-slate-500" />
            </Button>
          </div>
        </div>

        {/* Cột 2: Cấu hình Học phí (Fees) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between min-h-[160px]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{(t as any).fees || "Fees"}</h3>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div className="border-r border-slate-100 pr-2">
              <div className="text-[11px] text-slate-400 font-medium">{(t as any).feePerMonth || "Per month"}</div>
              <div className="text-xl font-bold text-emerald-600 mt-1 truncate">
                {Number(cls.fee_per_month || 0).toLocaleString("vi-VN")} <span className="text-xs font-normal text-slate-400">₫</span>
              </div>
            </div>
            <div className="pl-2">
              <div className="text-[11px] text-slate-400 font-medium">{(t as any).feePerSession || "Per session"}</div>
              <div className="text-xl font-bold text-orange-500 mt-1 truncate">
                {Number(cls.fee_per_session || 0).toLocaleString("vi-VN")} <span className="text-xs font-normal text-slate-400">₫</span>
              </div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 italic mt-2">
            {lang === "vi" ? "* Áp dụng khi tạo hóa đơn học phí" : "* Applied for monthly invoices"}
          </div>
        </div>

        {/* Cột 3: Lịch học cố định (Weekly Schedule) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between min-h-[160px]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{t.weeklySchedule}</h3>
          <div className="mt-2 flex-1 flex flex-col justify-center">
            {(schedules.data || []).length === 0 ? (
              <div className="text-xs text-slate-400 italic">{t.nothingHere}</div>
            ) : (
              <div className="space-y-1.5 max-h-[85px] overflow-y-auto pr-1">
                {(schedules.data || []).map((s: any) => (
                  <div key={s.id} className="flex justify-between items-center text-xs p-1.5 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="font-semibold text-slate-700">{t.daysLong[s.day_of_week]}</span>
                    <span className="text-slate-600 font-mono font-medium">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* --- 3. KHU VỰC CHI TIẾT DANH SÁCH & BÀI HỌC --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
        
        {/* Học sinh lớp học */}
        <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <h3 className="font-bold text-slate-900 mb-3 text-base flex items-center justify-between">
            <span>{t.enrolledStudents}</span>
            <span className="px-2.5 py-0.5 text-xs font-semibold bg-slate-100 text-slate-600 rounded-full">{(memberProfiles as any[]).length}</span>
          </h3>
          {(memberProfiles as any[]).length === 0 ? (
            <div className="text-sm text-slate-400 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed">{t.nothingHere}</div>
          ) : (
            <ul className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
              {(memberProfiles as any[]).map((p: any) => (
                <li key={p.id}>
                  <Link
                    to={`/classes/${id}/members/${p.id}`}
                    className="flex items-center gap-3 p-3 rounded-xl bg-slate-50/60 hover:bg-slate-100/80 border border-slate-100 transition-colors group"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800 group-hover:text-primary transition-colors truncate">{p.display_name || "—"}</div>
                      {p.phone && <div className="text-xs text-slate-400 mt-0.5 truncate">{p.phone}</div>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Chương & Bài học */}
        <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-900 mb-3 text-base">{lang === "vi" ? "Chương & Bài học" : "Chapters & Lessons"}</h3>
          <div className="flex gap-2 mb-4">
            <Input 
              placeholder={lang === "vi" ? "Tên chương mới…" : "New chapter name…"} 
              value={newChapter}
              onChange={(e) => setNewChapter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addChapter(); }}
              className="rounded-lg border-slate-200 text-sm h-9"
            />
            <Button variant="success" size="sm" onClick={addChapter} className="rounded-lg h-9 shrink-0">
              <Plus className="h-4 w-4 mr-1" />
              {lang === "vi" ? "Thêm chương" : "Add chapter"}
            </Button>
          </div>
          
          {(chapters as any[]).length === 0 ? (
            <div className="text-sm text-slate-400 italic py-6 text-center bg-slate-50 rounded-xl border border-dashed">{t.nothingHere}</div>
          ) : (
            <ul className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {(chapters as any[]).map((ch: any) => {
                const chLessons = (lessons as any[]).filter((l: any) => l.chapter_id === ch.id);
                const isOpen = openChapter[ch.id] !== false;
                return (
                  <li key={ch.id} className="rounded-xl border border-slate-100 overflow-hidden bg-slate-50/40">
                    <div className="flex items-center gap-2 p-2.5 bg-slate-50 border-b border-slate-100">
                      <button onClick={() => setOpenChapter({ ...openChapter, [ch.id]: !isOpen })} className="text-slate-400 hover:text-slate-600">
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
                      </button>
                      <BookOpen className="h-4 w-4 text-primary" />
                      <span className="font-semibold text-sm text-slate-800 flex-1 truncate">{ch.name}</span>
                      <span className="text-[11px] px-1.5 py-0.5 bg-white border border-slate-200 text-slate-500 rounded-md shrink-0">{chLessons.length} {lang === "vi" ? "bài" : "lessons"}</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10 rounded-md" onClick={() => deleteChapter(ch.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="p-2.5 space-y-2 bg-white">
                        {chLessons.map((l: any) => (
                          <div key={l.id} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50/50 border border-slate-100 hover:border-slate-200 transition-colors">
                            <FileText className="h-3.5 w-3.5 text-slate-400" />
                            <Link to={`/classes/${id}/lessons/${l.id}`} className="flex-1 text-xs text-slate-700 font-medium hover:text-primary hover:underline truncate">{l.name}</Link>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-destructive/10 rounded-md" onClick={() => deleteLesson(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input 
                            placeholder={lang === "vi" ? "Tên bài học…" : "Lesson name…"}
                            value={newLessonName[ch.id] || ""}
                            onChange={(e) => setNewLessonName({ ...newLessonName, [ch.id]: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") addLesson(ch.id); }}
                            className="h-8 text-xs rounded-lg border-slate-200" 
                          />
                          <Button size="sm" variant="outline" onClick={() => addLesson(ch.id)} className="h-8 text-xs rounded-lg shrink-0">
                            <Plus className="h-3.5 w-3.5 mr-1" />{lang === "vi" ? "Thêm bài" : "Add lesson"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* --- 4. LIÊN KẾT TÀI KHOẢN (Đưa xuống dưới cùng để đỡ rối) --- */}
      <Card className="p-5 bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-2">
          <Link2 className="h-4 w-4 text-primary" />
          <h3 className="font-bold text-slate-900 text-base">{lang === "vi" ? "Liên kết tài khoản với danh sách lớp" : "Link accounts to roster"}</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          {lang === "vi"
            ? "Học sinh sau khi tham gia bằng mã cần được liên kết với hồ sơ trong danh sách của bạn để hiển thị học phí và điểm danh."
            : "Students who joined via code should be linked to a roster entry so their fees and attendance appear."}
        </p>
        
        {pendingMembers.length === 0 ? (
          <div className="text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl border border-dashed">{lang === "vi" ? "Không có tài khoản nào đang chờ liên kết." : "No accounts pending."}</div>
        ) : (
          <ul className="space-y-2">
            {pendingMembers.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="flex-1 min-w-[160px]">
                  <div className="text-sm font-semibold text-slate-800">{p.display_name || "—"}</div>
                  {p.phone && <div className="text-xs text-slate-400 mt-0.5">{p.phone}</div>}
                </div>
                <Select value={linkChoice[p.id] || ""} onValueChange={(v) => setLinkChoice({ ...linkChoice, [p.id]: v })}>
                  <SelectTrigger className="w-52 h-9 text-xs rounded-lg border-slate-200">
                    <SelectValue placeholder={lang === "vi" ? "Chọn học sinh" : "Choose student"} />
                  </SelectTrigger>
                  <SelectContent>
                    {availableRoster.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">
                        {lang === "vi" ? "Chưa có học sinh trống." : "No unlinked students."}
                      </div>
                    )}
                    {availableRoster.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="success" disabled={!linkChoice[p.id]} onClick={() => linkAccount(p.id)} className="rounded-lg h-9 text-xs">
                  {lang === "vi" ? "Liên kết" : "Link"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(rosterInClass as any[]).filter((r: any) => r.linked_user_id).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              {lang === "vi" ? "Đã liên kết thành công" : "Linked successfully"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(rosterInClass as any[]).filter((r: any) => r.linked_user_id).map((r: any) => {
                const p = (memberProfiles as any[]).find((m: any) => m.id === r.linked_user_id);
                return (
                  <div key={r.id} className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs font-medium">
                    <span><b>{r.name}</b> ↔ {p?.display_name || r.linked_user_id.slice(0, 8)}</span>
                    <button onClick={() => unlinkRoster(r.id)} className="text-emerald-400 hover:text-emerald-600 transition-colors pl-1 font-bold">×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <ClassDialog
        open={editing}
        onOpenChange={(o) => {
          setEditing(o);
          if (!o) qc.invalidateQueries({ queryKey: ["class", id] });
        }}
        cls={cls}
      />
    </div>
  );
  }