export interface LogEntry {
  timestamp: string;
  level: "INFO" | "WARNING" | "CRITICAL" | "SYSTEM";
  message: string;
}

class GameLogger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  constructor() {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("paranoia_game_logs");
        if (saved) {
          this.logs = JSON.parse(saved);
        }
      } catch (e) {
        console.warn("Could not load logs from localStorage");
      }
    }
  }

  public log(level: "INFO" | "WARNING" | "CRITICAL" | "SYSTEM", message: string) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    
    this.logs.unshift(entry);
    
    // Keep within bounds
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(0, this.maxLogs);
    }

    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("paranoia_game_logs", JSON.stringify(this.logs));
      } catch (e) {}
    }

    console.log(`[${entry.level}] ${entry.message}`);
  }

  public getLogs(): LogEntry[] {
    return this.logs;
  }

  public clearLogs() {
    this.logs = [];
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("paranoia_game_logs");
      } catch (e) {}
    }
  }
}

export const logger = new GameLogger();
