"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  LuHistory,
  LuX,
  LuDownload,
  LuUserX,
  LuSparkles,
  LuUserCheck,
  LuSend,
} from "react-icons/lu";
import { ApplicationDrawer } from "@/components/pipeline/application-drawer";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Popover } from "@/components/ui/popover";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast-provider";
import { Pill, type PillTone } from "@/components/ui/pill";
import { ScoreBadge } from "@/components/ui/score-badge";
import { Table, TableContainer, TableEmpty } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/state";
import { api, ApiError, idempotencyKey } from "@/lib/api";
import { cn } from "@/lib/cn";
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
      <div className="modal-stack">
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

        <div className="modal-actions">
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
    return <span className="cand-card__status">Final stage</span>;
  }
  return (
    <label className="move-menu">
      <span className="sr-only">Move {card.candidate_name} to stage</span>
      <select
        className="select select--sm"
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
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const deepLinkApplication = searchParams.get("applicationId");

  const [view, setView] = useState<"funnel" | "board" | "list">("funnel");
  const [expandStages, setExpandStages] = useState(false);
  const [funnelStage, setFunnelStage] = useState<string | null>(null);
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

  // ?applicationId= deep link (Messages, Analytics, command palette) opens the drawer; closing drops the param.
  useEffect(() => {
    if (deepLinkApplication) setOpenApplication(deepLinkApplication);
  }, [deepLinkApplication]);
  const closeApplication = useCallback(() => {
    setOpenApplication(null);
    if (searchParams.get("applicationId")) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("applicationId");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [router, pathname, searchParams]);

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
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Bulk move failed.";
      setAnnouncement(msg);
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Bulk rejection failed.";
      setAnnouncement(msg);
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Screening failed.";
      setAnnouncement(msg);
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Shortlisting failed.";
      setAnnouncement(msg);
      toast.error(msg);
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
      const msg = err instanceof Error ? err.message : "Interview invitation failed.";
      setAnnouncement(msg);
      toast.error(msg);
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
    const avatarText = card.candidate_name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
    const isSelected = selectedIds.has(card.id);

    return (
      <article
        key={card.id}
        className={cn("cand-card", dragging?.id === card.id && "is-dragging", isSelected && "is-selected")}
        draggable={card.valid_destinations.length > 0}
        onDragStart={() => setDragging(card)}
        onDragEnd={() => setDragging(null)}
        aria-label={`${displayName}, ${card.stage_label}`}
      >
        <div className="cand-card__head">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelectCard(card.id);
            }}
            aria-label={`Select ${displayName}`}
          />
          {!blindMode && <span className="avatar" aria-hidden="true">{avatarText}</span>}
          <span className="cand-card__who">
            <button type="button" className="cand-card__name" onClick={() => setOpenApplication(card.id)}>
              {displayName}
            </button>
            <span className="cand-card__job">{card.job_title}</span>
          </span>
          <Pill tone={getStagePillTone(card.stage_id, card.stage_category)}>{card.stage_label}</Pill>
        </div>

        <p className="cand-card__reason" title={card.job_match_reasons ?? undefined}>
          {card.job_match_reasons || "Not screened yet — run screening to get an AI match explanation."}
        </p>

        <div className="cand-card__foot">
          <ScoreBadge score={card.job_match_score ?? null} label="Match" />
          <ScoreBadge score={card.profile_interview_score} label="Screen" />
        </div>

        {(card.applied_interview_status || card.sandbox_status) && (
          <div className="cand-card__foot">
            {card.applied_interview_status && (
              <Pill tone={card.applied_interview_status === "evaluated" ? "verified" : "attention"}>
                Interview {card.applied_interview_status.replace(/_/g, " ")}
              </Pill>
            )}
            {card.sandbox_status && (
              <Pill tone={["submitted", "expired"].includes(card.sandbox_status) ? "verified" : "attention"}>
                Sandbox {card.sandbox_status.replace(/_/g, " ")}
                {card.sandbox_score != null ? ` · ${card.sandbox_score}` : ""}
              </Pill>
            )}
          </div>
        )}

        <div className="cand-card__move">
          <MoveMenu card={card} onMove={startMove} />
        </div>
      </article>
    );
  }

  /** Primary automation for a workflow stage, shown beside the funnel strip and in lane headers. */
  function stageAction(stageId: string) {
    if (stageId === "received") {
      return (
        <Button size="sm" variant="secondary" onClick={() => handleScreenReceived()} loading={screeningBusy} disabled={receivedCards.length === 0}
          iconLeft={<LuSparkles size={13} />} title="Screen all received applications with AI">
          Screen all ({receivedCards.length})
        </Button>
      );
    }
    if (stageId === "screened") {
      return (
        <Button size="sm" variant="secondary" onClick={() => openShortlistModal(false)} disabled={screenedCards.length === 0}
          iconLeft={<LuUserCheck size={13} />} title="Auto-shortlist top candidates based on AI screening score">
          Shortlist ({screenedCards.length})…
        </Button>
      );
    }
    if (stageId === "shortlisted") {
      return (
        <Button size="sm" variant="secondary" onClick={() => openInviteModal(false)} disabled={shortlistedCards.length === 0}
          iconLeft={<LuSend size={13} />} title="Auto-invite top candidates to interview">
          Invite ({shortlistedCards.length})…
        </Button>
      );
    }
    return null;
  }

  const currentPosting = postings.data?.postings.find((p) => p.id === postingFilter);
  const activeStage = funnelStage ?? columns[0]?.stage_id ?? null;
  const stageCards = columns.find((c) => c.stage_id === activeStage)?.cards ?? [];

  return (
    <div className="dashboard dashboard--wide">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <PageHeader
        title="Pipeline"
        meta={`${allCards.length} candidate${allCards.length === 1 ? "" : "s"} · ${currentPosting?.title ?? "All requisitions"}`}
        actions={
          <>
            <label className="move-menu">
              <span className="sr-only">Filter by job requisition</span>
              <select
                className="select"
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
            <SegmentedControl
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "funnel", label: "Funnel" },
                { value: "board", label: "Board" },
                { value: "list", label: "Table" },
              ]}
            />
            {view === "board" && <Switch label="Expand stages" checked={expandStages} onChange={setExpandStages} />}
            <Switch label="Blind review" checked={blindMode} onChange={setBlindMode} />
            <Popover
              label="Pipeline actions"
              className="menu"
              trigger={({ open, toggle, ref }) => (
                <button ref={ref} type="button" className="button button--primary button--sm" aria-expanded={open} onClick={toggle}>
                  <LuSparkles size={14} aria-hidden="true" />
                  Actions
                </button>
              )}
            >
              {(close) => (
                <>
                  <button
                    type="button"
                    className="menu__item"
                    disabled={selectedReceived.length === 0 && receivedCards.length === 0}
                    onClick={() => {
                      close();
                      void handleScreenReceived(selectedReceived.length > 0 ? selectedReceived : undefined);
                    }}
                  >
                    {selectedReceived.length > 0 ? `Screen selected (${selectedReceived.length})` : `Screen all received (${receivedCards.length})`}
                    <small>Compute AI match scores and explanations</small>
                  </button>
                  <button
                    type="button"
                    className="menu__item"
                    disabled={selectedScreened.length === 0 && screenedCards.length === 0}
                    onClick={() => {
                      close();
                      openShortlistModal(selectedScreened.length > 0);
                    }}
                  >
                    {selectedScreened.length > 0 ? `Shortlist selected (${selectedScreened.length})…` : `Auto-shortlist top N (${screenedCards.length} screened)…`}
                    <small>Rank by match score; optionally reject the rest with AI feedback</small>
                  </button>
                  <button
                    type="button"
                    className="menu__item"
                    disabled={selectedShortlisted.length === 0 && shortlistedCards.length === 0}
                    onClick={() => {
                      close();
                      openInviteModal(selectedShortlisted.length > 0);
                    }}
                  >
                    {selectedShortlisted.length > 0 ? `Invite selected (${selectedShortlisted.length}) to interview…` : `Invite top N to interview (${shortlistedCards.length} shortlisted)…`}
                    <small>Send AI job interview invitations</small>
                  </button>
                </>
              )}
            </Popover>
          </>
        }
      />

      {loading ? (
        <LoadingState label="Loading candidate pipeline…" />
      ) : error ? (
        <ErrorState message={error.message} onRetry={reload} />
      ) : columns.length === 0 ? (
        <EmptyState
          title="No pipeline stages configured"
          description="Publish a workflow in Administration and assign it to an active job to view candidate movement here."
        />
      ) : view === "funnel" ? (
        <>
          <div className="stage-bar">
            <div className="stage-strip" role="group" aria-label="Stages">
              {columns.map((c) => (
                <button key={c.stage_id} type="button" aria-pressed={activeStage === c.stage_id} onClick={() => setFunnelStage(c.stage_id)}>
                  <b className="tabular-nums">{c.cards.length}</b>
                  <small>{c.label}</small>
                </button>
              ))}
            </div>
            {activeStage && stageAction(activeStage)}
          </div>
          {stageCards.length === 0 ? (
            <p className="lane__empty">No candidates in this stage</p>
          ) : (
            <div className="cand-grid">{stageCards.map((card) => renderCard(card))}</div>
          )}
        </>
      ) : view === "board" && !expandStages ? (
        <div className="board">
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
                className={cn("lane", dragOverColumn === group.id && "is-drop-target")}
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
                <header className="lane__head">
                  <h2>{group.label}</h2>
                  <span className="lane__count tabular-nums">{visibleCards.length}</span>
                  <div className="lane__action">
                    {group.id === "received" && stageAction("received")}
                    {group.id === "received" && screenedCards.length > 0 && stageAction("screened")}
                    {group.id === "shortlisted" && stageAction("shortlisted")}
                  </div>
                </header>

                {group.subStages.length > 1 && (
                  <div className="lane__chips" role="group" aria-label={`Filter ${group.label} sub-stages`}>
                    <button
                      type="button"
                      aria-pressed={currentSub === "all"}
                      onClick={() => setSubFilters((prev) => ({ ...prev, [group.id]: "all" }))}
                    >
                      All ({group.cards.length})
                    </button>
                    {group.subStages.map((sub) => (
                      <button
                        key={sub.id}
                        type="button"
                        aria-pressed={currentSub === sub.id}
                        onClick={() => setSubFilters((prev) => ({ ...prev, [group.id]: sub.id }))}
                      >
                        {sub.label} ({sub.count})
                      </button>
                    ))}
                  </div>
                )}

                {visibleCards.length === 0 ? (
                  <p className="lane__empty">
                    No candidates {currentSub !== "all" ? "in this stage" : "in this phase"}
                  </p>
                ) : (
                  visibleCards.map((card) => renderCard(card))
                )}
              </section>
            );
          })}
        </div>
      ) : view === "board" ? (
        <div className="board board--expanded" style={{ "--lanes": columns.length } as CSSProperties}>
          {columns.map((column) => (
            <section
              key={column.stage_id}
              className={cn("lane", dragOverColumn === column.stage_id && "is-drop-target")}
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
              <header className="lane__head">
                <h2>{column.label}</h2>
                <span className="lane__count tabular-nums">{column.cards.length}</span>
                <div className="lane__action">{stageAction(column.stage_id)}</div>
              </header>
              {column.cards.length === 0 ? (
                <p className="lane__empty">No candidates in this stage</p>
              ) : (
                column.cards.map((card) => renderCard(card))
              )}
            </section>
          ))}
        </div>
      ) : (
        <section className="panel" aria-label="Pipeline table list view">
          <TableContainer>
            <Table>
              <caption className="sr-only">
                All candidates across stages with keyboard accessible transition actions
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="table__check">
                    <input
                      type="checkbox"
                      checked={allCards.length > 0 && allCards.every((c) => selectedIds.has(c.id))}
                      onChange={() => toggleSelectAll(allCards)}
                      aria-label="Select all candidates"
                    />
                  </th>
                  <th scope="col">Candidate</th>
                  <th scope="col">Requisition</th>
                  <th scope="col">
                    <span className="table__head-action">
                      <span>Stage</span>
                      {receivedCards.length > 0 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleScreenReceived()}
                          loading={screeningBusy}
                          title="Screen all received candidates"
                          iconLeft={<LuSparkles size={12} />}
                        >
                          Screen ({receivedCards.length})
                        </Button>
                      )}
                    </span>
                  </th>
                  <th scope="col">Match / Screen</th>
                  <th scope="col">Job Interview</th>
                  <th scope="col">Move Stage</th>
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
                    <tr key={card.id} className={isSelected ? "is-selected" : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectCard(card.id)}
                          aria-label={`Select ${displayName}`}
                        />
                      </td>
                      <th scope="row">
                        <button type="button" className="link" onClick={() => setOpenApplication(card.id)}>
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
                        <span className="cand-card__foot">
                          <ScoreBadge score={card.job_match_score ?? null} label="Match" />
                          <ScoreBadge score={card.profile_interview_score} label="Screen" />
                        </span>
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
        <div role="region" aria-label="Bulk candidate operations" className="bulk-bar">
          <span className="bulk-bar__count">
            {selectedIds.size} {selectedIds.size === 1 ? "candidate" : "candidates"} selected
          </span>
          <label className="move-menu">
            <span className="sr-only">Move selected candidates to stage</span>
            <select
              className="select"
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
          </label>
          <Button
            size="sm"
            disabled={!bulkTargetStage || bulkBusy}
            onClick={handleBulkMove}
            loading={bulkBusy}
          >
            Apply Move
          </Button>

          {selectedReceived.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleScreenReceived(selectedReceived)}
              loading={screeningBusy}
              title="Screen selected received applications"
              iconLeft={<LuSparkles size={13} />}
            >
              Screen ({selectedReceived.length})
            </Button>
          )}

          {selectedScreened.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openShortlistModal(true)}
              title="Shortlist selected screened candidates"
              iconLeft={<LuUserCheck size={13} />}
            >
              Shortlist ({selectedScreened.length})…
            </Button>
          )}

          {selectedShortlisted.length > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openInviteModal(true)}
              title="Invite selected shortlisted candidates to AI Applied Interview"
              iconLeft={<LuSend size={13} />}
            >
              Invite to Interview ({selectedShortlisted.length})…
            </Button>
          )}

          <Button variant="secondary" size="sm" onClick={handleBulkExport} iconLeft={<LuDownload size={13} />}>
            Export CSV
          </Button>
          <Button
            variant="danger"
            size="sm"
            disabled={bulkBusy}
            onClick={() => setBulkRejectModalOpen(true)}
            iconLeft={<LuUserX size={13} />}
          >
            Reject…
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
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
          <div className="modal-stack">
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
            <div className="modal-actions">
              <Button
                variant="secondary"
                onClick={() => setBulkRejectModalOpen(false)}
                disabled={bulkBusy}
              >
                Cancel
              </Button>
              <Button
                variant="danger-filled"
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
          <div className="modal-stack">
            {!shortlistSelectedMode ? (
              <div className="modal-stack">
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
                <div className="rank-list">
                  <span className="rank-list__title">
                    AI Screening Ranked Preview ({screenedCards.length} candidate{screenedCards.length === 1 ? "" : "s"}):
                  </span>
                  {sortedScreened.map((c, i) => {
                    const isTopN = i < Math.min(shortlistTopN, screenedCards.length);
                    return (
                      <div key={c.id} className={cn("rank-row", isTopN && "is-top")}>
                        <span className="rank-row__text">
                          <span className="rank-row__name">
                            #{i + 1} {blindMode ? `Candidate #${c.id.slice(-4)}` : c.candidate_name}
                            {isTopN ? (
                              <span className="rank-row__tag rank-row__tag--keep">[Shortlist]</span>
                            ) : shortlistRejectRemaining ? (
                              <span className="rank-row__tag rank-row__tag--reject">[Reject]</span>
                            ) : null}
                          </span>
                          {c.job_match_reasons && (
                            <span className="rank-row__reason" title={c.job_match_reasons}>
                              {c.job_match_reasons}
                            </span>
                          )}
                        </span>
                        <ScoreBadge score={c.job_match_score ?? c.profile_interview_score} label="Match" />
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="opt-box">
                <strong>{selectedScreened.length}</strong> candidate(s) selected to advance to{" "}
                <strong>Shortlisted</strong>.
              </div>
            )}

            <div className="opt-box">
              <label className="opt-check">
                <input
                  type="checkbox"
                  checked={shortlistRejectRemaining}
                  onChange={(e) => setShortlistRejectRemaining(e.target.checked)}
                />
                <span>
                  <strong>
                    Reject remaining un-shortlisted candidates ({unshortlistedCount} candidate{unshortlistedCount === 1 ? "" : "s"})
                  </strong>
                  <small>Applicants not meeting the shortlisting cutoff will transition to the Rejected stage.</small>
                </span>
              </label>

              {shortlistRejectRemaining && (
                <label className="opt-check opt-check--nested">
                  <input
                    type="checkbox"
                    checked={shortlistSendFeedback}
                    onChange={(e) => setShortlistSendFeedback(e.target.checked)}
                  />
                  <span>
                    <strong><LuSparkles size={13} aria-hidden="true" /> AI Loophole Analysis &amp; Growth Email:</strong>{" "}
                    <small>Pinpoint missing qualifications and email tailored advice on how to improve for their next application.</small>
                  </span>
                </label>
              )}
            </div>

            <div className="modal-actions">
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
          <div className="modal-stack">
            {!inviteSelectedMode ? (
              <div className="modal-stack">
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
                <div className="rank-list">
                  <span className="rank-list__title">
                    Ranked Preview (Top {Math.min(inviteTopN, shortlistedCards.length)} will be invited):
                  </span>
                  {sortedShortlisted.slice(0, Math.min(inviteTopN, shortlistedCards.length)).map((c, i) => (
                    <div key={c.id} className="rank-row">
                      <span className="rank-row__name">
                        #{i + 1} {blindMode ? `Candidate #${c.id.slice(-4)}` : c.candidate_name}
                      </span>
                      <ScoreBadge score={c.job_match_score ?? c.profile_interview_score} label="Match" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="opt-box">
                <strong>{selectedShortlisted.length}</strong> candidate(s) selected to advance to{" "}
                <strong>Applied Interview</strong>.
              </div>
            )}

            <div className="opt-box">
              <label className="opt-check">
                <input
                  type="checkbox"
                  checked={inviteRejectRemaining}
                  onChange={(e) => setInviteRejectRemaining(e.target.checked)}
                />
                <span>
                  <strong>
                    Reject remaining un-invited candidates ({uninvitedCount} candidate{uninvitedCount === 1 ? "" : "s"})
                  </strong>
                  <small>Applicants not invited to interview will transition to the Rejected stage.</small>
                </span>
              </label>

              {inviteRejectRemaining && (
                <label className="opt-check opt-check--nested">
                  <input
                    type="checkbox"
                    checked={inviteSendFeedback}
                    onChange={(e) => setInviteSendFeedback(e.target.checked)}
                  />
                  <span>
                    <strong><LuSparkles size={13} aria-hidden="true" /> AI Loophole Analysis &amp; Growth Email:</strong>{" "}
                    <small>Provide candidates actionable feedback on interview competencies and qualification improvements.</small>
                  </span>
                </label>
              )}
            </div>

            <div className="modal-actions">
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
        <div role="alert" className="undo-toast">
          <LuHistory size={17} aria-hidden="true" />
          <span>
            Moved <strong>{undoToast.candidateName}</strong> to <strong>{undoToast.stageLabel}</strong> ({undoSecondsLeft}s)
          </span>
          <Button variant="primary" size="sm" onClick={triggerUndo}>
            Undo
          </Button>
          <button
            type="button"
            className="icon-button"
            onClick={() => setUndoToast(null)}
            aria-label="Dismiss undo notification"
          >
            <LuX size={15} aria-hidden="true" />
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
          onClose={closeApplication}
          onChanged={reload}
          blindMode={blindMode}
        />
      )}
    </div>
  );
}
