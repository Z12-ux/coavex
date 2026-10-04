import { getCurrentUser } from "@/server/auth/session";
import { t } from "@/lib/i18n/dictionary";
import { BrandMark } from "@/components/brand";
import { CtaArrow, LinkButton } from "@/components/ui";

export default async function NotFound() {
  const user = await getCurrentUser();
  const locale = user?.locale ?? "fr";
  const home = user?.role === "CLIENT" ? "/app" : "/";
  return (
    <main className="relative isolate flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div aria-hidden className="bg-grid pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(60%_50%_at_50%_40%,black,transparent_75%)]" />
      <div className="w-full max-w-md text-center">
        <div className="flex justify-center">
          <BrandMark size={44} />
        </div>
        <p aria-hidden className="tnum text-glow mt-6 font-display text-[112px] font-extrabold leading-none text-accent sm:text-[136px]">
          404
        </p>
        <h1 className="t-title mt-2 text-ink">{t(locale, "error.notFoundTitle")}</h1>
        <p className="mx-auto mt-2 max-w-sm text-[14px] leading-[21px] text-ink-2">{t(locale, "error.notFound")}</p>
        <LinkButton href={home} variant="neon" size="lg" className="mt-7 h-14 w-full justify-between pe-3 ps-5">
          <span>{t(locale, "error.backHome")}</span>
          <CtaArrow />
        </LinkButton>
      </div>
    </main>
  );
}
