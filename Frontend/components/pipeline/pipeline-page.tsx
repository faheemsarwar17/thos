"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LuLayoutGrid,
  LuColumns3,
  LuList,
  LuFilter,
  LuEye,
  LuEyeOff,
  LuHistory,
  LuX,
  LuDownload,
  LuUserX,
  LuSparkles,
  LuUserCheck,
  LuSend,
} from "react-icons/lu";
import { ApplicationDrawer } from "@/components/pipeline/application-drawer";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Table, TableContainer, TableEmpty } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { useApi } from "@/lib/use-api";
import type { PipelineCard, PipelineColumn, Posting } from "@/lib/types";

type TransitionTarget = {
  card: PipelineCard;
  destination: { id: string; label: string; requires_reason: boolean };
};

function getStagePillTone(stageId: string, category?: string): PillTone {
  const s = stageId.toLowerCase();
  const c = category?.toLowerCase();
  if (s === "received") return "brand";
  if (s === "screened") return "neutral";
  if (s === "shortlisted") return "brand";
  if (s === "applied_interview") return "verified";
  if (s === "offer") return "approval";
  if (s === "hired" || c === "hired") return "verified";
  if (s === "rejected" || c === "rejected") return "danger";
  if (s === "withdrawn" || c === "withdrawn") return "neutral";
  return "neutral";
}

type MacroPhaseGroup = {
  id: "received" | "shortlisted" | "interview" | "results";
  label: string;
  subtitle: string;
  subStages: { id: string; label: string; count: number; cards: PipelineCard[] }[];
  cards: PipelineCard[];
  stageIds: string[];
};

