import fs from 'fs/promises';
import path from 'path';

const LOG_FILE = 'error.log';

/**
 * Logs an error message to both the console and the error.log file.
 * @param {string} fileName - The name of the file that caused the error.
 * @param {string} message - The error message.
 */
export async function logError(fileName, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] | File: ${fileName} | Error: ${message}\n`;

  try {
    // Log to console for immediate feedback
    console.error(`   ❌ Error processing ${fileName}: ${message}`);

    // Append to log file for persistence
    await fs.appendFile(LOG_FILE, logMessage);
  } catch (err) {
    console.error('CRITICAL: Failed to write to log file.', err);
  }
}
