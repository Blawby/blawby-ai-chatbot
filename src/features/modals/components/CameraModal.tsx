import { FunctionComponent } from 'preact';
import { useRef, useEffect, useState, useCallback } from 'preact/hooks';
import Modal from '@/shared/components/Modal';
import CameraCaptureButton from './CameraCaptureButton';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

const CameraModal: FunctionComponent<CameraModalProps> = ({
  isOpen,
  onClose,
  onCapture
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [error, setError] = useState('');

  const onVideoLoaded = useCallback(() => {
    setIsCameraReady(true);
  }, []);
  const onVideoError = useCallback(() => {
    setError('Error loading video stream.');
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraReady(false);
  }, []);

  const startCamera = useCallback(async () => {
    try {
      setError('');
      setIsCameraReady(false);
      if (streamRef.current) stopCamera();
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch (envError) {
        console.log('Environment camera not available, trying user camera:', envError);
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadedmetadata', onVideoLoaded);
        videoRef.current.addEventListener('error', onVideoError);
      }
    } catch (err) {
      console.error('Error accessing camera:', err);
      setError('Could not access camera. Please check permissions and ensure your device has a camera.');
    }
  }, [stopCamera, onVideoLoaded, onVideoError]);

  useEffect(() => {
    if (isOpen) startCamera();
    const video = videoRef.current;
    return () => {
      // Remove listeners before stopping camera
      if (video) {
        video.removeEventListener('loadedmetadata', onVideoLoaded);
        video.removeEventListener('error', onVideoError);
      }
      stopCamera();
    };
  }, [isOpen, startCamera, stopCamera, onVideoLoaded, onVideoError]);

  const takePhoto = () => {
    if (!isCameraReady || !videoRef.current || !canvasRef.current) {
      console.error('Camera not ready or elements not available');
      return;
    }
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.error('Video has no dimensions');
      setError('Camera not ready. Please wait a moment and try again.');
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      console.error('Could not get canvas context');
      setError('Error capturing photo. Please try again.');
      return;
    }
    try {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
          onCapture(file);
          // Stop camera after capture completes to avoid race with cleanup
          stopCamera();
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
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
        <div className="absolute bottom-10 left-0 right-0 flex justify-center items-center py-4 z-10">
          <CameraCaptureButton onClick={takePhoto} disabled={!isCameraReady} />
        </div>
      </div>
    </Modal>
  );
};

export default CameraModal;
