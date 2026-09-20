import React, { useEffect, useState } from "react";
import { Download, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function InstallAppButton({ compact = false }) {
  const [promptEvent, setPromptEvent] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    setInstalled(Boolean(standalone));
    const capturePrompt = (event) => {
      event.preventDefault();
      setPromptEvent(event);
    };
    window.addEventListener("beforeinstallprompt", capturePrompt);
    return () => window.removeEventListener("beforeinstallprompt", capturePrompt);
  }, []);

  if (installed) return null;

  const install = async () => {
    if (!promptEvent) {
      toast.info("No iPhone: toque em Compartilhar e depois em “Adicionar à Tela de Início”. No Android, use o menu do navegador e escolha “Instalar aplicativo”.");
      return;
    }
    promptEvent.prompt();
    const result = await promptEvent.userChoice;
    if (result.outcome === "accepted") toast.success("Aplicativo adicionado à tela inicial");
    setPromptEvent(null);
  };

  return (
    <Button type="button" variant={compact ? "ghost" : "outline"} size={compact ? "sm" : "default"} onClick={install}>
      {compact ? <Smartphone size={16} /> : <Download size={16} className="mr-2" />}
      {!compact && "Adicionar à tela inicial"}
    </Button>
  );
}
