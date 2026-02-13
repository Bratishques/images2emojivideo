import chalk from "chalk";

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  LOG = 2,
  DEBUG = 3,
  VERBOSE = 4,
}

export interface LoggerOptions {
  context?: string;
  logLevels?: LogLevel[];
  timestamp?: boolean;
}

export class Logger {
  private context: string;
  private logLevels: LogLevel[];
  private timestamp: boolean;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context || "Application";
    this.logLevels = options.logLevels || [
      LogLevel.ERROR,
      LogLevel.WARN,
      LogLevel.LOG,
      LogLevel.DEBUG,
      LogLevel.VERBOSE,
    ];
    this.timestamp = options.timestamp !== false;
  }

  private formatMessage(level: string, message: string, color: (str: string) => string): string {
    const timestamp = this.timestamp ? this.getTimestamp() : "";
    const context = chalk.yellow(`[${this.context}]`);
    const levelStr = color(level.padEnd(7));
    
    const parts = [timestamp, levelStr, context, message].filter(Boolean);
    return parts.join(" ");
  }

  private getTimestamp(): string {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toTimeString().split(" ")[0];
    return chalk.gray(`${date} ${time}`);
  }

  private shouldLog(level: LogLevel): boolean {
    return this.logLevels.includes(level);
  }

  error(message: string, trace?: string, context?: string): void {
    if (!this.shouldLog(LogLevel.ERROR)) return;
    
    const ctx = context || this.context;
    const errorMsg = this.formatMessage("ERROR", message, chalk.red);
    console.error(errorMsg);
    
    if (trace) {
      const traceMsg = this.formatMessage("ERROR", trace, chalk.red);
      console.error(traceMsg);
    }
  }

  warn(message: string, context?: string): void {
    if (!this.shouldLog(LogLevel.WARN)) return;
    
    const ctx = context || this.context;
    const warnMsg = this.formatMessage("WARN", message, chalk.yellow);
    console.warn(warnMsg);
  }

  log(message: string, context?: string): void {
    if (!this.shouldLog(LogLevel.LOG)) return;
    
    const ctx = context || this.context;
    const logMsg = this.formatMessage("LOG", message, chalk.green);
    console.log(logMsg);
  }

  debug(message: string, context?: string): void {
    if (!this.shouldLog(LogLevel.DEBUG)) return;
    
    const ctx = context || this.context;
    const debugMsg = this.formatMessage("DEBUG", message, chalk.blue);
    console.log(debugMsg);
  }

  verbose(message: string, context?: string): void {
    if (!this.shouldLog(LogLevel.VERBOSE)) return;
    
    const ctx = context || this.context;
    const verboseMsg = this.formatMessage("VERBOSE", message, chalk.magenta);
    console.log(verboseMsg);
  }

  setContext(context: string): void {
    this.context = context;
  }

  setLogLevels(levels: LogLevel[]): void {
    this.logLevels = levels;
  }
}

// Default logger instance
export const logger = new Logger({ context: "Application" });

