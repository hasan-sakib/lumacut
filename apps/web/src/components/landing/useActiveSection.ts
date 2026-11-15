import { useEffect, useState } from "react";

/** The id of the section nearest the top of the screen (for the navbar highlight), or null. */
export function useActiveSection(ids: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive(ids.find((id) => visible.has(id)) ?? null);
      },
      // A band across the upper middle of the screen: a section is "current" while it crosses it.
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el !== null) observer.observe(el);
    }
    return () => {
      observer.disconnect();
    };
  }, [ids]);
  return active;
}

/** Has the page been scrolled away from the top? */
export function useScrolled(): boolean {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const read = () => {
      setScrolled(window.scrollY > 8);
    };
    read();
    window.addEventListener("scroll", read, { passive: true });
    return () => {
      window.removeEventListener("scroll", read);
    };
  }, []);
  return scrolled;
}
