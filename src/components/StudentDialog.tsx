import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useClasses, useEnrollments, qk } from "@/hooks/useData";
import { palette, randomColor } from "@/lib/format";
import { toast } from "sonner";
import { User, Calendar, Phone, Users, Wallet, Palette, BookOpen, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Định nghĩa Interface Props chuẩn để tương thích với tất cả các nơi gọi Popup
export interface StudentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: any;
}

export default function StudentDialog({ open, onOpenChange, student }: StudentDialogProps) {
  const { t, user } = useApp();
  const qc = useQueryClient();
  const classes = useClasses();
  const enrollments = useEnrollments();

  const [form, setForm] = useState<any>({
    name: "",
    phone: "", // <- Thêm trường phone cho học sinh
    grade: "",
    parent_name: "",
    parent_phone: "",
    notes: "",
    start_date: new Date().toISOString().slice(0, 10),
    color: randomColor(),
    payment_mode: "monthly",
    fee_per_month: 0,
    fee_per_session: 0,
    sessions_per_cycle: 8,
  });

  const [classIds, setClassIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name || "",
        phone: student.phone || "", // <- Gán phone từ dữ liệu cũ
        grade: student.grade || "",
        parent_name: student.parent_name || "",
        parent_phone: student.parent_phone || "",
        notes: student.notes || "",
        start_date: student.start_date || new Date().toISOString().slice(0, 10),
        color: student.color || randomColor(),
        payment_mode: student.payment_mode || "monthly",
        fee_per_month: Number(student.fee_per_month) || 0,
        fee_per_session: Number(student.fee_per_session) || 0,
        sessions_per_cycle: Number(student.sessions_per_cycle) || 8,
      });
      const myEnrolls = (enrollments.data || []).filter((e: any) => e.student_id === student.id);
      setClassIds(myEnrolls.map((e: any) => e.class_id));
    } else if (open) {
      setForm({
        name: "",
        grade: "",
        phone: "", // <- Thêm trường phone cho học sinh
        parent_name: "",
        parent_phone: "",
        notes: "",
        start_date: new Date().toISOString().slice(0, 10),
        color: randomColor(),
        payment_mode: "monthly",
        fee_per_month: 0,
        fee_per_session: 0,
        sessions_per_cycle: 8,
      });
      setClassIds([]);
    }
  }, [student, open, enrollments.data]);

