import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { ArrowLeft, ArrowRight, Building2, CalendarClock, CheckCircle2, MapPin, MessageSquareText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { formatVND } from "@/lib/format";
import { cn } from "@/lib/utils";

/* =====================================================================
   POPUP CỦA TỪNG LỚP (trang công khai /lop-hoc)
   Bước 1: chi tiết lớp (học phí, sĩ số, lịch học) → Bước 2: form đăng ký → Bước 3: đã gửi.
   Đăng ký được lưu vào bảng Supabase `class_registrations` (xem class_registrations.sql).
   ===================================================================== */

export type DialogClass = {
  id: string;
  name: string;
  tag: string;
  description: string;
  note: string;
  feeMonth: number;
  feeSession: number;
  enrolled: number;
  capacity: number; // 0 = không giới hạn sĩ số
  schedule: { days: string; time: string }[];
};

type Tone = { solid: string; tint: string; ink: string };

type Props = {
  cls: DialogClass | null;
  tone: Tone;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const sb: any = supabase;

// Nếu trang Auth đã có sẵn danh sách tỉnh/thành, hãy import dùng chung thay cho danh sách này.
const PROVINCES = [
  "Hà Nội", "TP. Hồ Chí Minh", "Hải Phòng", "Đà Nẵng", "Cần Thơ", "Huế",
  "An Giang", "Bắc Ninh", "Cà Mau", "Cao Bằng", "Đắk Lắk", "Điện Biên", "Đồng Nai", "Đồng Tháp",
  "Gia Lai", "Hà Tĩnh", "Hưng Yên", "Khánh Hòa", "Lai Châu", "Lạng Sơn", "Lào Cai", "Lâm Đồng",
  "Nghệ An", "Ninh Bình", "Phú Thọ", "Quảng Ngãi", "Quảng Ninh", "Quảng Trị", "Sơn La", "Tây Ninh",
  "Thái Nguyên", "Thanh Hóa", "Tuyên Quang", "Vĩnh Long",
];
const GRADES = ["Lớp 6", "Lớp 7", "Lớp 8", "Lớp 9", "Lớp 10", "Lớp 11", "Lớp 12", "Khác"];

type Form = {
  fullName: string;
  email: string;
  birthDate: string;
  phone: string;
  province: string;
  address: string;
  school: string;
  grade: string;
  schoolProvince: string;
  note: string;
  website: string; // ô bẫy bot, người thật không thấy và không điền
};
type Errors = Partial<Record<keyof Form, string>>;

const EMPTY_FORM: Form = {
  fullName: "",
  email: "",
  birthDate: "",
  phone: "",
  province: "",
  address: "",
  school: "",
  grade: "",
  schoolProvince: "",
  note: "",
  website: "",
};

const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// "0912 345 678", "0912.345.678", "+84 912 345 678" → "0912345678"
const normalizePhone = (s: string) => {
  let d = s.replace(/[^\d+]/g, "");
  if (d.startsWith("+84")) d = `0${d.slice(3)}`;
  else if (d.startsWith("84") && d.length >= 11) d = `0${d.slice(2)}`;
  return d.replace(/\D/g, "");
};
const isValidPhone = (s: string) => /^0\d{9,10}$/.test(normalizePhone(s));
// "0912345678" → "0912 345 678"
const prettyPhone = (d: string) => (d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : d);

// Thứ tự thêm lỗi theo đúng thứ tự các ô trên form, để ô sai đầu tiên được đưa con trỏ vào.
const validate = (f: Form): Errors => {
  const e: Errors = {};
  if (f.fullName.trim().length < 2) e.fullName = "Nhập họ và tên";
  if (!f.phone.trim()) e.phone = "Nhập số điện thoại để giáo viên liên hệ";
  else if (!isValidPhone(f.phone)) e.phone = "Số điện thoại chưa đúng, ví dụ 0912 345 678";
  if (!f.birthDate) e.birthDate = "Chọn ngày sinh";
  else if (f.birthDate > todayStr()) e.birthDate = "Ngày sinh không hợp lệ";
  // Email không bắt buộc, nhưng nếu có điền thì phải đúng định dạng
  if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email.trim())) e.email = "Email chưa đúng định dạng";
  if (!f.province) e.province = "Chọn tỉnh / thành phố";
  if (f.school.trim().length < 2) e.school = "Nhập tên trường";
  if (!f.grade) e.grade = "Chọn khối lớp";
  if (!f.schoolProvince) e.schoolProvince = "Chọn tỉnh / thành phố";
  return e;
};

