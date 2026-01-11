"use client";

import React, { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";

const waitForIceGatheringComplete = (pc: RTCPeerConnection) => {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const handleStateChange = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", handleStateChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", handleStateChange);
  });
};

export default function CoSolveSharePage() {
  const params = useParams();
  const shareId = Array.isArray(params?.shareId) ? params.shareId[0] : params?.shareId;
  const videoRef = useRef<HTMLVideoElement>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const pollRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"connecting" | "waiting" | "live" | "ended" | "error">("connecting");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!shareId) {
      setStatus("error");
      setErrorMessage("Missing share link.");
      return;
    }

    let cancelled = false;
    const rtcConfig: RTCConfiguration = {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      iceCandidatePoolSize: 2,
    };

    const connect = async () => {
      try {
        setStatus("connecting");
        const peer = new RTCPeerConnection(rtcConfig);
        peerRef.current = peer;

        peer.ontrack = (event) => {
          const stream = event.streams[0];
          if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(() => undefined);
          }
        };

        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "connected") {
            setStatus("live");
          } else if (peer.connectionState === "failed" || peer.connectionState === "disconnected" || peer.connectionState === "closed") {
            setStatus("ended");
          }
        };

        const offer = await peer.createOffer({
          offerToReceiveVideo: true,
          offerToReceiveAudio: false,
        });
        await peer.setLocalDescription(offer);
        await waitForIceGatheringComplete(peer);

        const res = await fetch(`/api/cosolve/share/${shareId}/viewer`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offer: peer.localDescription }),
        });

        if (!res.ok) {
          setStatus("ended");
          return;
        }

        const data = await res.json();
        const viewerId = data?.viewerId;
        if (!viewerId) {
          setStatus("error");
          setErrorMessage("Failed to join share session.");
          return;
        }

        setStatus("waiting");

        const pollAnswer = async () => {
          if (cancelled) return;
          try {
            const answerRes = await fetch(`/api/cosolve/share/${shareId}/viewer/${viewerId}/answer`, {
              cache: "no-store",
            });
            if (answerRes.status === 404) {
              setStatus("ended");
              if (pollRef.current !== null) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
              }
              return;
            }
            if (!answerRes.ok) return;
            const answerData = await answerRes.json();
            if (answerData?.answer && !peer.currentRemoteDescription) {
              await peer.setRemoteDescription(new RTCSessionDescription(answerData.answer));
              setStatus("live");
              if (pollRef.current !== null) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          } catch {
            // ignore poll errors
          }
        };

        await pollAnswer();
        pollRef.current = window.setInterval(pollAnswer, 750);
      } catch (error) {
        console.error("Share view connection failed:", error);
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Unable to connect to live share.");
        }
      }
    };

    connect();

    return () => {
      cancelled = true;
      if (pollRef.current !== null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }
    };
  }, [shareId]);

  return (
    <div className="min-h-screen w-full bg-black text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-5xl flex flex-col items-center gap-4">
        <div className="text-xs uppercase tracking-[0.2em] text-white/50">CoSolve Live View</div>
        <div className="w-full aspect-video bg-black/80 border border-white/10 rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center relative">
          <video ref={videoRef} className="w-full h-full object-contain" autoPlay playsInline muted />
          {(status === "connecting" || status === "waiting") && (
            <div className="absolute text-white/70 text-sm flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              {status === "connecting" ? "Connecting..." : "Waiting for host..."}
            </div>
          )}
        </div>
        {status === "ended" && (
          <div className="text-sm text-white/70">This live share has ended.</div>
        )}
        {status === "error" && (
          <div className="text-sm text-red-300">{errorMessage || "Unable to join live share."}</div>
        )}
      </div>
    </div>
  );
}
