import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, 
  FileText, 
  PlayCircle, 
  Download, 
  BookOpen, 
  AlertCircle,
  ExternalLink,
  Clock,
  Eye,
  FileCheck2,
  Volume2,
  Sparkles
} from "lucide-react";

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
    return (match && match[2].length === 11) ? `https://www.youtube.com/embed/${match[2]}` : null;
  };

  if (loading) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 space-y-3">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold text-slate-500">Đang tải nội dung bài học...</p>
      </div>
    );
  }

  if (notFound || !lesson) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="p-4 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">Không tìm thấy bài học</h2>
          <p className="text-xs text-slate-500">Bài học không tồn tại hoặc chưa được cập nhật quyền xem.</p>
        </div>
        <Button onClick={() => window.history.back()} variant="outline" className="rounded-xl font-bold text-xs gap-2">
          <ArrowLeft className="h-4 w-4" /> Quay lại
        </Button>
      </div>
    );
  }

  const embedUrl = getEmbedYoutubeUrl(lesson.video_url);

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      
      {/* 1. NÚT QUAY LẠI */}
      <div>
        <button
          onClick={() => window.history.back()}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại danh sách bài học
        </button>
      </div>

      {/* 2. HEADER BÀI HỌC */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-blue-50 text-blue-600 border-blue-200 text-xs font-bold">
            <BookOpen className="h-3.5 w-3.5 mr-1" /> Bài học
          </Badge>
          {lesson.created_at && (
            <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Đăng ngày {new Date(lesson.created_at).toLocaleDateString("vi-VN")}
            </span>
          )}
        </div>

        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          {lesson.title || lesson.name}
        </h1>

        {(lesson.summary || lesson.description) && (
          <p className="text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
            {lesson.summary || lesson.description}
          </p>
        )}
      </div>

      {/* 3. KHUNG TÀI LIỆU (DOCUMENTS) */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-600" /> Tài liệu bài học (Documents)
          </h3>
          <span className="text-xs font-bold text-slate-400">
            {documents.length} tệp
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-1">
            <FileText className="h-8 w-8 mx-auto text-slate-300 mb-1" />
            <p className="text-xs font-bold text-slate-500">Chưa có tài liệu nào được tải lên cho bài học này.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => {
              const fileName = doc.title || doc.name || doc.file_name || doc.filename || "Tài liệu bài học";
              const fileUrl = getFileUrl(doc);

              return (
                <div 
                  key={doc.id} 
                  className="p-4 rounded-2xl bg-slate-50 hover:bg-blue-50/50 border border-slate-200/80 hover:border-blue-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all group"
                >
                  {/* Bấm vào phần thông tin để mở tệp */}
                  <a 
                    href={fileUrl || "#"} 
                    target="_blank" 
                    rel="noreferrer" 
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                  >
                    <div className="p-2.5 rounded-xl bg-blue-100 group-hover:bg-blue-600 text-blue-600 group-hover:text-white transition-colors shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="truncate">
                      <h4 className="font-bold text-slate-900 group-hover:text-blue-600 text-xs sm:text-sm truncate transition-colors">
                        {fileName}
                      </h4>
                      <p className="text-[10px] text-slate-400">
                        {fileUrl ? "Nhấn để xem hoặc tải xuống tệp" : "Tài liệu bài học chính thức"}
                      </p>
                    </div>
                  </a>

                  {/* Nút hành động xem/tải */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                    {fileUrl && (
                      <>
                        <a href={fileUrl} target="_blank" rel="noreferrer">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            className="h-9 px-3 rounded-xl text-xs font-bold text-blue-600 border-blue-200 hover:bg-blue-100 gap-1 cursor-pointer"
                          >
                            <Eye className="h-3.5 w-3.5" /> Xem
                          </Button>
                        </a>
                        <a href={fileUrl} download target="_blank" rel="noreferrer">
                          <Button 
                            size="sm" 
                            className="h-9 px-3 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1 shadow-sm cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" /> Tải về
                          </Button>
                        </a>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. BÀI KIỂM TRA THỬ */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-emerald-600" /> Bài kiểm tra thử (Trial Test)
          </h3>
          <span className="text-xs font-bold text-slate-400">
            {trialTests.length} bài
          </span>
        </div>

        {trialTests.length === 0 ? (
          <div className="p-6 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <p className="text-xs font-bold text-slate-400 italic">Chưa có bài kiểm tra thử cho bài học này.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {trialTests.map((t) => (
              <div key={t.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{t.title}</h4>
                  <p className="text-[10px] text-slate-400">Thời gian: {t.duration_minutes || 45} phút</p>
                </div>
                <Link to={`/student/tests/${t.id}`}>
                  <Button size="sm" className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs">
                    Làm bài ngay
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. TỪ VỰNG (NẾU CÓ) */}
      {vocabularies.length > 0 && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="font-black text-slate-900 text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-600" /> Từ vựng cần nhớ (Vocabulary)
            </h3>
            <span className="text-xs font-bold text-slate-400">
              {vocabularies.length} từ
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                <tr>
                  <th className="p-3">Từ vựng</th>
                  <th className="p-3">Loại từ</th>
                  <th className="p-3">Phát âm</th>
                  <th className="p-3">Nghĩa tiếng Việt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vocabularies.map((v, idx) => (
                  <tr key={v.id || idx} className="hover:bg-slate-50/50">
                    <td className="p-3 font-bold text-slate-900 text-sm">{v.word}</td>
                    <td className="p-3 text-slate-500 italic">{v.word_class || v.class || "-"}</td>
                    <td className="p-3">
                      <button
                        onClick={() => speakText(v.word)}
                        className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors flex items-center gap-1 font-semibold"
                      >
                        <Volume2 className="h-3.5 w-3.5" /> Phát âm
                      </button>
                    </td>
                    <td className="p-3 font-semibold text-slate-800">{v.meaning_vi || v.meaning || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. VIDEO (NẾU CÓ) */}
      {(embedUrl || lesson.video_url) && (
        <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-3">
          <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-red-500" /> Video bài giảng
          </h3>

          <div className="aspect-video w-full rounded-2xl overflow-hidden bg-slate-900 border border-slate-200">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={lesson.title || "Video bài giảng"}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-white space-y-2 p-4">
                <PlayCircle className="h-10 w-10 text-red-500" />
                <a
                  href={lesson.video_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-blue-400 hover:underline flex items-center gap-1"
                >
                  Mở video trong tab mới <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}