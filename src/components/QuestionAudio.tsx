import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function QuestionAudio({ path, className }: { path?: string | null; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    (async () => {
      if (/^https?:\/\//i.test(path)) {
        setUrl(path);
        return;
      }
      const { data, error } = await supabase.storage.from("test-audios").createSignedUrl(path, 3600);
      if (!cancelled && !error) setUrl(data?.signedUrl || null);
    })();
    return () => { cancelled = true; };
  }, [path]);

  if (!path) return null;
  if (!url) return <div className="text-xs text-muted-foreground">Loading audio…</div>;
  return <audio controls src={url} className={className || "w-full"} />;
}
