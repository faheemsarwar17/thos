"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LuBell } from "react-icons/lu";
import { api } from "@/lib/api";
import type { Notification } from "@/lib/types";
import { Popover } from "@/components/ui/popover";
import { relTime } from "@/lib/rel-time";

export function NotificationsPanel({ persona }: { persona: "employer" | "candidate" }) {
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => {
    api.get<{ notifications: Notification[]; unread_count: number }>("/api/v1/notifications")
      .then((b) => { setItems(b.notifications); setUnread(b.unread_count); })
      .catch(() => { setItems([]); setUnread(0); });
  }, []);
  useEffect(load, [load]);
  const markAll = async () => { await api.post("/api/v1/notifications/mark-read").catch(() => undefined); load(); };

  return (
    <Popover label="Notifications" className="notes"
      trigger={({ open, toggle, ref }) => (
        <button ref={ref} type="button" className="icon-button" aria-expanded={open} onClick={() => { if (!open) load(); toggle(); }}
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"} title="Notifications">
          <LuBell size={16} aria-hidden="true" />
          {unread > 0 && <span className="badge-dot tabular-nums" aria-hidden="true">{unread}</span>}
        </button>
      )}>
      {(close) => (
        <>
          <header className="notes__head"><b>Notifications</b><button type="button" className="link" onClick={markAll}>Mark all read</button></header>
          <div className="notes__list">
            {items.length === 0 && <p className="notes__empty">You&apos;re all caught up.</p>}
            {items.map((n) => (
              <button key={n.id} type="button" className={`notes__item ${n.read ? "" : "is-unread"}`}
                onClick={() => { close(); if (n.link) router.push(n.link); }}>
                <span className="notes__dot" aria-hidden="true" />
                <span className="notes__text"><b>{n.title}</b><small>{n.body}</small></span>
                <time className="notes__time" dateTime={n.created_at}>{relTime(n.created_at)}</time>
              </button>
            ))}
          </div>
          <footer className="notes__foot">
            {persona === "employer"
              ? <Link className="link" href="/admin#audit" onClick={close}>Open audit log</Link>
              : <Link className="link" href="/candidate/applications" onClick={close}>View applications</Link>}
          </footer>
        </>
      )}
    </Popover>
  );
}
