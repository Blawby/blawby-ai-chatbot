import { FunctionComponent } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import AudioRecordingUI from './AudioRecordingUI';
import { Mic } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';
import { features } from '@/config/features';
import { Button } from '@/shared/ui/Button';

interface MediaControlsProps {
	onMediaCapture: (blob: Blob, type: 'audio' | 'video') => void;
	onRecordingStateChange?: (isRecording: boolean) => void;
}

const MediaControls: FunctionComponent<MediaControlsProps> = ({ 
	onMediaCapture,
	onRecordingStateChange 
}) => {
	// Always call hooks at the top level
	const [isRecording, setIsRecording] = useState(false);
	const [permissionDenied, setPermissionDenied] = useState(false);
	const mediaRecorderRef = useRef<MediaRecorder | null>(null);
	const mediaStreamRef = useRef<MediaStream | null>(null);
	const chunksRef = useRef<Blob[]>([]);

	useEffect(() => {
		if (!features.enableAudioRecording) return;
		onRecordingStateChange?.(isRecording);
	}, [isRecording, onRecordingStateChange]);

	const stopMediaStream = () => {
		if (mediaStreamRef.current) {
			mediaStreamRef.current.getTracks().forEach(track => {
				track.stop();
			});
			mediaStreamRef.current = null;
		}
	};

	useEffect(() => {
		return () => {
			stopMediaStream();
		};
	}, []);

	// If audio recording is disabled via feature flag, don't render anything
	if (!features.enableAudioRecording) {
		return null;
	}

	const startRecording = async () => {
		try {
			setPermissionDenied(false);
			const constraints = {
				audio: true,
				video: false
			};

			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			mediaStreamRef.current = stream;
			const mediaRecorder = new MediaRecorder(stream);
			mediaRecorderRef.current = mediaRecorder;
			chunksRef.current = [];

			mediaRecorder.ondataavailable = (e) => {
				if (e.data.size > 0) {
					chunksRef.current.push(e.data);
				}
			};

			mediaRecorder.start();
			setIsRecording(true);
		} catch (error) {
			console.error('Error accessing media devices:', error);
			setIsRecording(false);
			setPermissionDenied(true);
			// Announce the error for screen readers
			if (typeof document !== 'undefined') {
				const errorMessage = document.createElement('div');
				errorMessage.setAttribute('role', 'alert');
				errorMessage.classList.add('sr-only');
				errorMessage.textContent = 'MicrophoneIconrophone access denied. Please check your browser permissions.';
				document.body.appendChild(errorMessage);
				setTimeout(() => {
					document.body.removeChild(errorMessage);
				}, 5000);
			}
		}
	};

	const stopRecording = (shouldSave: boolean = true) => {
		if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
			try {
				mediaRecorderRef.current.onstop = () => {
					if (shouldSave && chunksRef.current.length > 0) {
						const blob = new Blob(chunksRef.current, {
							type: 'audio/webm'
						});
						onMediaCapture(blob, 'audio');
					}
					chunksRef.current = [];
					stopMediaStream();
					setIsRecording(false);
				};
				mediaRecorderRef.current.stop();
			} catch (error) {
				console.error('Error stopping recording:', error);
				// Force cleanup even if there was an error
				chunksRef.current = [];
				stopMediaStream();
				setIsRecording(false);
			}
		} else {
			// If recorder is not available or already inactive, just clean up
			chunksRef.current = [];
			stopMediaStream();
			setIsRecording(false);
		}
	};

	const handleCancelRecording = () => {
		stopRecording(false);
	};

	const handleConfirmRecording = () => {
		stopRecording(true);
	};

	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			if (!isRecording) {
				startRecording();
			}
		}
	};

	if (isRecording) {
		return (
			<div className="flex items-center gap-2" role="region" aria-label="Audio recording controls">
				<AudioRecordingUI
					isRecording={isRecording}
					onCancel={handleCancelRecording}
					onConfirm={handleConfirmRecording}
					mediaStream={mediaStreamRef.current}
				/>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2" role="region" aria-label="Audio recording">
			{/* Sized to match FileMenu's + trigger (icon-sm = 44×44, 20px icon)
			    so the two pill-internal controls read as a matched pair. */}
			<Button
				variant="icon"
				size="icon-sm"
				onClick={() => {
					if (!isRecording) {
						startRecording();
					}
				}}
				onKeyDown={handleKeyDown}
				title="Record audio"
				aria-label="Record audio message"
				aria-pressed={isRecording}
				disabled={permissionDenied}
				className="shadow-lg border bg-surface-utility/10 border-line-glass/20 hover:bg-surface-utility/20 hover:border-line-glass/30 hover:scale-105 disabled:opacity-60 disabled:cursor-not-allowed focus:outline-none focus:ring-0 focus-visible:ring-2 focus-visible:ring-line-glass/30 focus-visible:ring-offset-0 active:scale-100"
			>
				<Icon icon={Mic} className="w-5 h-5" aria-hidden="true"  />
			</Button>
			{permissionDenied && (
				<div className="sr-only" role="alert">
					MicrophoneIconrophone access denied. Please check your browser permissions.
				</div>
			)}
		</div>
	);
};

export default MediaControls; 