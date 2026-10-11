import { useEffect, useState } from "react";
import { CalendarDays, Link2, Unplug, Layers, User, Wallet, KeyRound, LogOut, Trash2, Globe, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
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

/* Design tokens: navy #0B1B3A · hổ phách #FFB547 · nền trung tính slate (giống các trang khác) */
const CARD = "space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs";
const LABEL = "text-sm font-medium text-slate-700";
const FIELD = "h-11 rounded-xl border-slate-200 bg-white text-sm shadow-xs focus-visible:border-[#0B1B3A] focus-visible:ring-2 focus-visible:ring-[#0B1B3A]/20";
const PRIMARY = "h-10 rounded-xl bg-[#0B1B3A] px-5 text-sm font-bold text-white hover:bg-[#13285a]";

const SectionHead = ({ icon: Icon, tone, title, hint, right }: { icon: any; tone: string; title: string; hint?: string; right?: React.ReactNode }) => (
  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
    <div className="flex items-center gap-3">
      <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tone)}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
        {hint && <p className="text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
    {right}
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

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12 font-['Be_Vietnam_Pro',sans-serif]">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap');`}</style>

      {/* HERO */}
      <div className="relative overflow-hidden rounded-3xl bg-[#0B1B3A] px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#FFB547]" />
        <div className="pointer-events-none absolute -bottom-28 right-40 hidden h-60 w-60 rounded-full border-[36px] border-white/[0.07] sm:block" />
        <div className="relative max-w-lg space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.settings}</h1>
          <p className="text-sm leading-relaxed text-white/70">
            {vi ? "Quản lý cấu hình tài khoản và thiết lập lớp học trực tuyến." : "Manage account configurations and online class setups."}
          </p>
        </div>
      </div>

      {/* THÔNG TIN CÁ NHÂN */}
      <Card className={CARD}>
        <SectionHead icon={User} tone="bg-indigo-50 text-indigo-600" title={vi ? "Thông tin cá nhân" : "Personal profile"} />

        <div className="flex flex-col items-start gap-5 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16 shrink-0 rounded-2xl ring-2 ring-white">
            <AvatarImage src={avatarUrl || undefined} className="object-cover" />
            <AvatarFallback
              className="rounded-2xl text-lg font-extrabold text-white"
              style={{ background: resolveStudentColor(null, user?.id ?? name) }}
            >
              {(name || "?").slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="w-full space-y-2">
            <Label className={LABEL}>{t.avatar}</Label>
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
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className={LABEL}>{vi ? "Họ và tên" : "Full name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className={FIELD} placeholder={vi ? "Nhập họ và tên..." : "Enter full name..."} />
          </div>

          <div className="space-y-1.5">
            <Label className={LABEL}>{t.phone || (vi ? "Số điện thoại" : "Phone number")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className={FIELD} placeholder="09xx xxx xxx" />
          </div>

          {!isStudent && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={LABEL}>{vi ? "Tên hiển thị của lớp / thương hiệu" : "Brand / class display name"}</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className={FIELD} placeholder={vi ? "Nhập tên thương hiệu..." : "Enter brand name..."} />
              <p className="text-xs text-slate-500">{vi ? "Hiển thị ở thanh điều hướng bên và tiêu đề trang." : "Shown in the sidebar and layout headings."}</p>
            </div>
          )}

          {isStudent && (
            <>
              <div className="space-y-1.5"><Label className={LABEL}>{t.email}</Label><Input value={user?.email || ""} className={cn(FIELD, "bg-slate-50 text-slate-500")} disabled /></div>
              <div className="space-y-1.5"><Label className={LABEL}>{(t as any).dateOfBirth}</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className={FIELD} /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label className={LABEL}>{(t as any).schoolClass}</Label><Input value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} className={FIELD} /></div>
              <div className="space-y-1.5"><Label className={LABEL}>{t.parentName}</Label><Input value={parentName} onChange={(e) => setParentName(e.target.value)} className={FIELD} /></div>
              <div className="space-y-1.5"><Label className={LABEL}>{t.parentPhone}</Label><Input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className={FIELD} placeholder="09xx xxx xxx" /></div>
            </>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label className={cn(LABEL, "flex items-center gap-1.5")}><Globe className="h-4 w-4 text-slate-400" /> {t.language}</Label>
            <Select value={lang} onValueChange={(v) => setLang(v as any)}>
              <SelectTrigger className={FIELD}><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="vi">Tiếng Việt</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={saveProfile} className={PRIMARY}>{t.save}</Button>
      </Card>

      {/* GOOGLE CALENDAR */}
      <Card className={CARD}>
        <SectionHead
          icon={CalendarDays}
          tone="bg-sky-50 text-sky-600"
          title={(t as any).googleCalendar}
          hint={(t as any).googleCalendarHint}
          right={
            <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", googleToken ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
              {googleToken ? (vi ? "Đã kết nối" : "Connected") : vi ? "Chưa kết nối" : "Not connected"}
            </span>
          }
        />

        {!googleToken ? (
          <div className="flex flex-col gap-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <div className="text-sm font-bold text-slate-900">{vi ? "Liên kết tài khoản Google cá nhân" : "Connect your Google account"}</div>
              <div className="text-xs text-slate-500">{vi ? "Đăng nhập để đồng bộ lịch dạy tự động." : "Sign in to sync your schedule details automatically."}</div>
            </div>
            <Button onClick={connectGoogleCalendar} className="h-10 shrink-0 gap-2 rounded-xl bg-[#0B1B3A] px-5 text-sm font-bold text-white hover:bg-[#13285a]">
              <Link2 className="h-4 w-4" /> {(t as any).connectGoogleCalendar}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700">
              <span>{(t as any).googleCalendarConnected}</span>
              <Button variant="ghost" onClick={disconnectGoogleCalendar} className="h-9 gap-1.5 rounded-lg px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 hover:text-rose-700">
                <Unplug className="h-4 w-4" /> {(t as any).disconnectGoogleCalendar}
              </Button>
            </div>

            {googleCalendarLoading ? (
              <div className="py-4 text-center text-sm text-slate-400">Loading...</div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {googleCalendars.map((calendar) => (
                    <label key={calendar.id} className="flex cursor-pointer select-none items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50">
                      <Checkbox id={calendar.id} checked={googleSelectedIds.includes(calendar.id)} onCheckedChange={() => toggleGoogleCalendar(calendar.id)} className="rounded-md" />
                      <span className="flex-1 truncate">{calendar.summary}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-3 border-t border-slate-100 pt-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Layers className="h-4 w-4 text-slate-400" /> {vi ? "Liên kết lịch riêng theo từng lớp học" : "Link a calendar per class"}
                  </div>
                  <div className="space-y-2">
                    {classes.map((clsItem) => (
                      <div key={clsItem.id} className="flex flex-col justify-between gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center">
                        <span className="flex items-center gap-2.5 text-sm font-semibold text-slate-900">
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: resolveStudentColor(null, clsItem.id) }} />
                          {clsItem.name}
                        </span>
                        <Select value={classCalendarMapping[clsItem.id] || "none"} onValueChange={(val) => handleClassCalendarChange(clsItem.id, val)}>
                          <SelectTrigger className={cn(FIELD, "h-10 w-full sm:w-60")}><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="none">{vi ? "Không liên kết" : "Not linked"}</SelectItem>
                            {googleCalendars.map((cal) => <SelectItem key={cal.id} value={cal.id}>{cal.summary}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* TÀI KHOẢN NGÂN HÀNG (VIETQR) */}
      {!isStudent && (
        <Card className={CARD}>
          <SectionHead icon={Wallet} tone="bg-amber-50 text-amber-600" title={t.vietQR} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className={LABEL}>{t.bankCode}</Label>
              <Input value={bankCode} onChange={(e) => setBankCode(e.target.value.toUpperCase())} className={cn(FIELD, "uppercase")} placeholder="VCB, MB, TCB..." />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL}>{vi ? "Số tài khoản" : "Account number"}</Label>
              <Input value={acct} onChange={(e) => setAcct(e.target.value)} className={FIELD} placeholder={vi ? "Nhập số tài khoản..." : "Enter account number..."} />
            </div>
            <div className="space-y-1.5">
              <Label className={LABEL}>{vi ? "Tên chủ tài khoản" : "Account holder name"}</Label>
              <Input value={holder} onChange={(e) => setHolder(e.target.value)} className={cn(FIELD, "uppercase")} placeholder="NGUYEN VAN A..." />
            </div>
          </div>

          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <Button onClick={saveBankInfo} className={cn(PRIMARY, "shrink-0")}>{t.save}</Button>

            {previewQR && bankCode && acct && (
              <div className="flex w-full flex-col items-center gap-2 rounded-xl bg-slate-50 p-3 sm:w-auto">
                <span className="text-xs font-medium text-slate-500">{vi ? "Mã QR xem trước" : "QR preview"}</span>
                <img src={previewQR} alt="QR preview" className="h-32 w-32 rounded-lg border border-slate-200 bg-white p-1" />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* THIẾT LẬP / ĐỔI MẬT KHẨU (HỖ TRỢ CẢ GOOGLE OAUTH & EMAIL AUTH) */}
      <Card className={CARD}>
        <SectionHead
          icon={KeyRound}
          tone="bg-violet-50 text-violet-600"
          title={hasPasswordAuth ? (vi ? "Đổi mật khẩu" : "Change password") : vi ? "Thiết lập mật khẩu riêng" : "Set account password"}
          hint={
            !hasPasswordAuth
              ? vi
                ? "Tài khoản của bạn đăng nhập bằng Google. Đặt mật khẩu để có thể đăng nhập bằng email riêng."
                : "You signed in via Google. Set a password to sign in using email directly."
              : undefined
          }
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {hasPasswordAuth && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className={LABEL}>{(t as any).currentPassword || (vi ? "Mật khẩu hiện tại" : "Current password")}</Label>
              <Input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} className={FIELD} placeholder="••••••••" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className={LABEL}>{(t as any).newPassword || (vi ? "Mật khẩu mới" : "New password")}</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className={FIELD} placeholder="••••••••" />
          </div>
          <div className="space-y-1.5">
            <Label className={LABEL}>{vi ? "Xác nhận mật khẩu mới" : "Confirm new password"}</Label>
            <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className={FIELD} placeholder="••••••••" />
          </div>
        </div>

        <Button onClick={changePassword} className={cn(PRIMARY, "gap-2")}>
          <CheckCircle2 className="h-4 w-4" /> {t.save}
        </Button>
      </Card>

      {/* KHU VỰC ĐĂNG XUẤT / XÓA TÀI KHOẢN */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-slate-900">{vi ? "Đăng xuất tài khoản" : "Log out"}</h4>
            <p className="text-xs text-slate-500">{vi ? "Thoát phiên làm việc" : "End current session"}</p>
          </div>
          <Button variant="outline" onClick={signOut} className="h-10 shrink-0 gap-2 rounded-xl border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <LogOut className="h-4 w-4" /> {t.logout}
          </Button>
        </Card>

        <Card className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-white p-5 shadow-xs">
          <div className="space-y-0.5">
            <h4 className="text-sm font-bold text-rose-600">{vi ? "Xoá tài khoản" : "Delete account"}</h4>
            <p className="text-xs text-slate-500">{vi ? "Xóa vĩnh viễn dữ liệu" : "Permanently wipe data"}</p>
          </div>
          <Button onClick={() => { setDelSent(false); setDelOpen(true); }} className="h-10 shrink-0 gap-2 rounded-xl bg-rose-600 px-4 text-sm font-bold text-white hover:bg-rose-700">
            <Trash2 className="h-4 w-4" /> {vi ? "Xoá" : "Delete"}
          </Button>
        </Card>
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