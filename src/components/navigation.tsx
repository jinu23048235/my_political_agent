"use client";
import Link from "next/link";
import { Icon } from "./icon";
import { usePathname } from "next/navigation";
const items = [{ href: "/", label: "지역", icon: "feed" as const }, { href: "/write", label: "글 쓰기", icon: "write" as const }, { href: "/representatives", label: "대표자", icon: "people" as const }, { href: "/settings", label: "설정", icon: "settings" as const }];
export function Navigation({ mobile = false }: { mobile?: boolean }) {
  const path = usePathname();
  return <nav className={mobile ? "mobile-nav" : "nav"} aria-label={mobile ? "하단 메뉴" : "주 메뉴"}>{items.map(item => {
    const active = item.href === "/" ? path === "/" || path.startsWith("/posts/") : path.startsWith(item.href);
    return <Link key={item.href} href={item.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}><Icon name={item.icon}/>{item.label}</Link>;
  })}</nav>;
}
