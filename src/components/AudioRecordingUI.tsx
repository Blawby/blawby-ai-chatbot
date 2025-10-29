import { FunctionComponent } from 'preact';
import { useEffect, useState, useRef, useCallback } from 'preact/hooks';
import { XMarkIcon, CheckIcon } from "@heroicons/react/24/outline";
import { Button } from './ui/Button';

// Type-safe interface for AudioContext globals
interface AudioContextGlobals {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
}

interface AudioRecordingUIProps {
    onCancel: () => void;
    onConfirm: () => void;
    isRecording: boolean;
    mediaStream?: MediaStream | null; // Add mediaStream prop to access the audio stream
}

const AudioRecordingUI: FunctionComponent<AudioRecordingUIProps> = ({
    onCancel,
    onConfirm,
    isRecording,
    mediaStream
}) => {
    const [recordingTime, setRecordingTime] = useState(0);
    const [isBrowser, setIsBrowser] = useState(false);
    const timerRef = useRef<number>();
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationFrameRef = useRef<number>();
    const confirmBtnRef = useRef<HTMLButtonElement>(null);
    
    // Web Audio API references
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const dataArrayRef = useRef<Uint8Array | null>(null);

    useEffect(() => {
        setIsBrowser(true);
    }, []);

    // Focus the confirm button when recording starts
    useEffect(() => {
        if (isBrowser && isRecording) {
            setTimeout(() => {
                confirmBtnRef.current?.focus();
            }, 100);
        }
    }, [isRecording, isBrowser]);

    // Handle keyboard navigation during recording
    useEffect(() => {
        if (!isBrowser || !isRecording) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onConfirm();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isRecording, isBrowser, onCancel, onConfirm]);

    // Timer logic
    useEffect(() => {
        if (!isBrowser || !isRecording) return;

        timerRef.current = window.setInterval(() => {
            setRecordingTime(prev => prev + 1);
        }, 1000);
        
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isRecording, isBrowser]);

    // Set up audio context and analyzer
    useEffect(() => {
        if (!isBrowser || !isRecording || !mediaStream) return;

        try {
            // Initialize Audio Context - get constructor from globalThis to avoid shadowing
            const audioGlobals = globalThis as unknown as AudioContextGlobals;
            const AudioContextConstructor: typeof AudioContext | undefined = 
                audioGlobals.AudioContext || audioGlobals.webkitAudioContext;
            
            if (!AudioContextConstructor) {
                console.warn('AudioContext not supported in this browser');
                animationFrameRef.current = fallbackVisualization();
                return;
            }
            
            audioContextRef.current = new AudioContextConstructor();
            
            // Create analyzer node
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256; // Fast Fourier Transform size
            const bufferLength = analyserRef.current.frequencyBinCount;
            // Create Uint8Array with explicit ArrayBuffer to ensure correct type
            const buffer = new ArrayBuffer(bufferLength);
            dataArrayRef.current = new Uint8Array(buffer) as Uint8Array<ArrayBuffer>;
            
            // Connect microphone stream to analyzer
            const source = audioContextRef.current.createMediaStreamSource(mediaStream);
            source.connect(analyserRef.current);
            
            // Start visualization
            visualizeAudio();
        } catch (error) {
            console.error('Error setting up audio visualization:', error);
            // Fall back to fake visualization if Web Audio API fails
            animationFrameRef.current = fallbackVisualization();
        }
        
        return () => {
            // Clean up audio context
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
            
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
        };
    }, [isRecording, isBrowser, mediaStream]); // fallbackVisualization and visualizeAudio are stable useCallback refs

    const visualizeAudio = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas || !analyserRef.current || !dataArrayRef.current) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Visualization settings
        const barWidth = 4;
        const barGap = 2;
        const barCount = Math.floor(canvas.width / (barWidth + barGap));
        const radius = 2; // Radius for rounded corners
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color');
        
        ctx.fillStyle = accentColor || '#0ea5e9';
        
        function draw() {
            if (!analyserRef.current || !dataArrayRef.current) return;
            
            // Get frequency data from microphone
            analyserRef.current.getByteFrequencyData(dataArrayRef.current as Uint8Array<ArrayBuffer>);
            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Center everything
            const totalWidth = barCount * barWidth + (barCount - 1) * barGap;
            const startXMarkIcon = (canvas.width - totalWidth) / 2;
            
            // Draw bars based on audio frequency data
            for (let i = 0; i < barCount; i++) {
                const x = startXMarkIcon + i * (barWidth + barGap);
                
                // Map frequency data to bar index
                // Use logarithmic scale to better match human hearing perception
                const dataIndex = Math.min(
                    Math.floor(i / barCount * dataArrayRef.current.length * 0.75),
                    dataArrayRef.current.length - 1
                );
                
                // Scale the value to get the bar height (0-255 to 0-1)
                const amplitude = dataArrayRef.current[dataIndex] / 255;
                
                // Calculate bar height (min 2px)
                const baseHeight = 4; // Minimum height when silent
                const maxHeight = canvas.height - 8; // Maximum height
                const h = baseHeight + (maxHeight - baseHeight) * amplitude;
                const y = (canvas.height - h) / 2;
                
                // Draw rounded rectangle
                if (h > 0) {
                    ctx.beginPath();
                    // Only use rounded corners if height is enough
                    if (h > radius * 2) {
                        // Corners are rounded
                        ctx.moveTo(x + radius, y);
                        ctx.lineTo(x + barWidth - radius, y);
                        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
                        ctx.lineTo(x + barWidth, y + h - radius);
                        ctx.quadraticCurveTo(x + barWidth, y + h, x + barWidth - radius, y + h);
                        ctx.lineTo(x + radius, y + h);
                        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
                        ctx.lineTo(x, y + radius);
                        ctx.quadraticCurveTo(x, y, x + radius, y);
                    } else {
                        // Simple rectangle for small heights
                        ctx.rect(x, y, barWidth, h);
                    }
                    ctx.fill();
                }
            }
            
            // Continue the animation loop if still recording
            if (isRecording) {
                animationFrameRef.current = requestAnimationFrame(draw);
            }
        }
        
        // Start the animation loop
        animationFrameRef.current = requestAnimationFrame(draw);
    }, [isRecording]);

    // Fallback to fake visualization if real audio analysis fails
    const fallbackVisualization = useCallback((): number => {
        const canvas = canvasRef.current;
        if (!canvas) return 0;

        const ctx = canvas.getContext('2d');
        if (!ctx) return 0;

        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Visualization settings
        const barWidth = 4;
        const barGap = 2;
        const barCount = Math.floor(canvas.width / (barWidth + barGap));
        const barHeightMultiplier = 30;
        const baseHeight = canvas.height / 4;
        const radius = 2; // Radius for rounded corners
        const accentColor = getComputedStyle(document.documentElement).getPropertyValue('--accent-color');
        
        ctx.fillStyle = accentColor || '#0ea5e9';
        
        function animateBarData() {
            const amplitudes = [];
            for (let i = 0; i < barCount; i++) {
                // Dynamic animation logic
                const time = Date.now() / 1000;
                const freq = 1 + (i / barCount) * 3;
                const amplitude = (Math.sin(time * freq * 2) + 1) / 2;
                
                // Add variations based on index to make it look more natural
                const variation = Math.sin(i * 0.2) * 0.3 + 0.7;
                
                // Create amplitude array with values between 0.1 and 1
                const finalAmplitude = 0.1 + (amplitude * variation * 0.9);
                
                // Add in some randomness for realism
                const randomFactor = 0.05;
                const randomOffset = (Math.random() * 2 - 1) * randomFactor;
                
                amplitudes.push(Math.max(0.1, Math.min(1, finalAmplitude + randomOffset)));
            }
            return amplitudes;
        }
        
        const drawBars = () => {
            const barAmplitudes = animateBarData();
            
            // Clear the canvas
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // Center everything
            const totalWidth = barCount * barWidth + (barCount - 1) * barGap;
            const startXMarkIcon = (canvas.width - totalWidth) / 2;
            
            // Draw bars
            for (let i = 0; i < barCount; i++) {
                const x = startXMarkIcon + i * (barWidth + barGap);
                const amplitude = barAmplitudes[i];
                const h = amplitude * barHeightMultiplier + baseHeight;
                const y = (canvas.height - h) / 2;
                
                // Draw rounded rectangle with better corner handling
                if (h > 0) {
                    ctx.beginPath();
                    // Only use rounded corners if height is enough
                    if (h > radius * 2) {
                        // Corners are rounded
                        ctx.moveTo(x + radius, y);
                        ctx.lineTo(x + barWidth - radius, y);
                        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
                        ctx.lineTo(x + barWidth, y + h - radius);
                        ctx.quadraticCurveTo(x + barWidth, y + h, x + barWidth - radius, y + h);
                        ctx.lineTo(x + radius, y + h);
                        ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
                        ctx.lineTo(x, y + radius);
                        ctx.quadraticCurveTo(x, y, x + radius, y);
                    } else {
                        // Simple rectangle for small heights
                        ctx.rect(x, y, barWidth, h);
                    }
                    ctx.fill();
                }
            }
            
            // Continue the animation loop if still recording
            if (isRecording) {
                animationFrameRef.current = requestAnimationFrame(drawBars);
            }
        };
        
        // Start the animation loop and return the animation frame ID
        return requestAnimationFrame(drawBars);
    }, [isRecording]);

    // Set up audio context and analyzer
    useEffect(() => {
        if (!isBrowser || !isRecording || !mediaStream) return;

        try {
            // Initialize Audio Context - get constructor from globalThis to avoid shadowing
            const audioGlobals = globalThis as unknown as AudioContextGlobals;
            const AudioContextConstructor: typeof AudioContext | undefined = 
                audioGlobals.AudioContext || audioGlobals.webkitAudioContext;
            
            if (!AudioContextConstructor) {
                console.warn('AudioContext not supported in this browser');
                animationFrameRef.current = fallbackVisualization();
                return;
            }
            
            audioContextRef.current = new AudioContextConstructor();
            
            // Create analyzer node
            analyserRef.current = audioContextRef.current.createAnalyser();
            analyserRef.current.fftSize = 256; // Fast Fourier Transform size
            const bufferLength = analyserRef.current.frequencyBinCount;
            // Create Uint8Array with explicit ArrayBuffer to ensure correct type
            const buffer = new ArrayBuffer(bufferLength);
            dataArrayRef.current = new Uint8Array(buffer) as Uint8Array<ArrayBuffer>;
            
            // Connect microphone stream to analyzer
            const source = audioContextRef.current.createMediaStreamSource(mediaStream);
            source.connect(analyserRef.current);
            
            // Start visualization
            visualizeAudio();
        } catch (error) {
            console.error('Error setting up audio visualization:', error);
            // Fall back to fake visualization if Web Audio API fails
            animationFrameRef.current = fallbackVisualization();
        }
        
        return () => {
            // Clean up audio context
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                audioContextRef.current.close();
            }
            
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
                animationFrameRef.current = undefined;
            }
        };
    }, [isRecording, isBrowser, mediaStream]); // fallbackVisualization and visualizeAudio are stable useCallback refs

    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="flex items-center gap-4 w-full flex-1 p-0 m-0 bg-none border-none h-8 animate-fade-in" role="dialog" aria-modal="true" aria-label="Audio recording in progress">
            <Button 
                variant="ghost"
                size="sm"
                onClick={onCancel}
                aria-label="Cancel recording"
                title="Cancel recording"
                className="flex items-center justify-center w-8 h-8 p-1.5 border-none rounded-full bg-none cursor-pointer transition-all duration-200 text-light-text dark:text-dark-text bg-light-hover dark:bg-dark-hover animate-zoom-in"
            >
                <XMarkIcon className="w-5 h-5" aria-hidden="true" />
            </Button>
            <div className="flex-1 flex items-center gap-4 h-8 animate-zoom-in bg-transparent" aria-live="polite">
                <canvas ref={canvasRef} width="300" height="40" aria-hidden="true" className="flex-1 h-8 rounded block image-rendering-crisp-edges image-rendering-webkit-optimize-contrast bg-transparent" />
                <div className="text-sm text-accent font-tabular-nums min-w-10 text-right" role="timer" aria-label={`Recording time: ${formatTime(recordingTime)}`}>
                    {formatTime(recordingTime)}
                </div>
                <div className="sr-only" aria-live="assertive">
                    Recording audio, duration: {formatTime(recordingTime)}
                </div>
            </div>
            <Button 
                variant="primary"
                size="sm"
                onClick={onConfirm}
                aria-label="Confirm and send recording"
                title="Confirm and send recording"
                ref={confirmBtnRef}
                className="flex items-center justify-center w-8 h-8 p-1.5 border-none rounded-full bg-none cursor-pointer transition-all duration-200 text-light-bg dark:text-dark-bg bg-light-text dark:bg-dark-text animate-zoom-in hover:scale-105"
            >
                <CheckIcon className="w-5 h-5" aria-hidden="true" />
            </Button>
        </div>
    );
};

export default AudioRecordingUI; 