function TransitionDialog({
  target,
  onCancel,
  onConfirm,
  busy,
  error,
}: {
  target: TransitionTarget;
  onCancel: () => void;
  onConfirm: (reason: string, note: string) => void;
  busy: boolean;
  error: string | null;
}) {
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");

  return (
    <Modal
      open={true}
      onClose={onCancel}
      title={`Move ${target.card.candidate_name}`}
      description={`Destination stage: ${target.destination.label}. This action is recorded in the immutable audit log.`}
    >
      <div style={{ display: "grid", gap: "14px", marginTop: "8px" }}>
        <label className="form-field">
          <span className="form-field__label">
            Reason Code {target.destination.requires_reason ? "(required)" : "(optional)"}
          </span>
          <input
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. meets_requirements, advanced_to_interview"
            autoFocus
          />
        </label>

        <label className="form-field">
          <span className="form-field__label">Reviewer Context Note (optional)</span>
          <textarea
            className="textarea"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            rows={3}
            placeholder="Add relevant notes for the hiring team…"
          />
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(reason, note)} loading={busy}>
            Confirm &amp; Advance
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MoveMenu({
  card,
  onMove,
}: {
  card: PipelineCard;
  onMove: (card: PipelineCard, destinationId: string) => void;
  busy?: boolean;
}) {
  if (card.valid_destinations.length === 0) {
    return <span style={{ color: "var(--ink-400)", fontSize: "11px" }}>Final Stage</span>;
  }
  return (
    <label className="move-menu" style={{ display: "inline-flex", width: "100%" }}>
      <span className="sr-only">Move {card.candidate_name} to stage</span>
      <select
        className="select"
        style={{ height: "32px", fontSize: "11px", padding: "4px 28px 4px 10px" }}
        value=""
        onChange={(event) => {
          if (event.target.value) onMove(card, event.target.value);
        }}
      >
        <option value="">Move stage…</option>
        {card.valid_destinations.map((destination) => (
          <option key={destination.id} value={destination.id}>
            → {destination.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PipelinePage() {
  const searchParams = useSearchParams();
  const postingFilter = searchParams.get("posting");
  const pipelinePath = postingFilter
    ? `/api/v1/pipeline?posting_id=${encodeURIComponent(postingFilter)}`
    : "/api/v1/pipeline";
  const { data, error, loading, reload } = useApi<{ columns: PipelineColumn[] }>(pipelinePath);
  const postings = useApi<{ postings: Posting[] }>("/api/v1/postings");

  const [view, setView] = useState<"board" | "expanded" | "list">("board");
  const [subFilters, setSubFilters] = useState<Record<string, string>>({
    received: "all",
    interview: "all",
    results: "all",
  });
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [target, setTarget] = useState<TransitionTarget | null>(null);
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);
  const [openApplication, setOpenApplication] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<PipelineCard | null>(null);

  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTargetStage, setBulkTargetStage] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRejectModalOpen, setBulkRejectModalOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState("");
  const [bulkRejectNote, setBulkRejectNote] = useState("");

  // Blind review mode toggle
  const [blindMode, setBlindMode] = useState(false);

  // Reversible 10-second undo toast
  const [undoToast, setUndoToast] = useState<{
    applicationId: string;
    candidateName: string;
    stageLabel: string;
  } | null>(null);
  const [undoSecondsLeft, setUndoSecondsLeft] = useState(10);

  useEffect(() => {
    if (!undoToast) return;
    const timer = setInterval(() => {
      setUndoSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setUndoToast(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [undoToast]);

  async function triggerUndo() {
    if (!undoToast) return;
    const toastData = undoToast;
    setUndoToast(null);
    try {
      await api.post(`/api/v1/pipeline/applications/${toastData.applicationId}/undo-transition`, {});
      setAnnouncement(`Reverted move for ${toastData.candidateName}.`);
      await reload();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to undo transition.";
      setAnnouncement(msg);
    }
  }

  function triggerMoveSuccess(card: PipelineCard, destLabel: string) {
    setUndoToast({
      applicationId: card.id,
      candidateName: card.candidate_name,
      stageLabel: destLabel,
    });
    setUndoSecondsLeft(10);
  }

  const startMove = useCallback((card: PipelineCard, destinationId: string) => {
    const destination = card.valid_destinations.find((d) => d.id === destinationId);
    if (!destination) return;
    setTransitionError(null);
    setTarget({ card, destination });
  }, []);

  async function confirmMove(reason: string, note: string) {
    if (!target) return;
    if (target.destination.requires_reason && !reason.trim()) {
      setTransitionError("A reason is required for this move.");
      return;
    }
    setTransitionBusy(true);
    setTransitionError(null);
    try {
      await api.post(`/api/v1/applications/${target.card.id}/transitions`, {
        to_stage_id: target.destination.id,
        from_stage_version: target.card.stage_version,
        reason_code: reason.trim(),
        note: note.trim(),
        idempotency_key: idempotencyKey(),
      });
      triggerMoveSuccess(target.card, target.destination.label);
      setAnnouncement(
        `${target.card.candidate_name} moved to ${target.destination.label}.`
      );
      setTarget(null);
      await reload();
    } catch (cause) {
      setTransitionError(
        cause instanceof ApiError ? cause.message : "The move failed. Try again."
      );
      if (cause instanceof ApiError && cause.code === "application_stage_conflict") {
        await reload();
      }
    } finally {
      setTransitionBusy(false);
    }
  }

  function toggleSelectCard(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(cards: PipelineCard[]) {
    setSelectedIds((prev) => {
      const allSelected = cards.length > 0 && cards.every((c) => prev.has(c.id));
      if (allSelected) {
        const next = new Set(prev);
        cards.forEach((c) => next.delete(c.id));
        return next;
      } else {
        const next = new Set(prev);
        cards.forEach((c) => next.add(c.id));
        return next;
      }
    });
  }

  const columns = data?.columns ?? [];
  const allCards = columns.flatMap((column) => column.cards);

  const availableStages = useMemo(() => {
    const map = new Map<string, string>();
    columns.forEach((col) => {
      map.set(col.stage_id, col.label);
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [columns]);

  async function handleBulkMove() {
    if (!bulkTargetStage || selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const dest = availableStages.find((s) => s.id === bulkTargetStage);
      await api.post("/api/v1/pipeline/bulk-transition", {
        application_ids: Array.from(selectedIds),
        to_stage_id: bulkTargetStage,
        reason_code: "bulk_move",
        note: "Moved via bulk pipeline action",
      });
      setAnnouncement(`Successfully moved ${selectedIds.size} candidates to ${dest?.label || bulkTargetStage}.`);
      setSelectedIds(new Set());
      setBulkTargetStage("");
      await reload();
    } catch (err: unknown) {
      setAnnouncement(err instanceof Error ? err.message : "Bulk move failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await api.post("/api/v1/pipeline/bulk-transition", {
        application_ids: Array.from(selectedIds),
        to_stage_id: "rejected",
        reason_code: bulkRejectReason.trim() || "does_not_meet_requirements",
        note: bulkRejectNote.trim() || "Rejected via bulk action",
      });
      setAnnouncement(`Rejected ${selectedIds.size} candidates.`);
      setSelectedIds(new Set());
      setBulkRejectModalOpen(false);
      setBulkRejectReason("");
      setBulkRejectNote("");
      await reload();
    } catch (err: unknown) {
      setAnnouncement(err instanceof Error ? err.message : "Bulk rejection failed.");
    } finally {
      setBulkBusy(false);
    }
  }

  // Automation states: Screening, Auto-Shortlist, and Interview Inviting
  const [screeningBusy, setScreeningBusy] = useState(false);

  const [shortlistModalOpen, setShortlistModalOpen] = useState(false);
  const [shortlistSelectedMode, setShortlistSelectedMode] = useState(false);
  const [shortlistTopN, setShortlistTopN] = useState(5);
  const [shortlistRejectRemaining, setShortlistRejectRemaining] = useState(true);
  const [shortlistSendFeedback, setShortlistSendFeedback] = useState(true);
  const [shortlistBusy, setShortlistBusy] = useState(false);

  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteSelectedMode, setInviteSelectedMode] = useState(false);
  const [inviteTopN, setInviteTopN] = useState(5);
  const [inviteRejectRemaining, setInviteRejectRemaining] = useState(true);
  const [inviteSendFeedback, setInviteSendFeedback] = useState(true);
  const [inviteBusy, setInviteBusy] = useState(false);

  // Filtered card groupings for stage automation
  const receivedCards = useMemo(() => allCards.filter((c) => c.stage_id === "received"), [allCards]);
  const screenedCards = useMemo(() => allCards.filter((c) => c.stage_id === "screened"), [allCards]);
  const shortlistedCards = useMemo(() => allCards.filter((c) => c.stage_id === "shortlisted"), [allCards]);

  const selectedReceived = useMemo(
    () => Array.from(selectedIds).filter((id) => receivedCards.some((c) => c.id === id)),
    [selectedIds, receivedCards]
  );
  const selectedScreened = useMemo(
    () => Array.from(selectedIds).filter((id) => screenedCards.some((c) => c.id === id)),
    [selectedIds, screenedCards]
  );
  const selectedShortlisted = useMemo(
    () => Array.from(selectedIds).filter((id) => shortlistedCards.some((c) => c.id === id)),
    [selectedIds, shortlistedCards]
  );

  const sortedScreened = useMemo(() => {
    return [...screenedCards].sort(
      (a, b) =>
        (b.job_match_score || 0) - (a.job_match_score || 0) ||
        (b.profile_interview_score || 0) - (a.profile_interview_score || 0)
    );
  }, [screenedCards]);

  const sortedShortlisted = useMemo(() => {
    return [...shortlistedCards].sort(
      (a, b) =>
        (b.job_match_score || 0) - (a.job_match_score || 0) ||
        (b.profile_interview_score || 0) - (a.profile_interview_score || 0)
    );
  }, [shortlistedCards]);

  const unshortlistedCount = shortlistSelectedMode
    ? Math.max(0, screenedCards.length - selectedScreened.length)
    : Math.max(0, screenedCards.length - Math.min(shortlistTopN, screenedCards.length));

  const uninvitedCount = inviteSelectedMode
    ? Math.max(0, shortlistedCards.length - selectedShortlisted.length)
    : Math.max(0, shortlistedCards.length - Math.min(inviteTopN, shortlistedCards.length));

  async function handleScreenReceived(targetIds?: string[]) {
    setScreeningBusy(true);
    try {
      const res = await api.post<{ screened_count: number; screened_ids: string[] }>(
        "/api/v1/pipeline/screen-received",
        {
          posting_id: postingFilter || undefined,
          application_ids: targetIds && targetIds.length > 0 ? targetIds : undefined,
        }
      );
      setAnnouncement(`Successfully screened ${res.screened_count} candidate(s). Match scores computed.`);
      if (targetIds && targetIds.length > 0) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          targetIds.forEach((id) => next.delete(id));
          return next;
        });
      }
      await reload();
    } catch (err: unknown) {
      setAnnouncement(err instanceof Error ? err.message : "Screening failed.");
    } finally {
      setScreeningBusy(false);
    }
  }

  function openShortlistModal(selectedOnly: boolean) {
    setShortlistSelectedMode(selectedOnly);
    setShortlistTopN(Math.min(5, Math.max(1, screenedCards.length)));
    setShortlistRejectRemaining(true);
    setShortlistSendFeedback(true);
    setShortlistModalOpen(true);
  }

  async function handleConfirmShortlist() {
    setShortlistBusy(true);
    try {
      const res = await api.post<{
        shortlisted_count: number;
        rejected_count: number;
      }>("/api/v1/pipeline/shortlist", {
        posting_id: postingFilter || undefined,
        application_ids: shortlistSelectedMode ? selectedScreened : undefined,
        top_n: !shortlistSelectedMode ? shortlistTopN : undefined,
        reject_remaining: shortlistRejectRemaining,
        send_ai_feedback: shortlistSendFeedback,
      });
      setAnnouncement(
        `Shortlisted ${res.shortlisted_count} candidate(s)${
          res.rejected_count > 0 ? ` and rejected ${res.rejected_count} candidate(s) with AI feedback` : ""
        }.`
      );
      setShortlistModalOpen(false);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectedScreened.forEach((id) => next.delete(id));
        return next;
      });
      await reload();
    } catch (err: unknown) {
      setAnnouncement(err instanceof Error ? err.message : "Shortlisting failed.");
    } finally {
      setShortlistBusy(false);
    }
  }

  function openInviteModal(selectedOnly: boolean) {
    setInviteSelectedMode(selectedOnly);
    setInviteTopN(Math.min(5, Math.max(1, shortlistedCards.length)));
    setInviteRejectRemaining(true);
    setInviteSendFeedback(true);
    setInviteModalOpen(true);
  }

  async function handleConfirmInviteInterviews() {
    setInviteBusy(true);
    try {
      const res = await api.post<{
        invited_count: number;
        rejected_count: number;
      }>("/api/v1/pipeline/invite-interviews", {
        posting_id: postingFilter || undefined,
        application_ids: inviteSelectedMode ? selectedShortlisted : undefined,
        top_n: !inviteSelectedMode ? inviteTopN : undefined,
        reject_remaining: inviteRejectRemaining,
        send_ai_feedback: inviteSendFeedback,
      });
      setAnnouncement(
        `Invited ${res.invited_count} candidate(s) to interview${
          res.rejected_count > 0 ? ` and rejected ${res.rejected_count} candidate(s) with AI feedback` : ""
        }.`
      );
      setInviteModalOpen(false);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        selectedShortlisted.forEach((id) => next.delete(id));
        return next;
      });
      await reload();
    } catch (err: unknown) {
      setAnnouncement(err instanceof Error ? err.message : "Interview invitation failed.");
    } finally {
      setInviteBusy(false);
    }
  }

  function handleBulkExport() {
    const selectedCards = allCards.filter((c) => selectedIds.has(c.id));
    if (selectedCards.length === 0) return;
    const headers = [
      "Candidate Name",
      "Job Title",
      "Stage",
      "Category",
      "Match Score",
      "Profile Score",
      "Interview Status",
      "Applied Date",
    ];
    const rows = selectedCards.map((c) => [
      `"${c.candidate_name.replace(/"/g, '""')}"`,
      `"${c.job_title.replace(/"/g, '""')}"`,
      `"${c.stage_label}"`,
      `"${c.stage_category}"`,
      c.job_match_score != null ? Math.round(c.job_match_score) : "",
      c.profile_interview_score != null ? Math.round(c.profile_interview_score) : "",
      `"${c.applied_interview_status || ""}"`,
      `"${new Date(c.applied_at).toLocaleDateString()}"`,
    ]);
    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline_candidates_export_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Group columns into 4 macro phases that fit cleanly on a single screen
  const macroGroups: MacroPhaseGroup[] = useMemo(() => {
    if (!columns || columns.length === 0) return [];

    const phaseMap: Record<string, MacroPhaseGroup> = {
      received: {
        id: "received",
        label: "Received",
        subtitle: "Pending & Screened",
        subStages: [],
        cards: [],
        stageIds: ["received", "screened"],
      },
      shortlisted: {
        id: "shortlisted",
        label: "Shortlisted",
        subtitle: "Qualified for Review",
        subStages: [],
        cards: [],
        stageIds: ["shortlisted"],
      },
      interview: {
        id: "interview",
        label: "Applied Interview",
        subtitle: "AI Interview & Offer",
        subStages: [],
        cards: [],
        stageIds: ["applied_interview", "offer"],
      },
      results: {
        id: "results",
        label: "Results",
        subtitle: "Hired, Rejected & Withdrawn",
        subStages: [],
        cards: [],
        stageIds: ["hired", "rejected", "withdrawn"],
      },
    };

    columns.forEach((col) => {
      let targetKey: "received" | "shortlisted" | "interview" | "results" = "results";
      const id = col.stage_id.toLowerCase();
      const cat = col.category.toLowerCase();
      const lbl = col.label.toLowerCase();

      if (id === "received" || id === "screened" || cat === "new") {
        targetKey = "received";
      } else if (id === "shortlisted" || lbl.includes("shortlist")) {
        targetKey = "shortlisted";
      } else if (
        id === "applied_interview" ||
        id === "offer" ||
        cat === "assessment" ||
        cat === "offer" ||
        lbl.includes("interview")
      ) {
        targetKey = "interview";
      } else if (
        ["hired", "rejected", "withdrawn"].includes(id) ||
        ["hired", "rejected", "withdrawn"].includes(cat)
      ) {
        targetKey = "results";
      } else if (cat === "review") {
        targetKey = "received";
      }

      const phase = phaseMap[targetKey];
      if (phase) {
        if (!phase.stageIds.includes(col.stage_id)) {
          phase.stageIds.push(col.stage_id);
        }
        phase.subStages.push({
          id: col.stage_id,
          label: col.label,
          count: col.cards.length,
          cards: col.cards,
        });
        phase.cards.push(...col.cards);
      }
    });

    return [phaseMap.received, phaseMap.shortlisted, phaseMap.interview, phaseMap.results];
  }, [columns]);

  function renderCard(card: PipelineCard) {
    const displayName = blindMode ? `Candidate #${card.id.slice(-4)}` : card.candidate_name;
    const avatarText = blindMode ? "#" : card.candidate_name.slice(0, 2).toUpperCase();
    const isSelected = selectedIds.has(card.id);

    return (
      <article
        key={card.id}
        className={`kanban-card${dragging?.id === card.id ? " is-dragging" : ""}${isSelected ? " is-selected" : ""}`}
        style={isSelected ? { outline: "2px solid var(--brand-500)", background: "var(--surface-raised)" } : undefined}
        draggable={card.valid_destinations.length > 0}
        onDragStart={() => setDragging(card)}
        onDragEnd={() => setDragging(null)}
        aria-label={`${displayName}, ${card.stage_label}`}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", minWidth: 0 }}>
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => {
                e.stopPropagation();
                toggleSelectCard(card.id);
              }}
              aria-label={`Select ${displayName}`}
              style={{ accentColor: "var(--brand-600)", width: "15px", height: "15px", cursor: "pointer", flexShrink: 0 }}
            />
            <button
              type="button"
              className="kanban-card__name"
              style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              onClick={() => setOpenApplication(card.id)}
            >
              {displayName}
            </button>
          </div>
          <div
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              background: blindMode ? "var(--surface-sunken)" : "var(--brand-100)",
              color: blindMode ? "var(--ink-600)" : "var(--brand-700)",
              display: "grid",
              placeItems: "center",
              fontSize: "10px",
              fontWeight: 700,
              flexShrink: 0,
            }}
            aria-hidden="true"
          >
            {avatarText}
          </div>
        </div>

        <p className="kanban-card__job">{card.job_title}</p>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px", flexWrap: "wrap" }}>
          <Pill tone={getStagePillTone(card.stage_id, card.stage_category)}>
            {card.stage_label}
          </Pill>
          <ScoreBadge score={card.profile_interview_score} />
        </div>

        {(card.applied_interview_status || card.sandbox_status) && (
          <div className="kanban-card__badges" style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "2px" }}>
            {card.applied_interview_status && (
              <Pill
                tone={
                  card.applied_interview_status === "evaluated"
                    ? "verified"
                    : "attention"
                }
              >
                Interview {card.applied_interview_status.replace(/_/g, " ")}
              </Pill>
            )}
            {card.sandbox_status && (
              <Pill
                tone={
                  ["submitted", "expired"].includes(card.sandbox_status)
                    ? "verified"
                    : "attention"
                }
              >
                Sandbox {card.sandbox_status.replace(/_/g, " ")}
                {card.sandbox_score != null ? ` · ${card.sandbox_score}` : ""}
              </Pill>
            )}
          </div>
        )}

        <div style={{ marginTop: "4px", paddingTop: "8px", borderTop: "1px solid var(--border-subtle)" }}>
          <MoveMenu card={card} onMove={startMove} />
        </div>
      </article>
    );
  }

  return (
    <div className="dashboard dashboard--wide">
      <div style={{ marginBottom: "16px" }}>
        <Breadcrumbs items={[{ label: "Employer Workspace", href: "/" }, { label: "Hiring Pipeline" }]} />
      </div>

      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="page-heading">
        <div>
          <p className="eyebrow">Hiring operations</p>
          <h1>Hiring Pipeline</h1>
          <p>4-phase optimized workflow view. Every move is strictly validated, audited, and synchronized with candidate timelines.</p>
        </div>

        <div className="page-heading__meta pipeline-controls" style={{ flexWrap: "wrap", justifyContent: "flex-end" }}>
          {/* Main Top Header Action: Screen All Received */}
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleScreenReceived()}
            disabled={receivedCards.length === 0}
            loading={screeningBusy}
            style={{ height: "36px", fontWeight: 600 }}
            title={
              receivedCards.length > 0
                ? "Screen all received applications across the active pipeline"
                : "No pending received applications"
            }
          >
            <LuSparkles size={14} style={{ marginRight: "6px" }} aria-hidden="true" />
            <span>Screen All Received ({receivedCards.length})</span>
          </Button>

          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <LuFilter size={15} style={{ color: "var(--ink-400)" }} aria-hidden="true" />
            <label className="move-menu">
              <span className="sr-only">Filter by job requisition</span>
              <select
                className="select"
                style={{ height: "36px", padding: "6px 32px 6px 12px", minWidth: "180px" }}
                value={postingFilter ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  window.location.href = value ? `/pipeline?posting=${value}` : "/pipeline";
                }}
              >
                <option value="">All Requisitions</option>
                {postings.data?.postings.map((posting) => (
                  <option key={posting.id} value={posting.id}>
                    {posting.title}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Blind Review Mode Toggle */}
          <Button
            variant={blindMode ? "primary" : "secondary"}
            size="sm"
            onClick={() => setBlindMode(!blindMode)}
            title="Mask candidate names & avatars to eliminate unconscious bias"
            style={{ height: "36px" }}
          >
            {blindMode ? (
              <LuEyeOff size={14} style={{ marginRight: "6px" }} aria-hidden="true" />
            ) : (
              <LuEye size={14} style={{ marginRight: "6px" }} aria-hidden="true" />
            )}
            <span>{blindMode ? "Blind Review: ON" : "Blind Review: OFF"}</span>
          </Button>

          {/* Accessible View Toggle: 4-Phase Fit vs All Stages vs Table List */}
          <div className="view-toggle" role="group" aria-label="Pipeline view mode">
            <button
              type="button"
              className={view === "board" ? "is-active" : undefined}
              aria-pressed={view === "board"}
              onClick={() => setView("board")}
              title="Single-page fit (4 macro phases)"
            >
              <LuLayoutGrid size={13} style={{ marginRight: "4px" }} aria-hidden="true" />
              Focus Board (Fit)
            </button>
            <button
              type="button"
              className={view === "expanded" ? "is-active" : undefined}
              aria-pressed={view === "expanded"}
              onClick={() => setView("expanded")}
              title="Expanded 7-column board"
            >
              <LuColumns3 size={13} style={{ marginRight: "4px" }} aria-hidden="true" />
              All Stages
            </button>
            <button
              type="button"
              className={view === "list" ? "is-active" : undefined}
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
              title="Compact tabular list"
            >
              <LuList size={13} style={{ marginRight: "4px" }} aria-hidden="true" />
              Table
            </button>
          </div>
        </div>
      </div>

      {/* Smart Pipeline Automations Quick Bar */}
      <div
        className="pipeline-automation-bar"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
          padding: "12px 16px",
          marginBottom: "16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Pipeline Actions:
          </span>

          {/* 1. Screening */}
          {selectedReceived.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleScreenReceived(selectedReceived)}
              loading={screeningBusy}
              title="Screen selected received applications and compute match scores"
            >
              <LuSparkles size={13} style={{ marginRight: "4px" }} />
              Screen Selected ({selectedReceived.length})
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleScreenReceived()}
              loading={screeningBusy}
              disabled={receivedCards.length === 0}
              title={
                receivedCards.length > 0
                  ? "Screen all received applications and compute match scores"
                  : "No pending received candidates"
              }
            >
              <LuSparkles size={13} style={{ marginRight: "4px" }} />
              Screen All Received ({receivedCards.length})
            </Button>
          )}

          {/* 2. Shortlisting */}
          {selectedScreened.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openShortlistModal(true)}
              title="Shortlist selected screened candidates"
            >
              <LuUserCheck size={13} style={{ marginRight: "4px" }} />
              Shortlist Selected ({selectedScreened.length})...
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openShortlistModal(false)}
              disabled={screenedCards.length === 0}
              title={
                screenedCards.length > 0
                  ? "Auto-shortlist top N candidates ranked by match score"
                  : "No screened candidates to shortlist"
              }
            >
              <LuUserCheck size={13} style={{ marginRight: "4px" }} />
              Auto-Shortlist Top N ({screenedCards.length} screened)...
            </Button>
          )}

          {/* 3. Interview Invitations */}
          {selectedShortlisted.length > 0 ? (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openInviteModal(true)}
              title="Invite selected shortlisted candidates to AI Applied Interview"
            >
              <LuSend size={13} style={{ marginRight: "4px" }} />
              Invite Selected ({selectedShortlisted.length})...
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openInviteModal(false)}
              disabled={shortlistedCards.length === 0}
              title={
                shortlistedCards.length > 0
                  ? "Auto-invite top N shortlisted candidates to interview"
                  : "No shortlisted candidates to invite"
              }
            >
              <LuSend size={13} style={{ marginRight: "4px" }} />
              Auto-Invite Top N ({shortlistedCards.length} shortlisted)...
            </Button>
          )}
        </div>

        <div style={{ fontSize: "12px", color: "var(--ink-500)", display: "flex", alignItems: "center", gap: "6px" }}>
          <LuSparkles size={13} style={{ color: "var(--brand-600)" }} />
          <span>AI analyzes loopholes &amp; provides candidate improvement roadmaps on rejections</span>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading candidate pipeline…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : columns.length === 0 ? (
        <EmptyState
          title="No pipeline stages configured"
          description="Publish a workflow in Administration and assign it to an active job to view candidate movement here."
        />
      ) : view === "board" ? (
        /* Optimized Single-Page Kanban (4 Macro Columns fit on 1 page) */
        <div className="kanban--fit" role="list" aria-label="Hiring pipeline macro phases">
          {macroGroups.map((group) => {
            const currentSub = subFilters[group.id] || "all";
            const visibleCards =
              currentSub === "all"
                ? group.cards
                : group.cards.filter((c) => c.stage_id === currentSub);
            const isDragTarget =
              dragging &&
              dragging.valid_destinations.some((d) => group.stageIds.includes(d.id));

            return (
              <section
                key={group.id}
                className={`kanban__column${
                  dragOverColumn === group.id ? " kanban__column--dragover" : ""
                }`}
                role="listitem"
                aria-label={`${group.label}, ${visibleCards.length} candidates`}
                onDragOver={(event) => {
                  if (isDragTarget) {
                    event.preventDefault();
                    setDragOverColumn(group.id);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverColumn === group.id) setDragOverColumn(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverColumn(null);
                  if (!dragging) return;
                  if (
                    currentSub !== "all" &&
                    dragging.valid_destinations.some((d) => d.id === currentSub)
                  ) {
                    startMove(dragging, currentSub);
                  } else {
                    const dest = dragging.valid_destinations.find((d) =>
                      group.stageIds.includes(d.id)
                    );
                    if (dest) startMove(dragging, dest.id);
                  }
                  setDragging(null);
                }}
              >
                <header className="kanban__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div className="kanban__header-title">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <h2>{group.label}</h2>
                      <span className="kanban__count tabular-nums">
                        {visibleCards.length}
                      </span>
                    </div>
                    <span className="kanban__header-subtitle">{group.subtitle}</span>
                  </div>

                  {group.id === "received" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleScreenReceived()}
                      loading={screeningBusy}
                      disabled={receivedCards.length === 0}
                      style={{ height: "26px", fontSize: "11px", padding: "0 8px", fontWeight: 600 }}
                      title={
                        receivedCards.length > 0
                          ? "Screen all received applications"
                          : "No pending received applications"
                      }
                    >
                      <LuSparkles size={11} style={{ marginRight: "3px" }} />
                      Screen All ({receivedCards.length})
                    </Button>
                  )}

                  {group.id === "shortlisted" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => openInviteModal(false)}
                      disabled={shortlistedCards.length === 0}
                      style={{ height: "26px", fontSize: "11px", padding: "0 8px", fontWeight: 600 }}
                      title={
                        shortlistedCards.length > 0
                          ? "Auto-invite top candidates to interview"
                          : "No shortlisted candidates to invite"
                      }
                    >
                      <LuSend size={11} style={{ marginRight: "3px" }} />
                      Invite ({shortlistedCards.length})
                    </Button>
                  )}
                </header>

                {/* Sub-filter tab pill row for macro columns with multiple stages */}
                {group.subStages.length > 1 && (
                  <div
                    className="kanban__subfilter"
                    role="tablist"
                    aria-label={`Filter ${group.label} sub-stages`}
                  >
                    <button
                      type="button"
                      className={`kanban__subfilter-btn${
                        currentSub === "all" ? " is-active" : ""
                      }`}
                      onClick={() =>
                        setSubFilters((prev) => ({ ...prev, [group.id]: "all" }))
                      }
                    >
                      All ({group.cards.length})
                    </button>
                    {group.subStages.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        className={`kanban__subfilter-btn${
                          currentSub === sub.id ? " is-active" : ""
                        }`}
                        onClick={() =>
                          setSubFilters((prev) => ({ ...prev, [group.id]: sub.id }))
                        }
                      >
                        {sub.label} ({sub.count})
                      </button>
                    ))}
                  </div>
                )}

                <div className="kanban__cards">
                  {visibleCards.length === 0 ? (
                    <div className="kanban__empty">
                      <span>
                        No candidates{" "}
                        {currentSub !== "all" ? "in this stage" : "in this phase"}
                      </span>
                    </div>
                  ) : (
                    visibleCards.map((card) => renderCard(card))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : view === "expanded" ? (
        /* Traditional Horizontal Scrolling All Stages */
        <div className="kanban" role="list" aria-label="All pipeline stages">
          {columns.map((column) => (
            <section
              key={column.stage_id}
              className="kanban__column"
              role="listitem"
              aria-label={`${column.label}, ${column.cards.length} candidates`}
              onDragOver={(event) => {
                if (dragging?.valid_destinations.some((d) => d.id === column.stage_id)) {
                  event.preventDefault();
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragging) startMove(dragging, column.stage_id);
                setDragging(null);
              }}
            >
              <header className="kanban__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="kanban__header-title">
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <h2>{column.label}</h2>
                    <span className="kanban__count tabular-nums">{column.cards.length}</span>
                  </div>
                </div>

                {column.stage_id === "received" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleScreenReceived()}
                    loading={screeningBusy}
                    disabled={column.cards.length === 0}
                    style={{ height: "26px", fontSize: "11px", padding: "0 8px", fontWeight: 600 }}
                    title={
                      column.cards.length > 0
                        ? "Screen all received applications"
                        : "No pending received applications"
                    }
                  >
                    <LuSparkles size={11} style={{ marginRight: "3px" }} />
                    Screen All ({column.cards.length})
                  </Button>
                )}

                {column.stage_id === "screened" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openShortlistModal(false)}
                    disabled={column.cards.length === 0}
                    style={{ height: "26px", fontSize: "11px", padding: "0 8px", fontWeight: 600 }}
                    title="Shortlist screened candidates"
                  >
                    <LuUserCheck size={11} style={{ marginRight: "3px" }} />
                    Shortlist
                  </Button>
                )}

                {column.stage_id === "shortlisted" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openInviteModal(false)}
                    disabled={column.cards.length === 0}
                    style={{ height: "26px", fontSize: "11px", padding: "0 8px", fontWeight: 600 }}
                    title="Auto-invite candidates to interview"
                  >
                    <LuSend size={11} style={{ marginRight: "3px" }} />
                    Invite
                  </Button>
                )}
              </header>

              <div className="kanban__cards">
                {column.cards.length === 0 ? (
                  <div className="kanban__empty">No candidates in this stage</div>
                ) : (
                  column.cards.map((card) => renderCard(card))
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        /* Accessible Table View */
        <section className="panel" aria-label="Pipeline table list view">
          <TableContainer>
            <Table>
              <caption className="sr-only">
                All candidates across stages with keyboard accessible transition actions
              </caption>
              <thead>
                <tr>
                  <th scope="col" style={{ width: "36px" }}>
                    <input
                      type="checkbox"
                      checked={allCards.length > 0 && allCards.every((c) => selectedIds.has(c.id))}
                      onChange={() => toggleSelectAll(allCards)}
                      aria-label="Select all candidates"
                      style={{ accentColor: "var(--brand-600)", width: "15px", height: "15px", cursor: "pointer" }}
                    />
                  </th>
                  <th scope="col">Candidate</th>
                  <th scope="col">Requisition</th>
                  <th scope="col">
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>Stage</span>
                      {receivedCards.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleScreenReceived()}
                          loading={screeningBusy}
                          style={{ height: "22px", fontSize: "10px", padding: "0 6px" }}
                          title="Screen all received candidates"
                        >
                          <LuSparkles size={10} style={{ marginRight: "2px" }} />
                          Screen ({receivedCards.length})
                        </Button>
                      )}
                    </div>
                  </th>
                  <th scope="col">Skill Score</th>
                  <th scope="col">Job Interview</th>
                  <th scope="col" style={{ width: "160px" }}>Move Stage</th>
                </tr>
              </thead>
              <tbody>
                {allCards.length === 0 && (
                  <TableEmpty colSpan={7}>No candidates found in the current filter.</TableEmpty>
                )}
                {allCards.map((card) => {
                  const displayName = blindMode ? `Candidate #${card.id.slice(-4)}` : card.candidate_name;
                  const isSelected = selectedIds.has(card.id);

                  return (
                    <tr key={card.id} style={isSelected ? { background: "var(--surface-raised)" } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectCard(card.id)}
                          aria-label={`Select ${displayName}`}
                          style={{ accentColor: "var(--brand-600)", width: "15px", height: "15px", cursor: "pointer" }}
                        />
                      </td>
                      <th scope="row">
                        <button
                          type="button"
                          className="table-action"
                          style={{ border: 0, background: "none", cursor: "pointer", textAlign: "left" }}
                          onClick={() => setOpenApplication(card.id)}
                        >
                          <strong>{displayName}</strong>
                        </button>
                      </th>
                      <td>{card.job_title}</td>
                      <td>
                        <Pill tone={getStagePillTone(card.stage_id, card.stage_category)}>
                          {card.stage_label}
                        </Pill>
                      </td>
                      <td>
                        <ScoreBadge score={card.profile_interview_score} />
                      </td>
                      <td>
                        {card.applied_interview_status
                          ? card.applied_interview_status.replace(/_/g, " ")
                          : "Not invited"}
                      </td>
                      <td>
                        <MoveMenu card={card} onMove={startMove} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </TableContainer>
        </section>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk candidate operations"
          style={{
            position: "fixed",
            bottom: "24px",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "12px",
            boxShadow: "0 10px 30px -5px rgba(0, 0, 0, 0.35)",
            padding: "10px 18px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 200,
            backdropFilter: "blur(10px)",
            maxWidth: "90vw",
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--ink-900)" }}>
            {selectedIds.size} {selectedIds.size === 1 ? "candidate" : "candidates"} selected
          </span>
          <div style={{ height: "20px", width: "1px", background: "var(--border)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <select
              className="select"
              style={{ height: "32px", fontSize: "12px", minWidth: "140px", padding: "4px 28px 4px 10px" }}
              value={bulkTargetStage}
              onChange={(e) => setBulkTargetStage(e.target.value)}
            >
              <option value="">Move to stage…</option>
              {availableStages.map((s) => (
                <option key={s.id} value={s.id}>
                  → {s.label}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!bulkTargetStage || bulkBusy}
              onClick={handleBulkMove}
              loading={bulkBusy}
            >
              Apply Move
            </Button>
          </div>

          {selectedReceived.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleScreenReceived(selectedReceived)}
              loading={screeningBusy}
              title="Screen selected received applications"
            >
              <LuSparkles size={13} style={{ marginRight: "4px" }} />
              Screen ({selectedReceived.length})
            </Button>
          )}

          {selectedScreened.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openShortlistModal(true)}
              title="Shortlist selected screened candidates"
            >
              <LuUserCheck size={13} style={{ marginRight: "4px" }} />
              Shortlist ({selectedScreened.length})...
            </Button>
          )}

          {selectedShortlisted.length > 0 && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => openInviteModal(true)}
              title="Invite selected shortlisted candidates to AI Applied Interview"
            >
              <LuSend size={13} style={{ marginRight: "4px" }} />
              Invite to Interview ({selectedShortlisted.length})...
            </Button>
          )}

          <Button
            variant="danger"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setBulkRejectModalOpen(true)}
          >
            <LuUserX size={13} style={{ marginRight: "4px" }} />
            Reject Selected
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBulkExport}
          >
            <LuDownload size={13} style={{ marginRight: "4px" }} />
            Export CSV
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </div>
      )}

      {/* Bulk Reject Modal Dialog */}
      {bulkRejectModalOpen && (
        <Modal
          open={true}
          onClose={() => setBulkRejectModalOpen(false)}
          title={`Reject ${selectedIds.size} Candidates`}
          description="Move selected applicants to the Rejected stage. This action will be recorded in the audit log."
        >
          <div style={{ display: "grid", gap: "14px", marginTop: "8px" }}>
            <label className="form-field">
              <span className="form-field__label">Rejection Reason Code (required)</span>
              <input
                className="input"
                value={bulkRejectReason}
                onChange={(e) => setBulkRejectReason(e.target.value)}
                placeholder="e.g. does_not_meet_requirements, role_closed"
                autoFocus
              />
            </label>
            <label className="form-field">
              <span className="form-field__label">Internal Audit Note (optional)</span>
              <textarea
                className="textarea"
                value={bulkRejectNote}
                onChange={(e) => setBulkRejectNote(e.target.value)}
                rows={3}
                placeholder="Add reviewer notes explaining the bulk rejection decision…"
              />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "12px" }}>
              <Button
                variant="secondary"
                onClick={() => setBulkRejectModalOpen(false)}
                disabled={bulkBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={handleBulkReject}
                loading={bulkBusy}
              >
                Confirm Bulk Rejection
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Auto-Shortlist Modal */}
      {shortlistModalOpen && (
        <Modal
          open={true}
          onClose={() => setShortlistModalOpen(false)}
          title={
            shortlistSelectedMode
              ? `Shortlist ${selectedScreened.length} Selected Candidates`
              : "Auto-Shortlist Top Candidates"
          }
          description="Advance qualified candidates to Shortlisted stage. Optionally reject remaining candidates with automated AI loophole feedback."
        >
          <div style={{ display: "grid", gap: "16px", marginTop: "8px" }}>
            {!shortlistSelectedMode ? (
              <div>
                <label className="form-field">
                  <span className="form-field__label">Number of top candidates to shortlist:</span>
                  <input
                    type="number"
                    min={1}
                    max={screenedCards.length}
                    className="input"
                    value={shortlistTopN}
                    onChange={(e) => setShortlistTopN(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </label>
                <div
                  style={{
                    marginTop: "8px",
                    maxHeight: "160px",
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Ranked Preview (Top {Math.min(shortlistTopN, screenedCards.length)} will be shortlisted):
                  </span>
                  {sortedScreened.slice(0, Math.min(shortlistTopN, screenedCards.length)).map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                        padding: "6px 0",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <span>
                        #{i + 1} {blindMode ? `Candidate #${c.id.slice(-4)}` : c.candidate_name}
                      </span>
                      <ScoreBadge score={c.job_match_score ?? c.profile_interview_score} label="Match" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "12px",
                  background: "var(--surface-sunken)",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <strong>{selectedScreened.length}</strong> candidate(s) selected to advance to{" "}
                <strong>Shortlisted</strong>.
              </div>
            )}

            {/* Reject remaining prompt */}
            <div
              style={{
                padding: "14px",
                background: "var(--surface-sunken)",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ marginTop: "3px" }}
                  checked={shortlistRejectRemaining}
                  onChange={(e) => setShortlistRejectRemaining(e.target.checked)}
                />
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>
                    Reject remaining un-shortlisted candidates ({unshortlistedCount} candidate{unshortlistedCount === 1 ? "" : "s"})
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                    Applicants not meeting the shortlisting cutoff will transition to the Rejected stage.
                  </span>
                </div>
              </label>

              {shortlistRejectRemaining && (
                <div
                  style={{
                    marginTop: "12px",
                    marginLeft: "24px",
                    paddingTop: "10px",
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: "2px" }}
                      checked={shortlistSendFeedback}
                      onChange={(e) => setShortlistSendFeedback(e.target.checked)}
                    />
                    <span style={{ fontSize: "12px", color: "var(--brand-800)" }}>
                      <LuSparkles size={13} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                      <strong>AI Loophole Analysis &amp; Growth Email:</strong> Pinpoint missing qualifications and email tailored advice on how to improve for their next application.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <Button
                variant="secondary"
                onClick={() => setShortlistModalOpen(false)}
                disabled={shortlistBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmShortlist}
                loading={shortlistBusy}
              >
                {shortlistRejectRemaining
                  ? `Shortlist & Reject Remaining (${unshortlistedCount})`
                  : "Confirm Shortlist Only"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Auto-Invite to Interview Modal */}
      {inviteModalOpen && (
        <Modal
          open={true}
          onClose={() => setInviteModalOpen(false)}
          title={
            inviteSelectedMode
              ? `Invite ${selectedShortlisted.length} Selected Candidates to Interview`
              : "Auto-Invite Top Shortlisted Candidates"
          }
          description="Advance candidates to AI Applied Interview and dispatch interview room invitations. Optionally reject remaining unselected candidates."
        >
          <div style={{ display: "grid", gap: "16px", marginTop: "8px" }}>
            {!inviteSelectedMode ? (
              <div>
                <label className="form-field">
                  <span className="form-field__label">Number of top candidates to invite:</span>
                  <input
                    type="number"
                    min={1}
                    max={shortlistedCards.length}
                    className="input"
                    value={inviteTopN}
                    onChange={(e) => setInviteTopN(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </label>
                <div
                  style={{
                    marginTop: "8px",
                    maxHeight: "160px",
                    overflowY: "auto",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    padding: "8px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 600,
                      color: "var(--ink-500)",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    Ranked Preview (Top {Math.min(inviteTopN, shortlistedCards.length)} will be invited):
                  </span>
                  {sortedShortlisted.slice(0, Math.min(inviteTopN, shortlistedCards.length)).map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "12px",
                        padding: "6px 0",
                        borderBottom: "1px solid var(--border-subtle)",
                      }}
                    >
                      <span>
                        #{i + 1} {blindMode ? `Candidate #${c.id.slice(-4)}` : c.candidate_name}
                      </span>
                      <ScoreBadge score={c.job_match_score ?? c.profile_interview_score} label="Match" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  padding: "12px",
                  background: "var(--surface-sunken)",
                  borderRadius: "6px",
                  fontSize: "13px",
                }}
              >
                <strong>{selectedShortlisted.length}</strong> candidate(s) selected to advance to{" "}
                <strong>Applied Interview</strong>.
              </div>
            )}

            {/* Reject remaining prompt */}
            <div
              style={{
                padding: "14px",
                background: "var(--surface-sunken)",
                borderRadius: "8px",
                border: "1px solid var(--border)",
              }}
            >
              <label style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  style={{ marginTop: "3px" }}
                  checked={inviteRejectRemaining}
                  onChange={(e) => setInviteRejectRemaining(e.target.checked)}
                />
                <div>
                  <strong style={{ fontSize: "13px", display: "block" }}>
                    Reject remaining un-invited candidates ({uninvitedCount} candidate{uninvitedCount === 1 ? "" : "s"})
                  </strong>
                  <span style={{ fontSize: "12px", color: "var(--ink-500)" }}>
                    Applicants not invited to interview will transition to the Rejected stage.
                  </span>
                </div>
              </label>

              {inviteRejectRemaining && (
                <div
                  style={{
                    marginTop: "12px",
                    marginLeft: "24px",
                    paddingTop: "10px",
                    borderTop: "1px dashed var(--border)",
                  }}
                >
                  <label style={{ display: "flex", alignItems: "flex-start", gap: "8px", cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      style={{ marginTop: "2px" }}
                      checked={inviteSendFeedback}
                      onChange={(e) => setInviteSendFeedback(e.target.checked)}
                    />
                    <span style={{ fontSize: "12px", color: "var(--brand-800)" }}>
                      <LuSparkles size={13} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                      <strong>AI Loophole Analysis &amp; Growth Email:</strong> Provide candidates actionable feedback on interview competencies and qualification improvements.
                    </span>
                  </label>
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px" }}>
              <Button
                variant="secondary"
                onClick={() => setInviteModalOpen(false)}
                disabled={inviteBusy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleConfirmInviteInterviews}
                loading={inviteBusy}
              >
                {inviteRejectRemaining
                  ? `Invite & Reject Remaining (${uninvitedCount})`
                  : "Send Invitations"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Reversible Stage Move Undo Window Toast */}
      {undoToast && (
        <div
          role="alert"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "10px",
            padding: "12px 18px",
            boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "12px",
            zIndex: 300,
          }}
        >
          <LuHistory size={17} style={{ color: "var(--brand-600)" }} />
          <span style={{ fontSize: "13px", color: "var(--ink-900)" }}>
            Moved <strong>{undoToast.candidateName}</strong> to <strong>{undoToast.stageLabel}</strong> ({undoSecondsLeft}s)
          </span>
          <Button
            variant="primary"
            size="sm"
            onClick={triggerUndo}
            style={{ height: "30px", padding: "0 12px" }}
          >
            Undo
          </Button>
          <button
            onClick={() => setUndoToast(null)}
            style={{
              background: "none",
              border: 0,
              cursor: "pointer",
              color: "var(--ink-400)",
              display: "grid",
              placeItems: "center",
              padding: "4px",
            }}
            aria-label="Dismiss undo notification"
          >
            <LuX size={15} />
          </button>
        </div>
      )}

      {/* Reusable Modal for Stage Movement Confirmation */}
      {target && (
        <TransitionDialog
          target={target}
          busy={transitionBusy}
          error={transitionError}
          onCancel={() => setTarget(null)}
          onConfirm={confirmMove}
        />
      )}

      {/* Candidate Dossier Slide-over Drawer */}
      {openApplication && (
        <ApplicationDrawer
          applicationId={openApplication}
          onClose={() => setOpenApplication(null)}
          onChanged={reload}
          blindMode={blindMode}
        />
      )}
    </div>
  );
}
