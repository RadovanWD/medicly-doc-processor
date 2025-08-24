import mammoth from 'mammoth';

/**
 * Parses data from the top of the document (Author, Title).
 */
function parseTopMatter(rawText) {
  const topMatter = {};
  const lines = rawText.split('\n');
  const nonTitlePatterns = [/^By Dr\. Gurbakhshish/i, /^Medically reviewed/i];

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    const isNonTitle = nonTitlePatterns.some(pattern => pattern.test(trimmedLine));
    if (!isNonTitle) {
      // A simple check to avoid picking up a short, irrelevant line as the title.
      if (trimmedLine.length > 15) {
        topMatter.title = trimmedLine;
        break;
      }
    }
  }

  const authorLine = lines.find(line => line.trim().startsWith('By Dr.'));
  if (authorLine) {
    topMatter.author = authorLine.trim();
  }

  if (!topMatter.title) {
    throw new Error(
      'Could not automatically determine the post title. Check the document for a clear title at the top.',
    );
  }
  return topMatter;
}

/**
 * A much more robust function to find and parse the SEO metadata block, wherever it is.
 */
function parseSeoMetadata(rawText) {
  const seoData = {};
  const lines = rawText.split('\n');

  // 1. Find the start of the SEO block
  const seoBlockStartMarkers = ['SEO & Meta Details for Blog Post:', 'Meta Title:', 'Blog Post:'];
  let seoBlockStartIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmedLine = lines[i].trim();
    if (seoBlockStartMarkers.some(marker => trimmedLine.startsWith(marker))) {
      seoBlockStartIndex = i;
      break;
    }
  }

  if (seoBlockStartIndex === -1) {
    throw new Error('Could not find the start of the SEO metadata block in the document.');
  }

  // 2. Parse only the lines within that block
  const seoLines = lines.slice(seoBlockStartIndex);
  let isParsingDescription = false;
  let descriptionLines = [];

  for (const line of seoLines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine.startsWith('Meta Title:')) {
      isParsingDescription = false;
      seoData.metaTitle = trimmedLine.substring('Meta Title:'.length).trim();
    } else if (trimmedLine.startsWith('Meta Description:')) {
      isParsingDescription = true;
      descriptionLines = [trimmedLine.substring('Meta Description:'.length).trim()];
    } else if (
      trimmedLine.startsWith('Slug:') ||
      trimmedLine.startsWith('Slugx:') ||
      trimmedLine.startsWith('URL Slug:')
    ) {
      isParsingDescription = false;
      seoData.slug = trimmedLine.substring(trimmedLine.indexOf(':') + 1).trim();
    } else if (trimmedLine.startsWith('Primary Keywords:')) {
      isParsingDescription = false;
      seoData.keywords = trimmedLine.substring('Primary Keywords:'.length).trim();
    } else if (isParsingDescription) {
      // This line is part of a multi-line description
      descriptionLines.push(trimmedLine);
    }
  }

  if (descriptionLines.length > 0) {
    seoData.metaDescription = descriptionLines.join(' ');
  }

  if (!seoData.slug || !seoData.metaTitle) {
    throw new Error('Found the SEO block, but it is missing "Slug" and/or "Meta Title".');
  }
  return seoData;
}

function postProcessHtml(html) {
  let processedHtml = html;
  const internalLinks = [
    { text: /online prescription/gi, url: 'https://medicly.com.au/prescriptions' },
    { text: /doctor consultation/gi, url: 'https://medicly.com.au/doctor-consultation' },
    { text: /online doctor consultation/gi, url: 'https://medicly.com.au/doctor-consultation' },
    { text: /certificates/gi, url: 'https://medicly.com.au/certificates' },
  ];

  internalLinks.forEach(link => {
    const regex = new RegExp(`(?<!<a[^>]*>)(${link.text.source})(?!<\\/a>)`, 'gi');
    processedHtml = processedHtml.replace(regex, `<a href="${link.url}">$1</a>`);
  });

  processedHtml = processedHtml.replace(/(<p><strong><a href="[^"]*")>/g, '$1 class="blog_cta">');
  return processedHtml;
}

export async function processDocxFile(filePath) {
  const rawTextResult = await mammoth.extractRawText({ path: filePath });
  const rawText = rawTextResult.value;

  const topData = parseTopMatter(rawText);
  const seoData = parseSeoMetadata(rawText);
  const metadata = { ...topData, ...seoData };
  const { title } = metadata;

  const htmlResult = await mammoth.convertToHtml({ path: filePath });
  let html = htmlResult.value;

  const endMarkers = [
    'Always consult your healthcare provider for personal medical concerns.',
    'Okay, I have the full, updated blog post content.',
    '[Discover All Medicly Telehealth Services Here!]',
    '✅ SEO & Meta Data for:',
    'Blog Post: How to Quickly Obtain an Online Medical Certificate',
    'Meta Title:',
  ];

  let contentStartIndex = html.indexOf(title);
  if (contentStartIndex !== -1) {
    const closingTagIndex = html.indexOf('</', contentStartIndex + title.length);
    if (closingTagIndex !== -1) {
      const endOfClosingTag = html.indexOf('>', closingTagIndex);
      if (endOfClosingTag !== -1) {
        contentStartIndex = endOfClosingTag + 1;
      }
    }
  } else {
    throw new Error('Could not find the start of the content after the title.');
  }

  let content = '';
  for (const marker of endMarkers) {
    const contentEndIndex = html.lastIndexOf(marker);
    if (contentEndIndex > contentStartIndex) {
      const openingTagIndex = html.lastIndexOf('<', contentEndIndex);
      if (openingTagIndex !== -1) {
        content = html.substring(contentStartIndex, openingTagIndex).trim();
        break;
      }
    }
  }

  if (!content) {
    // Fallback if no end marker is found, which can happen in some docs.
    // We will clean out the known SEO block from the HTML.
    const seoBlockHtmlStart = html.indexOf('Meta Title:');
    if (seoBlockHtmlStart > contentStartIndex) {
      const openingTagIndex = html.lastIndexOf('<', seoBlockHtmlStart);
      if (openingTagIndex !== -1) {
        content = html.substring(contentStartIndex, openingTagIndex).trim();
      }
    }
    if (!content) {
      throw new Error('Could not determine content boundaries. No known end pattern matched.');
    }
  }

  const processedContent = postProcessHtml(content);

  return { ...metadata, content: processedContent };
}
