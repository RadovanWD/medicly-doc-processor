import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { processDocxFile } from './src/services/docProcessor.js';
import { insertPost, closePool } from './src/services/database.js';
import { logError } from './src/services/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIRECTORY = path.join(__dirname, 'doc');
const SENT_DIRECTORY = path.join(__dirname, 'sent');

/**
 * Ensures that the 'sent' directory exists, creating it if necessary.
 */
async function ensureSentDirectoryExists() {
  try {
    await fs.mkdir(SENT_DIRECTORY, { recursive: true });
  } catch (error) {
    console.error(
      `❌ CRITICAL: Could not create the 'sent' directory. Please check permissions.`,
      error,
    );
    process.exit(1); // Exit the script if we can't create the folder.
  }
}

async function main() {
  console.log('🧑‍🏫 Starting Medicly document processor (V3)...');
  await ensureSentDirectoryExists(); // Make sure the 'sent' folder is ready.

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
          // Move the file to the 'sent' directory
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
