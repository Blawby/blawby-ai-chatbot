import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useCallback } from 'preact/hooks';
import Modal from './Modal';
import { CameraIcon } from "@heroicons/react/24/outline";
import { Button } from './ui/Button';

interface CameraIconModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCapture: (file: File) => void;
}

const CameraIconModal: FunctionComponent<CameraIconModalProps> = ({
    isOpen,
    onClose,
    onCapture
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isCameraIconReady, setIsCameraIconReady] = useState(false);
    const [error, setError] = useState('');

    const stopCameraIcon = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraIconReady(false);
    }, []);

    const startCameraIcon = useCallback(async () => {
        try {
            setError('');
            setIsCameraIconReady(false);
            
            if (streamRef.current) {
                stopCameraIcon();
            }
            
            // Try environment camera first, fallback to user camera
            let stream;
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: 'environment' }
                });
            } catch (envError) {
                console.log('Environment camera not available, trying user camera:', envError);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: true
                });
            }
            
            streamRef.current = stream;
            
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                videoRef.current.onloadedmetadata = () => {
                    setIsCameraIconReady(true);
                };
                videoRef.current.onerror = () => {
                    setError('Error loading video stream.');
                };
            }
        } catch (err) {
            console.error('Error accessing camera:', err);
            setError('Could not access camera. Please check permissions and ensure your device has a camera.');
        }
    }, [stopCameraIcon]);

    // Initialize the camera
    useEffect(() => {
        if (isOpen) {
            startCameraIcon();
        }
        return () => {
            stopCameraIcon();
        };
    }, [isOpen, startCameraIcon, stopCameraIcon]);


    const takePhoto = () => {
        if (!isCameraIconReady || !videoRef.current || !canvasRef.current) {
            console.error('CameraIcon not ready or elements not available');
            return;
        }
        
        const video = videoRef.current;
        const canvas = canvasRef.current;
        
        // Check if video has valid dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.error('Video has no dimensions');
            setError('CameraIcon not ready. Please wait a moment and try again.');
            return;
        }
        
        // Set canvas dimensions to match video
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        // Draw video frame to canvas
        const context = canvas.getContext('2d');
        if (!context) {
            console.error('Could not get canvas context');
            setError('Error capturing photo. Please try again.');
            return;
        }
        
        try {
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Convert to blob and then to File
            canvas.toBlob((blob) => {
                if (blob) {
                    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
                    onCapture(file);
                    onClose();
                } else {
                    console.error('Failed to create blob from canvas');
                    setError('Error creating photo. Please try again.');
                }
            }, 'image/jpeg', 0.9);
        } catch (error) {
            console.error('Error drawing image to canvas:', error);
            setError('Error capturing photo. Please try again.');
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} type="fullscreen" showCloseButton={true}>
            <div className="flex flex-col h-full w-full">
                {error && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded text-red-600 text-sm text-center absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10 max-w-80">
                        <p>{error}</p>
                    </div>
                )}
                
                <div className="relative w-full h-full overflow-hidden bg-black flex-grow">
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} style={{ display: 'none' }} />
                </div>
                
                <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center py-4 z-10">
                    <Button
                        type="button"
                        variant="primary"
                        onClick={takePhoto}
                        disabled={!isCameraIconReady}
                        title="Take photo"
                        className="cursor-pointer flex items-center justify-center transition-all duration-200 w-20 h-20 rounded-full bg-white shadow-lg p-0 relative disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                        <CameraIcon className="w-16 h-16 text-gray-800" />
                    </Button>
                </div>
            </div>
        </Modal>
    );
};

export default CameraIconModal; 