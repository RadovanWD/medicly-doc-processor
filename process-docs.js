import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processDocxFile } from './src/services/docProcessor.js';
import { insertPost, closePool } from './src/services/database.js';
import { logError } from './src/services/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIRECTORY = path.join(__dirname, 'doc');
const SENT_DIRECTORY = path.join(__dirname, 'sent');
const LOG_FILE = 'error.log';

/**
 * Clears the error log file at the start of the script.
 */
async function clearErrorLog() {
  try {
    await fs.unlink(LOG_FILE);
    console.log('🧹 Previous error log cleared.');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      // ENOENT means the file doesn't exist, which is fine.
      // Log any other errors.
      console.error('Could not clear the error log:', error);
    }
  }
}

async function ensureSentDirectoryExists() {
  try {
    await fs.mkdir(SENT_DIRECTORY, { recursive: true });
  } catch (error) {
    console.error(`❌ CRITICAL: Could not create the 'sent' directory.`, error);
    process.exit(1);
  }
}

async function main() {
  console.log('🧑‍🏫 Starting Medicly document processor (V4)...');
  await clearErrorLog();
  await ensureSentDirectoryExists();

  try {
    const files = await fs.readdir(DOCS_DIRECTORY);
    const docxFiles = files.filter(
      file => path.extname(file).toLowerCase() === '.docx' && !file.startsWith('~'),
    );

    if (docxFiles.length === 0) {
      console.log('💡 No .docx files found in the ./doc directory. Exiting.');
      return;
    }
    console.log(`✅ Found ${docxFiles.length} .docx file(s) to process.`);

    for (const file of docxFiles) {
      const filePath = path.join(DOCS_DIRECTORY, file);
      console.log(`\nProcessing file: ${file}`);
      try {
        const postData = await processDocxFile(filePath);
        const result = await insertPost(postData);

        if (result) {
          console.log(`   ✅ Success: Post "${postData.slug}" saved with ID: ${result.id}.`);
          const newFilePath = path.join(SENT_DIRECTORY, file);
          await fs.rename(filePath, newFilePath);
          console.log(`   ✅ Moved "${file}" to the ./sent folder.`);
        } else {
          console.log(
            `   ⚠️ Skipped: A post with slug "${postData.slug}" already exists. File not moved.`,
          );
        }
      } catch (error) {
        await logError(file, error.message);
      }
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      const errorMsg = `The directory "${DOCS_DIRECTORY}" does not exist.`;
      await logError('N/A', errorMsg);
    } else {
      await logError('N/A', `A critical error occurred: ${error.message}`);
    }
  } finally {
    await closePool();
    console.log('\nScript finished. Database connection pool closed.');
  }
}

main();
