import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

/**
 * Landing page reached via the magic-link emailed when a user requests
 * account deletion. Supabase auto-consumes the token in the URL and
 * establishes a session; we then call the delete-account edge function.
 */
export default function DeleteConfirm() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"verifying" | "ready" | "deleting" | "done" | "error">("verifying");
  const [email, setEmail] = useState<string>("");
  const [errMsg, setErrMsg] = useState<string>("");

  useEffect(() => {
    document.title = "Confirm account deletion";
    let cancelled = false;
    const check = async () => {
      // Give supabase-js a moment to parse the token from the URL hash.
      for (let i = 0; i < 20; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (!cancelled) {
            setEmail(data.session.user.email || "");
            setStatus("ready");
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 150));
      }
      if (!cancelled) {
        setStatus("error");
        setErrMsg("Verification link is invalid or has expired. Please request a new one.");
      }
    };
    check();
    return () => { cancelled = true; };
  }, []);

  const doDelete = async () => {
    setStatus("deleting");
    try {
      const { error } = await supabase.functions.invoke("delete-account");
      if (error) throw error;
      await supabase.auth.signOut();
      setStatus("done");
      toast.success("Account deleted");
      setTimeout(() => navigate("/auth", { replace: true }), 1200);
    } catch (e: any) {
      setStatus("error");
      setErrMsg(e.message || "Failed to delete account");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="w-full max-w-md p-6 space-y-4">
        <h1 className="text-2xl font-bold text-destructive">Confirm account deletion</h1>
        {status === "verifying" && <p className="text-muted-foreground">Verifying your link…</p>}
        {status === "ready" && (
          <>
            <p>Signed in as <span className="font-semibold">{email}</span>.</p>
            <p className="text-sm text-muted-foreground">
              This will permanently delete your account and all associated data. This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="destructive" onClick={doDelete}>Permanently delete</Button>
              <Button variant="outline" onClick={() => navigate("/")}>Cancel</Button>
            </div>
          </>
        )}
        {status === "deleting" && <p className="text-muted-foreground">Deleting your account…</p>}
        {status === "done" && <p className="text-success">Account deleted. Redirecting…</p>}
        {status === "error" && (
          <>
            <p className="text-destructive">{errMsg}</p>
            <Button variant="outline" onClick={() => navigate("/settings")}>Back to settings</Button>
          </>
        )}
      </Card>
    </div>
  );
}