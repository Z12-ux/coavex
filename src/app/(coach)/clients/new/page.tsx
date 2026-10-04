import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { pageUser } from "@/server/auth/session";
import { t } from "@/lib/i18n/dictionary";
import { PageHeader } from "@/components/ui";
import { NewClientForm } from "./new-client-form";

export default async function NewClientPage() {
  const user = await pageUser("staff");
  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/clients" className="-ms-1 mb-1 inline-flex min-h-11 items-center px-1 gap-1 text-[11.5px] font-semibold uppercase tracking-[0.16em] text-muted hover:text-ink">
        <ChevronLeft className="size-4 rtl:rotate-180" />
        {t(user.locale, "clients.title")}
      </Link>
      <PageHeader title={t(user.locale, "clients.new")} />
      <NewClientForm locale={user.locale} />
    </div>
  );
}
