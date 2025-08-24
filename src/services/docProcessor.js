import mammoth from 'mammoth';

/**
 * Extracts structured data from the raw text of a .docx file.
 *
 * @param {string} rawText - The full raw text from the document.
 * @param {string} filePath - The path to the file being processed, for error logging.
 * @returns {{metadata: object, content: string}} An object containing the extracted metadata and the main article content.
 */
function extractData(rawText, filePath) {
  const lines = rawText.split('\n').filter(line => line.trim() !== '');
  const metadata = {};
  let contentLines = [];
  let seoBlockStartIndex = -1;

  // Find the SEO block first to determine the content boundary
  const seoMarkers = /^(SEO & Meta Details|Blog Post:|Meta Data|1\. Meta Data|Meta Title:|Slug:|URL Slug:)/i;
  seoBlockStartIndex = lines.findIndex(line => seoMarkers.test(line));

  // 1. Extract Title, Author, and pre-SEO content
  let titleFound = false;
  for (let i = 0; i < (seoBlockStartIndex === -1 ? lines.length : seoBlockStartIndex); i++) {
    const line = lines[i].trim();
    if (/^By Dr\./i.test(line)) {
      metadata.author = line;
    } else if (!titleFound && line.length > 20 && !line.includes('Medically reviewed')) {
      metadata.title = line;
      titleFound = true;
    } else if (titleFound) {
      contentLines.push(lines[i]); // Use original line to preserve formatting
    }
  }

  // 2. Extract SEO metadata
  if (seoBlockStartIndex !== -1) {
    const seoLines = lines.slice(seoBlockStartIndex);
    let descriptionLines = [];
    let isParsingDescription = false;

    const seoPatterns = {
      slug: /^(Slug|Slugx|URL Slug|Suggested URL Slug):/i,
      metaTitle: /^(Meta Title|Optimized Meta Title):/i,
      metaDescription: /^(Meta Description|Compelling Meta Description):/i,
      keywords: /^Primary Keywords:/i,
    };

    seoLines.forEach(line => {
      const trimmedLine = line.trim();
      if (seoPatterns.slug.test(trimmedLine)) {
        isParsingDescription = false;
        metadata.slug = trimmedLine.replace(seoPatterns.slug, '').trim();
      } else if (seoPatterns.metaTitle.test(trimmedLine)) {
        isParsingDescription = false;
        metadata.metaTitle = trimmedLine.replace(seoPatterns.metaTitle, '').trim();
      } else if (seoPatterns.metaDescription.test(trimmedLine)) {
        isParsingDescription = true;
        descriptionLines.push(trimmedLine.replace(seoPatterns.metaDescription, '').trim());
      } else if (seoPatterns.keywords.test(trimmedLine)) {
        isParsingDescription = false;
        metadata.keywords = trimmedLine.replace(seoPatterns.keywords, '').trim();
      } else if (isParsingDescription) {
        descriptionLines.push(trimmedLine);
      }
    });

    if (descriptionLines.length > 0) {
      metadata.metaDescription = descriptionLines.join(' ').trim();
    }
  }

  // 3. Final validation
  if (!metadata.title) {
    throw new Error(`Title could not be determined for file: ${filePath}`);
  }
  if (!metadata.slug) {
    throw new Error(`Slug could not be found for file: ${filePath}`);
  }
  if (!metadata.metaTitle) {
    throw new Error(`Meta Title could not be found for file: ${filePath}`);
  }

  const content = contentLines.join('\n');
  return { metadata, content };
}


/**
 * Converts the extracted text content to HTML and applies post-processing.
 *
 * @param {string} content - The raw text content of the article.
 * @returns {Promise<string>} The processed HTML string.
 */
async function generateAndProcessHtml(content) {
  // Use mammoth to convert the raw text content to HTML
  const htmlResult = await mammoth.convert({
    array: Buffer.from(content)
  }, {
    styleMap: [
      "p[style-name='heading 1'] => h1:fresh",
      "p[style-name='heading 2'] => h2:fresh",
      "p[style-name='heading 3'] => h3:fresh",
      "p[style-name='heading 4'] => h4:fresh",
    ]
  });

  let processedHtml = htmlResult.value;

  // Define internal links and their URLs
  const internalLinks = [
    { phrases: ['online prescription', 'online prescriptions'], url: 'https://medicly.com.au/prescriptions' },
    { phrases: ['doctor consultation', 'online doctor consultation'], url: 'https://medicly.com.au/doctor-consultation' },
    { phrases: ['certificates'], url: 'https://medicly.com.au/certificates' },
    // Add more links as needed
  ];

  // Wrap phrases with hyperlinks
  internalLinks.forEach(link => {
    link.phrases.forEach(phrase => {
      // Use a regex that avoids replacing text already inside an <a> tag
      const regex = new RegExp(`(?<!<a[^>]*>)${phrase}(?!<\/a>)`, 'gi');
      processedHtml = processedHtml.replace(regex, `<a href=\"${link.url}\">${phrase}</a>`);
    });
  });

  // Add class="blog_cta" to specific call-to-action links
  processedHtml = processedHtml.replace(
    /(<a href=\"https:\/\/medicly.com.au\/[^\"]*\")>/g,
    '$1 class=\"blog_cta\">'
  );

  return processedHtml;
}


export async function processDocxFile(filePath) {
  const rawTextResult = await mammoth.extractRawText({ path: filePath });
  const rawText = rawTextResult.value;

  // Extract metadata and content from the raw text
  const { metadata, content } = extractData(rawText, filePath);

  // Generate and process the HTML from the extracted content
  const processedContent = await generateAndProcessHtml(content);

  // Return the complete, structured data
  return { ...metadata, content: processedContent };
}

