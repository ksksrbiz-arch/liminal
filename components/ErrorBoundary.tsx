import React, { Component, ErrorInfo, ReactNode } from 'react';
import { getLogger } from '../lib/gameLogger';
import BugReportModal from './BugReportModal';
import SafeModeTerminal from './SafeModeTerminal';

interface Props {
  children: ReactNode;
  fallbackTextComponent?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showConsole: boolean;
  forceTextFallback: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      showConsole: false,
      forceTextFallback: false
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI.
    return { 
      hasError: true, 
      error,
      showConsole: false,
      forceTextFallback: false
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const logger = getLogger();
    logger.fatal(
      `Unhandled React Component Crash: ${error.message}`, 
      'REACT_BOUNDARY', 
      `Stack trace: ${error.stack}\nComponent Stack: ${errorInfo.componentStack}`
    );
  }

  private handleHardRecovery = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  private handleEnterTextMode = () => {
    this.setState({ forceTextFallback: true });
  };

  public render() {
    const { hasError, error, forceTextFallback, showConsole } = this.state;

    if (hasError) {
      if (forceTextFallback) {
        return (
          <>
            <SafeModeTerminal 
              onReboot={() => this.setState({ hasError: false, error: null, forceTextFallback: false })}
              onOpenFeedback={() => this.setState({ showConsole: true })}
              savedNotes={[]}
              onNoteDiscovered={(id) => {
                const logger = getLogger();
                logger.info(`Discovered note ${id} in crash-recovery safe terminal grid.`, 'CRASH_GRID_PLAY');
              }}
            />
            
            <BugReportModal 
              isOpen={showConsole}
              onClose={() => this.setState({ showConsole: false })}
              currentUserEmail={null}
              onForceGraphicsFailure={() => {}}
              currentGameStats={{ crashRecoveredMode: true }}
            />
          </>
        );
      }

      return (
        <div className="relative w-full h-screen bg-[#070101] text-red-500 font-mono flex flex-col justify-center items-center p-6 text-center select-none overflow-hidden" id="crash_boundary_overlay">
          {/* CRT Noise Grid overlay */}
          <div 
            className="absolute inset-x-0 inset-y-0 pointer-events-none z-50 opacity-[0.08]"
            style={{
              backgroundImage: "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.45) 50%)",
              backgroundSize: "100% 6px"
            }}
          />
          <div className="absolute inset-0 bg-[#3a0000]/10 mix-blend-color-burn animate-pulse pointer-events-none"></div>

          <div className="relative z-15 flex flex-col items-center max-w-2xl bg-black/80 border-2 border-red-900/50 p-8 rounded-lg shadow-[0_0_80px_rgba(153,0,0,0.3)]">
            <span className="text-red-600 text-6xl animate-pulse tracking-widest font-serif block mb-4" style={{ transform: 'scale(1.3, 1)' }}>⚠️ INTERCEPTED</span>
            
            <h1 className="text-lg font-bold uppercase tracking-wider text-red-400 mb-2 border-b border-red-900/40 pb-2 w-full">
              CONTAINMENT SHIELD EXCEPTION RESOLVER
            </h1>
            
            <p className="text-xs text-gray-400 leading-relaxed max-w-md mb-6 uppercase text-center">
              An unhandled logical exception threatened core sandbox stability. The critical thread has been successfully decoupled from the display engine to prevent terminal hang.
            </p>

            {/* Error Message Box */}
            <div className="w-full bg-red-950/20 border border-red-900/40 p-4 rounded text-left font-mono text-[11px] text-red-200 mb-6 max-h-24 overflow-y-auto w-11/12 mx-auto">
              <span className="font-bold block text-red-400 border-b border-red-900/20 pb-1 mb-1">EXCEPTION RECORDED:</span>
              <span className="break-all">{error?.message || "Unknown virtual segmentation fault"}</span>
              {error?.stack && (
                <span className="block mt-2 opacity-50 font-sans text-[10px] truncate">{error.stack.split('\n')[1] || error.stack}</span>
              )}
            </div>

            {/* Suggestions for resolution */}
            <div className="text-left text-xs text-gray-500 max-w-sm mx-auto mb-8 border-l-2 border-red-900 pl-4 leading-relaxed uppercase">
              <span className="font-bold text-gray-400 block mb-1">RECOMMENDED CORRECTION VECTORS:</span>
              • Refresh client nodes to hot-swap canvas indices.<br/>
              • Re-route system interface to low-graphics text-mode console.<br/>
              • Dispatch log telemetry core dump to engineers.
            </div>

            {/* Responsive Actions */}
            <div className="flex flex-wrap gap-3.5 justify-center w-full">
              <button
                onClick={this.handleHardRecovery}
                className="px-6 py-3 border border-red-800 text-red-400 active:bg-red-900 bg-red-950/25 rounded hover:text-white transition-all text-xs font-bold font-mono tracking-widest uppercase cursor-pointer"
              >
                🔄 FORCE CORE REBOOT
              </button>
              
              <button
                onClick={this.handleEnterTextMode}
                className="px-6 py-3 border border-yellow-800 text-yellow-400 active:bg-yellow-900 bg-yellow-950/25 rounded hover:text-white transition-all text-xs font-bold font-mono tracking-widest uppercase cursor-pointer animate-pulse"
              >
                📟 ENTER PLAYABLE TEXT MODE
              </button>

              <button
                onClick={() => this.setState({ showConsole: true })}
                className="px-6 py-3 border border-gray-800 text-gray-400 active:bg-gray-800 bg-gray-950/25 rounded hover:text-white transition-all text-xs font-bold font-mono tracking-widest uppercase cursor-pointer"
              >
                💬 TRANSMIT TELEMETRY LOGS
              </button>
            </div>
          </div>

          <BugReportModal 
            isOpen={showConsole}
            onClose={() => this.setState({ showConsole: false })}
            currentUserEmail={null}
            onForceGraphicsFailure={() => {}}
            currentGameStats={{ boundaryCrashActive: true, originalMessage: error?.message }}
          />
        </div>
      );
    }

    // Access raw this.props.children adhering strictly to class requirements
    return this.props.children;
  }
}
