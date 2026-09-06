"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { LuSearch, LuBriefcase, LuBuilding2, LuMessageSquare } from "react-icons/lu";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { MessagingThreadView } from "@/components/messages/messaging-thread-view";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Pill } from "@/components/ui/pill";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { useApi } from "@/lib/use-api";
import type { Conversation } from "@/lib/types";

export default function CandidateMessagesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, error, loading, reload } = useApi<{ conversations: Conversation[] }>(
    "/api/v1/candidates/me/conversations"
  );

  const conversations = data?.conversations ?? [];

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;
    return conversations.filter(
      (c) =>
        (c.organization_name && c.organization_name.toLowerCase().includes(q)) ||
        (c.posting_title && c.posting_title.toLowerCase().includes(q)) ||
        (c.subject && c.subject.toLowerCase().includes(q)) ||
        (c.last_message_preview && c.last_message_preview.toLowerCase().includes(q))
    );
  }, [conversations, searchQuery]);

  const activeConversation = useMemo(() => {
    if (!conversations.length) return null;
    if (selectedId) {
      return conversations.find((c) => c.id === selectedId) ?? conversations[0];
    }
    return conversations[0];
  }, [conversations, selectedId]);

  return (
    <CandidateShell>
      <main className="content" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 80px)", padding: "20px" }}>
        <Breadcrumbs
          items={[
            { label: "Overview", href: "/candidate" },
            { label: "Messages" },
          ]}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", marginTop: "10px" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: "22px", fontWeight: 700 }}>Hiring Team Messages</h1>
            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "var(--ink-500)" }}>
              Direct communications with employers and hiring managers reviewing your applications
            </p>
          </div>
        </div>

        {loading && !data ? (
          <LoadingState label="Loading messages…" />
        ) : error && !data ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : conversations.length === 0 ? (
          <div className="panel" style={{ padding: "40px", textAlign: "center" }}>
            <EmptyState
              title="No employer messages yet"
              description="When a hiring team reaches out regarding your application or interview, the conversation thread will show here."
            />
            <div style={{ marginTop: "16px" }}>
              <Link href="/candidate/applications" className="button button--primary button--sm">
                View My Applications
              </Link>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "340px 1fr",
              gap: "16px",
              flex: 1,
              minHeight: 0,
            }}
          >
            {/* Conversations List Pane */}
            <div
              className="panel"
              style={{
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                height: "100%",
                background: "var(--surface)",
                borderRadius: "12px",
                border: "1px solid var(--border)",
              }}
            >
              {/* Search bar */}
              <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ position: "relative" }}>
                  <LuSearch
                    size={15}
                    style={{
                      position: "absolute",
                      left: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--ink-400)",
                    }}
                  />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search employer or role…"
                    style={{
                      width: "100%",
                      padding: "8px 10px 8px 32px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      background: "var(--surface-sunken)",
                      color: "var(--ink-800)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                </div>
              </div>

              {/* Thread List */}
              <div style={{ flex: 1, overflowY: "auto" }}>
                {filtered.length === 0 ? (
                  <div style={{ padding: "24px", textAlign: "center", color: "var(--ink-400)", fontSize: "13px" }}>
                    No matching conversations found.
                  </div>
                ) : (
                  filtered.map((conv) => {
                    const isSelected = activeConversation?.id === conv.id;
                    const unread = conv.unread_count ?? 0;

                    return (
                      <button
                        key={conv.id}
                        type="button"
                        onClick={() => setSelectedId(conv.id)}
                        style={{
                          width: "100%",
                          textAlign: "left",
                          padding: "14px 16px",
                          borderBottom: "1px solid var(--border)",
                          background: isSelected ? "var(--surface-raised, rgba(99, 102, 241, 0.08))" : "transparent",
                          borderLeft: isSelected ? "3px solid var(--brand-600, #4f46e5)" : "3px solid transparent",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                          display: "block",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px" }}>
                          <span style={{ fontWeight: isSelected || unread > 0 ? 700 : 500, fontSize: "14px", color: "var(--ink-900)" }}>
                            {conv.organization_name || "Employer"}
                          </span>
                          <span style={{ fontSize: "11px", color: "var(--ink-400)" }}>
                            {new Date(conv.last_message_at).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        </div>

                        {conv.posting_title && (
                          <div style={{ fontSize: "12px", color: "var(--brand-700, #4338ca)", marginBottom: "4px", fontWeight: 500 }}>
                            {conv.posting_title}
                          </div>
                        )}

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <p
                            style={{
                              margin: 0,
                              fontSize: "12px",
                              color: unread > 0 ? "var(--ink-800)" : "var(--ink-500)",
                              fontWeight: unread > 0 ? 600 : 400,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              maxWidth: "220px",
                            }}
                          >
                            {conv.last_message_preview || "No messages yet."}
                          </p>
                          {unread > 0 && <Pill tone="brand">{unread} new</Pill>}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Chat Thread Pane */}
            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              {activeConversation ? (
                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: "10px",
                    }}
                  >
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      <span style={{ fontSize: "13px", color: "var(--ink-500)" }}>
                        Conversation with <strong>{activeConversation.organization_name}</strong>
                      </span>
                      {activeConversation.posting_title && (
                        <Pill tone="neutral">{activeConversation.posting_title}</Pill>
                      )}
                    </div>
                  </div>

                  <div style={{ flex: 1, minHeight: 0 }}>
                    <MessagingThreadView
                      conversationId={activeConversation.id}
                      recipientTitle={activeConversation.organization_name}
                      subtitle={activeConversation.posting_title || activeConversation.subject}
                      onMessageSent={() => reload()}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="panel"
                  style={{
                    height: "100%",
                    display: "grid",
                    placeItems: "center",
                    padding: "40px",
                    textAlign: "center",
                  }}
                >
                  <EmptyState
                    title="No conversation selected"
                    description="Choose an employer thread from the left to read and send messages."
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </CandidateShell>
  );
}
