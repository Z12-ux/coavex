"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "./ui";

/**
 * Dark "Forge" is the default; light is opt-in and remembered per device.
 * The pre-paint script in the root layout applies the stored choice.
 */
export function ThemeToggle({ labels, className, withLabel = false }: { labels: { toLight: string; toDark: string }; className?: string; withLabel?: boolean }) {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.getAttribute("data-theme") === "light"), []);
  const toggle = () => {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("coachos:theme", next ? "light" : "dark");
    } catch {
      /* private mode: the choice lasts for the session */
    }
  };
  const label = light ? labels.toDark : labels.toLight;
  return (
    <button type="button" onClick={toggle} className={cn("press inline-flex h-10 items-center gap-2 rounded-md px-2.5 text-[13px] text-ink-2 hover:bg-surface-2", !withLabel && "w-10 justify-center px-0", className)} aria-label={label} title={label}>
      {light ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {withLabel ? <span>{label}</span> : null}
    </button>
  );
}
