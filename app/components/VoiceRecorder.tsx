"use client";

// Inline voice-note recorder. Hold the mic button to start, tap "send" to
// stop and upload, or "×" to cancel. Uses the MediaRecorder API.

import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence, tapPress } from "./motion";
import { Send, X } from "./Icons";

interface Props {
  open: boolean;
  onClose: () => void;
  onRecorded: (blob: Blob, mime: string, durationMs: number) => Promise<void> | void;
}

function pickMime(): string {
  // Browsers vary in what they support natively; fall back through reasonable options.
  if (typeof MediaRecorder === "undefined") return "audio/webm";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
    "audio/ogg",
  ];
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "audio/webm";
}

export default function VoiceRecorder({ open, onClose, onRecorded }: Props) {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.start(250);
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      setRecording(true);
      tickRef.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 200);
    } catch (err) {
      setError(
        err instanceof Error && err.name === "NotAllowedError"
          ? "Microphone permission denied"
          : "Couldn't start recording"
      );
      stopStream();
    }
  }, [stopStream]);

  const cancel = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    setRecording(false);
    setElapsedMs(0);
    chunksRef.current = [];
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  const finish = useCallback(async () => {
    const rec = mediaRecorderRef.current;
    if (!rec || rec.state !== "recording") return;
    setSubmitting(true);
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    const duration = Date.now() - startedAtRef.current;
    const mime = rec.mimeType || pickMime();

    // Wait for the final chunk before stopping
    await new Promise<void>((resolve) => {
      rec.addEventListener("stop", () => resolve(), { once: true });
      rec.stop();
    });
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    setRecording(false);
    stopStream();

    try {
      await onRecorded(blob, mime, duration);
    } finally {
      setSubmitting(false);
      setElapsedMs(0);
      onClose();
    }
  }, [onRecorded, onClose, stopStream]);

  // Auto-start when opened
  useEffect(() => {
    if (open && !recording && !mediaRecorderRef.current) {
      start();
    }
    if (!open && recording) {
      cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
      stopStream();
      mediaRecorderRef.current = null;
    };
  }, [stopStream]);

  const seconds = Math.floor(elapsedMs / 1000);
  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.18 }}
          className="border-t border-white/10 bg-rose-950/40 backdrop-blur-md"
          role="dialog"
          aria-label="Recording voice note"
        >
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full bg-red-400 animate-pulse shrink-0"
              aria-hidden
            />
            <p className="text-sm text-white/90 flex-1 min-w-0">
              {error ? (
                <span className="text-red-300">{error}</span>
              ) : recording ? (
                <span className="font-mono">{mm}:{ss}</span>
              ) : (
                "Starting..."
              )}
            </p>
            <motion.button
              type="button"
              onClick={cancel}
              aria-label="Cancel recording"
              whileTap={tapPress}
              disabled={submitting}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white/10 hover:bg-white/15 text-white/80 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              <X className="w-4 h-4" aria-hidden />
            </motion.button>
            <motion.button
              type="button"
              onClick={finish}
              aria-label="Send voice note"
              whileTap={tapPress}
              disabled={!recording || submitting}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-gradient-to-br from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 disabled:opacity-50 text-white cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
            >
              {submitting ? (
                <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-orbit" aria-hidden />
              ) : (
                <Send className="w-4 h-4 -ml-0.5" aria-hidden />
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
