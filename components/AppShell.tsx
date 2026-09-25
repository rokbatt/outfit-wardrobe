"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { useCutoutBackfill } from "@/lib/useCutoutBackfill";
import { LocalImportBanner } from "./CloudAccount";
import { IconBookmark, IconHanger, IconHome, IconLayers, IconStylist, IconUser } from "./icons";

const SIDE = [
  { href: "/", label: "홈", Icon: IconHome },
  { href: "/wardrobe", label: "옷장", Icon: IconHanger },
  { href: "/outfit", label: "코디하기", Icon: IconLayers },
  { href: "/ai", label: "AI 스타일리스트", Icon: IconStylist },
  { href: "/outfits", label: "내 코디", Icon: IconBookmark },
];
const TABS = [
  { href: "/", label: "홈", Icon: IconHome },
  { href: "/wardrobe", label: "옷장", Icon: IconHanger },
  { href: "/outfit", label: "코디", Icon: IconLayers },
  { href: "/ai", label: "AI", Icon: IconStylist },
  { href: "/profile", label: "프로필", Icon: IconUser },
];

const isActive = (path: string, href: string, exactOutfits = false) =>
  href === "/"
    ? path === "/"
    : href === "/outfit"
      ? path === "/outfit" || (!exactOutfits && path.startsWith("/outfits"))
      : path === href || path.startsWith(href + "/");

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { error, backend } = useStore();
  useCutoutBackfill();
  const hideNav = path.startsWith("/add");

  return (
    <div className="min-h-dvh lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh w-[208px] shrink-0 flex-col border-r border-line px-4 py-6 lg:flex">
        <Link href="/" className="brand px-2 text-[20px]">
          OUTFIT
        </Link>
        <nav className="mt-7 flex flex-col gap-0.5">
          {SIDE.map(({ href, label, Icon }) => {
            const on = isActive(path, href, true);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13.5px] transition ${
                  on ? "bg-card font-bold text-ink" : "text-ink-2 hover:bg-card/60"
                }`}
              >
                <Icon width={18} height={18} strokeWidth={on ? 1.8 : 1.5} />
                {label}
              </Link>
            );
          })}
        </nav>
        <p className="mt-7 px-2.5 text-[11px] font-semibold text-mute">설정</p>
        <Link
          href="/profile"
          className={`mt-1 flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-[13.5px] ${
            path.startsWith("/profile") ? "bg-card font-bold" : "text-ink-2 hover:bg-card/60"
          }`}
        >
          <IconUser width={18} height={18} /> 프로필
        </Link>
        <p className="mt-auto px-2.5 text-[11px] leading-relaxed text-mute">
          {backend === "supabase" ? "Supabase 동기화" : backend === "local" ? "이 기기에 저장 중" : ""}
        </p>
      </aside>

      <main className="min-w-0 flex-1">
        {error && <div className="bg-danger px-4 py-2 text-center text-[12.5px] text-white">저장소 연결 오류: {error}</div>}
        <div className={`mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8 ${hideNav ? "pb-[calc(2.5rem+env(safe-area-inset-bottom))]" : "pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-12"} pt-3 lg:pt-7`}>
          {!hideNav && <LocalImportBanner />}
          {children}
        </div>
      </main>

      {/* Mobile bottom nav */}
      {!hideNav && (
        <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 backdrop-blur-md lg:hidden">
          <ul className="mx-auto grid h-[58px] max-w-md grid-cols-5">
            {TABS.map(({ href, label, Icon }) => {
              const on = isActive(path, href);
              return (
                <li key={href}>
                  <Link href={href} className={`flex h-full flex-col items-center justify-center gap-0.5 ${on ? "text-ink" : "text-mute"}`}>
                    <Icon width={21} height={21} strokeWidth={on ? 1.9 : 1.4} />
                    <span className={`text-[10px] ${on ? "font-bold" : "font-medium"}`}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
