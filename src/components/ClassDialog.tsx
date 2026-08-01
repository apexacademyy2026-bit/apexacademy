import { useEffect, useState } from "react";
import { Plus, Trash2, BookOpen, Calendar, Palette, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { qk, useClassSchedules } from "@/hooks/useData";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const COLORS = [
  "#93c5fd", "#bfdbfe", "#a7f3d0", "#fef08a", "#fbcfe8", 
  "#ddd6fe", "#fecaca", "#c7d2fe", "#bbf7d0", "#fed7aa"
];

export default function ClassDialog({ open, onOpenChange, cls }: { open: boolean; onOpenChange: (o: boolean) => void; cls?: any }) {
  const { t, user, lang } = useApp();
  const qc = useQueryClient();
  const schedulesQuery = useClassSchedules();

  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [grade, setGrade] = useState("");
  const [category, setCategory] = useState<"math" | "english" | "none">("none");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [feePerMonth, setFeePerMonth] = useState("");
  const [feePerSession, setFeePerSession] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [notes, setNotes] = useState("");
  const [schedules, setSchedules] = useState<{ day_of_week: number; start_time: string; end_time: string }[]>([]);

  useEffect(() => {
    if (cls) {
      setName(cls.name || "");
      setSubject(cls.subject || "");
      setGrade(cls.grade || "");
      setCategory(cls.category || "none");
      setStartDate(cls.start_date || "");
      setEndDate(cls.end_date || "");
      setFeePerMonth(cls.fee_per_month ? String(cls.fee_per_month) : "");
      setFeePerSession(cls.fee_per_session ? String(cls.fee_per_session) : "");
      setColor(cls.color || COLORS[0]);
      setNotes(cls.notes || "");
      
      const existing = (schedulesQuery.data || []).filter((s: any) => s.class_id === cls.id);
      setSchedules(existing.map((s: any) => ({
        day_of_week: s.day_of_week,
        start_time: s.start_time.slice(0, 5),
        end_time: s.end_time.slice(0, 5),
      })));
    } else {
      setName(""); setSubject(""); setGrade(""); setCategory("none");
      setStartDate(""); setEndDate(""); setFeePerMonth(""); setFeePerSession("");
      setColor(COLORS[0]); setNotes(""); setSchedules([]);
    }
  }, [cls, open, schedulesQuery.data]);

  const addSchedule = () => setSchedules([...schedules, { day_of_week: 1, start_time: "18:00", end_time: "19:30" }]);
  const removeSchedule = (i: number) => setSchedules(schedules.filter((_, idx) => idx !== i));
  const updateSchedule = (i: number, k: string, v: any) => {
    const copy = [...schedules];
    (copy[i] as any)[k] = v;
    setSchedules(copy);
  };

  const save = async () => {
    if (!name.trim()) { toast.error(t.className + " required"); return; }
    if (!user) return;

    const payload = {
      user_id: user.id,
      name,
      subject,
      grade,
      category,
      start_date: startDate || null,
      end_date: endDate || null,
      fee_per_month: feePerMonth ? Number(feePerMonth) : null,
      fee_per_session: feePerSession ? Number(feePerSession) : null,
      color,
      notes,
    };

    let cid = cls?.id;
    if (cid) {
      const { error } = await supabase.from("classes").update(payload).eq("id", cid);
      if (error) { toast.error(error.message); return; }
    } else {
      const { data, error } = await supabase.from("classes").insert(payload).select().single();
      if (error) { toast.error(error.message); return; }
      cid = data.id;
    }

    if (cid) {
      await supabase.from("class_schedules").delete().eq("class_id", cid);
      if (schedules.length > 0) {
        const rows = schedules.map((s) => ({
          user_id: user.id,
          class_id: cid,
          day_of_week: Number(s.day_of_week),
          start_time: s.start_time,
          end_time: s.end_time,
        }));
        await supabase.from("class_schedules").insert(rows);
      }
    }

   qc.invalidateQueries({ queryKey: qk.classes });
    qc.invalidateQueries({ queryKey: ["class_schedules"] }); // Fix lỗi Type2322 tại đây
    toast.success(t.save);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
<DialogContent 
  className="max-w-2xl rounded-3xl p-6 sm:p-8 bg-white border-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto"
  onInteractOutside={(e) => e.preventDefault()}
>        
        {/* HEADER MODAL */}
        <DialogHeader className="space-y-1 text-left border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black text-slate-900 tracking-tight">
                {cls ? (lang === "vi" ? "Chỉnh sửa lớp học" : "Edit Class") : (lang === "vi" ? "Tạo lớp học mới" : "Create New Class")}
              </DialogTitle>
              <p className="text-xs font-semibold text-slate-400 mt-0.5">
                {lang === "vi" ? "Điền đầy đủ các thông tin và xếp lịch học cố định bên dưới" : "Fill in class details and configure weekly slots"}
              </p>
            </div>
          </div>
        </DialogHeader>

        {/* NỘI DUNG FORM */}
        <div className="space-y-6 pt-4">
          
          {/* SECTION 1: THÔNG TIN CƠ BẢN */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5 text-blue-500" />
              {lang === "vi" ? "Thông tin chung" : "General Info"}
            </h4>

            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.className} *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ví dụ: Lớp Toán 12 - Ôn Thi THPT"
                className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.subject}</Label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Toán, Tiếng Anh..."
                  className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.grade}</Label>
                <Input
                  value={grade}
                  onChange={(e) => setGrade(e.target.value)}
                  placeholder="Lớp 10, Khối 12..."
                  className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1.5 block">Danh mục phân loại</Label>
              <Select value={category} onValueChange={(v: any) => setCategory(v)}>
                <SelectTrigger className="h-11 rounded-2xl border-slate-200 text-xs font-semibold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="none" className="rounded-xl text-xs font-semibold">Chưa phân loại / Khác</SelectItem>
                  <SelectItem value="math" className="rounded-xl text-xs font-semibold">Toán học</SelectItem>
                  <SelectItem value="english" className="rounded-xl text-xs font-semibold">Tiếng Anh</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SECTION 2: THỜI GIAN & HỌC PHÍ */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-emerald-500" />
              {lang === "vi" ? "Thời gian & Học phí" : "Duration & Fees"}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.startDate}</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.endDate}</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.feePerMonth}</Label>
                <Input
                  type="number"
                  value={feePerMonth}
                  onChange={(e) => setFeePerMonth(e.target.value)}
                  placeholder="0"
                  className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.feePerSession}</Label>
                <Input
                  type="number"
                  value={feePerSession}
                  onChange={(e) => setFeePerSession(e.target.value)}
                  placeholder="0"
                  className="h-11 rounded-2xl border-slate-200 text-xs font-semibold focus-visible:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION 3: MÀU SẮC THẺ & GHI CHÚ */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <div>
              <Label className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1.5 block">
                <Palette className="h-3.5 w-3.5 text-purple-500" />
                Màu sắc đại diện
              </Label>
              <div className="flex flex-wrap gap-2.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-8 w-8 rounded-2xl transition-all cursor-pointer border-2",
                      color === c ? "border-slate-900 scale-110 shadow-md" : "border-transparent hover:scale-105"
                    )}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold text-slate-700 mb-1.5 block">{t.notes}</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Thêm ghi chú thêm về giáo trình, yêu cầu..."
                className="rounded-2xl border-slate-200 text-xs font-semibold min-h-[80px] focus-visible:ring-blue-500"
              />
            </div>
          </div>

          {/* SECTION 4: LỊCH HỌC CỐ ĐỊNH HÀNG TUẦN */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-blue-500" />
                  {t.weeklySchedule || "Lịch học cố định hàng tuần"}
                </Label>
              </div>
              <Button
                type="button"
                onClick={addSchedule}
                className="h-8 px-3 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs flex items-center gap-1 border border-blue-100 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                {lang === "vi" ? "Thêm ca học" : "Add slot"}
              </Button>
            </div>

            {schedules.length === 0 ? (
              <div className="p-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs font-semibold text-slate-400">
                Chưa có ca học cố định nào. Bấm nút phía trên để thêm.
              </div>
            ) : (
              <div className="space-y-2.5">
                {schedules.map((s, i) => (
                  <div key={i} className="flex flex-col sm:flex-row items-center gap-2 p-3 rounded-2xl bg-slate-50/80 border border-slate-100">
                    <Select
                      value={String(s.day_of_week)}
                      onValueChange={(v) => updateSchedule(i, "day_of_week", Number(v))}
                    >
                      <SelectTrigger className="h-9 rounded-xl border-slate-200 text-xs font-bold bg-white w-full sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-2xl">
                        {t.days.map((d: string, idx: number) => (
                          <SelectItem key={idx} value={String(idx)} className="rounded-xl text-xs font-semibold">
                            {d}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                      <Input
                        type="time"
                        value={s.start_time}
                        onChange={(e) => updateSchedule(i, "start_time", e.target.value)}
                        className="h-9 rounded-xl border-slate-200 text-xs font-bold bg-white"
                      />
                      <span className="text-xs text-slate-400 font-bold">-</span>
                      <Input
                        type="time"
                        value={s.end_time}
                        onChange={(e) => updateSchedule(i, "end_time", e.target.value)}
                        className="h-9 rounded-xl border-slate-200 text-xs font-bold bg-white"
                      />
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeSchedule(i)}
                      className="h-9 w-9 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 shrink-0 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

        {/* FOOTER NÚT THAO TÁC */}
        <DialogFooter className="flex items-center justify-end gap-2 pt-6 border-t border-slate-100">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-10 px-5 rounded-2xl font-bold text-xs text-slate-500 hover:bg-slate-100 cursor-pointer"
          >
            {t.cancel}
          </Button>
          <Button
            type="button"
            onClick={save}
            className="h-10 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-md shadow-blue-600/20 active:scale-95 transition-all cursor-pointer"
          >
            {t.save}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}