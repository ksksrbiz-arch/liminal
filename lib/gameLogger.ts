// Game Logger and Diagnostics Engine

export interface GameLog {
  id: string;
  timestamp: string;
  severity: 'INFO' | 'WARN' | 'ERROR' | 'FATAL';
  module: string;
  message: string;
  details?: string;
}

const STORAGE_KEY = 'liminal_diagnostic_logs';
const MAX_LOG_LENGTH = 100;

class GameLogger {
  private logs: GameLog[] = [];
  private listeners: ((logs: GameLog[]) => void)[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            this.logs = parsed.map(item => ({
              id: item.id || `log-${Math.random()}`,
              timestamp: item.timestamp || new Date().toISOString(),
              severity: item.severity || 'INFO',
              module: item.module || 'SYSTEM',
              message: item.message || '',
              details: item.details
            }));
          }
        }
      } catch (e) {
        // Fallback silently if localStorage blocked
        this.writeLocalLog("LocalStorage disabled or full. Safe fallback enabled.", "WARN", "init");
      }
    }
  }

  private writeLocalLog(message: string, severity: GameLog['severity'] = 'INFO', module: string = 'SYSTEM', details?: string) {
    const logEntry: GameLog = {
      id: `log-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
      timestamp: new Date().toISOString(),
      severity,
      module: module.toUpperCase(),
      message,
      details
    };

    this.logs.push(logEntry);
    if (this.logs.length > MAX_LOG_LENGTH) {
      this.logs.shift();
    }

    // Persist logs
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.logs));
      } catch (e) {
        // If quota exceeded, slice it and write
        this.logs = this.logs.slice(-50);
      }
    }

    this.notifyListeners();
  }

  public info(message: string, module: string = 'SYSTEM', details?: string) {
    this.writeLocalLog(message, 'INFO', module, details);
  }

  public warn(message: string, module: string = 'SYSTEM', details?: string) {
    this.writeLocalLog(message, 'WARN', module, details);
  }

  public error(message: string, module: string = 'SYSTEM', details?: string) {
    this.writeLocalLog(message, 'ERROR', module, details);
  }

  public fatal(message: string, module: string = 'SYSTEM', details?: string) {
    this.writeLocalLog(message, 'FATAL', module, details);
  }

  public getLogs(): GameLog[] {
    return [...this.logs];
  }

  public clearLogs() {
    this.logs = [];
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
    this.notifyListeners();
    this.info("Diagnostic log history cleared manually.", "SYSTEM");
  }

  public subscribe(listener: (logs: GameLog[]) => void): () => void {
    this.listeners.push(listener);
    // Initial emission
    listener([...this.logs]);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    const logsCopy = [...this.logs];
    this.listeners.forEach(l => {
      try {
        l(logsCopy);
      } catch (e) {
        console.error("Error in logger listener", e);
      }
    });
  }

  // Intercept standard global window errors and promise rejections
  public bindGlobalErrorHandlers() {
    if (typeof window === 'undefined') return;

    const handleWindowError = (event: ErrorEvent) => {
      const errorMsg = event.message || 'Unknown window error';
      const file = event.filename || '';
      const line = event.lineno || 0;
      const col = event.colno || 0;
      const stack = event.error?.stack || '';
      
      this.fatal(
        `Uncaught Exception: ${errorMsg}`, 
        'ENVIRONMENT', 
        `Location: ${file}:${line}:${col}\nStack: ${stack}`
      );
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      let msg = 'Unknown unhandled promise rejection';
      let stack = '';
      
      if (reason instanceof Error) {
        msg = reason.message;
        stack = reason.stack || '';
      } else if (typeof reason === 'string') {
        msg = reason;
      } else {
        msg = JSON.stringify(reason);
      }

      this.error(
        `Unhandled Promise Rejection: ${msg}`, 
        'ENVIRONMENT', 
        `Stack: ${stack || 'No stack trace available'}`
      );
    };

    window.addEventListener('error', handleWindowError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    // Patch console.error to log exceptions warning safely without recursively looping
    const originalConsoleError = console.error;
    let isLoggerActive = false;
    
    console.error = (...args: any[]) => {
      originalConsoleError.apply(console, args);
      
      if (isLoggerActive) return; // Prevent infinite log loops
      isLoggerActive = true;
      try {
        const textMsg = args.map(arg => {
          if (arg instanceof Error) return `${arg.message}\n${arg.stack}`;
          if (typeof arg === 'object') return JSON.stringify(arg);
          return String(arg);
        }).join(' ');
        
        // Exclude hot reload / browser-plugin noise
        if (!textMsg.includes('[webpack-dev-server]') && !textMsg.includes('react-devtools') && !textMsg.includes('chrome-extension')) {
          this.error(textMsg.slice(0, 500), 'CONSOLE');
        }
      } catch (e) {
        // failsafe
      } finally {
        isLoggerActive = false;
      }
    };
    
    this.info("Universal diagnostic interceptors and error hooks active.", "LOGGER_CORE");
    
    return () => {
      window.removeEventListener('error', handleWindowError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      console.error = originalConsoleError;
    };
  }
}

let loggerInstance: GameLogger | null = null;

export function getLogger(): GameLogger {
  if (!loggerInstance) {
    loggerInstance = new GameLogger();
  }
  return loggerInstance;
}
