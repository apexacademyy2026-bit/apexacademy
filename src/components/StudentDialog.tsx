import { useEffect, useState } from "react";
import { Check, GraduationCap, Loader2, Phone, UserRound, Users } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PALETTE, resolveStudentColor } from "@/lib/studentColor";

// Giá trị lưu trong cột payment_mode, khớp với StudentBill và Dashboard ("monthly" / "by_session").
const MONTHLY = "monthly";
const PER_SESSION = "by_session";

const GRADES = Array.from({ length: 12 }, (_, i) => String(i + 1));

const FIELD =
  "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20";

type FormState = {
  name: string;
  phone: string;
  grade: string;
  parent_name: string;
  parent_phone: string;
  payment_mode: string;
  color: string;
};

const emptyForm: FormState = {
  name: "",
  phone: "",
  grade: "",
  parent_name: "",
  parent_phone: "",
  payment_mode: PER_SESSION,
  color: PALETTE[0],
};

const Field = ({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) => (
  <label className="block space-y-1.5">
    <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
      {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />} {label}
    </span>
    {children}
  </label>
);

const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-3">
    <div>
      <h3 className="text-sm font-bold text-slate-900">{title}</h3>
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
    {children}
  </section>
);

export default function StudentDialog({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student?: any;
}) {
  const { user } = useApp();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const isEdit = !!student?.id;

  useEffect(() => {
    if (!open) return;
    setForm(
      student
        ? {
            name: student.name ?? "",
            phone: student.phone ?? "",
            grade: student.grade != null ? String(student.grade) : "",
            parent_name: student.parent_name ?? "",
            parent_phone: student.parent_phone ?? "",
            payment_mode: student.payment_mode || PER_SESSION,
            color: resolveStudentColor(student.color, student.id ?? student.name ?? ""),
          }
        : { ...emptyForm, color: PALETTE[Math.floor(Math.random() * PALETTE.length)] }
    );
  }, [open, student]);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Vui lòng nhập tên học sinh");
      return;
    }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      grade: form.grade || null,
      parent_name: form.parent_name.trim(),
      parent_phone: form.parent_phone.trim(),
      payment_mode: form.payment_mode,
      color: form.color,
    };
    // Ép kiểu vì file types do Supabase sinh ra có thể lệch với cấu trúc bảng thật (lỗi ts2345 / "never")
    const table = supabase.from("students") as any;
    const { error } = isEdit
      ? await table.update(payload).eq("id", student.id)
      : await table.insert({ ...payload, user_id: user.id });
    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(isEdit ? "Đã lưu thay đổi" : "Đã thêm học sinh");
    onOpenChange(false);
  };

  const monthly = form.payment_mode === MONTHLY;
  const swatches = PALETTE.includes(form.color) ? PALETTE : [form.color, ...PALETTE];
  const modes = [
    { value: PER_SESSION, active: !monthly, title: "Theo buổi", desc: "Tính học phí theo từng buổi học" },
    { value: MONTHLY, active: monthly, title: "Theo tháng", desc: "Thu một khoản cố định mỗi tháng" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] gap-0 overflow-hidden rounded-3xl border-0 p-0 font-['Be_Vietnam_Pro',sans-serif] sm:max-w-xl">
        <div className="h-1.5 bg-[#FFB547]" />

        <form onSubmit={handleSubmit} className="flex max-h-[calc(92vh-6px)] flex-col">
          <DialogHeader className="flex-row items-center gap-4 space-y-0 border-b border-slate-100 px-6 py-5 text-left">
            <div
              className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-extrabold text-white transition-colors [text-shadow:0_1px_1px_rgb(0_0_0/0.25)]"
              style={{ background: form.color }}
            >
              {form.name.trim() ? form.name.trim().charAt(0).toUpperCase() : <UserRound className="h-6 w-6" />}
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-lg font-extrabold text-slate-900">
                {isEdit ? "Sửa thông tin học sinh" : "Thêm học sinh mới"}
              </DialogTitle>
              <DialogDescription className="text-sm text-slate-500">
                {isEdit ? "Cập nhật hồ sơ, phụ huynh và hình thức học phí." : "Nhập thông tin cơ bản, bạn có thể chỉnh lại sau."}
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            <Section title="Học sinh">
              <Field label="Họ và tên">
                <Input autoFocus value={form.name} onChange={set("name")} placeholder="Nguyễn Văn An" className={FIELD} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Số điện thoại" icon={Phone}>
                  <Input type="tel" value={form.phone} onChange={set("phone")} placeholder="09xx xxx xxx" className={FIELD} />
                </Field>
                <Field label="Khối lớp" icon={GraduationCap}>
                  <Select value={form.grade} onValueChange={(v) => setForm((f) => ({ ...f, grade: v }))}>
                    <SelectTrigger className={FIELD}>
                      <SelectValue placeholder="Chọn khối lớp" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={g}>Lớp {g}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Phụ huynh" hint="Dùng để liên hệ khi cần thông báo học phí hoặc lịch học.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tên phụ huynh" icon={Users}>
                  <Input value={form.parent_name} onChange={set("parent_name")} placeholder="Nguyễn Thị Lan" className={FIELD} />
                </Field>
                <Field label="SĐT phụ huynh" icon={Phone}>
                  <Input type="tel" value={form.parent_phone} onChange={set("parent_phone")} placeholder="09xx xxx xxx" className={FIELD} />
                </Field>
              </div>
            </Section>

            <Section title="Hình thức học phí">
              <div role="radiogroup" className="grid gap-3 sm:grid-cols-2">
                {modes.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    role="radio"
                    aria-checked={m.active}
                    onClick={() => setForm((f) => ({ ...f, payment_mode: m.value }))}
                    className={cn(
                      "rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/30",
                      m.active ? "border-[#0B1B3A] bg-[#0B1B3A]/[0.04] ring-1 ring-[#0B1B3A]" : "border-slate-200 hover:border-slate-300"
                    )}
                  >
                    <span className="flex items-center justify-between text-sm font-bold text-slate-900">
                      {m.title}
                      {m.active && <Check className="h-4 w-4 text-[#0B1B3A]" strokeWidth={3} />}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">{m.desc}</span>
                  </button>
                ))}
              </div>
            </Section>

            <Section title="Màu đại diện" hint="Hiển thị trên avatar của học sinh trong danh sách.">
              <div className="flex flex-wrap gap-2.5">
                {swatches.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Chọn màu ${c}`}
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={cn(
                      "grid h-9 w-9 place-items-center rounded-full text-white transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
                      form.color === c ? "scale-110 ring-2 ring-offset-2" : "hover:scale-105"
                    )}
                    style={{ background: c, ["--tw-ring-color" as any]: c }}
                  >
                    {form.color === c && <Check className="h-4 w-4" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </Section>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-200/60">
              Hủy
            </Button>
            <Button type="submit" disabled={saving} className="h-10 min-w-28 gap-2 rounded-xl bg-[#0B1B3A] px-5 text-sm font-bold text-white hover:bg-[#13285a]">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isEdit ? "Lưu thay đổi" : "Thêm học sinh"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}