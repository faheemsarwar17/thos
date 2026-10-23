"use client";

import { useEffect, useRef, useState } from "react";
import { LuCheck } from "react-icons/lu";

function CheckBullet({ children }: { children: string }) {
	return (
		<li className="fx-bullet">
			<LuCheck size={12} aria-hidden="true" />
			<span>{children}</span>
		</li>
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
		<div className="fx-card fx-card--wide">
			<h1>Check your camera and microphone</h1>
			<div className="fx-device">
				<div className="fx-video">
					<video
						ref={videoRef}
						autoPlay
						muted
						playsInline
						className={hasRecorded ? "fx-video__live is-hidden" : "fx-video__live"}
					/>

					{hasRecorded && recordedUrl && (
						<video ref={playbackVideoRef} src={recordedUrl} controls playsInline className="fx-video__playback" />
					)}

					{!isRecording && !hasRecorded && <span className="fx-video__tag">Live preview</span>}
				</div>

				<div className="fx-device__side">
					<p className="fx-note">
						Click “Start Recording” and speak clearly for a few seconds. You can review before continuing.
					</p>

					<ul className="fx-bullets">
						<CheckBullet>Speak clearly into your microphone</CheckBullet>
						<CheckBullet>Minimise background noise</CheckBullet>
						<CheckBullet>Position yourself in the frame</CheckBullet>
						<CheckBullet>Ensure good lighting</CheckBullet>
					</ul>

					{hasRecorded ? (
						<label className="opt-check fx-confirm">
							<input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
							<span>My camera and microphone are working correctly</span>
						</label>
					) : (
						<div className="fx-level">
							<span>Microphone level</span>
							<div className="fx-meter" title="Live input from your microphone">
								<div ref={meterFillRef} className="fx-meter__fill" />
							</div>
						</div>
					)}

					<div className="fx-device__actions">
						{!hasRecorded ? (
							!isRecording ? (
								<button type="button" className="button button--primary fx-card__wide" onClick={startRecording} disabled={!cameraReady}>
									{!cameraReady ? "Preparing camera..." : "Start Recording"}
								</button>
							) : (
								<div className="fx-recording" role="status">
									<span className="fx-recording__dot" aria-hidden="true" />
									Recording... {countdown}s remaining
								</div>
							)
						) : (
							<div className="fx-device__pair">
								<button type="button" className="button button--secondary" onClick={handleRecordAgain}>
									Record Again
								</button>
								<button type="button" className="button button--primary" onClick={handleComplete} disabled={!confirmed}>
									Continue
								</button>
							</div>
						)}
					</div>
				</div>
			</div>

			<p className="fx-card__fine">This recording is temporary and will not be stored.</p>
		</div>
	);
}
