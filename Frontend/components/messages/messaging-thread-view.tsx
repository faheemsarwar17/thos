"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuSend, LuCheck, LuCheckCheck, LuClock } from "react-icons/lu";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { ConversationMessage } from "@/lib/types";

type MessagingThreadViewProps = {
  conversationId: string;
  recipientTitle?: string;
  subtitle?: string;
  isCompact?: boolean;
  onMessageSent?: () => void;
};

export function MessagingThreadView({
  conversationId,
  recipientTitle,
  subtitle,
  isCompact = false,
  onMessageSent,
}: MessagingThreadViewProps) {
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data, error, loading, reload } = useApi<{ messages: ConversationMessage[] }>(
    `/api/v1/conversations/${conversationId}/messages`
  );

  const messages = data?.messages ?? [];

  // Smooth scroll to bottom when messages change
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (scrollAnchorRef.current) {
      scrollAnchorRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }, []);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom("auto");
    }
  }, [conversationId, messages.length, scrollToBottom]);

  // Periodic polling every 3 seconds for active conversation
  useEffect(() => {
    if (!conversationId) return;
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") {
        reload();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [conversationId, reload]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || isSending) return;

    setIsSending(true);
    setSendError(null);

    try {
      await api.post(`/api/v1/conversations/${conversationId}/messages`, { body: text });
      setDraft("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      await reload();
      scrollToBottom("smooth");
      onMessageSent?.();
    } catch (err: unknown) {
      const msg = err instanceof ApiError ? err.message : "Failed to send message.";
      setSendError(msg);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  }

  function formatMessageTime(dateString: string) {
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  function formatMessageDate(dateString: string) {
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: isCompact ? "460px" : "100%",
        minHeight: isCompact ? "400px" : "550px",
        background: "var(--surface)",
        borderRadius: isCompact ? "10px" : "12px",
        border: "1px solid var(--border)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      {(recipientTitle || subtitle) && (
        <div
          style={{
            padding: isCompact ? "10px 14px" : "14px 20px",
            borderBottom: "1px solid var(--border)",
            background: "var(--surface-sunken)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            {recipientTitle && (
              <h3 style={{ margin: 0, fontSize: isCompact ? "14px" : "16px", fontWeight: 600 }}>
                {recipientTitle}
              </h3>
            )}
            {subtitle && (
              <p style={{ margin: "2px 0 0", fontSize: "12px", color: "var(--ink-500)" }}>
                {subtitle}
              </p>
            )}
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              fontSize: "11px",
              color: "var(--ink-400)",
            }}
          >
            <span
              style={{
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: "#10b981",
              }}
            />
            Live sync active
          </span>
        </div>
      )}

      {/* Message Stream */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: isCompact ? "12px" : "20px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        }}
      >
        {loading && messages.length === 0 ? (
          <LoadingState label="Loading messages…" />
        ) : error && messages.length === 0 ? (
          <ErrorState message={error.message} onRetry={reload} />
        ) : messages.length === 0 ? (
          <EmptyState
            title="No messages yet"
            description="Start the conversation by sending a direct note below."
          />
        ) : (
          messages.map((msg, idx) => {
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const isNewDay =
              !prevMsg ||
              formatMessageDate(prevMsg.sent_at) !== formatMessageDate(msg.sent_at);

            // Determine if message is from employer or candidate
            const isMine =
              msg.sender_role === "employer" ||
              (typeof window !== "undefined" &&
                window.location.pathname.startsWith("/candidate") &&
                msg.sender_role === "candidate");

            return (
              <div key={msg.id} style={{ display: "flex", flexDirection: "column" }}>
                {isNewDay && (
                  <div
                    style={{
                      textAlign: "center",
                      margin: "10px 0",
                      position: "relative",
                    }}
                  >
                    <span
                      style={{
                        padding: "2px 10px",
                        fontSize: "11px",
                        borderRadius: "12px",
                        background: "var(--surface-sunken)",
                        color: "var(--ink-400)",
                        fontWeight: 500,
                      }}
                    >
                      {formatMessageDate(msg.sent_at)}
                    </span>
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isMine ? "flex-end" : "flex-start",
                    maxWidth: "80%",
                    alignSelf: isMine ? "flex-end" : "flex-start",
                  }}
                >
                  {!isMine && (
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "var(--ink-600)",
                        marginBottom: "3px",
                        marginLeft: "4px",
                      }}
                    >
                      {msg.sender_name}
                    </span>
                  )}

                  <div
                    style={{
                      padding: "10px 14px",
                      borderRadius: isMine ? "14px 14px 2px 14px" : "14px 14px 14px 2px",
                      background: isMine ? "var(--brand-600, #4f46e5)" : "var(--surface-sunken)",
                      color: isMine ? "#ffffff" : "var(--ink-800)",
                      boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                      fontSize: "13px",
                      lineHeight: "1.45",
                      wordBreak: "break-word",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {msg.body}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginTop: "3px",
                      padding: "0 4px",
                      fontSize: "10px",
                      color: "var(--ink-400)",
                    }}
                  >
                    <span>{formatMessageTime(msg.sent_at)}</span>
                    {isMine && (
                      <span title={msg.read_by_recipient ? "Read by recipient" : "Delivered"}>
                        {msg.read_by_recipient ? (
                          <LuCheckCheck size={12} color="#10b981" />
                        ) : (
                          <LuCheck size={12} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={scrollAnchorRef} />
      </div>

      {/* Footer input area */}
      <div
        style={{
          padding: isCompact ? "10px 12px" : "12px 16px",
          borderTop: "1px solid var(--border)",
          background: "var(--surface)",
        }}
      >
        {sendError && (
          <div
            style={{
              padding: "6px 10px",
              marginBottom: "8px",
              background: "#fee2e2",
              color: "#991b1b",
              borderRadius: "6px",
              fontSize: "12px",
            }}
          >
            {sendError}
          </div>
        )}
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            rows={isCompact ? 2 : 2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message… (Ctrl + Enter to send)"
            disabled={isSending}
            style={{
              flex: 1,
              padding: "8px 12px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--ink-800)",
              fontSize: "13px",
              resize: "none",
              outline: "none",
              fontFamily: "inherit",
              lineHeight: 1.4,
              maxHeight: "120px",
            }}
          />
          <Button
            variant="primary"
            size={isCompact ? "sm" : "default"}
            disabled={!draft.trim() || isSending}
            loading={isSending}
            onClick={handleSend}
            iconLeft={<LuSend size={14} />}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
