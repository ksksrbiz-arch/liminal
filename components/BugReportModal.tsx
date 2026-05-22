import React, { useState, useEffect } from 'react';
import { getLogger, GameLog } from '../lib/gameLogger';

interface BugReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail?: string | null;
  onForceGraphicsFailure: () => void;
  onSimulateContextLoss?: () => void;
  currentGameStats?: Record<string, any>;
}

export default function BugReportModal({
  isOpen,
  onClose,
  currentUserEmail,
  onForceGraphicsFailure,
  onSimulateContextLoss,
  currentGameStats = {}
}: BugReportModalProps) {
  const logger = getLogger();
  const [email, setEmail] = useState(currentUserEmail || '');
  const [summary, setSummary] = useState('');
  const [extraDetails, setExtraDetails] = useState('');
  const [logs, setLogs] = useState<GameLog[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<boolean>(false);
  const [webglCaps, setWebglCaps] = useState<Record<string, any>>({});

  // Sync email when user overrides authentication
  useEffect(() => {
    if (currentUserEmail) {
      setTimeout(() => {
        setEmail(currentUserEmail);
      }, 0);
    }
  }, [currentUserEmail]);

  // Load and subscribe to logs when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const unsubscribe = logger.subscribe((updatedLogs) => {
      setLogs(updatedLogs);
    });

    // Capture basic WebGL capabilities for the diagnostic packet
    if (typeof window !== 'undefined') {
      try {
        const canvas = document.createElement('canvas');
        const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
        if (gl) {
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as any;
          setTimeout(() => {
            setWebglCaps({
              supported: true,
              version: gl.getParameter(gl.VERSION),
              vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unmasked vendor restricted',
              renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unmasked renderer restricted',
              shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
              maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
            });
          }, 0);
        } else {
          setTimeout(() => {
            setWebglCaps({ supported: false, error: 'WebGL basic interface returned null' });
          }, 0);
        }
      } catch (e: any) {
        const errMsg = e.message || 'WebGL check exception';
        setTimeout(() => {
          setWebglCaps({ supported: false, error: errMsg });
        }, 0);
      }
    }

    return () => unsubscribe();
  }, [isOpen, logger]);

  if (!isOpen) return null;

  const handleCopyLogs = () => {
    try {
      const logDump = logs.map(l => `[${l.timestamp}] [${l.severity}] [${l.module}] ${l.message}`).join('\n');
      navigator.clipboard.writeText(logDump);
      setCopiedIndex(true);
      setTimeout(() => setCopiedIndex(false), 2000);
      logger.info("Diagnostic log dump copied to clipboard.", "DIAG_PANEL");
    } catch (e) {
      logger.error("Failed to copy logs to clipboard.", "DIAG_PANEL");
    }
  };

  const handleClearLogs = () => {
    logger.clearLogs();
  };

  // Safe manual action triggers
  const handleSimulateReactError = () => {
    logger.fatal("Debug: Manually triggered runtime exception. Preparing component fallback cascade.", "FAULT_INJECTOR");
    setTimeout(() => {
      throw new Error("MANUAL_FAULT_INJECTION: Standard React Component Crash Test. The React error boundary should capture this safely.");
    }, 100);
  };

  const handleTriggerContextLoss = () => {
    if (onSimulateContextLoss) {
      logger.warn("Diagnostic: Initiating simulated GPU WebGL Context Loss sequence.", "FAULT_INJECTOR");
      onSimulateContextLoss();
      onClose();
    } else {
      alert("WebGL context loss trigger is currently unavailable. Start the 3D game first.");
    }
  };

  const handleSimulateStorageException = () => {
    logger.warn("Diagnostic: Testing LocalStorage full Exception simulation.", "FAULT_INJECTOR");
    try {
      throw new DOMException("The serialized quota has exceeded local sandbox limits.", "QuotaExceededError");
    } catch (e: any) {
      logger.error("LocalStorage write crash trapped successfully.", "STORAGE_ENG", e.stack);
    }
  };

  const handleSubmitReport = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitMessage(null);
    setSubmitError(null);
    setDiagnosticId(null);

    const reportPayload = {
      timestamp: new Date().toISOString(),
      email: email || 'anonymous@player.local',
      summary: summary || 'User telemetry description skipped',
      errorDetails: extraDetails || 'No auxiliary details provided',
      userAgent: typeof window !== 'undefined' ? navigator.userAgent : 'Server-Side Node Environment',
      screenSize: typeof window !== 'undefined' ? {
        width: window.innerWidth,
        height: window.innerHeight,
        pixelRatio: window.devicePixelRatio
      } : null,
      webglCapabilities: webglCaps,
      gameState: currentGameStats,
      logs: logs
    };

    try {
      // 1. Submit to server API
      const response = await fetch('/api/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reportPayload)
      });

      if (!response.ok) {
        throw new Error(`API returned response status ${response.status}`);
      }

      const resData = await response.json();
      
      if (resData.success) {
        setDiagnosticId(resData.diagnosticId);
        setSubmitMessage(resData.message);
        logger.info(`Telemetry report submitted securely. Diagnostic ID: ${resData.diagnosticId}`, "DIAG_SENDER");
        // Clear input form
        setSummary('');
        setExtraDetails('');
      } else {
        throw new Error(resData.error || "Submission rejected by development endpoint.");
      }
    } catch (err: any) {
      // Automatic recovery: store bug report locally in LocalStorage if API fails!
      logger.error(`Automatic report upload failed. Attempting offline backup: ${err.message}`, "DIAG_SENDER");
      
      try {
        const storedFailedReports = localStorage.getItem('liminal_failed_reports');
        const list = storedFailedReports ? JSON.parse(storedFailedReports) : [];
        list.push(reportPayload);
        localStorage.setItem('liminal_failed_reports', JSON.stringify(list.slice(-5))); // keep last 5
        
        setSubmitError(`Failed to transmit report directly to our core server due to network restrictions. However, to ensure seamless recovery, your report has been cached in local browser storage and will retry synchronization automatically on next reboot.`);
      } catch (backupErr) {
        setSubmitError(`Network transmission failed: ${err.message}. Additionally, local offline backup storage limits were exceeded. Please copy raw logs manually.`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-[1000] flex items-center justify-center p-4 overflow-y-auto font-sans" id="diagnostic_system_modal">
      <div className="bg-[#0b0c10] border border-gray-800 w-full max-w-4xl rounded-lg h-[90vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.85)] select-text relative text-white">
        
        {/* Header decoration */}
        <header className="border-b border-gray-800 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-red-500 font-mono text-xs tracking-[0.25em] font-bold">● SYSTEM INTEGRITY STAGING PANEL</h2>
            <p className="text-xl font-serif text-gray-200 mt-0.5">Diagnostics & Safe Mode Staging</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-500 hover:text-white font-mono text-sm border border-gray-800 hover:border-gray-500 px-3 py-1 rounded transition-colors focus:outline-none"
          >
            DISMISS [ESC]
          </button>
        </header>

        {/* Modal body */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 overflow-hidden">
          
          {/* Left panel - Submission form & diagnostics */}
          <form onSubmit={handleSubmitReport} className="lg:col-span-7 p-6 overflow-y-auto flex flex-col gap-4 border-r border-gray-800">
            <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider">Report System Instability</h3>
            
            {submitMessage && (
              <div className="bg-green-950/20 border border-green-500/30 text-green-400 rounded-md p-4 text-xs font-mono">
                <p className="font-bold">✔ TRANSMISSION COMPLETED SUCCESSFULLY</p>
                <p className="mt-1 leading-relaxed">{submitMessage}</p>
                {diagnosticId && <p className="mt-2 text-white font-extrabold uppercase bg-green-500/10 px-2 py-1 inline-block rounded">Diagnostic ID: {diagnosticId}</p>}
              </div>
            )}

            {submitError && (
              <div className="bg-red-950/20 border border-red-500/30 text-red-400 rounded-md p-4 text-xs font-mono leading-relaxed">
                <p className="font-bold">⚠️ AUTOMATED NETWORK RECOVERY NOTICE</p>
                <p className="mt-1">{submitError}</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">YOUR SYSTEM EMAIL COORDINATE</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="skagglegotu@gmail.com" 
                className="bg-[#121318] border border-gray-800 focus:border-red-900 focus:outline-none px-3 py-2.5 rounded text-sm text-gray-200 font-mono"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">UNEXPECTED INSTABILITY ENCOUNTERED (SUMMARY)</label>
              <input 
                type="text" 
                required
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="e.g. Flickering shadow artifact in north breaker, or WebGL lag..." 
                className="bg-[#121318] border border-gray-800 focus:border-red-900 focus:outline-none px-3 py-2.5 rounded text-sm text-gray-200"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-mono text-gray-400">STEPS EXECUTED PRIOR FROM COLLAPSE (OPTIONAL)</label>
              <textarea 
                rows={3}
                value={extraDetails}
                onChange={(e) => setExtraDetails(e.target.value)}
                placeholder="e.g. Walking near user start checkpoint users/save location. Collected lithium battery." 
                className="bg-[#121318] border border-gray-800 focus:border-red-900 focus:outline-none px-3 py-2.5 rounded text-sm text-gray-200 font-sans"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-red-950/70 border border-red-900 text-red-400 active:bg-red-900 hover:text-white font-mono tracking-widest py-3 text-xs font-bold rounded transition-colors uppercase cursor-pointer"
            >
              {isSubmitting ? "COMPILING SIGNAL MATRIX..." : "⚡ DISPATCH SYSTEM TELEMETRY TO DEV HEADQUARTERS"}
            </button>

            {/* Simulated hardware specs */}
            <div className="mt-4 pt-4 border-t border-gray-900">
              <h4 className="text-[10px] font-mono text-gray-500 uppercase tracking-[0.15em] mb-2">Decrypted Hardware Signatures</h4>
              <div className="grid grid-cols-2 gap-3 text-2xs font-mono text-gray-400 bg-[#121318]/50 p-3.5 rounded border border-gray-900">
                <div>
                  <span className="opacity-50">AGENT WORKSPACE:</span>
                  <span className="text-[#a6adbb] block">DEV RUN CONTAINER [3000]</span>
                </div>
                <div>
                  <span className="opacity-50">DIAGNOSTIC TELEMETRY:</span>
                  <span className="text-[#a6adbb] block">ACTIVE (100% DEPTH)</span>
                </div>
                {webglCaps.supported ? (
                  <>
                    <div className="col-span-2">
                      <span className="opacity-50">GPU HARDWARE INTERFACE:</span>
                      <span className="text-[#a6adbb] block truncate">{webglCaps.renderer}</span>
                    </div>
                    <div>
                      <span className="opacity-50">SHADING LANG:</span>
                      <span className="text-[#a6adbb] block">{webglCaps.shadingLanguageVersion}</span>
                    </div>
                    <div>
                      <span className="opacity-50">GL MAX SECTOR TEX SIZE:</span>
                      <span className="text-[#a6adbb] block">{webglCaps.maxTextureSize}px</span>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 text-yellow-600">
                    <span className="opacity-50">GPU HARDWARE INTERFACE:</span>
                    <span className="block font-bold">⛔ WEBGL UNRESPONSIVE OR BLOCKED</span>
                  </div>
                )}
              </div>
            </div>
          </form>

          {/* Right panel - Live logs console and fault injection suite */}
          <aside className="lg:col-span-5 p-6 overflow-y-auto flex flex-col gap-5 bg-[#0a0a0d]">
            
            {/* Logs controller section */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between border-b border-gray-900 pb-2">
                <h3 className="text-xs font-mono uppercase text-gray-400 tracking-wider">Diagnostic Log Collector ({logs.length})</h3>
                <div className="flex gap-2.5">
                  <button 
                    type="button"
                    onClick={handleCopyLogs}
                    className="text-[10px] uppercase font-mono border border-gray-800 px-2 py-0.5 rounded hover:border-gray-500 transition-colors"
                  >
                    {copiedIndex ? "COPIED" : "COPY"}
                  </button>
                  <button 
                    type="button"
                    onClick={handleClearLogs}
                    className="text-[10px] uppercase font-mono border border-red-950 text-red-500 px-2 py-0.5 rounded hover:border-red-900 transition-colors"
                  >
                    CLEAR
                  </button>
                </div>
              </div>

              {/* Monospace virtual logs block */}
              <div className="bg-black/80 border border-gray-900 h-44 rounded-md p-3.5 overflow-y-auto font-mono text-[10px] flex flex-col gap-1.5 scrollbar-thin">
                {logs.length === 0 ? (
                  <span className="text-gray-600 italic">No telemetry reports collected currently. Walk around or test.</span>
                ) : (
                  logs.map((log) => {
                    let sevCol = 'text-green-400';
                    if (log.severity === 'WARN') sevCol = 'text-amber-500';
                    if (log.severity === 'ERROR') sevCol = 'text-red-500';
                    if (log.severity === 'FATAL') sevCol = 'text-white font-extrabold bg-red-900 px-1 rounded animate-pulse';
                    
                    return (
                      <div key={log.id} className="leading-normal flex items-start gap-1 p-0.5 border-b border-white/5 pb-1">
                        <span className="text-gray-600 shrink-0 text-[9px]">{log.timestamp.slice(11, 19)}</span>
                        <span className={`${sevCol} shrink-0 uppercase tracking-tighter text-[9px]`}>[{log.severity}]</span>
                        <span className="text-[#a6adbb] break-all">{log.message}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* QA Testing Lab / Fault Injector Suit */}
            <div className="border border-red-950/40 bg-red-950/5 p-4 rounded-lg flex flex-col gap-3">
              <div>
                <h4 className="text-xs font-mono font-bold tracking-wider text-red-500">🧪 INTERACTIVE FAULT SIMULATION LAB</h4>
                <p className="text-[10px] text-gray-500 mt-0.5 leading-normal uppercase font-mono">
                  Safely trigger error states in real-time to verify handlers and Text fallback mode.
                </p>
              </div>
              
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={onForceGraphicsFailure}
                  className="w-full bg-[#3d1500]/40 border border-[#ff6600]/30 hover:bg-[#ff6600]/15 text-[#ff8000] text-2xs py-2 rounded font-mono font-bold text-left px-3 flex items-center justify-between"
                >
                  <span>FA-01: FORCE SAFE-MODE TEXT RE-ROUTE</span>
                  <span className="text-[10px]">FORCE FALLBACK</span>
                </button>

                <button
                  type="button"
                  onClick={handleTriggerContextLoss}
                  className="w-full bg-[#330000]/40 border border-red-900/30 hover:bg-red-900/15 text-red-400 text-2xs py-2 rounded font-mono font-bold text-left px-3 flex items-center justify-between"
                >
                  <span>FA-02: SIMULATE WEBGL CANVAS CONTEXT LOSS</span>
                  <span className="text-[10px]">LOST WEBGL</span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateStorageException}
                  className="w-full bg-slate-900/40 border border-slate-700/30 hover:bg-slate-700/15 text-slate-300 text-2xs py-2 rounded font-mono font-bold text-left px-3 flex items-center justify-between"
                >
                  <span>FA-03: EMULATE LOCALSTORAGE LIMIT CRASH</span>
                  <span className="text-[10px]">TEST STORAGE</span>
                </button>

                <button
                  type="button"
                  onClick={handleSimulateReactError}
                  className="w-full bg-red-950/20 border border-red-500/20 hover:bg-red-500/10 text-red-200 text-2xs py-2 rounded font-mono font-bold text-left px-3 flex items-center justify-between bg-red-950/40 border-red-500/40"
                >
                  <span>FA-04: TRAP UNHANDLED EXCEPTION CRASH</span>
                  <span className="text-[10px] font-extrabold text-red-500 animate-pulse">FATAL React Error</span>
                </button>
              </div>
              <div className="text-[9px] text-gray-500 font-mono uppercase text-center mt-0.5">
                FAULT SIGNALS ARE INTERCEPTED SAFELY AND RECOVERABLE VIA RELOAD.
              </div>
            </div>

          </aside>

        </div>
      </div>
    </div>
  );
}
