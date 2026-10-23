"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LuSend, LuCheck, LuCheckCheck } from "react-icons/lu";
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
    <div className={isCompact ? "thread thread--compact" : "thread"}>
      {(recipientTitle || subtitle) && (
        <div className="thread__head">
          <div className="thread__titles">
            {recipientTitle && <h3>{recipientTitle}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          <span className="thread__live">
            <span className="thread__live-dot" aria-hidden="true" />
            Live sync active
          </span>
        </div>
      )}

      <div className="thread__messages">
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
              <div key={msg.id} className="thread__item">
                {isNewDay && (
                  <div className="thread__day">
                    <span>{formatMessageDate(msg.sent_at)}</span>
                  </div>
                )}

                <div className={isMine ? "thread__msg thread__msg--mine" : "thread__msg"}>
                  {!isMine && <span className="thread__sender">{msg.sender_name}</span>}

                  <div className={isMine ? "thread__bubble thread__bubble--mine" : "thread__bubble"}>
                    {msg.body}
                  </div>

                  <div className="thread__meta">
                    <span>{formatMessageTime(msg.sent_at)}</span>
                    {isMine && (
                      <span title={msg.read_by_recipient ? "Read by recipient" : "Delivered"}>
                        {msg.read_by_recipient ? (
                          <LuCheckCheck size={12} className="thread__read" aria-label="Read" />
                        ) : (
                          <LuCheck size={12} aria-label="Delivered" />
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

      <div className="thread__composer">
        {sendError && <p className="thread__error" role="alert">{sendError}</p>}
        <div className="thread__compose-row">
          <label className="sr-only" htmlFor={`composer-${conversationId}`}>Message</label>
          <textarea
            id={`composer-${conversationId}`}
            ref={textareaRef}
            rows={2}
            className="textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message… (Ctrl + Enter to send)"
            disabled={isSending}
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
