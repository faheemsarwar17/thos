"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LuArrowLeft, LuExternalLink, LuSearch } from "react-icons/lu";
import { MessagingThreadView } from "@/components/messages/messaging-thread-view";
import { PageHeader } from "@/components/ui/page-header";
import { Pill } from "@/components/ui/pill";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { useApi } from "@/lib/use-api";
import type { Conversation } from "@/lib/types";

const COPY = {
  employer: {
    path: "/api/v1/conversations",
    meta: "Conversations with applicants",
    loading: "Loading conversations…",
    emptyTitle: "No active conversations",
    emptyText: "When you reach out to candidates in the Pipeline drawer, your message threads will appear here.",
    emptyHref: "/pipeline",
    emptyCta: "Go to Pipeline",
    search: "Search candidate or job…",
    fallbackName: "Applicant",
    pickText: "Choose a candidate thread from the list to read and send messages.",
  },
  candidate: {
    path: "/api/v1/candidates/me/conversations",
    meta: "Conversations with employers",
    loading: "Loading messages…",
    emptyTitle: "No employer messages yet",
    emptyText: "When a hiring team reaches out regarding your application or interview, the conversation thread will show here.",
    emptyHref: "/candidate/applications",
    emptyCta: "View My Applications",
    search: "Search employer or role…",
    fallbackName: "Employer",
    pickText: "Choose an employer thread from the list to read and send messages.",
  },
} as const;

/** Two panes ≥900px; below that a list → thread flow (selected thread kept in state and ?c=). */
export function MessagesInbox({ persona }: { persona: "employer" | "candidate" }) {
  const copy = COPY[persona];
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("c"));
  // Only an explicit pick (or ?c=) switches a narrow screen to the thread; the desktop auto-pick does not.
  const [threadOpen, setThreadOpen] = useState(() => !!searchParams.get("c"));

  const { data, error, loading, reload } = useApi<{ conversations: Conversation[] }>(copy.path);
  const conversations = data?.conversations ?? [];
  const nameOf = (c: Conversation) => (persona === "employer" ? c.candidate_name : c.organization_name) || copy.fallbackName;

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (persona === "employer"
          ? c.candidate_name && c.candidate_name.toLowerCase().includes(q)
          : c.organization_name && c.organization_name.toLowerCase().includes(q)) ||
        (c.posting_title && c.posting_title.toLowerCase().includes(q)) ||
        (c.subject && c.subject.toLowerCase().includes(q)) ||
        (c.last_message_preview && c.last_message_preview.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery, persona]);

  // Default select first thread if available and none selected
  const activeConversation = useMemo(() => {
    if (!conversations.length) return null;
    if (selectedId) {
      return conversations.find((c) => c.id === selectedId) ?? conversations[0];
    }
    return conversations[0];
  }, [conversations, selectedId]);

  useEffect(() => {
    const c = searchParams.get("c");
    if (c) {
      setSelectedId(c);
      setThreadOpen(true);
    }
  }, [searchParams]);

  function select(id: string) {
    setSelectedId(id);
    setThreadOpen(true);
    router.replace(`${pathname}?c=${encodeURIComponent(id)}`, { scroll: false });
  }

  function backToList() {
    setThreadOpen(false);
    router.replace(pathname, { scroll: false });
  }

  return (
    <div className="dashboard">
      <PageHeader title="Messages" meta={copy.meta} />

      {loading && !data ? (
        <LoadingState label={copy.loading} />
      ) : error && !data ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : conversations.length === 0 ? (
        <div className="panel">
          <EmptyState
            title={copy.emptyTitle}
            description={copy.emptyText}
            action={<Link href={copy.emptyHref} className="button button--primary button--sm">{copy.emptyCta}</Link>}
          />
        </div>
      ) : (
        <div className="msg" data-view={threadOpen ? "thread" : "list"}>
          <div className="msg__list">
            <div className="msg__search">
              <label className="input-icon">
                <span className="sr-only">Search conversations</span>
                <input
                  type="text"
                  className="input"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={copy.search}
                />
                <LuSearch size={15} aria-hidden="true" />
              </label>
            </div>
            <div className="msg__threads">
              {filtered.length === 0 ? (
                <p className="msg__none">No matching conversations found.</p>
              ) : (
                filtered.map((conv) => {
                  const isSelected = activeConversation?.id === conv.id;
                  const unread = conv.unread_count ?? 0;
                  return (
                    <button
                      key={conv.id}
                      type="button"
                      className={isSelected ? "msg__item is-active" : "msg__item"}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => select(conv.id)}
                    >
                      <b className={unread > 0 ? "is-unread" : undefined}>{nameOf(conv)}</b>
                      <span className="msg__date">
                        {new Date(conv.last_message_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      {conv.posting_title && <span className="msg__posting">{conv.posting_title}</span>}
                      <small className={unread > 0 ? "is-unread" : undefined}>{conv.last_message_preview || "No messages yet."}</small>
                      {unread > 0 && <Pill tone="brand">{unread} new</Pill>}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="msg__thread">
            {activeConversation ? (
              <>
                <div className="msg__thread-head">
                  <button type="button" className="icon-button msg__back" aria-label="Back to conversations" onClick={backToList}>
                    <LuArrowLeft size={16} aria-hidden="true" />
                  </button>
                  <span className="msg__with">
                    Conversation with <strong>{nameOf(activeConversation)}</strong>
                  </span>
                  {activeConversation.posting_title && <Pill tone="neutral">{activeConversation.posting_title}</Pill>}
                  {persona === "employer" && activeConversation.application_id && (
                    <Link
                      href={`/pipeline?applicationId=${activeConversation.application_id}`}
                      className="button button--secondary button--sm msg__view"
                    >
                      <LuExternalLink size={13} aria-hidden="true" />
                      <span>View Application</span>
                    </Link>
                  )}
                </div>
                <MessagingThreadView
                  conversationId={activeConversation.id}
                  recipientTitle={nameOf(activeConversation)}
                  subtitle={activeConversation.posting_title || activeConversation.subject}
                  onMessageSent={() => reload()}
                />
              </>
            ) : (
              <EmptyState title="No conversation selected" description={copy.pickText} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
