import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Calendar,
  CreditCard,
  FileCheck2,
  Clock,
  ChevronDown,
  ChevronRight,
  FileText,
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  PlayCircle,
  Download
} from "lucide-react";

export default function StudentClassDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, profile } = useApp();

  const [cls, setCls] = useState<any>(null);
  const [studentRoster, setStudentRoster] = useState<any>(null);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [chapters, setChapters] = useState<any[]>([]);
  const [lessonsByChapter, setLessonsByChapter] = useState<Record<string, any[]>>({});
  const [documents, setDocuments] = useState<any[]>([]);
  const [openChapters, setOpenChapters] = useState<Record<string, boolean>>({});
  const [attendanceTab, setAttendanceTab] = useState<"all" | "unpaid" | "paid">("all");
  const [loading, setLoading] = useState(true);

useEffect(() => {
    if (!id || !user) return;

    (async () => {
      setLoading(true);
      try {
        // 1. Lấy thông tin Lớp học
        const { data: c } = await (supabase as any)
          .from("classes")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        setCls(c);
        if (c) document.title = `${c.name} — Sổ Gia Sư`;

      // 2. Tìm tất cả ID hồ sơ học sinh thuộc tài khoản này (Đã bổ sung quét user_id)
const { data: stList } = await (supabase as any)
  .from("students")
  .select("id")
  .or(`user_id.eq.${user.id},linked_user_id.eq.${user.id},email.eq.${user.email}`);

const possibleStudentIds = (stList || []).map((s: any) => s.id);
possibleStudentIds.push(user.id); // Thêm cả auth user id làm fallback

if (stList && stList.length > 0) {
  setStudentRoster(stList[0]);
}

        // 3. 🟢 FETCH ĐIỂM DANH: Tìm điểm danh khớp lớp id và thuộc 1 trong các student_id
        const { data: att } = await (supabase as any)
          .from("attendance")
          .select("*")
          .eq("class_id", id)
          .in("student_id", possibleStudentIds)
          .order("date", { ascending: false });

        setAttendance(att || []);

        // 4. Lấy danh sách bài kiểm tra
        const { data: tts } = await (supabase as any)
          .from("tests")
          .select("*")
          .eq("class_id", id)
          .order("created_at", { ascending: false });
        setTests(tts || []);

        // 5. 🟢 FETCH TÀI LIỆU / BÀI HỌC
        let chData: any[] = [];
        const { data: ch1 } = await (supabase as any)
          .from("class_chapters")
          .select("*")
          .eq("class_id", id)
          .order("sort_order", { ascending: true });

        if (ch1 && ch1.length > 0) {
          chData = ch1;
        } else {
          const { data: ch2 } = await (supabase as any)
            .from("chapters")
            .select("*")
            .eq("class_id", id);
          if (ch2) chData = ch2;
        }
        setChapters(chData);

        if (chData.length > 0) {
          const chIds = chData.map((ch: any) => ch.id);
          let lssData: any[] = [];

          const { data: l1 } = await (supabase as any)
            .from("class_lessons")
            .select("*")
            .in("chapter_id", chIds);
          if (l1 && l1.length > 0) lssData = l1;

          if (lssData.length === 0) {
            const { data: l2 } = await (supabase as any)
              .from("lessons")
              .select("*")
              .in("chapter_id", chIds);
            if (l2) lssData = l2;
          }

          const lMap: Record<string, any[]> = {};
          lssData.forEach((l: any) => {
            (lMap[l.chapter_id] ||= []).push(l);
          });
          setLessonsByChapter(lMap);

          const initialOpen: Record<string, boolean> = {};
          if (chData[0]) initialOpen[chData[0].id] = true;
          setOpenChapters(initialOpen);
        }

      } catch (err) {
        console.error("Lỗi lấy dữ liệu:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [id, user?.id, user?.email]);

  const toggleChapter = (chapterId: string) => {
    setOpenChapters((prev) => ({ ...prev, [chapterId]: !prev[chapterId] }));
  };

  const fmtVnd = (n: number) => `${Number(n || 0).toLocaleString("vi-VN")} ₫`;
  const fmtDate = (d?: string) => (d ? new Date(d).toLocaleDateString("vi-VN") : "—");

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-6 flex items-center justify-center text-slate-400 font-medium">
        Đang đồng bộ dữ liệu với giáo viên...
      </div>
    );
  }

  if (!cls) {
    return (
      <div className="min-h-screen bg-[#f8fafc] p-6 text-center space-y-4">
        <p className="text-slate-500 font-bold">Không tìm thấy thông tin lớp học.</p>
        <Link to="/student/classes">
          <Button variant="outline" className="rounded-xl">Quay lại danh sách lớp</Button>
        </Link>
      </div>
    );
  }

  const filteredAttendance = attendance.filter((a) => {
    if (attendanceTab === "unpaid") return !a.is_paid;
    if (attendanceTab === "paid") return a.is_paid;
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      
      {/* 1. HEADER LỚP HỌC */}
      <div className="space-y-4">
        <Link to="/student/classes" className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors">
          <ArrowLeft className="h-4 w-4" /> Tất cả lớp học
        </Link>

        <div className="relative overflow-hidden rounded-3xl bg-white border border-slate-200/80 p-6 sm:p-8 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="h-3 w-12 rounded-full" style={{ backgroundColor: cls.color || "#3b82f6" }} />
                <Badge variant="secondary" className="text-xs font-bold bg-blue-50 text-blue-600 rounded-lg">
                  {cls.subject || "Môn học"} {cls.grade && `· Khối ${cls.grade}`}
                </Badge>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {cls.name}
              </h1>
            </div>

            {!studentRoster && (
              <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2.5 rounded-2xl text-xs font-medium max-w-md">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <span>Chú ý: Tài khoản của bạn cần giáo viên xác nhận danh sách lớp để xem điểm danh chuẩn xác nhất.</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-100 text-xs">
            <div className="bg-slate-50 p-3.5 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-blue-100/60 text-blue-600">
                <Calendar className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Ngày khai giảng</span>
                <p className="font-extrabold text-slate-900 text-sm">{fmtDate(cls.start_date || cls.created_at)}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-100/60 text-emerald-600">
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Học phí/tháng</span>
                <p className="font-extrabold text-emerald-600 font-mono text-sm">{fmtVnd(cls.fee_per_month)}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-100/60 text-purple-600">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Học phí/buổi</span>
                <p className="font-extrabold text-purple-600 font-mono text-sm">{fmtVnd(cls.fee_per_session)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. CHƯƠNG TRÌNH & BÀI HỌC / TÀI LIỆU */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-blue-600" /> Chương trình & Bài học
          </h2>
          <span className="text-xs font-bold text-slate-400">
            {chapters.length > 0 ? `${chapters.length} chương` : `${documents.length} tài liệu`}
          </span>
        </div>

        {chapters.length === 0 && documents.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-1">
            <BookOpen className="h-8 w-8 mx-auto text-slate-300 mb-1" />
            <p className="text-xs font-bold text-slate-500">Giáo viên chưa đăng tải nội dung bài học.</p>
          </div>
        ) : chapters.length > 0 ? (
          <div className="space-y-3">
            {chapters.map((ch) => {
              const lessons = lessonsByChapter[ch.id] || [];
              const isOpen = openChapters[ch.id];

              return (
                <div key={ch.id} className="border border-slate-200/80 rounded-2xl overflow-hidden transition-all">
                  <button
                    onClick={() => toggleChapter(ch.id)}
                    className="w-full bg-slate-50 hover:bg-slate-100/80 p-4 flex items-center justify-between text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-1.5 rounded-lg bg-blue-100 text-blue-600 font-bold">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base">{ch.title || ch.name}</h3>
                        {ch.description && <p className="text-xs text-slate-500">{ch.description}</p>}
                      </div>
                    </div>

                    <span className="text-xs font-bold text-slate-400 bg-white px-2.5 py-1 rounded-full border border-slate-200 shrink-0">
                      {lessons.length} bài
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-3 bg-white divide-y divide-slate-100">
                      {lessons.length === 0 ? (
                        <p className="text-xs text-slate-400 p-3 italic">Chương này chưa có bài học.</p>
                      ) : (
                        lessons.map((ls) => (
                          <div key={ls.id} className="p-3 hover:bg-slate-50/80 rounded-xl flex items-center justify-between transition-colors">
                            <div className="flex items-center gap-3">
                              <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
                                {ls.video_url ? <PlayCircle className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
                              </div>
                              <div>
                                <h4 className="font-bold text-slate-800 text-xs sm:text-sm">{ls.title || ls.name}</h4>
                                {ls.summary && <p className="text-[11px] text-slate-400 line-clamp-1">{ls.summary}</p>}
                              </div>
                            </div>

                            <Link to={`/student/lessons/${ls.id}`}>
                              <Button size="sm" className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1">
                                Xem bài học <ChevronRight className="h-3.5 w-3.5" />
                              </Button>
                            </Link>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Khung hiển thị danh sách Tài liệu nếu không phân chương */
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {documents.map((doc) => (
              <div key={doc.id} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-100 text-blue-600">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">{doc.title || doc.name}</h4>
                    <p className="text-[10px] text-slate-400">{doc.file_type || "Tài liệu học tập"}</p>
                  </div>
                </div>
                {doc.file_url && (
                  <a href={doc.file_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="h-8 px-2.5 rounded-xl gap-1 text-xs font-bold text-blue-600">
                      <Download className="h-3.5 w-3.5" /> Tải về
                    </Button>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. LỊCH SỬ ĐIỂM DANH & HỌC PHÍ */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" /> Lịch sử điểm danh & Học phí
          </h2>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl text-xs font-bold text-slate-500 self-start">
            <button
              onClick={() => setAttendanceTab("all")}
              className={`px-3 py-1.5 rounded-lg transition-all ${attendanceTab === "all" ? "bg-white text-slate-900 shadow-sm" : ""}`}
            >
              Tất cả ({attendance.length})
            </button>
            <button
              onClick={() => setAttendanceTab("unpaid")}
              className={`px-3 py-1.5 rounded-lg transition-all ${attendanceTab === "unpaid" ? "bg-white text-amber-600 shadow-sm" : ""}`}
            >
              Chưa đóng
            </button>
            <button
              onClick={() => setAttendanceTab("paid")}
              className={`px-3 py-1.5 rounded-lg transition-all ${attendanceTab === "paid" ? "bg-white text-emerald-600 shadow-sm" : ""}`}
            >
              Đã đóng
            </button>
          </div>
        </div>

        {filteredAttendance.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-1">
            <Clock className="h-8 w-8 mx-auto text-slate-300 mb-1" />
            <p className="text-xs font-bold text-slate-500">Chưa có dữ liệu điểm danh nào được ghi nhận.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                <tr>
                  <th className="p-3 rounded-l-xl">Ngày học</th>
                  <th className="p-3">Điểm danh</th>
                  <th className="p-3">Học phí ca</th>
                  <th className="p-3 text-right rounded-r-xl">Trạng thái thanh toán</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAttendance.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-3 font-bold text-slate-900">{fmtDate(a.date)}</td>
                    <td className="p-3">
                      <Badge className={a.status === "present" || a.present ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-red-50 text-red-700 border-red-200"}>
                        {a.status === "present" || a.present ? "Có mặt" : "Vắng mặt"}
                      </Badge>
                    </td>
                    <td className="p-3 font-mono font-bold text-slate-700">{fmtVnd(a.fee_amount || cls.fee_per_session)}</td>
                    <td className="p-3 text-right">
                      <Badge className={a.is_paid ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"}>
                        {a.is_paid ? "Đã thanh toán" : "Chưa thanh toán"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. BÀI KIỂM TRA & ĐỀ THI */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <FileCheck2 className="h-5 w-5 text-blue-600" /> Bài kiểm tra & Đề thi
          </h2>
          <span className="text-xs font-bold text-slate-400">
            {tests.length} bài
          </span>
        </div>

        {tests.length === 0 ? (
          <div className="p-8 text-center text-slate-400 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 space-y-1">
            <FileCheck2 className="h-8 w-8 mx-auto text-slate-300 mb-1" />
            <p className="text-xs font-bold text-slate-500">Chưa có bài kiểm tra nào cho lớp này.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tests.map((t) => (
              <div key={t.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 text-xs sm:text-sm">{t.title}</h4>
                  <p className="text-[11px] text-slate-400">Thời gian: {t.duration_minutes || 45} phút</p>
                </div>
                <Link to={`/student/tests/${t.id}`}>
                  <Button size="sm" className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs">
                    Làm bài
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}