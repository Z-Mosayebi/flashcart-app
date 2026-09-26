"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { usePreferences } from "@/components/PreferencesProvider";
import UserAvatar from "@/components/UserAvatar";
import type { TranslationKey } from "@/lib/i18n";

interface NavItem {
  href: string;
  labelKey: TranslationKey;
  icon: JSX.Element;
}

const NAV: NavItem[] = [
  {
    href: "/review",
    labelKey: "nav.review",
    icon: <span aria-hidden className="text-lg leading-none">🃏</span>,
  },
  {
    href: "/tutor",
    labelKey: "nav.tutor",
    icon: <span aria-hidden className="text-lg leading-none">💬</span>,
  },
  {
    href: "/dashboard",
    labelKey: "nav.dashboard",
    icon: <span aria-hidden className="text-lg leading-none">🏆</span>,
  },
];

/** Rendered only for admins; everyone else never sees the page exists. */
const ADMIN_ITEM: NavItem = {
  href: "/admin",
  labelKey: "nav.admin",
  icon: <span aria-hidden className="text-lg leading-none">🛡️</span>,
};

export default function NavBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const { t } = usePreferences();

  const signedIn = status === "authenticated";
  const items = session?.user?.isAdmin ? [...NAV, ADMIN_ITEM] : NAV;

  // The marketing page has its own header.
  if (pathname === "/" && !signedIn) return null;

  return (
    <>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/80 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 sm:px-6">
          <Link href={signedIn ? "/review" : "/"} className="font-display text-lg font-semibold tracking-tight">
            Flashcard
          </Link>

          {/* Desktop nav */}
          {signedIn && (
            <nav className="hidden items-center gap-1 sm:flex">
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "relative rounded-lg px-3 py-1.5 text-sm transition-colors",
                      active ? "text-ink" : "text-ink-muted hover:text-ink"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-lg bg-surface-raised"
                        transition={{ type: "spring", stiffness: 380, damping: 30 }}
                      />
                    )}
                    <span className="relative flex items-center gap-1.5">
                      {item.icon}
                      {t(item.labelKey)}
                    </span>
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {signedIn ? (
              <>
                {/* Identity + settings in one control: shows who is signed in
                    and doubles as the way into the settings page. */}
                <Link
                  href="/settings"
                  title={t("nav.settings")}
                  className={clsx(
                    "flex items-center gap-2 rounded-lg py-1 pl-1 pr-1 transition-colors sm:pr-2.5",
                    pathname === "/settings"
                      ? "bg-surface-raised text-ink"
                      : "text-ink-muted hover:bg-surface-raised hover:text-ink"
                  )}
                >
                  <UserAvatar
                    name={session?.user?.name}
                    email={session?.user?.email}
                    image={session?.user?.image}
                    size={28}
                  />
                  {/* Hidden on phones, where the bottom nav carries navigation
                      and header space is scarce. */}
                  <span className="hidden max-w-[10rem] truncate text-sm sm:block">
                    {session?.user?.name || session?.user?.email}
                  </span>
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="rounded-lg px-3 py-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
                >
                  {t("nav.signOut")}
                </button>
              </>
            ) : (
              <Link href="/signin" className="rounded-lg px-3 py-1.5 text-sm text-ink-muted hover:text-ink">
                {t("nav.signIn")}
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Mobile bottom nav — thumb-reachable, the primary navigation on phones */}
      {signedIn && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 backdrop-blur-lg sm:hidden">
          <div className="flex">
            {items.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] transition-colors",
                    active ? "text-brand" : "text-ink-faint"
                  )}
                >
                  {item.icon}
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </>
  );
}
