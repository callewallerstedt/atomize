"use client";

import { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";

export default function QRCameraPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId as string;
  const [images, setImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Verify session exists on mount
  useEffect(() => {
    if (!sessionId) {
      setError("Invalid session ID");
      return;
    }
    
    // Verify session exists
    const verifySession = async () => {
      try {
        const response = await fetch(`/api/qr-session/${sessionId}/images`);
        if (!response.ok) {
          const data = await response.json();
          if (response.status === 404) {
            setError("Session not found. The QR code may have expired. Please generate a new one.");
          } else if (response.status === 410) {
            setError("Session expired. Please generate a new QR code.");
          } else {
            setError(data.error || "Failed to verify session");
          }
        }
      } catch (err) {
        console.error("Error verifying session:", err);
        setError("Failed to verify session. Please check your connection.");
      }
    };
    
    verifySession();
  }, [sessionId]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);

  useEffect(() => {
    return () => {
      // Cleanup camera stream on unmount
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" }, // Use back camera on mobile
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (err: any) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera. Please use the file picker instead.");
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `photo-${Date.now()}.jpg`, {
            type: "image/jpeg",
          });
          setImages((prev) => [...prev, file]);
        }
      }, "image/jpeg", 0.8);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setImages((prev) => [...prev, ...files]);
  };

  const removeImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async () => {
    if (images.length === 0) return;
    
    if (!sessionId) {
      setError("Invalid session ID");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      images.forEach((image) => {
        formData.append("images", image);
      });

      const response = await fetch(`/api/qr-session/${sessionId}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        if (response.status === 404) {
          throw new Error("Session not found. The QR code may have expired. Please generate a new one.");
        } else if (response.status === 410) {
          throw new Error("Session expired. Please generate a new QR code.");
        } else {
          throw new Error(data.error || "Upload failed");
        }
      }

      const result = await response.json();
      console.log("Upload successful:", result);

      setUploaded(true);
      setUploading(false);

      // Stop camera if active
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        setCameraActive(false);
      }

      // Show success message briefly, then could redirect or show confirmation
      setTimeout(() => {
        // Could close window or show success message
      }, 2000);
    } catch (err: any) {
      setError(err.message || "Failed to upload images");
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] p-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold mb-4 text-center">
          Answer with Phone
        </h1>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
            {error}
          </div>
        )}

        {uploaded && (
          <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/40 text-green-200 text-sm text-center">
            ✓ Images sent successfully!
          </div>
        )}

        {/* Camera Preview */}
        {cameraActive && (
          <div className="mb-4 relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full rounded-lg"
              style={{ transform: "scaleX(-1)" }} // Mirror for selfie view
            />
            <button
              onClick={capturePhoto}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-white border-4 border-gray-300 shadow-lg"
            />
          </div>
        )}

        {/* Camera Controls */}
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => {
              // Create a new file input that opens native camera
              const cameraInput = document.createElement('input');
              cameraInput.type = 'file';
              cameraInput.accept = 'image/*';
              cameraInput.capture = 'environment'; // Opens native camera
              cameraInput.multiple = true;
              cameraInput.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                const files = Array.from(target.files || []);
                setImages((prev) => [...prev, ...files]);
              };
              cameraInput.click();
            }}
            className="btn-grey flex-1 px-4 py-3 rounded-lg font-semibold"
          >
            Open Camera
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn-grey flex-1 px-4 py-3 rounded-lg font-semibold"
          >
            Choose Files
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Image Preview */}
        {images.length > 0 && (
          <div className="mb-4">
            <h2 className="text-lg font-semibold mb-2">
              Selected Images ({images.length})
            </h2>
            <div className="grid grid-cols-2 gap-2">
              {images.map((image, index) => (
                <div key={index} className="relative">
                  <img
                    src={URL.createObjectURL(image)}
                    alt={`Preview ${index + 1}`}
                    className="w-full h-32 object-cover rounded-lg"
                  />
                  <button
                    onClick={() => removeImage(index)}
                    className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white text-xs"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload Button */}
        <button
          onClick={uploadImages}
          disabled={images.length === 0 || uploading || uploaded}
          className="btn-grey w-full px-4 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading
            ? "Uploading..."
            : uploaded
            ? "Sent!"
            : `Send ${images.length} Image${images.length !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}