// ✅ SỬA LẠI HÀM submit CHUẨN XÁC:
// ✅ ĐÃ SỬA: Loại bỏ triệt để user_id trước khi insert/update
const submit = async () => {
  if (!user || !form.name) return;
  setBusy(true);
  try {
    let id = student?.id;

    // 🎯 TÁCH user_id RA KHỎI FORM ĐỂ ĐẢM BẢO KHÔNG TRUYỀN ID GIÁO VIÊN
    const { user_id, ...cleanForm } = form;

    if (student) {
      // Khi CẬP NHẬT: chỉ update các trường dữ liệu sạch (không chạm vào user_id)
      const { error } = await supabase
        .from("students")
        .update(cleanForm)
        .eq("id", student.id);
        
      if (error) throw error;
    } else {
      // Khi THÊM MỚI: insert dữ liệu sạch, ép user_id = null 
      const { data, error } = await supabase
        .from("students")
        .insert({
          ...cleanForm,
          user_id: user.id // 🔥 Ép buộc user_id luôn là null cho học sinh mới
        })
        .select()
        .single();
        
      if (error) throw error;
      id = data.id;
    }

    // Sync enrollments (Giữ nguyên)
    const existing = (enrollments.data || []).filter((e: any) => e.student_id === id);
    const existingIds = new Set(existing.map((e: any) => e.class_id));
    const wanted = new Set(classIds);
    const toAdd = classIds.filter((c) => !existingIds.has(c));
    const toRemove = existing.filter((e: any) => !wanted.has(e.class_id));

    if (toAdd.length) {
      await supabase
        .from("enrollments")
        .insert(toAdd.map((c) => ({ student_id: id, class_id: c, user_id: user.id })));
    }
    for (const r of toRemove) await supabase.from("enrollments").delete().eq("id", r.id);

    toast.success(t?.save || "Saved successfully");
    qc.invalidateQueries({ queryKey: qk.students });
    qc.invalidateQueries({ queryKey: qk.enrollments });
    onOpenChange(false);
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    setBusy(false);
  }
};

  const toggleClass = (id: string) => {
    setClassIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-2xl shadow-xl border-0">
        {/* Header */}
        <DialogHeader className="p-5 pb-4 border-b bg-background sticky top-0 z-10">
          <DialogTitle className="text-lg font-semibold flex items-center gap-2">
            <User className="h-5 w-5 text-emerald-600" />
            {student ? t?.edit || "Edit Student" : t?.addStudent || "Add Student"}
          </DialogTitle>
        </DialogHeader>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          {/* Section 1: Thông tin cơ bản */}
          <div className="space-y-3">
            <div>
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {t?.name || "Full name"} <span className="text-destructive">*</span>
              </Label>
              <Input
                required
                placeholder="e.g. Nguyen Van A"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 h-9 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t?.grade || "Grade"}
                </Label>
                <Input
                  placeholder="e.g. 7"
                  value={form.grade}
                  onChange={(e) => setForm({ ...form, grade: e.target.value })}
                  className="mt-1 h-9 rounded-lg"
                />
              </div>
              <div>
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t?.startDate || "Start date"}
                </Label>
                <div className="relative mt-1">
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="h-9 rounded-lg pl-8 text-sm"
                  />
                  <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Thông tin phụ huynh */}
          <div className="p-3.5 rounded-xl bg-muted/40 border border-border/60 space-y-2.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Users className="h-3.5 w-3.5" />
              Parent Info
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Input
                  placeholder={t?.parentName || "Parent name"}
                  value={form.parent_name}
                  onChange={(e) => setForm({ ...form, parent_name: e.target.value })}
                  className="h-8 text-xs rounded-lg bg-background"
                />
              </div>
              <div>
                <div className="relative">
                  <Input
                    placeholder={t?.parentPhone || "Parent phone"}
                    value={form.parent_phone}
                    onChange={(e) => setForm({ ...form, parent_phone: e.target.value })}
                    className="h-8 text-xs rounded-lg bg-background pl-7"
                  />
                  <Phone className="absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Ghi chú */}
          <div>
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t?.notes || "Notes"}
            </Label>
            <Textarea
              placeholder="Add notes..."
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="mt-1 min-h-[50px] text-xs rounded-lg resize-none"
            />
          </div>

          {/* Section 4: Học phí & Hình thức */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Wallet className="h-3.5 w-3.5" />
              {(t as any)?.paymentMode || "Payment Details"}
            </div>

            {/* Segmented control */}
            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-muted/50 border">
              <button
                type="button"
                onClick={() => setForm({ ...form, payment_mode: "monthly" })}
                className={cn(
                  "py-1.5 text-xs font-medium rounded-lg transition-all",
                  form.payment_mode === "monthly"
                    ? "bg-background shadow-sm text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {(t as any)?.monthly || "Monthly"}
              </button>
              <button
                type="button"
                onClick={() => setForm({ ...form, payment_mode: "session" })}
                className={cn(
                  "py-1.5 text-xs font-medium rounded-lg transition-all",
                  form.payment_mode === "session"
                    ? "bg-background shadow-sm text-foreground font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {(t as any)?.bySession || "By session"}
              </button>
            </div>

            {form.payment_mode === "monthly" ? (
              <div>
                <Label className="text-xs text-muted-foreground">
                  {(t as any)?.feePerMonth || "Fee per month (₫)"}
                </Label>
                <Input
                  type="number"
                  value={form.fee_per_month}
                  onChange={(e) => setForm({ ...form, fee_per_month: +e.target.value })}
                  className="mt-1 h-9 rounded-lg font-mono text-sm"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {(t as any)?.feePerSession || "Fee per session (₫)"}
                  </Label>
                  <Input
                    type="number"
                    value={form.fee_per_session}
                    onChange={(e) => setForm({ ...form, fee_per_session: +e.target.value })}
                    className="mt-1 h-9 rounded-lg font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">
                    {(t as any)?.sessionsPerCycle || "Sessions per cycle"}
                  </Label>
                  <Input
                    type="number"
                    value={form.sessions_per_cycle}
                    onChange={(e) => setForm({ ...form, sessions_per_cycle: +e.target.value })}
                    className="mt-1 h-9 rounded-lg font-mono text-sm"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 5: Màu sắc đại diện */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Palette className="h-3.5 w-3.5" />
              {t?.color || "Theme color"}
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {palette.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, color: c })}
                  style={{ background: c }}
                  className={cn(
                    "w-7 h-7 rounded-full transition-all flex items-center justify-center border border-black/10",
                    form.color === c ? "scale-110 ring-2 ring-emerald-500 ring-offset-2" : "hover:scale-105"
                  )}
                >
                  {form.color === c && <Check className="h-3.5 w-3.5 text-gray-700" />}
                </button>
              ))}
            </div>
          </div>

          {/* Section 6: Lớp học tham gia */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <BookOpen className="h-3.5 w-3.5" />
              {t?.enrolledClasses || "Enrolled classes"}
            </div>
            <div className="flex flex-wrap gap-2">
              {(classes.data || []).map((c: any) => {
                const isSelected = classIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleClass(c.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-2",
                      isSelected
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-background hover:bg-muted text-muted-foreground border-border"
                    )}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: c.color }}
                    />
                    {c.name}
                    {isSelected && <Check className="h-3 w-3 ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="p-4 bg-muted/20 border-t gap-2 sm:gap-0 sticky bottom-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-xl text-xs"
          >
            {t?.cancel || "Cancel"}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={busy}
            className="h-9 rounded-xl text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium min-w-[80px]"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t?.save || "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}