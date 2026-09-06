"use client";

import { useEffect, useRef, useState } from "react";

function CheckBullet({ children }: { children: string }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "8px",
				fontSize: "0.75rem",
				color: "var(--color-text-secondary)"
			}}
		>
			<div
				style={{
					width: "16px",
					height: "16px",
					borderRadius: "999px",
					backgroundColor: "var(--color-success-light)",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					border: "1px solid rgba(5,150,105,0.18)",
					flexShrink: 0
				}}
			>
				<svg
					width="10"
					height="10"
					viewBox="0 0 24 24"
					fill="none"
					stroke="var(--color-success)"
					strokeWidth="3"
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path d="M5 13l4 4L19 7" />
				</svg>
			</div>
			<span>{children}</span>
		</div>
	);
}

export default function DeviceCheck({ onNext }: { onNext: () => void }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const playbackVideoRef = useRef<HTMLVideoElement>(null);

	const [stream, setStream] = useState<MediaStream | null>(null);
	const [isRecording, setIsRecording] = useState(false);
	const [hasRecorded, setHasRecorded] = useState(false);
	const [countdown, setCountdown] = useState(10);
	const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
	const [cameraReady, setCameraReady] = useState(false);
	const [confirmed, setConfirmed] = useState(false);

	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const chunksRef = useRef<Blob[]>([]);
	const countdownRef = useRef<number | null>(null);
	const meterFillRef = useRef<HTMLDivElement | null>(null);
	const meterLoopRef = useRef<number | null>(null);
	const meterSmoothedRef = useRef(0);

	const getSupportedMimeType = () => {
		const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
		return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
	};

	const startStream = async () => {
		try {
			const s = await navigator.mediaDevices.getUserMedia({
				audio: true,
				video: { width: 1280, height: 720 }
			});

			setStream(s);

			if (videoRef.current) {
				videoRef.current.srcObject = s;
				videoRef.current.muted = true;
				await videoRef.current.play().catch(() => {});
			}

			setCameraReady(true);
		} catch (err) {
			console.error("Error starting stream:", err);
			setCameraReady(false);
		}
	};

	const stopStream = () => {
		stream?.getTracks().forEach((t) => t.stop());
		setStream(null);
		if (videoRef.current) videoRef.current.srcObject = null;
	};

	const startRecording = () => {
		if (!stream || !cameraReady) return;

		chunksRef.current = [];
		setCountdown(10);
		setIsRecording(true);

		const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() });
		mediaRecorderRef.current = recorder;

		recorder.ondataavailable = (e) => {
			if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
		};

		recorder.onstop = () => {
			if (!chunksRef.current.length) return;

			const blob = new Blob(chunksRef.current, { type: "video/webm" });
			if (recordedUrl) URL.revokeObjectURL(recordedUrl);
			const url = URL.createObjectURL(blob);

			stopStream();
			setRecordedUrl(url);
			setHasRecorded(true);
			setIsRecording(false);
		};

		recorder.start();

		if (countdownRef.current) window.clearInterval(countdownRef.current);
		countdownRef.current = window.setInterval(() => {
			setCountdown((prev) => {
				if (prev <= 1) {
					if (countdownRef.current) window.clearInterval(countdownRef.current);
					countdownRef.current = null;
					recorder.stop();
					return 0;
				}
				return prev - 1;
			});
		}, 1000);
	};

	const handleRecordAgain = () => {
		if (recordedUrl) URL.revokeObjectURL(recordedUrl);
		setRecordedUrl(null);
		setHasRecorded(false);
		setCountdown(10);
		setConfirmed(false);
		startStream();
	};

	useEffect(() => {
		startStream();
		return () => {
			stopStream();
			if (recordedUrl) URL.revokeObjectURL(recordedUrl);
			if (countdownRef.current) window.clearInterval(countdownRef.current);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Live mic level from the preview stream (Web Audio analyser + rAF; updates ref, no per-frame React state).
	useEffect(() => {
		if (!stream) {
			meterSmoothedRef.current = 0;
			if (meterFillRef.current) meterFillRef.current.style.transform = "scaleX(0)";
			return;
		}
		const audioTracks = stream.getAudioTracks();
		if (!audioTracks.length || audioTracks[0].readyState === "ended") return;

		const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtx) return;

		const ctx = new AudioCtx();
		const source = ctx.createMediaStreamSource(stream);
		const analyser = ctx.createAnalyser();
		analyser.fftSize = 1024;
		analyser.smoothingTimeConstant = 0.65;
		source.connect(analyser);

		const data = new Uint8Array(analyser.fftSize);
		let stopped = false;

		const tick = () => {
			if (stopped) return;
			analyser.getByteTimeDomainData(data);
			let sumSq = 0;
			for (let i = 0; i < data.length; i++) {
				const n = (data[i]! - 128) / 128;
				sumSq += n * n;
			}
			const rms = Math.sqrt(sumSq / data.length);
			// Boost quiet speech; cap so normal talking fills most of the bar.
			const instant = Math.min(1, Math.pow(rms * 4.2, 0.85));
			const gated = instant < 0.012 ? 0 : instant;
			meterSmoothedRef.current = meterSmoothedRef.current * 0.72 + gated * 0.28;
			const level = meterSmoothedRef.current;
			const el = meterFillRef.current;
			if (el) el.style.transform = `scaleX(${level})`;
			meterLoopRef.current = window.requestAnimationFrame(tick);
		};

		const startLoop = () => {
			if (stopped) return;
			meterLoopRef.current = window.requestAnimationFrame(tick);
		};

		void ctx.resume().then(startLoop).catch(() => startLoop());

		const currentMeterFill = meterFillRef.current;
		return () => {
			stopped = true;
			if (meterLoopRef.current != null) {
				window.cancelAnimationFrame(meterLoopRef.current);
				meterLoopRef.current = null;
			}
			source.disconnect();
			analyser.disconnect();
			void ctx.close();
			meterSmoothedRef.current = 0;
			if (currentMeterFill) currentMeterFill.style.transform = "scaleX(0)";
		};
	}, [stream]);

	const handleComplete = () => {
		stopStream();
		if (recordedUrl) URL.revokeObjectURL(recordedUrl);
		onNext();
	};

	return (
		<div style={{ flex: 1, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "32px 16px" }}>
			<div style={{ width: "100%", maxWidth: "960px" }}>
				<div className="card animate-fade-up" style={{ padding: "24px", boxShadow: "var(--shadow-card)" }}>
					<div style={{ display: "grid", gridTemplateColumns: "1.9fr 1fr", gap: "24px" }}>
						{/* Video (2/3) */}
						<div>
							<div
								style={{
									position: "relative",
									borderRadius: "14px",
									overflow: "hidden",
									backgroundColor: "#000",
									aspectRatio: "16/9"
								}}
							>
								<video
									ref={videoRef}
									autoPlay
									muted
									playsInline
									style={{
										width: "100%",
										height: "100%",
										objectFit: "cover",
										transform: "scaleX(-1)",
										display: hasRecorded ? "none" : "block"
									}}
								/>

								{hasRecorded && recordedUrl && (
									<video
										ref={playbackVideoRef}
										src={recordedUrl}
										controls
										playsInline
										style={{ width: "100%", height: "100%", objectFit: "cover" }}
									/>
								)}

								{!isRecording && !hasRecorded && (
									<div
										style={{
											position: "absolute",
											right: "12px",
											top: "12px",
											borderRadius: "10px",
											backgroundColor: "rgba(0,0,0,0.55)",
											padding: "6px 10px",
											fontSize: "0.75rem",
											color: "rgba(255,255,255,0.65)"
										}}
									>
										Live preview
									</div>
								)}
							</div>
						</div>

						{/* Sidebar (1/3) */}
						<div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
							<div
								style={{
									borderRadius: "12px",
									border: "1px solid rgba(37,99,235,0.22)",
									backgroundColor: "rgba(37,99,235,0.06)",
									padding: "12px",
									color: "rgba(37,99,235,0.95)",
									fontSize: "0.8125rem",
									lineHeight: 1.45
								}}
							>
								Click “Start Recording” and speak clearly for a few seconds. You can review before continuing.
							</div>

							<div style={{ display: "grid", gap: "10px" }}>
								<CheckBullet>Speak clearly into your microphone</CheckBullet>
								<CheckBullet>Minimise background noise</CheckBullet>
								<CheckBullet>Position yourself in the frame</CheckBullet>
								<CheckBullet>Ensure good lighting</CheckBullet>
							</div>

							{hasRecorded ? (
								<label
									style={{
										display: "flex",
										alignItems: "flex-start",
										gap: "12px",
										cursor: "pointer",
										borderRadius: "12px",
										border: "1px solid var(--color-border)",
										backgroundColor: "rgba(148, 163, 184, 0.10)",
										padding: "12px"
									}}
								>
									<input
										type="checkbox"
										checked={confirmed}
										onChange={(e) => setConfirmed(e.target.checked)}
										style={{ marginTop: "2px" }}
									/>
									<span style={{ fontSize: "0.8125rem", color: "var(--color-text-secondary)" }}>
										My camera and microphone are working correctly
									</span>
								</label>
							) : (
								<div
									style={{
										borderRadius: "12px",
										border: "1px solid var(--color-border)",
										backgroundColor: "rgba(148, 163, 184, 0.10)",
										padding: "12px",
										fontSize: "0.75rem",
										color: "var(--color-text-muted)",
										display: "flex",
										alignItems: "center",
										justifyContent: "space-between",
										gap: "10px"
									}}
								>
									<span>Microphone level</span>
									<div
										title="Live input from your microphone"
										style={{
											width: "96px",
											height: "8px",
											borderRadius: "999px",
											backgroundColor: "rgba(148, 163, 184, 0.35)",
											overflow: "hidden"
										}}
									>
										<div
											ref={meterFillRef}
											style={{
												height: "100%",
												width: "100%",
												transform: "scaleX(0)",
												transformOrigin: "left center",
												borderRadius: "999px",
												background:
													"linear-gradient(90deg, rgba(37,99,235,0.55) 0%, rgba(37,99,235,0.95) 55%, rgba(59,130,246,1) 100%)",
												willChange: "transform"
											}}
										/>
									</div>
								</div>
							)}

							<div style={{ marginTop: "auto" }}>
								{!hasRecorded ? (
									!isRecording ? (
										<button
											className="btn btn-primary"
											style={{ width: "100%" }}
											onClick={startRecording}
											disabled={!cameraReady}
										>
											{!cameraReady ? "Preparing camera..." : "Start Recording"}
										</button>
									) : (
										<div
											style={{
												width: "100%",
												borderRadius: "12px",
												border: "1px solid rgba(239, 68, 68, 0.28)",
												backgroundColor: "rgba(239, 68, 68, 0.08)",
												padding: "10px 12px",
												fontSize: "0.875rem",
												fontWeight: 600,
												color: "rgba(185, 28, 28, 0.95)",
												display: "flex",
												alignItems: "center",
												justifyContent: "center",
												gap: "10px"
											}}
										>
											<div
												style={{
													width: "10px",
													height: "10px",
													borderRadius: "999px",
													backgroundColor: "rgba(239,68,68,0.9)"
												}}
											/>
											Recording... {countdown}s remaining
										</div>
									)
								) : (
									<div style={{ display: "flex", gap: "12px" }}>
										<button className="btn btn-secondary" style={{ width: "100%" }} onClick={handleRecordAgain}>
											Record Again
										</button>
										<button
											className="btn btn-primary"
											style={{ width: "100%" }}
											onClick={handleComplete}
											disabled={!confirmed}
										>
											Continue
										</button>
									</div>
								)}
							</div>
						</div>
					</div>
				</div>

				<p style={{ marginTop: "14px", textAlign: "center", fontSize: "0.75rem", color: "var(--color-text-muted)" }}>
					This recording is temporary and will not be stored.
				</p>
			</div>
		</div>
	);
}
