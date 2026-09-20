import React, { useEffect, useState } from "react";
import { api, brl } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card } from "@/components/ui/card";

export default function ProServices() {
  const { user } = useAuth();
  const [services, setServices] = useState([]);

  useEffect(() => {
    api.get("/services").then((r) => setServices(r.data.filter((s) => s.active !== false)));
  }, [user.id]);

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <div className="text-xs tracking-[0.4em] text-primary uppercase">Catálogo</div>
        <h1 className="font-display text-4xl sm:text-5xl mt-2">Meus serviços</h1>
        <p className="text-sm text-muted-foreground mt-2">Estes são os serviços vinculados ao seu perfil pelo gerente do Studio.</p>
      </div>
      <div className="space-y-2">
        {services.map((s) => (
          <Card key={s.id} className="p-4 border-border flex items-center justify-between" data-testid={`pro-svc-${s.id}`}>
            <div>
              <div className="font-medium">{s.name}</div>
              <div className="text-xs text-muted-foreground">{s.duration_min} min • {brl(s.price)}</div>
            </div>
          </Card>
        ))}
        {services.length === 0 && <div className="text-muted-foreground">Nenhum serviço cadastrado pelo Studio.</div>}
      </div>
    </div>
  );
}
