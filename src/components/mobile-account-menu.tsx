"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LogOut, Settings, UserRound } from "lucide-react";

export function MobileAccountMenu({ email, signOutAction }: { email: string; signOutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div className="mobile-account-menu" ref={rootRef}>
    <button
      type="button"
      className="mobile-account-trigger"
      aria-label="Open account menu"
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
    >
      <UserRound size={20}/>
    </button>
    {open && <div className="mobile-account-popover" role="menu">
      <div className="mobile-account-email">{email}</div>
      <Link href="/settings" role="menuitem" onClick={() => setOpen(false)}><Settings size={17}/> Settings</Link>
      <form action={signOutAction}>
        <button type="submit" role="menuitem"><LogOut size={17}/> Sign out</button>
      </form>
    </div>}
  </div>;
}