const fieldCls = (bad: boolean) =>
  cn(
    "h-11 w-full rounded-2xl border bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 md:text-sm",
    bad ? "border-rose-400 focus:border-rose-500 focus:ring-rose-200" : "border-slate-300 focus:border-[#0B1B3A] focus:ring-[#0B1B3A]/20",
  );

function Section({ n, title, icon, children }: { n: number; title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="flex items-center gap-3 text-base font-extrabold text-slate-900">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#0B1B3A] text-sm font-bold text-white">{n}</span>
        {icon && <span className="text-slate-400">{icon}</span>}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({
  k,
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  k: keyof Form;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={`reg-${k}`} className="block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </label>
      {children}
      {error ? (
        <p id={`reg-${k}-err`} className="text-xs font-medium text-rose-600">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export default function ClassDialog({ cls, tone, open, onOpenChange }: Props) {
  const [step, setStep] = useState<"detail" | "form" | "done">("detail");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [sending, setSending] = useState(false);
  const [sentPhone, setSentPhone] = useState("");

  // Giữ lại lớp vừa mở để nội dung không biến mất giữa chừng khi popup đang đóng
  const last = useRef<DialogClass | null>(cls);
  if (cls) last.current = cls;
  const c = cls ?? last.current;

  useEffect(() => {
    if (open) {
      setStep("detail");
      setErrors({});
    }
  }, [open, cls?.id]);

  if (!c) return null;

  const set = (k: keyof Form, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => (e[k] ? { ...e, [k]: undefined } : e));
  };
  const bind = (k: keyof Form) => ({
    id: `reg-${k}`,
    value: form[k],
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k, e.target.value),
    "aria-invalid": !!errors[k],
    "aria-describedby": errors[k] ? `reg-${k}-err` : undefined,
    className: fieldCls(!!errors[k]),
  });

  const hasFee = c.feeMonth > 0 || c.feeSession > 0;
  const showCount = c.capacity > 0 || c.enrolled > 0;
  const full = c.capacity > 0 && c.enrolled >= c.capacity;
  const pct = c.capacity > 0 ? Math.min(100, Math.round((c.enrolled / c.capacity) * 100)) : 0;
  const scheduleText = c.schedule.map((s) => `${s.days}, ${s.time}`).join(" và ");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    const errs = validate(form);
    setErrors(errs);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(`reg-${first}`)?.focus();
      return;
    }
    if (form.website) {
      setStep("done"); // bot: làm như đã gửi nhưng không lưu
      return;
    }
    setSending(true);
    try {
      // Không .select() sau insert: khách không có quyền đọc lại bản ghi.
      const { error } = await sb.from("class_registrations").insert({
        showcase_class_id: c.id,
        class_name: c.name,
        class_schedule: scheduleText || null,
        full_name: form.fullName.trim(),
        email: form.email.trim().toLowerCase() || null,
        phone: normalizePhone(form.phone),
        birth_date: form.birthDate,
        province: form.province,
        address: form.address.trim() || null,
        school: form.school.trim(),
        grade: form.grade,
        school_province: form.schoolProvince,
        note: form.note.trim() || null,
      });
      if (error) throw error;
      setSentPhone(prettyPhone(normalizePhone(form.phone)));
      setForm(EMPTY_FORM);
      setStep("done");
    } catch {
      toast.error("Chưa gửi được đăng ký. Bạn thử lại sau ít phút hoặc liên hệ trực tiếp với giáo viên.");
    } finally {
      setSending(false);
    }
  };

  const title = step === "detail" ? c.name : step === "form" ? `Đăng ký lớp ${c.name}` : "Đã gửi đăng ký";
  const subtitle =
    step === "detail"
      ? c.tag || "Chi tiết lớp học"
      : step === "form"
        ? "Điền thông tin bên dưới, giáo viên sẽ liên hệ để xác nhận chỗ học."
        : c.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex max-h-[92dvh] w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden rounded-3xl border-0 bg-white p-0 font-['Be_Vietnam_Pro',sans-serif] text-slate-900 shadow-2xl sm:rounded-3xl",
          step === "form" ? "max-w-3xl sm:max-w-3xl" : "max-w-xl sm:max-w-xl",
        )}
      >
        <div className="h-1.5 shrink-0" style={{ background: tone.solid }} aria-hidden />

        <header className="shrink-0 border-b border-slate-100 px-6 pb-4 pr-14 pt-5 md:px-8 md:pr-16">
          {step === "form" && (
            <button
              type="button"
              onClick={() => setStep("detail")}
              className="mb-2 -ml-2 inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A]"
            >
              <ArrowLeft className="h-4 w-4" /> Chi tiết lớp
            </button>
          )}
          <DialogTitle className="text-xl font-extrabold leading-snug tracking-tight md:text-2xl">{title}</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-slate-500">{subtitle}</DialogDescription>
        </header>

        {/* BƯỚC 1: CHI TIẾT LỚP */}
        {step === "detail" && (
          <>
            <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6 md:px-8">
              {(hasFee || showCount) && (
                <div className={cn("grid gap-6", hasFee && showCount && "sm:grid-cols-2")}>
                  {hasFee ? (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-500">Học phí</h3>
                      {c.feeMonth > 0 && (
                        <p className="mt-1">
                          <span className="text-3xl font-extrabold tabular-nums tracking-tight">{formatVND(c.feeMonth)}</span>
                          <span className="text-sm text-slate-500"> / tháng</span>
                        </p>
                      )}
                      {c.feeSession > 0 && (
                        <p className={c.feeMonth > 0 ? "mt-0.5 text-sm text-slate-600" : "mt-1"}>
                          <span className={cn("tabular-nums", c.feeMonth > 0 ? "font-semibold text-slate-800" : "text-3xl font-extrabold tracking-tight")}>
                            {formatVND(c.feeSession)}
                          </span>
                          <span className="text-sm text-slate-500"> / buổi</span>
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-500">Học phí</h3>
                      <p className="mt-1 text-sm text-slate-600">Liên hệ để biết học phí</p>
                    </div>
                  )}

                  {showCount && (
                    <div>
                      <h3 className="text-sm font-semibold text-slate-500">Học sinh đã tham gia</h3>
                      {c.capacity > 0 ? (
                        <>
                          <p className="mt-1">
                            <span className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: tone.ink }}>
                              {c.enrolled}
                            </span>
                            <span className="text-xl font-bold tabular-nums text-slate-400">/{c.capacity}</span>
                          </p>
                          <div
                            role="progressbar"
                            aria-label="Số học sinh đã tham gia"
                            aria-valuemin={0}
                            aria-valuemax={c.capacity}
                            aria-valuenow={Math.min(c.enrolled, c.capacity)}
                            className="mt-2 h-2 overflow-hidden rounded-full"
                            style={{ background: tone.tint }}
                          >
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone.solid }} />
                          </div>
                          <p className="mt-1.5 text-sm text-slate-600">
                            {full ? "Lớp đã đủ chỗ, bạn vẫn có thể vào danh sách chờ." : `Còn ${c.capacity - c.enrolled} chỗ`}
                          </p>
                        </>
                      ) : (
                        <p className="mt-1">
                          <span className="text-3xl font-extrabold tabular-nums tracking-tight" style={{ color: tone.ink }}>
                            {c.enrolled}
                          </span>
                          <span className="text-sm text-slate-500"> học sinh</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <CalendarClock className="h-4 w-4" aria-hidden /> Lịch học
                </h3>
                {c.schedule.length === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">Chưa có lịch học</p>
                ) : (
                  <ul className="mt-2 divide-y divide-slate-100 border-y border-slate-100">
                    {c.schedule.map((s) => (
                      <li key={`${s.days}-${s.time}`} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2.5 text-sm">
                        <span className="font-semibold text-slate-900">{s.days}</span>
                        <span className="tabular-nums text-slate-600">{s.time}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {(c.description || c.note) && (
                <div className="space-y-2">
                  {c.description && <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{c.description}</p>}
                  {c.note && <p className="text-sm font-semibold text-slate-800">{c.note}</p>}
                </div>
              )}
            </div>

            <footer className="shrink-0 border-t border-slate-100 bg-white px-6 py-4 md:px-8">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0B1B3A] text-base font-bold text-white transition-colors hover:bg-[#13285a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2"
              >
                {full ? "Đăng ký vào danh sách chờ" : "Đăng ký học lớp này"} <ArrowRight className="h-4 w-4" />
              </button>
            </footer>
          </>
        )}

        {/* BƯỚC 2: FORM ĐĂNG KÝ */}
        {step === "form" && (
          <form onSubmit={submit} noValidate className="min-h-0 flex-1 space-y-7 overflow-y-auto px-6 py-6 md:px-8">
            <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed" style={{ background: tone.tint, color: tone.ink }}>
              <span className="font-bold">{c.name}</span>
              {scheduleText && <span>, {scheduleText}</span>}
              {full && <span className="font-semibold"> (đang đủ chỗ, bạn sẽ vào danh sách chờ)</span>}
            </div>

            {/* Ô bẫy bot */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              value={form.website}
              onChange={(e) => set("website", e.target.value)}
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
            />

            <Section n={1} title="Thông tin cá nhân học sinh">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field k="fullName" label="Họ và tên" required error={errors.fullName}>
                  <input {...bind("fullName")} type="text" autoComplete="name" placeholder="Ví dụ: Nguyễn Văn A" maxLength={120} />
                </Field>
                <Field k="phone" label="Số điện thoại / Zalo" required error={errors.phone} hint="Của học sinh hoặc phụ huynh">
                  <input {...bind("phone")} type="tel" autoComplete="tel" inputMode="tel" placeholder="0912 345 678" maxLength={30} />
                </Field>
                <Field k="birthDate" label="Ngày sinh" required error={errors.birthDate}>
                  <input {...bind("birthDate")} type="date" autoComplete="bday" max={todayStr()} />
                </Field>
              </div>
              <Field k="email" label="Địa chỉ Gmail (không bắt buộc)" error={errors.email} className="sm:max-w-sm">
                <input {...bind("email")} type="email" autoComplete="email" inputMode="email" placeholder="hocsinh@gmail.com" maxLength={160} />
              </Field>
            </Section>

            <Section n={2} title="Khu vực hiện tại đang sinh sống" icon={<MapPin className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field k="province" label="Tỉnh / Thành phố" required error={errors.province}>
                  <select {...bind("province")}>
                    <option value="">-- Chọn Tỉnh / Thành --</option>
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field k="address" label="Địa chỉ chi tiết (số nhà, đường)" error={errors.address}>
                  <input {...bind("address")} type="text" autoComplete="street-address" placeholder="Số 12, ngõ 34, đường Lê Lợi..." maxLength={300} />
                </Field>
              </div>
            </Section>

            <Section n={3} title="Thông tin trường học" icon={<Building2 className="h-4 w-4" />}>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field k="school" label="Tên trường đang học" required error={errors.school}>
                  <input {...bind("school")} type="text" placeholder="Ví dụ: THPT Quốc Học" maxLength={160} />
                </Field>
                <Field k="grade" label="Khối lớp" required error={errors.grade}>
                  <select {...bind("grade")}>
                    <option value="">-- Chọn khối lớp --</option>
                    {GRADES.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field k="schoolProvince" label="Thuộc Tỉnh / Thành phố" required error={errors.schoolProvince}>
                  <select {...bind("schoolProvince")}>
                    <option value="">-- Chọn Tỉnh / Thành --</option>
                    {PROVINCES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </Section>

            <Section n={4} title="Ghi chú cho giáo viên" icon={<MessageSquareText className="h-4 w-4" />}>
              <Field k="note" label="Mục tiêu học hoặc câu hỏi (không bắt buộc)" error={errors.note}>
                <textarea
                  {...bind("note")}
                  rows={3}
                  maxLength={1000}
                  placeholder="Ví dụ: Em muốn lên điểm môn Toán trước kỳ thi giữa kỳ"
                  className={cn(bind("note").className, "h-auto py-3")}
                />
              </Field>
            </Section>

            <button
              type="submit"
              disabled={sending}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[#0B1B3A] text-base font-bold text-white transition-colors hover:bg-[#13285a] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2"
            >
              {sending ? "Đang gửi..." : "Gửi đăng ký"} {!sending && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>
        )}

        {/* BƯỚC 3: ĐÃ GỬI */}
        {step === "done" && (
          <div className="px-6 py-10 text-center md:px-8">
            <CheckCircle2 className="mx-auto h-14 w-14" style={{ color: tone.solid }} aria-hidden />
            <p className="mt-4 text-lg font-extrabold">Giáo viên đã nhận đăng ký của bạn</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
              Đăng ký lớp <b>{c.name}</b> đã được gửi.{" "}
              {sentPhone ? (
                <>
                  Giáo viên sẽ liên hệ qua số điện thoại <b>{sentPhone}</b> để xác nhận chỗ học.
                </>
              ) : (
                "Giáo viên sẽ liên hệ với bạn để xác nhận chỗ học."
              )}
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-6 inline-flex h-11 items-center rounded-2xl bg-[#0B1B3A] px-6 text-sm font-bold text-white hover:bg-[#13285a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B1B3A] focus-visible:ring-offset-2"
            >
              Đóng
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}