// Append unanswered questions to a JSONL log file.
declare const require: (module: string) => any; // Allow CommonJS require in TS.
declare const process: { cwd: () => string }; // Minimal process typing.

const fs = require("fs"); // Node file system module.
const path = require("path"); // Node path module.

const LOG_DIR = path.join(process.cwd(), "backend", "data");
const LOG_FILE = path.join(LOG_DIR, "unanswered_questions.jsonl");

type UnansweredRecord = {
  timestamp: string;
  character: string;
  message: string;
  reason: string;
};

function ensureLogFile(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    if (!fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "", "utf8");
    }
  } catch (error: any) {
    // eslint-disable-next-line no-console
    console.error(`[unanswered_logger] Failed to ensure log file: ${error?.message || error}`);
    throw error; // Re-throw to be caught by caller
  }
}

export function logUnansweredQuestion(record: UnansweredRecord): void {
  try {
    // Validate record
    if (!record || typeof record !== "object") {
      // eslint-disable-next-line no-console
      console.error("[unanswered_logger] Invalid record:", record);
      return;
    }
    
    if (!record.timestamp || !record.character || !record.message || !record.reason) {
      // eslint-disable-next-line no-console
      console.error("[unanswered_logger] Missing required fields:", record);
      return;
    }

    ensureLogFile();
    const line = `${JSON.stringify(record)}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf8");
  } catch (error: any) {
    // Log error but don't break chat responses
    // eslint-disable-next-line no-console
    console.error(`[unanswered_logger] Failed to log unanswered question: ${error?.message || error}`);
    // eslint-disable-next-line no-console
    console.error("[unanswered_logger] Record was:", JSON.stringify(record));
  }
}
