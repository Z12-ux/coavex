import { redirect } from "next/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { BrandMark, Wordmark } from "@/components/brand";
import { LoginForm } from "./login-form";

export const metadata = { title: "Connexion" };

const DEMO_ACCOUNTS = [
  { email: "coach@coachos.demo", password: "coach1234", role: "coach" },
  { email: "ahmed@coachos.demo", password: "client1234", role: "client" },
  { email: "sara@coachos.demo", password: "client1234", role: "client" },
] as const;

/**
 * Welcome / sign-in — immersive hero, always dark (`.forge`).
 * Desktop: the coach fills the left side edge to edge and dissolves into the
 * page; his name sits over the photo as real text; the form is on the right.
 * Phones: the photo is the top of the screen, the name over it, the form
 * slides up underneath.
 */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "CLIENT" ? "/app" : "/");
  const { next } = await searchParams;
  return (
    <main className="forge relative isolate min-h-dvh overflow-hidden bg-bg text-ink lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(440px,0.8fr)]">
      {/* Hero: photo edge to edge, dissolving into the page */}
      <section className="relative h-[52dvh] min-h-[340px] lg:h-auto lg:min-h-dvh" aria-label="Coach Farouk">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/coach-farouk-hero.webp"
          alt="Coach Farouk"
          width={1400}
          height={1968}
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover object-[56%_0%] sm:object-[56%_15%] lg:object-[56%_20%]"
        />
        {/* dissolves: bottom (both), end side (desktop), soft top for the brand */}
        <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[58%] bg-gradient-to-t from-bg via-bg/70 to-transparent" />
        <span aria-hidden className="pointer-events-none absolute inset-y-0 end-0 hidden w-[34%] bg-gradient-to-l from-bg to-transparent lg:block rtl:bg-gradient-to-r" />
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-bg/85 to-transparent" />

        <div className="absolute start-4 top-4 flex items-center gap-3 sm:start-6 sm:top-6 lg:start-10 lg:top-9">
          <BrandMark size={40} title="" />
          <Wordmark size="lg" />
        </div>

        <div className="absolute inset-x-4 bottom-12 sm:inset-x-6 lg:inset-x-10 lg:bottom-14">
          <p className="flex items-center gap-2 text-[11.5px] font-semibold uppercase leading-none tracking-[0.2em] text-accent sm:text-[12.5px]">
            <span aria-hidden className="h-px w-8 bg-accent" />
            Coach sportif
          </p>
          <p className="mt-2 font-display text-[58px] font-extrabold uppercase leading-[0.86] tracking-[0.01em] text-ink sm:text-[76px] lg:text-[clamp(84px,9.2vw,148px)]">
            Coach
            <br />
            <span className="text-glow text-accent">Farouk</span>
          </p>
          <p className="mt-3 font-display text-[13px] font-semibold uppercase tracking-[0.32em] text-ink-2 sm:text-[15px] lg:mt-5 lg:text-[17px]">Discipline. Force. Constance.</p>
        </div>
      </section>

      {/* Sign-in */}
      <section className="relative z-10 -mt-7 px-4 pb-10 sm:px-6 lg:mt-0 lg:flex lg:items-center lg:px-10 lg:py-12">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 hidden lg:block">
          <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(80%_60%_at_60%_40%,black,transparent_80%)]" />
          <div className="absolute end-[-120px] top-[18%] size-[420px] rounded-full bg-accent/10 blur-[110px]" />
        </div>
        <div className="mx-auto w-full max-w-sm lg:max-w-[400px]">
          <LoginForm next={next} />
          <section className="mt-4 rounded-lg border border-border bg-surface/60 px-4 py-3 backdrop-blur">
            <h2 className="t-kicker">Comptes de démonstration</h2>
            <ul className="mt-1.5 divide-y divide-border">
              {DEMO_ACCOUNTS.map((a) => (
                <li key={a.email} className="flex items-center justify-between gap-3 py-1.5 text-[12.5px]">
                  <span className="tnum min-w-0 truncate text-ink-2">
                    {a.email} <span className="text-muted-2">·</span> <span className="text-muted">{a.password}</span>
                  </span>
                  <span className="shrink-0 rounded-full border border-border-strong px-2 py-px text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{a.role}</span>
                </li>
              ))}
            </ul>
          </section>
          <p className="mt-4 text-center text-[11.5px] text-muted-2 lg:text-start">Le système d&apos;exploitation du coach</p>
        </div>
      </section>
    </main>
  );
}
