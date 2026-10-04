"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Lock, Mail } from "lucide-react";
import { loginAction, type LoginState } from "@/server/actions/auth";
import { Button, CtaArrow, Field, cn, inputClass } from "@/components/ui";

const iconCls = "pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, undefined);
  // React 19 resets uncontrolled fields after a form action: keep the e-mail after a failed attempt.
  const [email, setEmail] = useState("");
  return (
    <form action={action} className="rounded-lg border border-border bg-surface/90 p-5 shadow-[var(--shadow)] backdrop-blur sm:p-6">
      <p className="t-kicker">Bienvenue</p>
      <h1 className="t-title mt-1 text-ink">Connexion</h1>
      <p className="mb-5 mt-1 text-[13px] text-muted">Accédez à votre espace coach ou client.</p>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-3.5">
        <Field label="E-mail" required>
          <span className="relative block">
            <Mail className={iconCls} aria-hidden />
            <input name="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={cn(inputClass, "h-12 ps-10")} placeholder="vous@exemple.com" />
          </span>
        </Field>
        <Field label="Mot de passe" required>
          <span className="relative block">
            <Lock className={iconCls} aria-hidden />
            <input name="password" type="password" autoComplete="current-password" required className={cn(inputClass, "h-12 ps-10")} />
          </span>
        </Field>
      </div>
      {state?.error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-md border border-bad/30 border-s-2 border-s-bad bg-bad-soft px-3 py-2 text-[13px] text-ink">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-bad" aria-hidden />
          {state.error === "locked" ? "Trop de tentatives. Réessayez dans 10 minutes." : "E-mail ou mot de passe incorrect."}
        </p>
      ) : null}
      <Button type="submit" variant="neon" size="lg" className="mt-5 h-14 w-full justify-between pe-3 ps-5" disabled={pending} aria-busy={pending || undefined}>
        <span>{pending ? "Connexion…" : "Se connecter"}</span>
        <CtaArrow />
      </Button>
    </form>
  );
}
