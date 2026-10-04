"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "./toast";
import { cn } from "./ui";

/** While the action runs, the form's buttons dim and ignore further clicks (no double submit). */
const BUSY = "[&[data-busy]_button]:pointer-events-none [&[data-busy]_button]:opacity-55 [&[data-busy]]:cursor-progress";

/**
 * <form> for server actions. After the action completes it refreshes the
 * route (belt and braces for revalidatePath) and shows a short confirmation.
 * While pending the form is marked busy so buttons dim and cannot double-submit.
 */
export function ActionForm({
  action,
  children,
  className,
  id,
  toast: successMessage,
  errorMessage = "Une erreur est survenue. Vos modifications n'ont pas été perdues. Réessayez.",
  confirm,
}: {
  action: (formData: FormData) => Promise<void | unknown>;
  children: ReactNode;
  className?: string;
  id?: string;
  /** confirmation shown on success (omit for silent actions such as navigation) */
  toast?: string;
  errorMessage?: string;
  /** ask before running (destructive actions) */
  confirm?: string;
}) {
  const router = useRouter();
  const [, start] = useTransition();
  const [busy, setBusy] = useState(false);
  return (
    <form
      id={id}
      className={cn(BUSY, className)}
      aria-busy={busy || undefined}
      data-busy={busy ? "" : undefined}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      action={async (formData: FormData) => {
        setBusy(true);
        let failed = false;
        try {
          await action(formData);
        } catch (err) {
          // Next uses thrown errors for redirects; only real failures are reported.
          const digest = (err as { digest?: string } | null)?.digest ?? "";
          if (!digest.startsWith("NEXT_REDIRECT") && !digest.startsWith("NEXT_NOT_FOUND")) {
            failed = true;
            toast(errorMessage, "bad", 4000);
          }
          throw err;
        } finally {
          setBusy(false);
          if (!failed && successMessage) toast(successMessage, "good");
          start(() => router.refresh());
        }
      }}
    >
      {children}
    </form>
  );
}
