import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, Copy, RefreshCw, Plus, Link2, FileText, Trash2, BookOpen, ChevronDown, StickyNote, ExternalLink, ChevronRight } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { resolveStudentColor } from "@/lib/studentColor";

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate (giống các trang khác) */
const CARD = "rounded-2xl border border-slate-200 bg-white p-5 shadow-xs";
const FIELD = "h-10 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20";
const PRIMARY = "h-10 shrink-0 gap-1.5 rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white hover:bg-[#13285a]";
const HERO_PILL = "inline-flex items-center rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white";
const EMPTY = "rounded-xl border border-dashed border-slate-300 bg-slate-50 py-6 text-center text-sm text-slate-500";
const BUBBLE = "grid shrink-0 place-items-center font-extrabold text-white [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]";

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

  // Tách ghi chú thành từng dòng, tự nhận diện đường link
  const renderFormattedText = (text: string) => {
    const lines = text.split("\n");

    return lines.map((line, lineIdx) => {
      const words = line.split(" ");

      return (
        <div key={lineIdx} className="min-h-[1.25rem]">
          {words.map((word, wordIdx) => {
            const isWordUrl =
              word.startsWith("http://") ||
              word.startsWith("https://") ||
              word.startsWith("www.");

            if (isWordUrl) {
              const href = word.startsWith("www.") ? `https://${word}` : word;
              return (
                <a
                  key={wordIdx}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className="mr-1 inline-flex items-center gap-0.5 break-all font-semibold text-indigo-700 hover:underline"
                >
                  {word}
                  <ExternalLink className="inline h-3 w-3 shrink-0" />
                </a>
              );
            }

            return <span key={wordIdx} className="mr-1">{word}</span>;
          })}
        </div>
      );
    });
  };

  useEffect(() => { document.title = cls ? `${cls.name} — ${t.appName}` : t.appName; }, [cls, t]);

  if (!cls) return <div className="text-muted-foreground">…</div>;

  /* ---------------- GIAO DIỆN ---------------- */
  const vi = lang === "vi";
  const accent = resolveStudentColor(cls.color, cls.id);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Nút quay lại */}
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2 h-10 gap-1.5 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> {t.classes}
      </Button>

      {/* HERO: hình tròn lớn mang màu riêng của lớp */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-7 sm:px-10 sm:py-9">
        <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full" style={{ background: accent }} />
        <div className="pointer-events-none absolute -bottom-24 right-36 hidden h-52 w-52 rounded-full border-[32px] border-white/[0.07] sm:block" />
        <div className="relative space-y-6">
          <div className="flex items-center gap-5">
            <div className={cn("h-20 w-20 rounded-3xl text-4xl ring-4 ring-white/90", BUBBLE)} style={{ background: accent }}>
              {cls.subject ? cls.subject.charAt(0).toUpperCase() : "M"}
            </div>
            <div className="min-w-0 space-y-2.5">
              <h1 className="truncate text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{cls.name}</h1>
              <div className="flex flex-wrap gap-2">
                {cls.subject && <span className={HERO_PILL}>{cls.subject}</span>}
                {cls.grade && <span className={HERO_PILL}>{vi ? "Lớp" : "Grade"} {cls.grade}</span>}
                {cls.start_date && (
                  <span className={HERO_PILL}>
                    {fmtDate(cls.start_date)} {cls.end_date && `– ${fmtDate(cls.end_date)}`}
                  </span>
                )}
              </div>
            </div>
          </div>
          <Button onClick={() => setEditing(true)} className="h-10 gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#0B1B3A] hover:bg-slate-100">
            <Pencil className="h-4 w-4" /> {t.edit}
          </Button>
        </div>
      </div>

      {/* GHI CHÚ (đã xử lý xuống dòng và đường link) */}
      {cls.notes && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-slate-700">
          <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <span className="mb-1 block font-bold text-slate-900">{vi ? "Ghi chú" : "Notes"}</span>
            <div className="space-y-1">{renderFormattedText(cls.notes)}</div>
          </div>
        </div>
      )}

      {/* 3 CỘT: MÃ THAM GIA, HỌC PHÍ, LỊCH HỌC */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Mã tham gia */}
        <Card className={cn(CARD, "flex min-h-[170px] flex-col justify-between")}>
          <div>
            <h3 className="text-sm font-medium text-slate-500">{(t as any).joinCode}</h3>
            <div className="mb-4 mt-2 font-mono text-3xl font-extrabold tracking-widest text-slate-900">{cls.join_code || "—"}</div>
          </div>
          <div className="flex gap-2">
            <Button onClick={copyCode} className={cn(PRIMARY, "flex-1")}>
              <Copy className="h-4 w-4" /> {(t as any).copyCode}
            </Button>
            <Button variant="outline" size="icon" onClick={regenCode} aria-label={(t as any).regenerateCode} title={(t as any).regenerateCode} className="h-10 w-10 shrink-0 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        {/* Học phí */}
        <Card className={cn(CARD, "flex min-h-[170px] flex-col justify-between")}>
          <h3 className="text-sm font-medium text-slate-500">{(t as any).fees || "Fees"}</h3>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3">
              <div className="text-xs font-medium text-emerald-700">{(t as any).feePerMonth || "Per month"}</div>
              <div className="mt-1 truncate text-xl font-extrabold text-slate-900">
                {Number(cls.fee_per_month || 0).toLocaleString("vi-VN")} <span className="text-xs font-medium text-slate-500">₫</span>
              </div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3">
              <div className="text-xs font-medium text-amber-700">{(t as any).feePerSession || "Per session"}</div>
              <div className="mt-1 truncate text-xl font-extrabold text-slate-900">
                {Number(cls.fee_per_session || 0).toLocaleString("vi-VN")} <span className="text-xs font-medium text-slate-500">₫</span>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-500">{vi ? "Áp dụng khi tạo hóa đơn học phí." : "Applied for monthly invoices."}</p>
        </Card>

        {/* Lịch học cố định */}
        <Card className={cn(CARD, "flex min-h-[170px] flex-col")}>
          <h3 className="text-sm font-medium text-slate-500">{t.weeklySchedule}</h3>
          <div className="mt-2 flex flex-1 flex-col justify-center">
            {(schedules.data || []).length === 0 ? (
              <div className="text-sm text-slate-400">{t.nothingHere}</div>
            ) : (
              <div className="max-h-[100px] space-y-1.5 overflow-y-auto pr-1">
                {(schedules.data || []).map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-semibold text-slate-800">{t.daysLong[s.day_of_week]}</span>
                    <span className="font-mono font-medium text-slate-600">{s.start_time.slice(0, 5)} – {s.end_time.slice(0, 5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* HỌC SINH & CHƯƠNG / BÀI HỌC */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Học sinh lớp học */}
        <Card className={cn(CARD, "overflow-hidden")}>
          <h3 className="mb-3 flex items-center justify-between text-base font-bold text-slate-900">
            <span>{t.enrolledStudents}</span>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{(memberProfiles as any[]).length}</span>
          </h3>
          {(memberProfiles as any[]).length === 0 ? (
            <div className={EMPTY}>{t.nothingHere}</div>
          ) : (
            <ul className="max-h-[350px] space-y-2 overflow-y-auto pr-1">
              {(memberProfiles as any[]).map((p: any) => (
                <li key={p.id}>
                  <Link
                    to={`/classes/${id}/members/${p.id}`}
                    className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
                  >
                    <div className={cn("h-10 w-10 rounded-xl text-sm", BUBBLE)} style={{ background: resolveStudentColor(null, p.id) }}>
                      {(p.display_name || "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-900">{p.display_name || "—"}</div>
                      {p.phone && <div className="mt-0.5 truncate text-xs text-slate-500">{p.phone}</div>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 transition-all group-hover:translate-x-0.5 group-hover:text-slate-700" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Chương & Bài học */}
        <Card className={CARD}>
          <h3 className="mb-3 text-base font-bold text-slate-900">{vi ? "Chương & Bài học" : "Chapters & Lessons"}</h3>
          <div className="mb-4 flex gap-2">
            <Input
              placeholder={vi ? "Tên chương mới…" : "New chapter name…"}
              value={newChapter}
              onChange={(e) => setNewChapter(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addChapter(); }}
              className={FIELD}
            />
            <Button onClick={addChapter} className={PRIMARY}>
              <Plus className="h-4 w-4" /> {vi ? "Thêm chương" : "Add chapter"}
            </Button>
          </div>

          {(chapters as any[]).length === 0 ? (
            <div className={EMPTY}>{t.nothingHere}</div>
          ) : (
            <ul className="max-h-[320px] space-y-2.5 overflow-y-auto pr-1">
              {(chapters as any[]).map((ch: any) => {
                const chLessons = (lessons as any[]).filter((l: any) => l.chapter_id === ch.id);
                const isOpen = openChapter[ch.id] !== false;
                return (
                  <li key={ch.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    <div className="flex items-center gap-2 bg-slate-50 p-2.5">
                      <button type="button" aria-label={isOpen ? "Thu gọn" : "Mở rộng"} onClick={() => setOpenChapter({ ...openChapter, [ch.id]: !isOpen })} className="text-slate-400 hover:text-slate-700">
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isOpen ? "" : "-rotate-90"}`} />
                      </button>
                      <BookOpen className="h-4 w-4 shrink-0" style={{ color: accent }} />
                      <span className="flex-1 truncate text-sm font-bold text-slate-900">{ch.name}</span>
                      <span className="shrink-0 rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{chLessons.length} {vi ? "bài" : "lessons"}</span>
                      <Button size="icon" variant="ghost" aria-label="Xóa chương" className="h-8 w-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => deleteChapter(ch.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    {isOpen && (
                      <div className="space-y-2 border-t border-slate-100 p-2.5">
                        {chLessons.map((l: any) => (
                          <div key={l.id} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 p-2 transition-colors hover:border-slate-200">
                            <FileText className="h-4 w-4 shrink-0 text-slate-400" />
                            <Link to={`/classes/${id}/lessons/${l.id}`} className="flex-1 truncate text-sm font-medium text-slate-800 hover:text-[#0B1B3A] hover:underline">{l.name}</Link>
                            <Button size="icon" variant="ghost" aria-label="Xóa bài học" className="h-7 w-7 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600" onClick={() => deleteLesson(l.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <Input
                            placeholder={vi ? "Tên bài học…" : "Lesson name…"}
                            value={newLessonName[ch.id] || ""}
                            onChange={(e) => setNewLessonName({ ...newLessonName, [ch.id]: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") addLesson(ch.id); }}
                            className={cn(FIELD, "h-9")}
                          />
                          <Button variant="outline" onClick={() => addLesson(ch.id)} className="h-9 shrink-0 gap-1 rounded-xl border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                            <Plus className="h-4 w-4" /> {vi ? "Thêm bài" : "Add lesson"}
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

      {/* LIÊN KẾT TÀI KHOẢN */}
      <Card className={CARD}>
        <div className="mb-1 flex items-center gap-2">
          <Link2 className="h-4 w-4 text-slate-400" />
          <h3 className="text-base font-bold text-slate-900">{vi ? "Liên kết tài khoản với danh sách lớp" : "Link accounts to roster"}</h3>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          {vi
            ? "Học sinh sau khi tham gia bằng mã cần được liên kết với hồ sơ trong danh sách của bạn để hiển thị học phí và điểm danh."
            : "Students who joined via code should be linked to a roster entry so their fees and attendance appear."}
        </p>

        {pendingMembers.length === 0 ? (
          <div className={cn(EMPTY, "py-4")}>{vi ? "Không có tài khoản nào đang chờ liên kết." : "No accounts pending."}</div>
        ) : (
          <ul className="space-y-2">
            {pendingMembers.map((p: any) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3">
                <div className="flex min-w-[160px] flex-1 items-center gap-3">
                  <div className={cn("h-10 w-10 rounded-xl text-sm", BUBBLE)} style={{ background: resolveStudentColor(null, p.id) }}>
                    {(p.display_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">{p.display_name || "—"}</div>
                    {p.phone && <div className="mt-0.5 text-xs text-slate-500">{p.phone}</div>}
                  </div>
                </div>
                <Select value={linkChoice[p.id] || ""} onValueChange={(v) => setLinkChoice({ ...linkChoice, [p.id]: v })}>
                  <SelectTrigger className={cn(FIELD, "w-52")}>
                    <SelectValue placeholder={vi ? "Chọn học sinh" : "Choose student"} />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {availableRoster.length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500">
                        {vi ? "Chưa có học sinh trống." : "No unlinked students."}
                      </div>
                    )}
                    {availableRoster.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button disabled={!linkChoice[p.id]} onClick={() => linkAccount(p.id)} className={PRIMARY}>
                  {vi ? "Liên kết" : "Link"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        {(rosterInClass as any[]).filter((r: any) => r.linked_user_id).length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-2 text-sm font-semibold text-slate-700">
              {vi ? "Đã liên kết thành công" : "Linked successfully"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(rosterInClass as any[]).filter((r: any) => r.linked_user_id).map((r: any) => {
                const p = (memberProfiles as any[]).find((m: any) => m.id === r.linked_user_id);
                return (
                  <div key={r.id} className="flex items-center gap-2 rounded-full bg-emerald-50 py-1.5 pl-3 pr-2 text-sm font-medium text-emerald-700">
                    <span><b>{r.name}</b> ↔ {p?.display_name || r.linked_user_id.slice(0, 8)}</span>
                    <button type="button" aria-label="Hủy liên kết" onClick={() => unlinkRoster(r.id)} className="grid h-5 w-5 place-items-center rounded-full text-emerald-500 transition-colors hover:bg-emerald-100 hover:text-emerald-800">
                      ×
                    </button>
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