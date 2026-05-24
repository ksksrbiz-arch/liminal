"use client";

import React, { useState } from "react";
import { Bug, Send, X, ShieldAlert, CheckCircle2 } from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  gameTimeElapsed: number;
  sanityLevel: number;
  playerState: any;
}

export function BugReportModal({ isOpen, onClose, gameTimeElapsed, sanityLevel, playerState }: Props) {
  const [details, setDetails] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!details.trim()) return;

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/bug-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          details,
          gameTimeElapsed,
          sanityLevel,
          playerState,
          userEmail: "skagglegotu@gmail.com"
        }),
      });
      const data = await response.json();
      if (data.success) {
        setSuccessMsg("Incident protocol data successfully synchronized with security servers.");
        setDetails("");
        setTimeout(() => {
          setSuccessMsg(null);
          onClose();
        }, 2200);
      } else {
        throw new Error(data.error);
      }
    } catch (err: any) {
      console.error(err);
      alert("Failed to synchronize reporting packets: " + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 font-mono crt">
      <div className="bg-[#0c0d12] border border-[#232d3d] rounded-lg max-w-lg w-full p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          id="close-modal-btn"
          className="absolute top-4 right-4 text-gray-500 hover:text-red-400 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5 border-b border-gray-800 pb-3">
          <Bug className="w-6 h-6 text-[#4bc0c0]" />
          <div>
            <h2 className="text-md font-bold text-gray-200 tracking-wider">INCIDENT PORTAL DIARY</h2>
            <p className="text-[10px] text-gray-400">Tactical Security Log Submission Interface</p>
          </div>
        </div>

        {successMsg ? (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
            <CheckCircle2 className="w-12 h-12 text-[#4bc0c0] animate-bounce" />
            <p className="text-sm font-semibold text-gray-200">{successMsg}</p>
            <p className="text-xs text-emerald-500 font-bold">TRANSMISSION OK</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="text-xs bg-gray-950/80 p-3 rounded border border-gray-900 leading-relaxed text-gray-300">
              <span className="font-bold text-[#4bc0c0] block mb-1">INCIDENT TELEMETRY PAYLOAD:</span>
              <ul className="space-y-1 text-gray-400">
                <li>• Elapsed Survival: <span className="text-gray-200">{Math.floor(gameTimeElapsed)}s</span></li>
                <li>• Biological Sanity: <span className="text-gray-200">{Math.floor(sanityLevel)}%</span></li>
                <li>• Coordinates: <span className="text-gray-200">X: {playerState?.x?.toFixed(1)}, Y: {playerState?.y?.toFixed(1)}</span></li>
                <li>• Operator ID: <span className="text-gray-200">sk@sec.bunker</span></li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-400 tracking-wider">
                DESCRIBE INTRUDER ANOMALY OR SYSTEM BUG:
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={4}
                required
                placeholder="Declare visual anomalies, stalker routing glitches, hardware audio lag, or general incident details..."
                className="w-full bg-[#050608] border border-[#1e2530] focus:border-[#4bc0c0] rounded p-3 text-xs text-gray-100 placeholder-gray-600 focus:outline-none transition-colors resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || !details.trim()}
              id="submit-modal-btn"
              className="w-full flex items-center justify-center gap-2 bg-[#1b2b3a] hover:bg-[#283e53] text-[#4bc0c0] font-bold py-2.5 px-4 rounded border border-[#4bc0c0]/30 hover:border-[#4bc0c0]/60 transition duration-150 active:scale-95 disabled:opacity-30 disabled:pointer-events-none"
            >
              {isSubmitting ? (
                <>
                  <ShieldAlert className="w-4 h-4 animate-spin text-amber-500" />
                  CRYPTOGRAPHIC TRANSMISSION IN PROGRESS...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  SUBMIT INCIDENT REPORT TO STATION SERVER
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
