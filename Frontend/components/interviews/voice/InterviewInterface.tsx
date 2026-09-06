"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRoomContext, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState, RoomEvent, LocalVideoTrack, createLocalVideoTrack, ParticipantEvent } from "livekit-client";
import { RiBrainLine, RiCameraLine, RiMessage3Line, RiMicLine } from "react-icons/ri";
import { Interview } from "@/types/tracking";
import { TranscriptEntry } from "./TranscriptOverlay";
import { publicApi } from "@/utils/api";
import EndInterviewModal from "./EndInterviewModal";
import MicLevelIndicator from "./MicLevelIndicator";

function mapStoredTranscriptEntry(entry: Record<string, unknown>): TranscriptEntry | null {
	const rawSpeaker = String(entry.role || entry.speaker || "agent").toLowerCase();
	const speaker: TranscriptEntry["speaker"] =
		rawSpeaker === "user" || rawSpeaker === "candidate" || rawSpeaker === "participant"
			? "user"
			: "agent";
	const text = String(entry.content || entry.text || entry.message || "").trim();
	if (!text) {
		return null;
	}
	return {
		speaker,
		text,
		timestamp: entry.timestamp ? String(entry.timestamp) : undefined
	};
}

function mapStoredTranscripts(entries: unknown): TranscriptEntry[] {
	if (!Array.isArray(entries)) {
		return [];
	}
	return entries
		.map((entry) =>
			entry && typeof entry === "object" ? mapStoredTranscriptEntry(entry as Record<string, unknown>) : null
		)
		.filter((entry): entry is TranscriptEntry => entry !== null);
}

function computeElapsedFromTranscripts(entries: unknown): number {
	if (!Array.isArray(entries) || entries.length === 0) {
		return 0;
	}
	const timestamps = entries
		.map((entry) => {
			if (!entry || typeof entry !== "object") {
				return NaN;
			}
			const raw = (entry as Record<string, unknown>).timestamp;
			return raw ? new Date(String(raw)).getTime() : NaN;
		})
		.filter((value) => Number.isFinite(value));
	if (timestamps.length === 0) {
		return 0;
	}
	const earliest = Math.min(...timestamps);
	return Math.max(0, Math.floor((Date.now() - earliest) / 1000));
}

interface InterviewInterfaceProps {
	interview: Interview;
	telemetrySocketUrl: string;
	/** Calls POST /complete — keeps LiveKit connected so the agent can speak closing. */
	onRequestInterviewComplete: () => Promise<void>;
	/** Switches the page to the “interview complete” screen (no API call). */
	onInterviewFinished: () => void;
	uiMode?: "setup" | "interview";
	onSetupStageChange?: (stage: string) => void;
	onSetupStatusChange?: (status: string) => void;
	onSetupFailed?: (detail: { error: string; sessionId?: string }) => void;
}

