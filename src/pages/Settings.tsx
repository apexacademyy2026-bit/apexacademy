import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, Link2, Unplug, Layers, User, Wallet, KeyRound, LogOut, Trash2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { vietQRUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { resolveStudentColor } from "@/lib/studentColor";
import {
  consumeGoogleCalendarTokenFromHash,
  getStoredGoogleCalendarSelection,
  getStoredGoogleCalendarToken,
  listGoogleCalendars,
  normalizeCalendarSelection,
  saveStoredGoogleCalendarSelection,
  saveStoredGoogleCalendarToken,
} from "@/lib/google-calendar";

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate (cùng cỡ với trang Lớp học) */
const LABEL = "text-sm font-semibold text-slate-800";
const FIELD = "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20";
const PRIMARY = "h-11 rounded-xl bg-[#0B1B3A] px-5 text-sm font-bold text-white hover:bg-[#13285a]";
const OUTLINE = "h-11 shrink-0 gap-2 rounded-xl border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50";

// Một khối cài đặt: biểu tượng + tiêu đề, nội dung, nút lưu ở chân
const Panel = ({ icon: Icon, title, hint, right, footer, children }: { icon: LucideIcon; title: string; hint?: string; right?: React.ReactNode; footer?: React.ReactNode; children: React.ReactNode }) => (
  <section className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
    <header className="flex items-start gap-3.5 px-6 pb-5 pt-6">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#0B1B3A]/5 text-[#0B1B3A]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{title}</h2>
        {hint && <p className="text-sm leading-relaxed text-slate-500">{hint}</p>}
      </div>
      {right}
    </header>
    <div className="flex flex-1 flex-col border-t border-slate-100 px-6">{children}</div>
    {footer && <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 bg-slate-50 px-6 py-4">{footer}</footer>}
  </section>
);

// Một ô nhập: nhãn phía trên, gợi ý phía dưới
const Field = ({ label, hint, className, children }: { label: React.ReactNode; hint?: string; className?: string; children: React.ReactNode }) => (
  <div className={cn("min-w-0 space-y-2", className)}>
    <Label className={LABEL}>{label}</Label>
    {children}
    {hint && <p className="text-xs leading-relaxed text-slate-500">{hint}</p>}
  </div>
);

export default function Settings() {
  const { t, profile, user, refreshProfile, lang, setLang, signOut, role } = useApp();
  const [name, setName] = useState("");
  const [brandName, setBrandName] = useState("");
  const [phone, setPhone] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [acct, setAcct] = useState("");
  const [holder, setHolder] = useState("");
  const [pwd, setPwd] = useState("");
  const [curPwd, setCurPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dob, setDob] = useState("");
  const [schoolClass, setSchoolClass] = useState("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [googleToken, setGoogleToken] = useState("");
  const [googleCalendars, setGoogleCalendars] = useState<any[]>([]);
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(false);
  const [googleSelectedIds, setGoogleSelectedIds] = useState<string[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [classCalendarMapping, setClassCalendarMapping] = useState<Record<string, string>>({});
  const isStudent = role === "student";

  // Kiểm tra xem người dùng có đăng nhập bằng Email/Mật khẩu truyền thống hay không
  const hasPasswordAuth = !user?.identities || user.identities.some((i: any) => i.provider === "email");

  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delSent, setDelSent] = useState(false);

  useEffect(() => { document.title = `${t.settings} — ${t.appName}`; }, [t]);

  useEffect(() => {
    if (profile && user) {
      setName(profile.display_name || "");
      setPhone((profile as any).phone || "");
      setBankCode(profile.bank_code || "");
      setAcct(profile.bank_account_number || "");
      setHolder(profile.bank_account_name || "");
      setAvatarUrl((profile as any).avatar_url || null);
      setDob((profile as any).date_of_birth || "");
      setSchoolClass((profile as any).school_class || "");
      setParentName((profile as any).parent_name || "");
      setParentPhone((profile as any).parent_phone || "");
    }
    if (user?.user_metadata?.brand_name) {
      setBrandName(user.user_metadata.brand_name || "");
    }
  }, [profile, user]);

  useEffect(() => {
    if (!user || isStudent) return;
    (async () => {
      const { data, error } = await (supabase.from("classes") as any).select("id, name, google_calendar_id");
      if (data && !error) {
        setClasses(data);
        const mapping: Record<string, string> = {};
        data.forEach((c: any) => { mapping[c.id] = c.google_calendar_id || "none"; });
        setClassCalendarMapping(mapping);
      }
    })();
  }, [user, isStudent]);

  useEffect(() => {
    let active = true;
    (async () => {
      const tokenFromHash = consumeGoogleCalendarTokenFromHash();
      const session = await supabase.auth.getSession();
      const providerToken = (session.data.session as any)?.provider_token || null;
      const token = tokenFromHash || providerToken || getStoredGoogleCalendarToken();

      if (!active) return;
      if (!token) { setGoogleToken(""); return; }
      setGoogleToken(token);

      try {
        setGoogleCalendarLoading(true);
        const calendars = await listGoogleCalendars(token);
        const saved = getStoredGoogleCalendarSelection();
        const normalized = normalizeCalendarSelection(saved, calendars);
        setGoogleCalendars(calendars);
        setGoogleSelectedIds(normalized);
        saveStoredGoogleCalendarSelection(normalized);
        saveStoredGoogleCalendarToken(token);
      } catch (err: any) {
        setGoogleToken("");
        saveStoredGoogleCalendarToken(null);
      } finally {
        if (active) setGoogleCalendarLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const saveProfile = async () => {
    if (!user) return;
    try {
      const updatePromises: Promise<any>[] = [
        (supabase
          .from("profiles")
          .upsert({
            id: user.id,
            display_name: name.trim() || null,
            phone: phone.trim() || null,
            ...(isStudent ? {
              date_of_birth: dob || null,
              school_class: schoolClass || null,
              parent_name: parentName || null,
              parent_phone: parentPhone || null,
            } : {})
          }) as any)
      ];

      if (!isStudent) {
        updatePromises.push(
          supabase.auth.updateUser({
            data: { brand_name: brandName.trim() || null }
          })
        );
      }

      const results = await Promise.all(updatePromises);
      if (results[0] && (results[0] as any).error) throw new Error((results[0] as any).error.message);
      if (results[1] && (results[1] as any).error) throw new Error((results[1] as any).error.message);

      toast.success(t.save);
      await refreshProfile();
    } catch (error: any) {
      toast.error(error.message || (lang === "vi" ? "Lỗi lưu thông tin" : "Error saving profile"));
    }
  };

  const saveBankInfo = async () => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          bank_code: bankCode.trim().toUpperCase() || null,
          bank_account_number: acct.trim() || null,
          bank_account_name: holder.trim() || null
        });

      if (error) throw error;
      toast.success(t.save);
      await refreshProfile();
    } catch (error: any) {
      toast.error(error.message || (lang === "vi" ? "Lỗi lưu thông tin tài khoản ngân hàng" : "Error saving bank account details"));
    }
  };

  // Hàm Đổi / Tạo mật khẩu hoạt động cho cả Google Auth và Email Auth
  const changePassword = async () => {
    if (pwd.length < 6) return toast.error(lang === "vi" ? "Mật khẩu mới phải từ 6 ký tự trở lên" : "New password must be at least 6 characters");
    if (pwd !== confirmPwd) return toast.error(lang === "vi" ? "Mật khẩu xác nhận không khớp!" : "Confirm password does not match!");

    if (hasPasswordAuth) {
      if (!curPwd) return toast.error(lang === "vi" ? "Vui lòng nhập mật khẩu hiện tại" : "Please enter your current password");
      if (pwd === curPwd) return toast.error(lang === "vi" ? "Mật khẩu mới phải khác mật khẩu hiện tại" : "New password must be different from current password");
      if (!user?.email) return toast.error(lang === "vi" ? "Yêu cầu email đăng nhập" : "Login email required");

      try {
        const { error: vErr } = await supabase.auth.signInWithPassword({ email: user.email, password: curPwd });
        if (vErr) return toast.error(lang === "vi" ? "Mật khẩu hiện tại không đúng!" : "Current password is incorrect");
      } catch (e: any) {
        return toast.error(e.message);
      }
    }

    try {
      const { error } = await supabase.auth.updateUser({ password: pwd });
      if (error) throw error;

      toast.success(lang === "vi" ? "Cập nhật mật khẩu thành công!" : "Password updated successfully!");
      setPwd("");
      setCurPwd("");
      setConfirmPwd("");
    } catch (error: any) {
      toast.error(error.message || (lang === "vi" ? "Lỗi đổi mật khẩu" : "Error changing password"));
    }
  };

  const handleClassCalendarChange = async (classId: string, googleCalendarId: string) => {
    const dbValue = googleCalendarId === "none" ? null : googleCalendarId;
    const { error } = await supabase.from("classes").update({ google_calendar_id: dbValue } as any).eq("id", classId);
    if (error) toast.error(error.message);
    else {
      setClassCalendarMapping(prev => ({ ...prev, [classId]: googleCalendarId }));
      toast.success(lang === "vi" ? "Đã liên kết lịch" : "Calendar linked successfully");
    }
  };

  const startDelete = async () => {
    if (!user?.email) return toast.error(lang === "vi" ? "Yêu cầu email tài khoản" : "Account email required");
    setDelBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: user.email,
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/account/delete-confirm` },
    });
    setDelBusy(false);
    if (error) return toast.error(error.message);
    setDelSent(true);
    toast.success(lang === "vi" ? "Email xác nhận đã được gửi thành công" : "Confirmation email sent successfully");
  };

  const previewQR = vietQRUrl(bankCode, acct, holder, 100000, "Demo");

  const connectGoogleCalendar = async () => {
    try {
      const redirectTo = `${window.location.origin}/settings`;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: "https://www.googleapis.com/auth/calendar",
          queryParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
        },
      });
      if (error) throw error;
      if (!data?.url) throw new Error("No URL returned");
      window.location.assign(data.url);
    } catch (err: any) {
      toast.error(err.message || (lang === "vi" ? "Lỗi kết nối lịch Google" : "Google Calendar connection error"));
    }
  };

  const disconnectGoogleCalendar = () => {
    saveStoredGoogleCalendarToken(null);
    saveStoredGoogleCalendarSelection([]);
    setGoogleToken("");
    setGoogleCalendars([]);
    setGoogleSelectedIds([]);
    toast.success(lang === "vi" ? "Đã ngắt kết nối Google Calendar" : "Google Calendar disconnected");
  };

  const toggleGoogleCalendar = (id: string) => {
    setGoogleSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id];
      saveStoredGoogleCalendarSelection(next);
      return next;
    });
  };

  const extractAvatarPath = (url: string | null) => {
    if (!url) return null;
    const marker = "/avatars/";
    const idx = url.indexOf(marker);
    return idx >= 0 ? url.slice(idx + marker.length) : null;
  };

  const handleAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const previousPath = extractAvatarPath(avatarUrl);

      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = data.publicUrl;
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      if (error) throw error;

      setAvatarUrl(url);
      if (previousPath) {
        await supabase.storage.from("avatars").remove([previousPath]).catch(() => {});
      }
      refreshProfile();
      toast.success(t.save);
    } catch (err: any) {
      toast.error(err.message);
    } finally { setUploading(false); }
  };

  const removeAvatar = async () => {
    if (!user) return;
    const previousPath = extractAvatarPath(avatarUrl);
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setAvatarUrl(null);
    if (previousPath) {
      await supabase.storage.from("avatars").remove([previousPath]).catch(() => {});
    }
    refreshProfile();
  };

  /* ---------------- GIAO DIỆN ---------------- */
  const vi = lang === "vi";
  const roleLabel = isStudent ? (vi ? "Học sinh" : "Student") : vi ? "Giáo viên" : "Teacher";
  const avatarColor = resolveStudentColor(null, user?.id ?? name);
  const qrReady = !!(previewQR && bankCode && acct);

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* ĐẦU TRANG: cùng cỡ với hero trang Lớp học */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-24 hidden h-72 w-72 rounded-full bg-[#FFB547] sm:block" />
        <div className="pointer-events-none absolute -bottom-28 right-40 hidden h-60 w-60 rounded-full border-[36px] border-white/[0.07] sm:block" />
        <div className="relative space-y-6">
          <div className="max-w-lg space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.settings}</h1>
            <p className="text-sm leading-relaxed text-white/70">
              {vi ? "Quản lý cấu hình tài khoản và thiết lập lớp học trực tuyến." : "Manage account configurations and online class setups."}
            </p>
          </div>
          <div className="flex max-w-md items-center gap-4 rounded-2xl bg-white/10 p-3.5 pr-5 ring-1 ring-white/15">
            <Avatar className="h-14 w-14 shrink-0 rounded-xl">
              <AvatarImage src={avatarUrl || undefined} className="object-cover" />
              <AvatarFallback className="rounded-xl text-lg font-extrabold text-white" style={{ background: avatarColor }}>
                {(name || "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-base font-bold text-white">{name || (vi ? "Chưa đặt tên" : "No name yet")}</div>
              <div className="truncate text-sm text-white/65">{user?.email}</div>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-[#FFB547] px-3 py-1 text-xs font-bold text-[#0B1B3A]">{roleLabel}</span>
          </div>
        </div>
      </div>

      {/* CÁC KHỐI CÀI ĐẶT: hai cột, trên điện thoại xếp một cột theo thứ tự */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="min-w-0 space-y-5">
          {/* HỒ SƠ */}
          <Panel
            icon={User}
            title={vi ? "Hồ sơ" : "Profile"}
            hint={vi ? "Thông tin cá nhân và cách bạn xuất hiện trong ứng dụng." : "Your personal details and how you appear in the app."}
            footer={<Button onClick={saveProfile} className={PRIMARY}>{t.save}</Button>}
          >
            <div className="space-y-5 py-5">
              <div className="flex flex-wrap items-center gap-4">
                <Avatar className="h-16 w-16 shrink-0 rounded-2xl ring-2 ring-slate-100">
                  <AvatarImage src={avatarUrl || undefined} className="object-cover" />
                  <AvatarFallback className="rounded-2xl text-lg font-extrabold text-white" style={{ background: avatarColor }}>
                    {(name || "?").slice(0, 1).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-wrap gap-2">
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={uploading} />
                    <span className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0B1B3A] px-4 text-sm font-bold text-white transition-colors hover:bg-[#13285a]">
                      {uploading ? "…" : t.uploadAvatar}
                    </span>
                  </label>
                  {avatarUrl && (
                    <Button variant="outline" onClick={removeAvatar} type="button" className="h-10 rounded-xl border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-100">
                      {t.removeAvatar}
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label={vi ? "Họ và tên" : "Full name"}>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder={vi ? "Nhập họ và tên..." : "Enter full name..."} />
                </Field>

                <Field
                  label={t.phone || (vi ? "Số điện thoại" : "Phone number")}
                  hint={!isStudent ? (vi ? "Hiện trên hóa đơn học phí gửi phụ huynh." : "Shown on tuition invoices sent to parents.") : undefined}
                >
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} placeholder="09xx xxx xxx" />
                </Field>

                {!isStudent && (
                  <Field
                    label={vi ? "Tên lớp / thương hiệu" : "Brand / class name"}
                    hint={vi ? "Hiển thị ở thanh điều hướng bên và tiêu đề trang." : "Shown in the sidebar and layout headings."}
                  >
                    <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={FIELD} placeholder={vi ? "Nhập tên thương hiệu..." : "Enter brand name..."} />
                  </Field>
                )}

                {isStudent && (
                  <>
                    <Field label={t.email}>
                      <Input value={user?.email || ""} className={cn(FIELD, "bg-slate-50 text-slate-500")} disabled />
                    </Field>
                    <Field label={(t as any).dateOfBirth}>
                      <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={FIELD} />
                    </Field>
                    <Field label={(t as any).schoolClass}>
                      <Input value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} className={FIELD} />
                    </Field>
                    <Field label={t.parentName}>
                      <Input value={parentName} onChange={(e) => setParentName(e.target.value)} className={FIELD} />
                    </Field>
                    <Field label={t.parentPhone}>
                      <Input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className={FIELD} placeholder="09xx xxx xxx" />
                    </Field>
                  </>
                )}

                <Field label={t.language}>
                  <Select value={lang} onValueChange={(v) => setLang(v as any)}>
                    <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
                    <SelectContent className="rounded-xl text-sm">
                      <SelectItem value="vi">Tiếng Việt</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          </Panel>

          {/* NGÂN HÀNG (VIETQR) */}
          {!isStudent && (
            <Panel
              icon={Wallet}
              title={t.vietQR}
              hint={vi ? "Mã QR trên hóa đơn học phí được tạo từ thông tin này." : "The payment QR on tuition invoices is generated from these details."}
              footer={<Button onClick={saveBankInfo} className={PRIMARY}>{t.save}</Button>}
            >
              <div className="grid gap-5 py-5 md:grid-cols-[minmax(0,1fr)_9.5rem]">
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label={t.bankCode}>
                    <Input value={bankCode} onChange={(e) => setBankCode(e.target.value.toUpperCase())} className={cn(FIELD, "uppercase")} placeholder="VCB, MB, TCB..." />
                  </Field>
                  <Field label={vi ? "Số tài khoản" : "Account number"}>
                    <Input value={acct} onChange={(e) => setAcct(e.target.value)} className={FIELD} placeholder={vi ? "Nhập số tài khoản..." : "Enter account number..."} />
                  </Field>
                  <Field label={vi ? "Tên chủ tài khoản" : "Account holder name"} className="sm:col-span-2">
                    <Input value={holder} onChange={(e) => setHolder(e.target.value)} className={cn(FIELD, "uppercase")} placeholder="NGUYEN VAN A..." />
                  </Field>
                </div>

                <div
                  className={cn(
                    "flex min-h-[9.5rem] flex-col items-center justify-center gap-2 rounded-xl p-4 text-center",
                    qrReady ? "bg-slate-50" : "border border-dashed border-slate-300 bg-slate-50/60",
                  )}
                >
                  {qrReady ? (
                    <>
                      <img src={previewQR} alt="QR preview" className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1" />
                      <span className="text-xs font-medium text-slate-500">{vi ? "Mã QR xem trước" : "QR preview"}</span>
                    </>
                  ) : (
                    <p className="text-xs leading-relaxed text-slate-500">
                      {vi ? "Nhập mã ngân hàng và số tài khoản để xem trước mã QR." : "Enter the bank code and account number to preview the QR."}
                    </p>
                  )}
                </div>
              </div>
            </Panel>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          {/* GOOGLE CALENDAR */}
          <Panel
            icon={CalendarDays}
            title={(t as any).googleCalendar}
            hint={(t as any).googleCalendarHint}
            right={
              <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", googleToken ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
                {googleToken ? (vi ? "Đã kết nối" : "Connected") : vi ? "Chưa kết nối" : "Not connected"}
              </span>
            }
          >
            {!googleToken ? (
              <div className="py-5">
                <div className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <div className="text-sm font-bold text-slate-900">{vi ? "Liên kết tài khoản Google cá nhân" : "Connect your Google account"}</div>
                    <div className="text-xs text-slate-500">{vi ? "Đăng nhập để đồng bộ lịch dạy tự động." : "Sign in to sync your schedule details automatically."}</div>
                  </div>
                  <Button onClick={connectGoogleCalendar} className={cn(PRIMARY, "shrink-0 gap-2")}>
                    <Link2 className="h-4 w-4" /> {(t as any).connectGoogleCalendar}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-6 py-5">
                <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
                  <span>{(t as any).googleCalendarConnected}</span>
                  <Button variant="ghost" onClick={disconnectGoogleCalendar} className="h-9 gap-1.5 rounded-lg px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                    <Unplug className="h-4 w-4" /> {(t as any).disconnectGoogleCalendar}
                  </Button>
                </div>

                {googleCalendarLoading ? (
                  <div className="py-4 text-center text-sm text-slate-400">Loading...</div>
                ) : (
                  <>
                    <div className="space-y-3">
                      <div className="text-sm font-bold text-slate-900">{vi ? "Chọn lịch muốn dùng" : "Choose calendars"}</div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {googleCalendars.map((calendar) => (
                          <label key={calendar.id} className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                            <Checkbox id={calendar.id} checked={googleSelectedIds.includes(calendar.id)} onCheckedChange={() => toggleGoogleCalendar(calendar.id)} className="rounded-md" />
                            <span className="flex-1 truncate">{calendar.summary}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-slate-100 pt-6">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <Layers className="h-4 w-4 text-slate-400" /> {vi ? "Liên kết lịch riêng theo từng lớp học" : "Link a calendar per class"}
                      </div>
                      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {classes.map((clsItem) => (
                          <div key={clsItem.id} className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center">
                            <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold text-slate-900">
                              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: resolveStudentColor(null, clsItem.id) }} />
                              <span className="truncate">{clsItem.name}</span>
                            </span>
                            <Select value={classCalendarMapping[clsItem.id] || "none"} onValueChange={(val) => handleClassCalendarChange(clsItem.id, val)}>
                              <SelectTrigger className={cn(FIELD, "h-10 w-full sm:w-56")}><SelectValue /></SelectTrigger>
                              <SelectContent className="rounded-xl text-sm">
                                <SelectItem value="none">{vi ? "Không liên kết" : "Not linked"}</SelectItem>
                                {googleCalendars.map((cal) => <SelectItem key={cal.id} value={cal.id}>{cal.summary}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </Panel>

          {/* MẬT KHẨU (HỖ TRỢ CẢ GOOGLE OAUTH & EMAIL AUTH) */}
          <Panel
            icon={KeyRound}
            title={hasPasswordAuth ? (vi ? "Đổi mật khẩu" : "Change password") : vi ? "Thiết lập mật khẩu riêng" : "Set account password"}
            hint={
              !hasPasswordAuth
                ? vi
                  ? "Tài khoản của bạn đăng nhập bằng Google. Đặt mật khẩu để có thể đăng nhập bằng email riêng."
                  : "You signed in via Google. Set a password to sign in using email directly."
                : undefined
            }
            footer={
              <Button onClick={changePassword} className={cn(PRIMARY, "gap-2")}>
                <CheckCircle2 className="h-4 w-4" /> {t.save}
              </Button>
            }
          >
            <div className="space-y-5 py-5">
              {hasPasswordAuth && (
                <Field label={(t as any).currentPassword || (vi ? "Mật khẩu hiện tại" : "Current password")}>
                  <Input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} className={FIELD} placeholder="••••••••" />
                </Field>
              )}
              <Field label={(t as any).newPassword || (vi ? "Mật khẩu mới" : "New password")} hint={vi ? "Tối thiểu 6 ký tự." : "At least 6 characters."}>
                <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className={FIELD} placeholder="••••••••" />
              </Field>
              <Field label={vi ? "Xác nhận mật khẩu mới" : "Confirm new password"}>
                <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className={FIELD} placeholder="••••••••" />
              </Field>
            </div>
          </Panel>

          {/* ĐĂNG XUẤT / XÓA TÀI KHOẢN */}
          <Panel icon={ShieldAlert} title={vi ? "Tài khoản" : "Account"}>
            <div className="flex flex-wrap items-center justify-between gap-4 py-5">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900">{vi ? "Đăng xuất tài khoản" : "Log out"}</h3>
                <p className="text-xs text-slate-500">{vi ? "Thoát phiên làm việc" : "End current session"}</p>
              </div>
              <Button variant="outline" onClick={signOut} className={OUTLINE}>
                <LogOut className="h-4 w-4" /> {t.logout}
              </Button>
            </div>
            <div className="-mx-6 flex flex-wrap items-center justify-between gap-4 border-t border-rose-100 bg-rose-50/60 px-6 py-5">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-rose-600">{vi ? "Xoá tài khoản" : "Delete account"}</h3>
                <p className="text-xs text-slate-500">{vi ? "Xóa vĩnh viễn dữ liệu" : "Permanently wipe data"}</p>
              </div>
              <Button onClick={() => { setDelSent(false); setDelOpen(true); }} className="h-11 shrink-0 gap-2 rounded-xl bg-rose-600 px-5 text-sm font-bold text-white hover:bg-rose-700">
                <Trash2 className="h-4 w-4" /> {vi ? "Xoá" : "Delete"}
              </Button>
            </div>
          </Panel>
        </div>
      </div>

      {/* POPUP XÓA TÀI KHOẢN */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-3xl border-0 p-0 font-['Be_Vietnam_Pro',sans-serif] sm:max-w-sm">
          <div className="h-1.5 bg-rose-500" />
          <DialogHeader className="space-y-2 px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-2 text-lg font-extrabold text-rose-600">
              <ShieldAlert className="h-5 w-5" /> {vi ? "Xác nhận xóa tài khoản" : "Delete account"}
            </DialogTitle>
            <DialogDescription className="text-sm leading-relaxed text-slate-500">
              {!delSent
                ? (vi ? `Hệ thống sẽ gửi một liên kết xác thực bảo mật tối cao đến hòm thư điện tử ${user?.email} để phê duyệt yêu cầu hủy.` : `We will send a high-security validation link to ${user?.email} to authorize destruction.`)
                : (vi ? "Email phê duyệt xóa đã được gửi đi. Hãy kiểm tra hộp thư đến." : "Authorization email has been sent. Please check inbox.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4">
            <Button variant="ghost" onClick={() => setDelOpen(false)} disabled={delBusy} className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-200/60">
              {vi ? "Đóng" : "Close"}
            </Button>
            {!delSent && (
              <Button onClick={startDelete} disabled={delBusy} className="h-10 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
                {vi ? "Gửi email xác nhận" : "Send email"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}