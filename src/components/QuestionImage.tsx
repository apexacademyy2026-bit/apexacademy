import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Resolves a `test-images` storage path to a signed URL and renders it. */
export function QuestionImage({ path, className }: { path: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // If a full URL was stored, use it directly.
      if (/^https?:\/\//i.test(path)) { setUrl(path); return; }
      const { data, error } = await supabase.storage.from("test-images").createSignedUrl(path, 3600);
      if (!cancelled && !error) setUrl(data?.signedUrl || null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  if (!url) return <div className="text-xs text-muted-foreground">Loading image…</div>;
  return <img src={url} alt="Question" className={className || "max-h-80 rounded-md border"} />;
}

export function QuestionImagePreview({ path }: { path: string }) {
  return <div className="mt-2"><QuestionImage path={path} className="max-h-48 rounded-md border" /></div>;
}