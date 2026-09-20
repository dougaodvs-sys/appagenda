import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, mediaUrl, BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import InstallAppButton from "@/components/InstallAppButton";

export default function PublicStudio() {
  const { slug } = useParams();
  const [studio, setStudio] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    api.get(`/public/studios/${slug}/config`).then((r) => {
      const config = r.data;
      setStudio(config);
      let manifestLink = document.querySelector('link[rel="manifest"]');
      if (!manifestLink) {
        manifestLink = document.createElement("link");
        manifestLink.rel = "manifest";
        document.head.appendChild(manifestLink);
      }
      manifestLink.href = `${BACKEND_URL}/api/public/studios/${encodeURIComponent(config.slug)}/manifest`;
    }).catch(() => setError(true));
  }, [slug]);
  if (error) return <div className="min-h-screen flex items-center justify-center">Studio não encontrado.</div>;
  if (!studio) return <div className="min-h-screen flex items-center justify-center">Carregando…</div>;
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-md">
        {studio.logo_url && <img src={mediaUrl(studio.logo_url)} alt={studio.name} className="mx-auto h-24 w-24 rounded-full object-cover" />}
        <h1 className="font-display text-4xl">{studio.name}</h1>
        <p className="text-muted-foreground">Agende seu horário online.</p>
        <InstallAppButton />
        <div className="flex justify-center gap-3">
          <Button asChild><Link to={`/login?studio=${encodeURIComponent(slug)}`}>Entrar para agendar</Link></Button>
          <Button variant="outline" asChild><Link to={`/register?studio=${encodeURIComponent(slug)}`}>Criar conta</Link></Button>
        </div>
      </div>
    </div>
  );
}
