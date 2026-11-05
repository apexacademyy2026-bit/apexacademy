import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams, Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileCheck2,
  FileText,
  PlayCircle,
  Sparkles,
  Volume2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ---------------- KIỂU GIAO DIỆN DÙNG CHUNG (cùng ngôn ngữ với Dashboard) ----------------
   Bảng màu: mực navy #0B1B3A · nền trắng · viền zinc mảnh · nhấn hổ phách #FFB547 (chỉ trên nền navy). */
const FONT = "font-['Be_Vietnam_Pro',sans-serif]";
const CARD = "rounded-2xl border border-zinc-200 bg-white";
const CHIP = "inline-flex h-9 min-w-0 max-w-full items-center gap-2 rounded-full border border-zinc-200 bg-white px-3.5 text-sm font-medium text-zinc-700";
const CHIP_BTN = `${CHIP} shrink-0 transition-colors hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30`;
const SMALL_BTN =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50";
const NAVY_SMALL_BTN =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-[#0B1B3A] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#13285a]";
const TILE = "grid shrink-0 place-items-center rounded-xl bg-zinc-100 text-zinc-700";
const COUNT = "rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-600";
const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2 focus-visible:ring-offset-white";

function SectionHead({ icon: Icon, title, subtitle, right }: { icon: LucideIcon; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn(TILE, "h-10 w-10")}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
        </div>
      </div>
      {right}
    </div>
  );
}

function EmptyBox({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-8 text-center text-sm text-zinc-500">
      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {text}
    </div>
  );
}

