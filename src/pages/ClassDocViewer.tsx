import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useApp } from "@/contexts/AppContext";
import { supabase } from "@/integrations/supabase/client";

export default function ClassDocViewer() {
  const { id, docId } = useParams();
  const { t } = useApp();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<any>(null);
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    if (!docId) return;
    (async () => {
      const { data: d } = await supabase.from("class_documents").select("*").eq("id", docId).maybeSingle();
      if (!d) return;
      setDoc(d);
      const { data: signed } = await supabase.storage.from("class-docs").createSignedUrl(d.storage_path, 60 * 30);
      if (signed?.signedUrl) setUrl(signed.signedUrl);
    })();
  }, [docId]);

  const isImage = doc?.mime_type?.startsWith("image/");
  const isPdf = doc?.mime_type === "application/pdf";

  return (
    <div className="space-y-3 max-w-5xl">
      <Button variant="ghost" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-4 w-4" /> {t.classes}
      </Button>
      <Card className="p-4 border-0 shadow-card">
        <h1 className="font-semibold mb-3">{doc?.name || "…"}</h1>
        {!url ? (
          <div className="text-sm text-muted-foreground py-10 text-center">…</div>
        ) : isPdf ? (
          <iframe
            src={`${url}#toolbar=0&navpanes=0&scrollbar=1`}
            className="w-full h-[80vh] rounded-lg border"
            title={doc?.name}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : isImage ? (
          <img
            src={url}
            alt={doc?.name}
            className="max-w-full mx-auto select-none pointer-events-none"
            draggable={false}
            onContextMenu={(e) => e.preventDefault()}
          />
        ) : (
          <div className="text-sm text-muted-foreground">Preview not supported for this file type.</div>
        )}
      </Card>
    </div>
  );
}