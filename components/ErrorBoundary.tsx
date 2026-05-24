"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Terminal, ShieldAlert, Cpu } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught game engine error:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#050505] text-[#ff4c4c] flex flex-col items-center justify-center p-6 crt crt-animate font-mono">
          <div className="max-w-xl w-full bg-[#0a0505] border border-[#7f1d1d] rounded p-6 shadow-2xl relative overflow-hidden">
            {/* Red scanlines screen overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-red-950/10 pointer-events-none" />
            
            <div className="flex items-center gap-3 mb-6 border-b border-[#7f1d1d] pb-4">
              <ShieldAlert className="w-8 h-8 text-[#ff4c4c]" />
              <div>
                <h1 className="text-xl font-bold tracking-widest text-[#ff4c4c]">SYSTEM KERNEL PANIC</h1>
                <p className="text-xs text-red-500/80">Code: ERR_TACTICAL_CRITICAL</p>
              </div>
            </div>

            <p className="text-sm mb-4 leading-relaxed text-red-100">
              The neural networking engine or canvas display buffer has crashed. A safety override has been initiated.
            </p>

            <div className="bg-[#120606] border border-[#ff3333]/20 rounded p-4 mb-6 max-h-48 overflow-y-auto text-xs text-red-400">
              <span className="font-bold text-red-300">SYSTEM STACK TRACE:</span>
              <pre className="mt-2 whitespace-pre-wrap">
                {this.state.error?.stack || this.state.error?.toString()}
              </pre>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={this.handleReset}
                id="reboot-system"
                className="flex-1 flex items-center justify-center gap-2 bg-[#7f1d1d] hover:bg-red-800 text-white font-semibold py-2.5 px-4 rounded border border-red-600 transition duration-150 active:scale-95"
              >
                <Cpu className="w-4 h-4" />
                REBOOT MAIN MOTHERBOARD
              </button>
              
              <button
                onClick={() => {
                  if (typeof window !== "undefined") {
                     localStorage.removeItem("paranoia_game_logs");
                     window.location.reload();
                  }
                }}
                id="reset-local-storage"
                className="flex-1 flex items-center justify-center gap-2 bg-[#120606] hover:bg-[#250b0c] text-red-400 hover:text-red-300 font-semibold py-2.5 px-4 rounded border border-red-900 transition duration-150 active:scale-95"
              >
                <Terminal className="w-4 h-4" />
                WIPE PREFERENTIALS & RELOAD
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.children;
  }
}