export default function InterviewInterface({
	interview,
	telemetrySocketUrl,
	onRequestInterviewComplete,
	onInterviewFinished,
	uiMode = "interview",
	onSetupStageChange,
	onSetupStatusChange,
	onSetupFailed
}: InterviewInterfaceProps) {
	const room = useRoomContext();
	const { localParticipant } = useLocalParticipant();

	const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
	const [isAgentTurnPending, setIsAgentTurnPending] = useState(false);
	const [isUserSpeaking, setIsUserSpeaking] = useState(false);
	// Sticky lock after 2-minute answer cap — keeps mic off until agent finishes reply.
	const [isAnswerTimeCapLocked, setIsAnswerTimeCapLocked] = useState(false);
	const answerTimeCapLockedRef = useRef(false);
	const [transcript, setTranscript] = useState<TranscriptEntry[]>(() => mapStoredTranscripts(interview.transcripts));
	const [isMuted, setIsMuted] = useState(false);
	const [isCameraOn, setIsCameraOn] = useState(false);
	const [interviewerName, setInterviewerName] = useState("Interviewer");
	const [localVideoTrack, setLocalVideoTrack] = useState<LocalVideoTrack | null>(null);
	const [setupStatus, setSetupStatus] = useState("Establishing secure connection...");
	const [isTelemetryConnected, setIsTelemetryConnected] = useState(false);
	const [isRoomConnected, setIsRoomConnected] = useState(room.state === ConnectionState.Connected);
	const [hasStartedInterview, setHasStartedInterview] = useState(false);
	const [isInterviewReady, setIsInterviewReady] = useState(
		() => interview.status !== "PENDING" && mapStoredTranscripts(interview.transcripts).length > 0
	);
	const [, setHasAgentFinishedOpening] = useState(
		() => mapStoredTranscripts(interview.transcripts).some((e) => e.speaker === "agent")
	);
	const [showEndModal, setShowEndModal] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<number | null>(null);
	const completionNotifiedRef = useRef(false);
	const completionWaitersRef = useRef<Array<() => void>>([]);
	const hasInitializedMicRef = useRef(false);
	const hasInitializedCamRef = useRef(false);
	const onRequestInterviewCompleteRef = useRef(onRequestInterviewComplete);
	const onInterviewFinishedRef = useRef(onInterviewFinished);
	const startRequestInFlightRef = useRef(false);
	const selfVideoRef = useRef<HTMLVideoElement | null>(null);
	const identityCheckSentRef = useRef(false);
	const stopAndUploadRecordingRef = useRef<() => Promise<void>>(async () => { });
	const finalizeInterviewSessionRef = useRef<() => Promise<void>>(async () => { });
	// Client-side recording
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const recordingChunksRef = useRef<Blob[]>([]);
	const isRecordingRef = useRef(false);
	const audioContextRef = useRef<AudioContext | null>(null);
	const mixedAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
	const remoteAudioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
	const localMicSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
	const detachRoomAudioListenersRef = useRef<(() => void) | null>(null);
	const transcriptScrollRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const loaded = mapStoredTranscripts(interview.transcripts);
		if (loaded.length === 0) {
			return;
		}
		setTranscript((prev) => (prev.length > 0 ? prev : loaded));
		const resumedElapsed = computeElapsedFromTranscripts(interview.transcripts);
		if (resumedElapsed > 0) {
			setElapsedTime((prev) => Math.max(prev, resumedElapsed));
		}
	}, [interview.transcripts]);

	useLayoutEffect(() => {
		const el = transcriptScrollRef.current;
		if (!el) return;
		// Keep transcript pinned to latest content when messages arrive or bottom chrome changes height.
		el.scrollTop = el.scrollHeight;
	}, [transcript, isAgentSpeaking, isMuted, setupStatus]);

	useEffect(() => {
		onRequestInterviewCompleteRef.current = onRequestInterviewComplete;
		onInterviewFinishedRef.current = onInterviewFinished;
	}, [onRequestInterviewComplete, onInterviewFinished]);

	const notifyCompletionWaiters = () => {
		for (const resolve of completionWaitersRef.current) {
			resolve();
		}
		completionWaitersRef.current = [];
	};

	const waitForInterviewCompletedEvent = (timeoutMs: number) =>
		new Promise<void>((resolve, reject) => {
			if (completionNotifiedRef.current) {
				resolve();
				return;
			}
			const timer = window.setTimeout(() => {
				completionWaitersRef.current = completionWaitersRef.current.filter((r) => r !== done);
				reject(new Error("Timed out waiting for interview completion"));
			}, timeoutMs);
			const done = () => {
				window.clearTimeout(timer);
				resolve();
			};
			completionWaitersRef.current.push(done);
		});

	useEffect(() => {
		finalizeInterviewSessionRef.current = async () => {
			await stopAndUploadRecordingRef.current();
			if (localVideoTrack) {
				localVideoTrack.stop();
			}
			if (room) {
				room.disconnect();
			}
			onInterviewFinishedRef.current();
		};
	}, [localVideoTrack, room]);

	useEffect(() => {
		onSetupStatusChange?.(setupStatus);
	}, [onSetupStatusChange, setupStatus]);

	// Safety: if backend says agent is speaking but never ends, unlock the UI.
	useEffect(() => {
		if (!isAgentSpeaking) {
			return;
		}
		const timeoutId = window.setTimeout(() => {
			console.warn("Agent speaking state timed out — clearing UI speaking flag");
			setIsAgentSpeaking(false);
			setIsAgentTurnPending(false);
		}, 45000);
		return () => window.clearTimeout(timeoutId);
	}, [isAgentSpeaking]);

	// Keep the candidate mic off while the room/agent is preparing or the interviewer is speaking.
	useEffect(() => {
		if (!isRoomConnected || !localParticipant || !hasStartedInterview) {
			return;
		}

		const shouldEnableMic =
			uiMode === "interview" &&
			isInterviewReady &&
			!isAgentSpeaking &&
			!isAgentTurnPending &&
			!isAnswerTimeCapLocked;

		if (shouldEnableMic && !hasInitializedMicRef.current) {
			hasInitializedMicRef.current = true;
		}

		localParticipant
			.setMicrophoneEnabled(shouldEnableMic, {
				autoGainControl: true,
				echoCancellation: true,
				noiseSuppression: true
			})
			.then(() => {
				setIsMuted(!shouldEnableMic);
			})
			.catch((err) => {
				if (shouldEnableMic) {
					hasInitializedMicRef.current = false;
				}
				console.error("Failed to toggle microphone", err);
				if (shouldEnableMic) {
					setSetupStatus("Microphone access is required to continue.");
				}
			});
	}, [
		hasStartedInterview,
		isAgentSpeaking,
		isAgentTurnPending,
		isAnswerTimeCapLocked,
		isInterviewReady,
		isRoomConnected,
		localParticipant,
		uiMode
	]);

	const unlockCandidateMic = () => {
		answerTimeCapLockedRef.current = false;
		setIsAnswerTimeCapLocked(false);
		setIsAgentTurnPending(false);
		setIsAgentSpeaking(false);
		setIsUserSpeaking(false);
	};

	// Relay local speaking state to the backend so long answers are not mistaken for silence.
	useEffect(() => {
		if (!localParticipant || !isRoomConnected || !hasStartedInterview || uiMode !== "interview") {
			return;
		}

		const sendUserAudioActivity = (active: boolean) => {
			const ws = wsRef.current;
			if (!ws || ws.readyState !== WebSocket.OPEN) {
				return;
			}
			// Always send "stopped" so the backend can clear sticky speaking flags
			// when the mic mutes for agent prep. Only suppress "started" while muted
			// / agent is speaking / agent turn is pending.
			if (active && (isMuted || isAgentSpeaking || isAgentTurnPending || isAnswerTimeCapLocked)) {
				return;
			}
			ws.send(
				JSON.stringify({
					type: "user_audio_activity",
					content: { active }
				})
			);
		};

		const onSpeakingChanged = (speaking: boolean) => {
			setIsUserSpeaking(speaking);
			sendUserAudioActivity(speaking);
		};

		// When agent prep/speech starts, force a stop signal so backend reply
		// scheduling is not blocked by a leftover active=true.
		if (isMuted || isAgentSpeaking || isAgentTurnPending || isAnswerTimeCapLocked) {
			sendUserAudioActivity(false);
			setIsUserSpeaking(false);
		}

		localParticipant.on(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
		return () => {
			localParticipant.off(ParticipantEvent.IsSpeakingChanged, onSpeakingChanged);
		};
	}, [
		hasStartedInterview,
		isAgentSpeaking,
		isAgentTurnPending,
		isAnswerTimeCapLocked,
		isMuted,
		isRoomConnected,
		localParticipant,
		uiMode
	]);

	// Publish camera track once after interview starts.
	useEffect(() => {
		if (!isRoomConnected || !localParticipant || hasInitializedCamRef.current || !hasStartedInterview) return;
		hasInitializedCamRef.current = true;

		createLocalVideoTrack({ facingMode: "user" })
			.then(async (track) => {
				await localParticipant.publishTrack(track);
				setLocalVideoTrack(track);
				setIsCameraOn(true);
			})
			.catch((err) => {
				hasInitializedCamRef.current = false;
				console.warn("Camera not available:", err);
			});
	}, [hasStartedInterview, isRoomConnected, localParticipant]);

	// Silent one-shot identity verification: once the camera is live, capture a
	// single frame and match it against the candidate's profile photo. The
	// interview continues exactly the same regardless of the outcome — the
	// verdict is recorded on the attempt and surfaced in the report.
	useEffect(() => {
		if (!hasStartedInterview || !isRoomConnected || !localVideoTrack || uiMode !== "interview") {
			return;
		}
		if (identityCheckSentRef.current) {
			return;
		}
		identityCheckSentRef.current = true;

		let cancelled = false;
		const attemptCapture = (attemptsLeft: number) => {
			if (cancelled || completionNotifiedRef.current) return;
			const video = selfVideoRef.current;
			if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
				if (attemptsLeft > 0) {
					window.setTimeout(() => attemptCapture(attemptsLeft - 1), 1500);
				}
				return;
			}
			try {
				const canvas = document.createElement("canvas");
				canvas.width = video.videoWidth;
				canvas.height = video.videoHeight;
				const context = canvas.getContext("2d");
				if (!context) return;
				context.drawImage(video, 0, 0, canvas.width, canvas.height);
				const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
				void publicApi
					.verifyIdentity(interview.access_token, dataUrl)
					.catch((err) => console.warn("Identity check request failed:", err));
			} catch (err) {
				console.warn("Identity frame capture failed:", err);
			}
		};

		const timer = window.setTimeout(() => attemptCapture(4), 2500);
		return () => {
			cancelled = true;
			window.clearTimeout(timer);
		};
	}, [hasStartedInterview, isRoomConnected, localVideoTrack, uiMode, interview.access_token]);

	// Attach local video track to the self-view <video> once it exists.
	// During LiveKit setup, uiMode is "setup" and the video node is not mounted; the track may
	// already be published before we switch to "interview", so we must re-attach when uiMode changes.
	useEffect(() => {
		if (!localVideoTrack || uiMode !== "interview") return;
		const el = selfVideoRef.current;
		if (!el) return;

		localVideoTrack.attach(el);
		void el.play().catch(() => { });

		// Start client-side MediaRecorder once we have a video track on a real element
		startClientRecording();

		return () => {
			localVideoTrack.detach(el);
		};
	}, [localVideoTrack, uiMode]);

	const getRemoteTrackKey = (track: { sid?: string; mediaStreamTrack?: MediaStreamTrack | null }): string | null => {
		if (track.sid) {
			return track.sid;
		}
		if (track.mediaStreamTrack?.id) {
			return track.mediaStreamTrack.id;
		}
		return null;
	};

	const connectRemoteAudioTrackToMixer = (track: {
		kind?: string;
		sid?: string;
		mediaStreamTrack?: MediaStreamTrack | null;
	}) => {
		if (track.kind !== "audio") return;

		const audioCtx = audioContextRef.current;
		const mixDest = mixedAudioDestinationRef.current;
		const mediaStreamTrack = track.mediaStreamTrack ?? null;
		const trackKey = getRemoteTrackKey(track);

		if (!audioCtx || !mixDest || !mediaStreamTrack || !trackKey) return;
		if (remoteAudioSourcesRef.current.has(trackKey)) return;

		try {
			const source = audioCtx.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
			source.connect(mixDest);
			remoteAudioSourcesRef.current.set(trackKey, source);
		} catch (err) {
			console.warn("Failed to connect remote audio track to recording mix:", err);
		}
	};

	const disconnectRemoteAudioTrackFromMixer = (track: { sid?: string; mediaStreamTrack?: MediaStreamTrack | null }) => {
		const trackKey = getRemoteTrackKey(track);
		if (!trackKey) return;

		const existingSource = remoteAudioSourcesRef.current.get(trackKey);
		if (!existingSource) return;

		try {
			existingSource.disconnect();
		} catch {
			// no-op
		}
		remoteAudioSourcesRef.current.delete(trackKey);
	};

	const syncExistingRemoteAudioTracks = () => {
		room.remoteParticipants.forEach((participant) => {
			participant.audioTrackPublications.forEach((pub) => {
				if (pub.track) {
					connectRemoteAudioTrackToMixer(pub.track);
				}
			});
		});
	};

	// Track LiveKit room connectivity so we only start interview when room is actually connected.
	useEffect(() => {
		const syncRoomState = () => {
			setIsRoomConnected(room.state === ConnectionState.Connected);
		};

		syncRoomState();
		room.on(RoomEvent.Connected, syncRoomState);
		room.on(RoomEvent.Disconnected, syncRoomState);

		return () => {
			room.off(RoomEvent.Connected, syncRoomState);
			room.off(RoomEvent.Disconnected, syncRoomState);
		};
	}, [room]);

	// Connect Telemetry WebSocket
	useEffect(() => {
		let canceled = false;
		let retryCount = 0;
		const maxRetries = 5;

		const clearRetryTimer = () => {
			if (reconnectTimerRef.current !== null) {
				window.clearTimeout(reconnectTimerRef.current);
				reconnectTimerRef.current = null;
			}
		};

		const connectTelemetry = () => {
			if (canceled || completionNotifiedRef.current) {
				return;
			}

			const ws = new WebSocket(telemetrySocketUrl);
			wsRef.current = ws;

			ws.onopen = () => {
				if (canceled) {
					return;
				}
				retryCount = 0;
				console.log("Telemetry WebSocket connected");
				setIsTelemetryConnected(true);
				setSetupStatus("Telemetry connected. Preparing interview...");
			};

			ws.onmessage = (event) => {
				if (canceled) {
					return;
				}
				try {
					const msg = JSON.parse(event.data);
					console.log("Telemetry Message: ", msg);

					switch (msg.type) {
						case "interviewer_identity":
							if (msg.content?.name) {
								const name = String(msg.content.name).trim();
								if (name) {
									setInterviewerName(name);
								}
							}
							break;
						case "agent_turn_pending":
							setIsUserSpeaking(false);
							setIsAgentTurnPending(true);
							break;
						case "agent_turn_cleared":
							setIsAgentTurnPending(false);
							break;
						case "agent_speech_started":
							setIsAgentTurnPending(false);
							setIsAgentSpeaking(true);
							break;
						case "agent_speech_ended":
							setIsAgentTurnPending(false);
							setIsAgentSpeaking(false);
							// ALWAYS unlock the candidate mic when agent audio ends —
							// including ghost/empty clears. The sticky cap lock used to
							// ignore speech_interrupted_empty and left the mic off forever.
							answerTimeCapLockedRef.current = false;
							setIsAnswerTimeCapLocked(false);
							if (msg.content?.reason !== "ghost_speaking_cleared"
								&& msg.content?.reason !== "opening_greeting_retry"
								&& msg.content?.reason !== "opening_greeting_failed"
								&& msg.content?.reason !== "speech_interrupted_empty") {
								setHasAgentFinishedOpening(true);
							}
							break;
						case "user_turn_granted":
							// Authoritative backend signal: candidate may speak now.
							unlockCandidateMic();
							void localParticipant?.setMicrophoneEnabled(true, {
								autoGainControl: true,
								echoCancellation: true,
								noiseSuppression: true
							}).catch(() => {});
							break;
						case "answer_time_cap":
							// Hard-mute at the 2-minute answer limit until agent finishes.
							answerTimeCapLockedRef.current = true;
							setIsUserSpeaking(false);
							setIsMuted(true);
							setIsAnswerTimeCapLocked(true);
							setIsAgentTurnPending(true);
							// Do NOT fake isAgentSpeaking — that trapped the mic when
							// speech_interrupted_empty arrived before real agent audio.
							void localParticipant?.setMicrophoneEnabled(false).catch(() => {});
							break;
						case "user_speech_started":
							// Ignore while cap-locked — late VAD must not re-open the mic UI.
							if (answerTimeCapLockedRef.current) {
								break;
							}
							setIsAgentTurnPending(false);
							setIsUserSpeaking(true);
							break;
                        case "user_speech_ended":
							setIsUserSpeaking(false);
							if (msg.content?.reason === "answer_time_cap") {
								answerTimeCapLockedRef.current = true;
								setIsMuted(true);
								setIsAnswerTimeCapLocked(true);
								setIsAgentTurnPending(true);
								void localParticipant?.setMicrophoneEnabled(false).catch(() => {});
							}
							break;
						case "new_transcript_message":
							if (msg.content) {
								const mapped = mapStoredTranscriptEntry(msg.content as Record<string, unknown>);
								if (mapped) {
									setTranscript((prev) => [...prev, mapped]);
								}
							}
							break;
						case "transcript_history":
							if (Array.isArray(msg.content?.messages)) {
								const loaded = mapStoredTranscripts(msg.content.messages);
								if (loaded.length > 0) {
									setTranscript(loaded);
									const resumedElapsed = computeElapsedFromTranscripts(msg.content.messages);
									if (resumedElapsed > 0) {
										setElapsedTime((prev) => Math.max(prev, resumedElapsed));
									}
									if (loaded.some((entry) => entry.speaker === "agent")) {
										setHasAgentFinishedOpening(true);
									}
								}
							}
							break;
						case "setting_up_interview":
							const status = msg.content?.status;
							console.log("Setting up interview status:", status);
							if (status === "generating_persona") {
								setSetupStatus("Preparing your interviewer profile...");
								onSetupStageChange?.("prompt_generation");
							} else if (status === "connecting_to_room") {
								setSetupStatus("Connecting to the interview room...");
								onSetupStageChange?.("setting_up");
							} else if (status === "initializing_agents") {
								setSetupStatus("Initializing interview session...");
								onSetupStageChange?.("agent_initialization");
							} else if (status === "reconnecting_realtime") {
								setSetupStatus("Realtime connection interrupted. Reconnecting...");
								setIsInterviewReady(false);
								setHasAgentFinishedOpening(false);
							} else if (status === "realtime_recovered") {
								setSetupStatus("Realtime connection restored. Continuing interview...");
								setIsInterviewReady(true);
							}
							break;
						case "interview_setup_complete":
							console.log("Interview setup complete");
							setSetupStatus("Your interviewer is ready and joining the conversation...");
							setIsInterviewReady(true);
							onSetupStageChange?.("setup_complete");
							break;
						case "interview_completed":
							setIsAgentTurnPending(false);
							setIsAgentSpeaking(false);
							setIsUserSpeaking(false);
							setSetupStatus("Interview complete. Finalizing results...");
							if (!completionNotifiedRef.current) {
								completionNotifiedRef.current = true;
								notifyCompletionWaiters();
								void finalizeInterviewSessionRef.current();
							}
							break;
						case "interview_failed":
							setIsAgentSpeaking(false);
							if (msg.content?.reason === "invalid_realtime_model") {
								setSetupStatus("Interview setup failed due to an unsupported realtime model. Please contact support.");
							} else {
								setSetupStatus("Interview failed. Please refresh and try again.");
							}
							break;
						case "interview_setup_failed": {
							const rawErr = msg.content?.error;
							const err =
								rawErr != null && String(rawErr).trim()
									? String(rawErr).trim()
									: "Failed to initialize interview. Please try again.";
							const sessionId = msg.content?.session_id != null ? String(msg.content.session_id) : undefined;
							startRequestInFlightRef.current = false;
							setHasStartedInterview(false);
							setIsInterviewReady(false);
							setHasAgentFinishedOpening(false);
							hasInitializedMicRef.current = false;
							setSetupStatus(err);
							onSetupFailed?.({ error: err, sessionId });
							break;
						}
					}
				} catch (e) {
					console.error("Failed parsing WS message", e);
				}
			};

			ws.onerror = () => {
				// Browser emits generic Event objects here; avoid noisy console.error stack traces.
				if (!canceled && !completionNotifiedRef.current) {
					console.warn("Telemetry WebSocket encountered a transient error event.");
				}
			};

			ws.onclose = (event) => {
				setIsTelemetryConnected(false);

				if (canceled || completionNotifiedRef.current) {
					return;
				}

				// Policy violation/unauthorized errors should not auto-retry.
				if (event.code === 1008) {
					setSetupStatus("Interview link is invalid or expired.");
					return;
				}

				if (retryCount < maxRetries) {
					retryCount += 1;
					const delayMs = Math.min(5000, 500 * 2 ** (retryCount - 1));
					setSetupStatus("Connection interrupted. Reconnecting...");
					clearRetryTimer();
					reconnectTimerRef.current = window.setTimeout(connectTelemetry, delayMs);
					return;
				}

				setSetupStatus("Connection closed. Refresh if interview does not continue.");
			};
		};

		connectTelemetry();

		return () => {
			canceled = true;
			clearRetryTimer();
			const ws = wsRef.current;
			if (ws && ws.readyState === WebSocket.OPEN) {
				ws.close(1000, "component unmount");
			} else if (ws) {
				ws.close();
			}
			wsRef.current = null;
			setIsTelemetryConnected(false);
		};
	}, [onSetupFailed, telemetrySocketUrl]);

	// Start backend interview only after BOTH telemetry and room are connected.
	useEffect(() => {
		const startInterviewWhenReady = async () => {
			if (!isTelemetryConnected || !isRoomConnected || hasStartedInterview || startRequestInFlightRef.current) {
				return;
			}

			startRequestInFlightRef.current = true;

			try {
				if (interview.status !== "PENDING") {
					setSetupStatus("Rejoining active interview session...");
				} else {
					setSetupStatus("Connected to room. Starting interviewer...");
				}

				const response = await publicApi.startInterview(interview.access_token);
				setHasStartedInterview(true);

				if (response?.data?.status === "already_in_progress") {
					setSetupStatus("Rejoining active interview session...");
					setIsInterviewReady(true);
					setHasAgentFinishedOpening(mapStoredTranscripts(interview.transcripts).some((e) => e.speaker === "agent"));
					onSetupStageChange?.("setup_complete");
				}

				if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
					wsRef.current.send(JSON.stringify({ type: "participant_joined" }));
				}
			} catch (err) {
				startRequestInFlightRef.current = false;
				console.error("Failed to start interview agent", err);
				setSetupStatus("Unable to start interview. Please refresh and try again.");
			}
		};

		startInterviewWhenReady();
	}, [hasStartedInterview, interview.access_token, interview.status, isRoomConnected, isTelemetryConnected]);

	// UX fallback so user is not stuck on the same status forever.
	useEffect(() => {
		if (transcript.length > 0 || setupStatus !== "Your interviewer is ready and joining the conversation...") {
			return;
		}

		const timeoutId = window.setTimeout(() => {
			setSetupStatus('Connected. If the interviewer does not speak, say "Hello" to begin.');
		}, 12000);

		return () => window.clearTimeout(timeoutId);
	}, [setupStatus, transcript.length]);

	// ─── Client-side MediaRecorder helpers ──────────────────────────────────────
	const startClientRecording = async () => {
		if (isRecordingRef.current) return;
		try {
			// ── 1. Reuse LiveKit's already-open video track (no second getUserMedia) ──
			// localVideoTrack is the track already published to the room.
			const videoMediaTrack = localVideoTrack?.mediaStreamTrack ?? null;

			// ── 2. Reuse LiveKit's already-open mic track ─────────────────────────────
			let micMediaTrack: MediaStreamTrack | null = null;
			localParticipant?.audioTrackPublications.forEach((pub) => {
				if (pub.track?.mediaStreamTrack) {
					micMediaTrack = pub.track.mediaStreamTrack;
				}
			});

			// ── 3. Build a Web Audio mixer to combine mic + AI remote audio ───────────
			const audioCtx = new AudioContext();
			audioContextRef.current = audioCtx;
			const mixDest = audioCtx.createMediaStreamDestination();
			mixedAudioDestinationRef.current = mixDest;

			// Pipe local mic into the mix (reused — no new hardware capture)
			if (micMediaTrack) {
				const micSource = audioCtx.createMediaStreamSource(new MediaStream([micMediaTrack]));
				micSource.connect(mixDest);
				localMicSourceRef.current = micSource;
			}

			// Pipe current and future remote participant audio (the AI agent) into the mix.
			syncExistingRemoteAudioTracks();

			detachRoomAudioListenersRef.current?.();
			const handleTrackSubscribed = (track: {
				kind?: string;
				sid?: string;
				mediaStreamTrack?: MediaStreamTrack | null;
			}) => {
				connectRemoteAudioTrackToMixer(track);
			};
			const handleTrackUnsubscribed = (track: { sid?: string; mediaStreamTrack?: MediaStreamTrack | null }) => {
				disconnectRemoteAudioTrackFromMixer(track);
			};

			room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
			room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
			detachRoomAudioListenersRef.current = () => {
				room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
				room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
			};

			// ── 4. Assemble the final stream: local video + mixed audio ───────────────
			const tracks: MediaStreamTrack[] = [];
			if (videoMediaTrack) tracks.push(videoMediaTrack);
			const mixedAudio = mixDest.stream.getAudioTracks()[0];
			if (mixedAudio) tracks.push(mixedAudio);

			if (tracks.length === 0) {
				console.warn("No tracks available for recording.");
				return;
			}

			// ── 5. Start recording ────────────────────────────────────────────────────
			const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
				? "video/webm;codecs=vp9,opus"
				: "video/webm";
			const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType });
			recordingChunksRef.current = [];
			recorder.ondataavailable = (e) => {
				if (e.data.size > 0) recordingChunksRef.current.push(e.data);
			};
			recorder.start(1000);
			mediaRecorderRef.current = recorder;
			isRecordingRef.current = true;
		} catch (err) {
			console.warn("Client-side recording could not start:", err);
		}
	};

	const stopAndUploadRecording = async () => {
		if (!isRecordingRef.current || !mediaRecorderRef.current) return;
		isRecordingRef.current = false;

		return new Promise<void>((resolve) => {
			const recorder = mediaRecorderRef.current!;
			recorder.onstop = async () => {
				try {
					const blob = new Blob(recordingChunksRef.current, { type: "video/webm" });
					if (blob.size > 0) {
						await publicApi.uploadRecording(interview.access_token, blob);
					}
				} catch (err) {
					console.warn("Failed to upload recording:", err);
				} finally {
					detachRoomAudioListenersRef.current?.();
					detachRoomAudioListenersRef.current = null;

					remoteAudioSourcesRef.current.forEach((source) => {
						try {
							source.disconnect();
						} catch {
							/* no-op */
						}
					});
					remoteAudioSourcesRef.current.clear();
					localMicSourceRef.current?.disconnect();
					localMicSourceRef.current = null;
					mixedAudioDestinationRef.current = null;
					audioContextRef.current?.close();
					audioContextRef.current = null;
					resolve();
				}
			};
			recorder.stop();
			// Stop all underlying hardware tracks so the camera/mic indicator turns off
			recorder.stream?.getTracks().forEach((t) => t.stop());
		});
	};
	stopAndUploadRecordingRef.current = stopAndUploadRecording;

	const interviewerDisplayName = interviewerName?.trim() || "Interviewer";
	const participantLabel = interview.participant?.full_name || "Participant";

	// ATS-like timer (PTS does not currently provide a duration field)
	const INTERVIEW_DURATION_MINUTES = 10;
	const [elapsedTime, setElapsedTime] = useState(() => computeElapsedFromTranscripts(interview.transcripts));
	const timerRef = useRef<number | null>(null);

	useEffect(() => {
		if (timerRef.current) window.clearInterval(timerRef.current);
		timerRef.current = window.setInterval(() => setElapsedTime((t) => t + 1), 1000);
		return () => {
			if (timerRef.current) window.clearInterval(timerRef.current);
			timerRef.current = null;
		};
	}, []);

	const agentSpeaking = isAgentSpeaking;
	const userSpeaking = isUserSpeaking;
	const awaitingAgentReply = isAgentTurnPending;
	const isCameraOff = !localVideoTrack || !isCameraOn;

	const CircularTimer = ({ elapsedSeconds }: { elapsedSeconds: number }) => {
		const elapsedMinutes = Math.floor(elapsedSeconds / 60);
		const elapsedSecs = elapsedSeconds % 60;
		const totalSeconds = INTERVIEW_DURATION_MINUTES * 60;
		const isNearEnd = totalSeconds > 0 && elapsedSeconds >= totalSeconds * 0.85;

		return (
			<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
				<span
					style={{
						fontFamily: "var(--font-mono)",
						fontSize: "1rem",
						fontWeight: 600,
						letterSpacing: "-0.02em",
						color: isNearEnd ? "var(--color-error)" : "var(--color-text)",
						fontVariantNumeric: "tabular-nums"
					}}
				>
					{elapsedMinutes.toString().padStart(2, "0")}:{elapsedSecs.toString().padStart(2, "0")}
				</span>
				<span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>elapsed</span>
			</div>
		);
	};

	const AudioWaveBars = ({ active, color }: { active: boolean; color: "primary" | "emerald" }) => {
		const barColor = color === "emerald" ? "rgba(34,197,94,0.9)" : "rgba(37,99,235,0.9)";
		const idleColor = "rgba(100,116,139,0.55)";
		const heights = [5, 8, 12, 9, 14, 11, 7, 13, 10, 6];
		return (
			<div style={{ display: "flex", height: "20px", alignItems: "flex-end", gap: "2px" }}>
				{heights.map((h, i) => (
					<div
						key={i}
						className={active ? "animate-pulse" : undefined}
						style={{
							width: "3px",
							borderRadius: "999px",
							height: active ? `${h}px` : "3px",
							backgroundColor: active ? barColor : idleColor,
							opacity: active ? 1 : 0.8,
							transition: "height 300ms",
							animationDelay: `${i * 0.07}s`
						}}
					/>
				))}
			</div>
		);
	};

	const AIAvatar = ({ speaking }: { speaking: boolean }) => (
		<div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
			<div
				style={{
					position: "relative",
					width: "44px",
					height: "44px",
					borderRadius: "999px",
					background: "linear-gradient(135deg, rgba(30,41,59,1) 0%, rgba(15,23,42,1) 100%)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					transition: "all 500ms",
					boxShadow: speaking ? "0 0 0 2px rgba(37,99,235,0.45), 0 0 0 6px rgba(37,99,235,0.14)" : undefined
				}}
			>
				<RiBrainLine size={20} color="rgba(147,197,253,0.95)" aria-hidden />
			</div>
			<p
				style={{
					margin: 0,
					fontSize: "10px",
					fontWeight: 800,
					letterSpacing: "0.12em",
					color: "rgba(255,255,255,0.82)"
				}}
			>
				AI INTERVIEWER
			</p>
			<AudioWaveBars active={speaking} color="primary" />
		</div>
	);

	const TranscriptMessage = ({
		text,
		isLatest,
		timeLabel,
		speaker = "agent"
	}: {
		text: string;
		isLatest: boolean;
		timeLabel?: string;
		speaker?: "agent" | "user";
	}) => {
		const isUser = speaker === "user";
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: isUser ? "flex-end" : "flex-start",
					gap: "3px"
				}}
			>
				<span style={{ padding: "0 2px", fontSize: "0.625rem", color: "var(--color-text-muted)" }}>
					{isUser ? participantLabel : "AI Interviewer"}
				</span>
				<div
					style={{
						maxWidth: "92%",
						backgroundColor: isUser
							? "var(--color-success-light)"
							: isLatest
								? "var(--color-accent-light)"
								: "var(--color-bg-subtle)",
						border: isUser
							? "1px solid var(--color-success-border)"
							: isLatest
								? "1px solid var(--color-accent-border)"
								: "1px solid var(--color-border)",
						padding: "8px 10px",
						borderRadius: "var(--radius-lg)"
					}}
				>
					<p
						style={{
							margin: 0,
							fontSize: "0.8125rem",
							lineHeight: 1.5,
							color: "var(--color-text)"
						}}
					>
						{text}
					</p>
					{timeLabel ? (
						<div
							style={{
								marginTop: "4px",
								fontSize: "0.625rem",
								color: "var(--color-text-muted)"
							}}
						>
							{timeLabel}
						</div>
					) : null}
				</div>
			</div>
		);
	};

	return (
		<div
			className="animate-fade-up"
			style={{
				display: "flex",
				flexDirection: "column",
				flex: 1,
				minHeight: 0,
				height: "100%"
			}}
		>
			{uiMode === "setup" ? null : (
				<main
					className="interview-stage"
					style={{
						margin: "0 auto",
						width: "100%",
						maxWidth: "960px",
						padding: "16px",
						display: "flex",
						flexDirection: "column",
						gap: "14px",
						flex: 1,
						minHeight: 0,
						overflow: "hidden",
						boxSizing: "border-box"
					}}
				>
					{/* Header */}
					<div
						className="card"
						style={{
							padding: "12px 16px",
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: "12px",
							flexShrink: 0
						}}
					>
						<div style={{ minWidth: 0 }}>
							<h1
								style={{
									fontSize: "0.9375rem",
									fontWeight: 700,
									color: "var(--color-text)",
									margin: 0,
									letterSpacing: "-0.02em"
								}}
							>
								Job Interview
							</h1>
							<p
								style={{
									margin: "2px 0 0",
									fontSize: "0.75rem",
									color: "var(--color-text-secondary)",
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis"
								}}
							>
								{isRoomConnected ? "Connected" : "Connecting…"} · {interviewerDisplayName}
							</p>
						</div>

						<div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
							<CircularTimer elapsedSeconds={elapsedTime} />
							<button
								className="btn btn-ghost"
								onClick={() => setShowEndModal(true)}
								style={{
									border: "1px solid var(--color-error-border, rgba(220,38,38,0.35))",
									color: "var(--color-error)",
									padding: "6px 12px",
									fontSize: "0.8125rem"
								}}
							>
								End
							</button>
						</div>
					</div>

					{/* Stage: constrained video + compact transcript */}
					<div
						className="interview-stage-grid"
						style={{
							display: "grid",
							flex: 1,
							minHeight: 0,
							width: "100%",
							gap: "14px",
							gridTemplateColumns: "minmax(0, 1fr) minmax(260px, 300px)",
							gridTemplateRows: "minmax(0, 1fr)",
							alignItems: "start",
							overflow: "hidden"
						}}
					>
						{/* Video — fixed 16:9, not stretched */}
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								gap: "10px",
								minWidth: 0,
								width: "min(100%, 640px)",
								justifySelf: "center"
							}}
						>
							<div
								style={{
									position: "relative",
									width: "100%",
									aspectRatio: "16 / 9",
									overflow: "hidden",
									borderRadius: "var(--radius-xl)",
									backgroundColor: "#0f172a",
									border: userSpeaking
										? "1px solid var(--color-success-border)"
										: "1px solid var(--color-border)",
									boxShadow: "var(--shadow-card)",
									transition: "border-color 200ms"
								}}
							>
								<video
									ref={selfVideoRef}
									autoPlay
									playsInline
									muted
									style={{
										position: "absolute",
										inset: 0,
										width: "100%",
										height: "100%",
										objectFit: "cover",
										transform: "scaleX(-1)",
										opacity: isCameraOff ? 0 : 1,
										transition: "opacity 200ms"
									}}
								/>

								{isCameraOff && (
									<div
										style={{
											position: "absolute",
											inset: 0,
											display: "flex",
											flexDirection: "column",
											alignItems: "center",
											justifyContent: "center",
											backgroundColor: "#0f172a",
											gap: "8px"
										}}
									>
										<div
											style={{
												width: "48px",
												height: "48px",
												borderRadius: "999px",
												backgroundColor: "rgba(30,41,59,1)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center"
											}}
										>
											<RiCameraLine size={22} color="rgba(148,163,184,0.9)" aria-hidden />
										</div>
										<p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
											Camera starting…
										</p>
									</div>
								)}

								<div
									style={{
										position: "absolute",
										left: "12px",
										bottom: "12px",
										display: "flex",
										alignItems: "center",
										gap: "6px",
										borderRadius: "var(--radius-md)",
										padding: "5px 10px",
										backgroundColor: "rgba(15,23,42,0.72)",
										backdropFilter: "blur(6px)"
									}}
								>
									<span
										style={{
											width: "6px",
											height: "6px",
											borderRadius: "999px",
											backgroundColor: isMuted
												? "var(--color-text-muted)"
												: "var(--color-success)"
										}}
									/>
									<span style={{ fontSize: "0.75rem", fontWeight: 600, color: "#fff" }}>
										{participantLabel}
									</span>
								</div>

								<div
									style={{
										position: "absolute",
										right: "12px",
										bottom: "12px",
										width: "112px",
										borderRadius: "var(--radius-lg)",
										border: "1px solid rgba(255,255,255,0.12)",
										backgroundColor: "rgba(15,23,42,0.88)",
										backdropFilter: "blur(8px)",
										overflow: "hidden"
									}}
								>
									<div style={{ padding: "10px 8px", display: "flex", justifyContent: "center" }}>
										<AIAvatar speaking={agentSpeaking} />
									</div>
								</div>
							</div>

							<div
								style={{
									display: "flex",
									alignItems: "center",
									gap: "10px",
									padding: "8px 10px",
									borderRadius: "var(--radius-lg)",
									backgroundColor: "var(--color-surface)",
									border: "1px solid var(--color-border)",
									boxShadow: "var(--shadow-card)"
								}}
							>
								<span
									style={{
										fontSize: "0.6875rem",
										fontWeight: 700,
										letterSpacing: "0.06em",
										color: "var(--color-text-muted)",
										textTransform: "uppercase",
										flexShrink: 0
									}}
								>
									Mic
								</span>
								<div style={{ flex: 1, minWidth: 0 }}>
									<MicLevelIndicator
										micSourceRef={localMicSourceRef}
										audioContextRef={audioContextRef}
										isMuted={isMuted}
									/>
								</div>
								<span
									className={`badge ${isMuted ? "badge-yellow" : "badge-green"}`}
									style={{ flexShrink: 0 }}
								>
									{isMuted ? "Muted" : "Live"}
								</span>
							</div>
						</div>

						{/* Transcript */}
						<div
							style={{
								display: "flex",
								flexDirection: "column",
								minWidth: 0,
								minHeight: 0,
								height: "100%",
								maxHeight: "100%"
							}}
						>
							<div
								className="card"
								style={{
									display: "flex",
									flexDirection: "column",
									flex: 1,
									minHeight: 0,
									overflow: "hidden"
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										padding: "12px 14px",
										borderBottom: "1px solid var(--color-border)",
										flexShrink: 0
									}}
								>
									<div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
										<RiMessage3Line size={14} color="var(--color-accent)" aria-hidden />
										<h3
											style={{
												margin: 0,
												fontSize: "0.6875rem",
												fontWeight: 700,
												letterSpacing: "0.06em",
												color: "var(--color-text-secondary)",
												textTransform: "uppercase"
											}}
										>
											Transcript
										</h3>
									</div>
									<span style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)" }}>
										{agentSpeaking ? "Speaking" : awaitingAgentReply ? "Thinking" : "Listening"}
									</span>
								</div>

								<div
									ref={transcriptScrollRef}
									style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 14px" }}
								>
									{transcript.length === 0 ? (
										<div
											style={{
												height: "100%",
												minHeight: "120px",
												display: "flex",
												flexDirection: "column",
												alignItems: "center",
												justifyContent: "center",
												textAlign: "center",
												gap: "8px"
											}}
										>
											<RiMessage3Line size={22} color="var(--color-text-muted)" aria-hidden />
											<p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
												{setupStatus || "Waiting for the interview to begin…"}
											</p>
										</div>
									) : (
										<div style={{ display: "grid", gap: "10px" }}>
											{transcript.map((m, idx, arr) => (
												<TranscriptMessage
													key={idx}
													text={m.text}
													speaker={m.speaker}
													isLatest={idx === arr.length - 1}
													timeLabel={
														m.timestamp
															? new Date(m.timestamp).toLocaleTimeString([], {
																	hour: "2-digit",
																	minute: "2-digit"
																})
															: undefined
													}
												/>
											))}

											{!agentSpeaking && !awaitingAgentReply && !isMuted && (
												<div
													style={{
														display: "inline-flex",
														alignItems: "center",
														gap: "6px",
														alignSelf: "flex-start",
														borderRadius: "var(--radius-md)",
														backgroundColor: "var(--color-success-light)",
														padding: "4px 8px",
														fontSize: "0.6875rem",
														fontWeight: 600,
														color: "var(--color-success)",
														border: "1px solid var(--color-success-border)"
													}}
												>
													<RiMicLine size={11} aria-hidden />
													Listening
												</div>
											)}

											{awaitingAgentReply && !agentSpeaking && (
												<div
													style={{
														display: "inline-flex",
														alignItems: "center",
														gap: "6px",
														alignSelf: "flex-start",
														borderRadius: "var(--radius-md)",
														backgroundColor: "var(--color-accent-light)",
														padding: "4px 8px",
														fontSize: "0.6875rem",
														fontWeight: 600,
														color: "var(--color-accent)",
														border: "1px solid var(--color-accent-border)"
													}}
												>
													Preparing…
												</div>
											)}

											{agentSpeaking && (
												<div
													style={{
														display: "inline-flex",
														alignItems: "center",
														gap: "6px",
														alignSelf: "flex-start",
														borderRadius: "var(--radius-md)",
														backgroundColor: "var(--color-accent-light)",
														padding: "8px 10px",
														border: "1px solid var(--color-accent-border)"
													}}
												>
													{[0, 0.15, 0.3].map((d, i) => (
														<div
															key={i}
															className="animate-bounce"
															style={{
																width: "6px",
																height: "6px",
																borderRadius: "999px",
																backgroundColor: "var(--color-accent)",
																animationDelay: `${d}s`
															}}
														/>
													))}
												</div>
											)}
										</div>
									)}
								</div>
							</div>
						</div>
					</div>
				</main>
			)}

			{/* Confirmation Modal */}
			{showEndModal && (
				<EndInterviewModal
					onCancel={() => setShowEndModal(false)}
					onConfirm={async () => {
						setShowEndModal(false);
						setSetupStatus("Closing interview — please wait for the farewell...");
						try {
							const ws = wsRef.current;
							if (ws && ws.readyState === WebSocket.OPEN) {
								ws.send(
									JSON.stringify({
										type: "user_requested_end",
										content: {}
									})
								);
							}
							await onRequestInterviewCompleteRef.current();
							await waitForInterviewCompletedEvent(45000);
						} catch (err) {
							console.warn("Interview closing wait ended:", err);
						}
						if (!completionNotifiedRef.current) {
							completionNotifiedRef.current = true;
							notifyCompletionWaiters();
							await finalizeInterviewSessionRef.current();
						}
					}}
				/>
			)}
		</div>
	);
}