export default function StudentLessonView() {
  const { id } = useParams<{ id: string }>();

  const [lesson, setLesson] = useState<any>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [trialTests, setTrialTests] = useState<any[]>([]);
  const [vocabularies, setVocabularies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // 🟢 HÀM XỬ LÝ LẤY URL TỆP TỰ ĐỘNG VÀ CHÍNH XÁC 100%
  const getFileUrl = (doc: any) => {
    if (!doc) return "";

    // 1. Quét tất cả các tên cột URL có thể có trong Database Supabase
    let raw =
      doc.file_url ||
      doc.document_url ||
      doc.attachment_url ||
      doc.url ||
      doc.path ||
      doc.file_path ||
      doc.storage_path ||
      doc.link ||
      "";

    // Nếu đã là URL tuyệt đối (http/https/blob)
    if (raw && (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("blob:"))) {
      return raw;
    }

    // 2. Nếu là relative path hoặc chỉ có tên file, tự tạo Public URL từ Supabase Storage
    const fileNameOrPath = raw || doc.file_name || doc.filename || doc.title || doc.name || "";
    if (!fileNameOrPath) return "";

    const buckets = ["documents", "lesson_documents", "class_documents", "files", "uploads", "materials"];
    for (const bucket of buckets) {
      const { data } = supabase.storage.from(bucket).getPublicUrl(fileNameOrPath);
      if (data?.publicUrl) {
        return data.publicUrl;
      }
    }

    return raw || fileNameOrPath;
  };

  useEffect(() => {
    if (!id) return;

    (async () => {
      setLoading(true);
      setNotFound(false);
      try {
        // 1. LẤY CHI TIẾT BÀI HỌC
        let { data: ls } = await (supabase as any)
          .from("class_lessons")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (!ls) {
          const { data: lsFallback } = await (supabase as any)
            .from("lessons")
            .select("*")
            .eq("id", id)
            .maybeSingle();
          ls = lsFallback;
        }

        if (!ls) {
          setNotFound(true);
          return;
        }

        setLesson(ls);
        document.title = `${ls.title || ls.name || "Bài học"} — Apex Academy`;

        // 2. LẤY TÀI LIỆU BÀI HỌC
        let docList: any[] = [];
        const { data: d1 } = await (supabase as any)
          .from("lesson_documents")
          .select("*")
          .eq("lesson_id", id);

        if (d1 && d1.length > 0) {
          docList = d1;
        } else {
          const { data: d2 } = await (supabase as any)
            .from("class_documents")
            .select("*")
            .eq("lesson_id", id);
          if (d2) docList = d2;
        }
        setDocuments(docList);

        // 3. LẤY BÀI KIỂM TRA THỬ
        const { data: ts } = await (supabase as any)
          .from("tests")
          .select("*")
          .eq("lesson_id", id);
        setTrialTests(ts || []);

        // 4. LẤY TỪ VỰNG
        const { data: vocs } = await (supabase as any)
          .from("lesson_vocabularies")
          .select("*")
          .eq("lesson_id", id);

        if (vocs) {
          setVocabularies(vocs);
        } else {
          const { data: vocs2 } = await (supabase as any)
            .from("vocabularies")
            .select("*")
            .eq("lesson_id", id);
          setVocabularies(vocs2 || []);
        }
      } catch (err) {
        console.error("Lỗi tải chi tiết bài học:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const speakText = (text: string) => {
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    window.speechSynthesis.speak(utterance);
  };

  const getEmbedYoutubeUrl = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return match && match[2].length === 11 ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  if (loading) {
    return (
      <div className={cn("min-h-screen w-full bg-zinc-50", FONT)}>
        <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-8">
          <p className="text-sm text-zinc-500">Đang tải nội dung bài học...</p>
          <Skeleton className="h-40 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-12">
            <Skeleton className="h-64 rounded-2xl lg:col-span-8" />
            <Skeleton className="h-64 rounded-2xl lg:col-span-4" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !lesson) {
    return (
      <div className={cn("flex min-h-screen w-full items-center justify-center bg-zinc-50 p-4", FONT)}>
        <div className={cn(CARD, "w-full max-w-md space-y-5 p-8 text-center")}>
          <div className={cn(TILE, "mx-auto h-12 w-12 rounded-2xl")}>
            <AlertCircle className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-zinc-900">Không tìm thấy bài học</h2>
            <p className="text-sm text-zinc-500">Bài học không tồn tại hoặc chưa được cập nhật quyền xem.</p>
          </div>
          <button type="button" onClick={() => window.history.back()} className={cn(CHIP_BTN, "mx-auto")}>
            <ArrowLeft className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            Quay lại
          </button>
        </div>
      </div>
    );
  }

  const embedUrl = getEmbedYoutubeUrl(lesson.video_url);
  const description = lesson.summary || lesson.description;

  return (
    <div className={cn("min-h-screen w-full bg-zinc-50", FONT)}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap');`}</style>

      <div className="mx-auto max-w-7xl space-y-4 p-4 pb-12 sm:p-8 sm:pb-14">
        <div>
          <button type="button" onClick={() => window.history.back()} className={CHIP_BTN}>
            <ArrowLeft className="h-4 w-4 text-zinc-400" aria-hidden="true" />
            Quay lại danh sách bài học
          </button>
        </div>

        {/* ĐẦU TRANG BÀI HỌC */}
        <section className={cn(CARD, "space-y-5 p-5 sm:p-7")}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 items-center gap-4">
              <div className={cn(TILE, "h-12 w-12")}>
                <BookOpen className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 space-y-1.5">
                <p className="text-sm text-zinc-500">Bài học</p>
                <h1 className="break-words text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
                  {lesson.title || lesson.name}
                </h1>
              </div>
            </div>

            {lesson.created_at && (
              <div className="flex flex-wrap items-center gap-2">
                <span className={CHIP}>
                  <Clock className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden="true" />
                  Đăng ngày {new Date(lesson.created_at).toLocaleDateString("vi-VN")}
                </span>
              </div>
            )}
          </div>

          {description && (
            <p className="border-t border-zinc-100 pt-5 text-sm leading-relaxed text-zinc-600">{description}</p>
          )}
        </section>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-12">
          {/* CỘT CHÍNH: VIDEO, TÀI LIỆU, TỪ VỰNG */}
          <div className="space-y-4 lg:col-span-8">
            {/* VIDEO (NẾU CÓ) */}
            {(embedUrl || lesson.video_url) && (
              <section className={cn(CARD, "space-y-5 p-5 sm:p-6")}>
                <SectionHead icon={PlayCircle} title="Video bài giảng" />

                <div className="aspect-video w-full overflow-hidden rounded-xl border border-zinc-200 bg-[#0B1B3A]">
                  {embedUrl ? (
                    <iframe
                      src={embedUrl}
                      title={lesson.title || "Video bài giảng"}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-4 text-white">
                      <PlayCircle className="h-10 w-10 text-[#FFB547]" aria-hidden="true" />
                      <a
                        href={lesson.video_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white hover:underline"
                      >
                        Mở video trong tab mới <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* TÀI LIỆU (DOCUMENTS) */}
            <section className={cn(CARD, "space-y-5 p-5 sm:p-6")}>
              <SectionHead
                icon={FileText}
                title="Tài liệu bài học"
                subtitle="Documents"
                right={<span className={COUNT}>{documents.length} tệp</span>}
              />

              {documents.length === 0 ? (
                <EmptyBox icon={FileText} text="Chưa có tài liệu nào được tải lên cho bài học này." />
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => {
                    const fileName = doc.title || doc.name || doc.file_name || doc.filename || "Tài liệu bài học";
                    const fileUrl = getFileUrl(doc);

                    return (
                      <div
                        key={doc.id}
                        className="group flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
                      >
                        {/* Bấm vào phần thông tin để mở tệp */}
                        <a
                          href={fileUrl || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={cn("flex min-w-0 flex-1 items-center gap-3 rounded-lg", focusRing)}
                        >
                          <div className={cn(TILE, "h-10 w-10 transition-colors group-hover:bg-[#0B1B3A] group-hover:text-white")}>
                            <FileText className="h-4 w-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold text-zinc-900">{fileName}</h4>
                            <p className="truncate text-xs text-zinc-500">
                              {fileUrl ? "Nhấn để xem hoặc tải xuống tệp" : "Tài liệu bài học chính thức"}
                            </p>
                          </div>
                        </a>

                        {/* Nút hành động xem/tải */}
                        {fileUrl && (
                          <div className="ml-auto flex shrink-0 items-center gap-2">
                            <a href={fileUrl} target="_blank" rel="noreferrer" className={cn(SMALL_BTN, focusRing)}>
                              <Eye className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Xem
                            </a>
                            <a href={fileUrl} download target="_blank" rel="noreferrer" className={cn(NAVY_SMALL_BTN, focusRing)}>
                              <Download className="h-3.5 w-3.5 text-[#FFB547]" aria-hidden="true" /> Tải về
                            </a>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* TỪ VỰNG (NẾU CÓ) */}
            {vocabularies.length > 0 && (
              <section className={cn(CARD, "space-y-5 p-5 sm:p-6")}>
                <SectionHead
                  icon={Sparkles}
                  title="Từ vựng cần nhớ"
                  subtitle="Vocabulary"
                  right={<span className={COUNT}>{vocabularies.length} từ</span>}
                />

                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {vocabularies.map((v, idx) => {
                    const wordClass = v.word_class || v.class;
                    return (
                      <li
                        key={v.id || idx}
                        className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2">
                            <h4 className="text-sm font-semibold text-zinc-900">{v.word}</h4>
                            {wordClass && <span className="text-xs italic text-zinc-500">{wordClass}</span>}
                          </div>
                          <p className="text-sm text-zinc-600">{v.meaning_vi || v.meaning || "-"}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => speakText(v.word)}
                          aria-label={`Phát âm ${v.word}`}
                          className={cn(SMALL_BTN, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30")}
                        >
                          <Volume2 className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" /> Phát âm
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>

          {/* CỘT PHỤ: BÀI KIỂM TRA THỬ */}
          <section className={cn(CARD, "space-y-5 p-5 sm:p-6 lg:col-span-4")}>
            <SectionHead
              icon={FileCheck2}
              title="Bài kiểm tra thử"
              subtitle="Trial Test"
              right={<span className={COUNT}>{trialTests.length} bài</span>}
            />

            {trialTests.length === 0 ? (
              <EmptyBox icon={FileCheck2} text="Chưa có bài kiểm tra thử cho bài học này." />
            ) : (
              <div className="space-y-2">
                {trialTests.map((test) => (
                  <div key={test.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3">
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-zinc-900">{test.title}</h4>
                      <p className="flex items-center gap-1 text-xs tabular-nums text-zinc-500">
                        <Clock className="h-3 w-3 text-zinc-400" aria-hidden="true" />
                        {test.duration_minutes || 45} phút
                      </p>
                    </div>
                    <Link to={`/student/tests/${test.id}`} className={cn(NAVY_SMALL_BTN, focusRing)}>
                      Làm bài ngay
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}