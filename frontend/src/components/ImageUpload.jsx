import React, { useRef, useState } from "react";
import { api, mediaUrl, fmtErr } from "@/lib/api";
import { toast } from "sonner";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";

export const ImageUpload = ({ value, onChange, folder = "misc", label, testid = "image-upload", aspect = "aspect-video" }) => {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const pick = () => inputRef.current?.click();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem."); return; }
    const fd = new FormData();
    fd.append("file", file);
    fd.append("folder", folder);
    setBusy(true);
    try {
      const { data } = await api.post("/upload", fd);
      onChange(data.url);
      toast.success("Imagem enviada");
    } catch (err) {
      const detail = err.response?.data?.detail;
      toast.error(fmtErr(detail) || err.message || "Falha no upload");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div>
      {label && <div className="text-sm font-medium mb-1.5">{label}</div>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid={`${testid}-input`} />
      {value ? (
        <div className={`relative ${aspect} w-full overflow-hidden rounded-lg border border-border group`}>
          <img src={mediaUrl(value)} alt="preview" className="h-full w-full object-cover" data-testid={`${testid}-preview`} />
          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button type="button" onClick={pick} disabled={busy} className="text-xs px-3 py-1.5 rounded-full bg-white/90 text-black hover:bg-white" data-testid={`${testid}-replace`}>Trocar</button>
            <button type="button" onClick={() => onChange("")} className="p-1.5 rounded-full bg-white/90 text-black hover:bg-white" data-testid={`${testid}-clear`}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={pick} disabled={busy} data-testid={`${testid}-btn`}
          className={`${aspect} w-full flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-secondary/20 hover:bg-secondary/40 text-muted-foreground transition-colors`}>
          {busy ? <Loader2 size={22} className="animate-spin text-primary" /> : <Upload size={22} strokeWidth={1.5} />}
          <span className="text-xs">{busy ? "Enviando…" : "Enviar imagem"}</span>
        </button>
      )}
    </div>
  );
};

export const NoImage = ({ className = "" }) => (
  <div className={`flex items-center justify-center bg-secondary/30 text-muted-foreground ${className}`}>
    <ImageIcon size={28} strokeWidth={1.25} />
  </div>
);
