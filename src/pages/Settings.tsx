import { useEffect, useState } from "react";
import { CalendarDays, Link2, Unplug, Layers, User, Wallet, KeyRound, LogOut, Trash2, Globe, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { vietQRUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  consumeGoogleCalendarTokenFromHash,
  getStoredGoogleCalendarSelection,
  getStoredGoogleCalendarToken,
  listGoogleCalendars,
  normalizeCalendarSelection,
  saveStoredGoogleCalendarSelection,
  saveStoredGoogleCalendarToken,
} from "@/lib/google-calendar";

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

  return (
    <div className="space-y-7 max-w-2xl pb-12">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-slate-950">{t.settings}</h1>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          {lang === "vi" ? "Quản lý cấu hình tài khoản và thiết lập lớp học trực tuyến" : "Manage account configurations and online class setups"}
        </p>
      </div>

      {/* CARD 1: THÔNG TIN CÁ NHÂN */}
      <Card className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-white space-y-6">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
          <div className="h-7 w-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-600">
            <User className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-black text-slate-950">{lang === "vi" ? "Thông tin cá nhân" : "Personal Profile"}</h3>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
          <Avatar className="h-16 w-16 rounded-xl border-2 border-white shadow-sm shrink-0">
            <AvatarImage src={avatarUrl || undefined} className="object-cover" />
            <AvatarFallback className="rounded-xl font-bold bg-blue-600 text-white text-lg">{(name || "?").slice(0, 1).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="space-y-2 w-full">
            <Label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{t.avatar}</Label>
            <div className="flex flex-wrap gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={handleAvatar} disabled={uploading} />
                <span className="inline-flex h-9 items-center justify-center px-4 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 transition-colors shadow-sm">
                  {uploading ? "…" : t.uploadAvatar}
                </span>
              </label>
              {avatarUrl && (
                <Button variant="outline" size="sm" onClick={removeAvatar} type="button" className="h-9 rounded-xl text-xs font-bold border-slate-200 text-slate-600 hover:bg-slate-100">
                  {t.removeAvatar}
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">{lang === "vi" ? "Họ và tên" : "Full name"}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11 rounded-xl text-sm" placeholder={lang === "vi" ? "Nhập họ và tên..." : "Enter full name..."} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">{t.phone || (lang === "vi" ? "Số điện thoại" : "Phone number")}</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 rounded-xl text-sm" placeholder="09xx xxx xxx" />
          </div>

          {!isStudent && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold text-slate-700">{lang === "vi" ? "Tên hiển thị của lớp / thương hiệu" : "Brand / class display name"}</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} className="h-11 rounded-xl text-sm" placeholder={lang === "vi" ? "Nhập tên thương hiệu..." : "Enter brand name..."} />
              <p className="text-[10px] text-slate-400 font-medium">
                {lang === "vi" ? "Hiển thị ở thanh điều hướng bên và tiêu đề trang." : "Shown in the sidebar and layout headings."}
              </p>
            </div>
          )}

          {isStudent && (
            <>
              <div className="space-y-1.5"><Label className="text-xs font-bold text-slate-700">{t.email}</Label><Input value={user?.email || ""} className="h-11 rounded-xl bg-slate-50 text-slate-500 text-sm" disabled /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold text-slate-700">{(t as any).dateOfBirth}</Label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="h-11 rounded-xl text-sm" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label className="text-xs font-bold text-slate-700">{(t as any).schoolClass}</Label><Input value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)} className="h-11 rounded-xl text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold text-slate-700">{t.parentName}</Label><Input value={parentName} onChange={(e) => setParentName(e.target.value)} className="h-11 rounded-xl text-sm" /></div>
              <div className="space-y-1.5"><Label className="text-xs font-bold text-slate-700">{t.parentPhone}</Label><Input value={parentPhone} onChange={(e) => setParentPhone(e.target.value)} className="h-11 rounded-xl text-sm" placeholder="09xx xxx xxx" /></div>
            </>
          )}

          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs font-bold text-slate-700 flex items-center gap-1"><Globe className="h-3.5 w-3.5 text-slate-400" /> {t.language}</Label>
            <Select value={lang} onValueChange={(v) => setLang(v as any)}>
              <SelectTrigger className="h-11 rounded-xl text-sm"><SelectValue /></SelectTrigger>
              <SelectContent className="rounded-xl">
                <SelectItem value="vi">Tiếng Việt</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button onClick={saveProfile} className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all">
          {t.save}
        </Button>
      </Card>

      {/* CARD 2: GOOGLE CALENDAR */}
      <Card className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-white space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-slate-50">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-600">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-950">{(t as any).googleCalendar}</h3>
              <p className="text-[11px] font-medium text-slate-400">{(t as any).googleCalendarHint}</p>
            </div>
          </div>
          <Badge className={cn(
            "text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider border shrink-0 sm:self-center self-start",
            googleToken ? "bg-emerald-50 text-emerald-700 border-emerald-200/50" : "bg-slate-50 text-slate-400 border-slate-200"
          )}>
            {googleToken ? (lang === "vi" ? "Đã kết nối" : "Connected") : (lang === "vi" ? "Chưa kết nối" : "Not connected")}
          </Badge>
        </div>

        {!googleToken ? (
          <div className="rounded-2xl border border-dashed border-sky-200 bg-gradient-to-br from-sky-500/5 via-white to-slate-50/30 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs font-bold text-slate-900">{lang === "vi" ? "Liên kết tài khoản Google cá nhân" : "Connect your Google account"}</div>
              <div className="text-[11px] text-slate-400 font-medium">{lang === "vi" ? "Đăng nhập đồng bộ hóa lịch trình biểu giảng dạy tự động." : "Sign in to sync your schedule details automatically."}</div>
            </div>
            <Button onClick={connectGoogleCalendar} className="h-10 px-5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs gap-1.5 shadow-sm transition-all shrink-0">
              <Link2 className="h-4 w-4" /> {(t as any).connectGoogleCalendar}
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs font-bold text-slate-600">
              <span>{(t as any).googleCalendarConnected}</span>
              <Button variant="ghost" size="sm" onClick={disconnectGoogleCalendar} className="h-8 rounded-lg text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 gap-1.5">
                <Unplug className="h-3.5 w-3.5" /> {(t as any).disconnectGoogleCalendar}
              </Button>
            </div>

            {googleCalendarLoading ? (
              <div className="flex justify-center py-4 text-xs text-slate-400 italic">Loading...</div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {googleCalendars.map((calendar) => (
                    <label key={calendar.id} className="flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition-colors cursor-pointer select-none">
                      <Checkbox id={calendar.id} checked={googleSelectedIds.includes(calendar.id)} onCheckedChange={() => toggleGoogleCalendar(calendar.id)} className="rounded-md" />
                      <span className="truncate flex-1">{calendar.summary}</span>
                    </label>
                  ))}
                </div>

                <div className="space-y-3 pt-3 border-t border-slate-100">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="h-4 w-4 text-sky-600" /> {lang === "vi" ? "Liên kết lịch riêng theo từng lớp học" : "Link a calendar per class"}
                  </div>
                  <div className="space-y-2">
                    {classes.map((clsItem) => (
                      <div key={clsItem.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50/50 border border-slate-100">
                        <span className="text-xs font-bold text-slate-800">{clsItem.name}</span>
                        <Select value={classCalendarMapping[clsItem.id] || "none"} onValueChange={(val) => handleClassCalendarChange(clsItem.id, val)}>
                          <SelectTrigger className="w-full sm:w-60 h-9 rounded-lg text-xs bg-white border-slate-200"><SelectValue /></SelectTrigger>
                          <SelectContent className="rounded-xl">
                            <SelectItem value="none">{lang === "vi" ? "Không liên kết" : "Not linked"}</SelectItem>
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

      {/* CARD 3: THÔNG TIN TÀI KHOẢN NGÂN HÀNG (VIETQR) */}
      {!isStudent && (
        <Card className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-white space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
            <div className="h-7 w-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600">
              <Wallet className="h-4 w-4" />
            </div>
            <h3 className="text-sm font-black text-slate-950">{t.vietQR}</h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">{t.bankCode}</Label>
              <Input value={bankCode} onChange={(e) => setBankCode(e.target.value.toUpperCase())} className="h-11 rounded-xl text-sm uppercase" placeholder="VCB, MB, TCB..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">{lang === "vi" ? "Số tài khoản" : "Account number"}</Label>
              <Input value={acct} onChange={(e) => setAcct(e.target.value)} className="h-11 rounded-xl text-sm" placeholder={lang === "vi" ? "Nhập số tài khoản..." : "Enter account number..."} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold text-slate-700">{lang === "vi" ? "Tên chủ tài khoản" : "Account holder name"}</Label>
              <Input value={holder} onChange={(e) => setHolder(e.target.value)} className="h-11 rounded-xl text-sm uppercase" placeholder="NGUYEN VAN A..." />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 pt-2">
            <Button onClick={saveBankInfo} className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all shrink-0">
              {t.save}
            </Button>

            {previewQR && bankCode && acct && (
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-100 w-full sm:w-auto flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{lang === "vi" ? "Mã QR xem trước" : "QR Preview"}</span>
                <img src={previewQR} alt="QR preview" className="h-32 w-32 rounded-lg bg-white p-1 border border-slate-100 shadow-xs" />
              </div>
            )}
          </div>
        </Card>
      )}

      {/* CARD 4: THIẾT LẬP / ĐỔI MẬT KHẨU (HỖ TRỢ CẢ GOOGLE OAUTH & EMAIL AUTH) */}
      <Card className="p-6 border border-slate-100 shadow-sm rounded-2xl bg-white space-y-4">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-50">
          <div className="h-7 w-7 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-600">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-950">
              {hasPasswordAuth 
                ? (lang === "vi" ? "Đổi mật khẩu" : "Change password") 
                : (lang === "vi" ? "Thiết lập mật khẩu riêng" : "Set account password")}
            </h3>
            {!hasPasswordAuth && (
              <p className="text-[11px] font-medium text-slate-400 mt-0.5">
                {lang === "vi" 
                  ? "Tài khoản của bạn đăng nhập bằng Google. Đặt mật khẩu để có thể đăng nhập bằng email riêng." 
                  : "You signed in via Google. Set a password to sign in using email directly."}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Nếu là tài khoản đăng nhập Email truyền thống -> Yêu cầu nhập Mật khẩu hiện tại */}
          {hasPasswordAuth && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-bold text-slate-700">{(t as any).currentPassword || (lang === "vi" ? "Mật khẩu hiện tại" : "Current Password")}</Label>
              <Input type="password" value={curPwd} onChange={(e) => setCurPwd(e.target.value)} className="h-11 rounded-xl text-sm" placeholder="••••••••" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">{(t as any).newPassword || (lang === "vi" ? "Mật khẩu mới" : "New Password")}</Label>
            <Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="h-11 rounded-xl text-sm" placeholder="••••••••" />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-bold text-slate-700">{lang === "vi" ? "Xác nhận mật khẩu mới" : "Confirm New Password"}</Label>
            <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} className="h-11 rounded-xl text-sm" placeholder="••••••••" />
          </div>
        </div>

        <Button onClick={changePassword} className="h-10 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all gap-1.5">
          <CheckCircle2 className="h-4 w-4" /> {t.save}
        </Button>
      </Card>

      {/* 🛑 KHU VỰC THAO TÁC NGUY HIỂM / DỌN DẸP HỆ THỐNG */}
      <div className="pt-4 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* ĐĂNG XUẤT */}
        <Card className="p-4 border border-slate-100 shadow-sm rounded-2xl bg-white flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-slate-900">{lang === "vi" ? "Đăng xuất tài khoản" : "Log out"}</h4>
            <p className="text-[10px] font-medium text-slate-400">{lang === "vi" ? "Thoát phiên làm việc" : "End current session"}</p>
          </div>
          <Button variant="ghost" onClick={signOut} className="h-10 px-4 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50 gap-1.5 shrink-0">
            <LogOut className="h-4 w-4" /> {t.logout}
          </Button>
        </Card>

        {/* XÓA TÀI KHOẢN */}
        <Card className="p-4 border border-red-100 shadow-sm rounded-2xl bg-white flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold text-red-600">{lang === "vi" ? "Xoá tài khoản" : "Delete account"}</h4>
            <p className="text-[10px] font-medium text-slate-400">{lang === "vi" ? "Xóa vĩnh viễn dữ liệu" : "Permanently wipe data"}</p>
          </div>
          <Button variant="destructive" onClick={() => { setDelSent(false); setDelOpen(true); }} className="h-10 px-4 rounded-xl text-xs font-bold gap-1.5 shrink-0 shadow-sm">
            <Trash2 className="h-4 w-4" /> {lang === "vi" ? "Xoá" : "Delete"}
          </Button>
        </Card>
      </div>

      {/* DIALOG XÓA TÀI KHOẢN */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="rounded-2xl max-w-sm p-6">
          <DialogHeader className="space-y-2">
            <DialogTitle className="flex items-center gap-2 text-red-600 font-black text-lg">
              <ShieldAlert className="h-5 w-5" /> {lang === "vi" ? "Xác nhận xóa tài khoản" : "Delete account"}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 font-medium leading-relaxed">
              {!delSent
                ? (lang === "vi" ? `Hệ thống sẽ gửi một liên kết xác thực bảo mật tối cao đến hòm thư điện tử ${user?.email} để phê duyệt yêu cầu hủy.` : `We will send a high-security validation link to ${user?.email} to authorize destruction.`)
                : (lang === "vi" ? "Email phê duyệt xóa đã được gửi đi. Hãy kiểm tra hộp thư đến." : "Authorization email has been sent. Please check inbox.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setDelOpen(false)} disabled={delBusy} className="h-10 rounded-xl text-xs font-bold border-slate-200">
              {lang === "vi" ? "Đóng" : "Close"}
            </Button>
            {!delSent && (
              <Button variant="destructive" onClick={startDelete} disabled={delBusy} className="h-10 rounded-xl text-xs font-bold shadow-sm">
                {lang === "vi" ? "Gửi email xác nhận" : "Send email"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}