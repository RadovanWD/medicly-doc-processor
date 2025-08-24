import mammoth from 'mammoth';

/**
 * A robust, single-pass parser to extract all data from the raw text.
 * This is the final, most flexible version.
 * @param {string} rawText - The full raw text from the .docx file.
 * @returns {object} A structured object with all extracted data.
 */
function finalParser(rawText) {
  const data = {
    title: null,
    author: null,
    slug: null,
    metaTitle: null,
    metaDescription: null,
    keywords: null,
  };
  const lines = rawText.split('\n');
  let descriptionLines = [];
  let isParsingDescription = false;

  const patterns = {
    slug: /^(Slug|Slugx|URL Slug|Suggested URL Slug):/i,
    metaTitle: /^(Meta Title|Optimized Meta Title):/i,
    metaDescription: /^(Meta Description|Compelling Meta Description):/i,
    keywords: /^Primary Keywords:/i,
    author: /^By Dr\./i,
    reviewed: /^Medically reviewed/i,
    seoBlockStart: /^(SEO & Meta Details|Blog Post:|Meta Data|1\. Meta Data)/i,
  };

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (patterns.slug.test(trimmedLine)) {
      isParsingDescription = false;
      data.slug = trimmedLine.replace(patterns.slug, '').trim();
    } else if (patterns.metaTitle.test(trimmedLine)) {
      isParsingDescription = false;
      data.metaTitle = trimmedLine.replace(patterns.metaTitle, '').trim();
    } else if (patterns.metaDescription.test(trimmedLine)) {
      isParsingDescription = true;
      descriptionLines = [trimmedLine.replace(patterns.metaDescription, '').trim()];
    } else if (patterns.keywords.test(trimmedLine)) {
      isParsingDescription = false;
      data.keywords = trimmedLine.replace(patterns.keywords, '').trim();
    } else if (patterns.author.test(trimmedLine)) {
      data.author = trimmedLine;
    } else if (isParsingDescription) {
      descriptionLines.push(trimmedLine);
    } else if (
      !data.title &&
      !patterns.author.test(trimmedLine) &&
      !patterns.reviewed.test(trimmedLine) &&
      !patterns.seoBlockStart.test(trimmedLine) &&
      trimmedLine.length > 20 &&
      !trimmedLine.includes(':')
    ) {
      data.title = trimmedLine;
    }
  }

  if (descriptionLines.length > 0) {
    data.metaDescription = descriptionLines.join(' ').trim();
  }

  if (!data.slug || !data.metaTitle) {
    throw new Error(
      `Failed to find required SEO fields. Found Slug: '${data.slug}', Meta Title: '${data.metaTitle}'. Check the document.`,
    );
  }
  if (!data.title) {
    throw new Error('Failed to find a suitable title for the document.');
  }

  return data;
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

  const metadata = finalParser(rawText);
  const { title } = metadata;

  const htmlResult = await mammoth.convertToHtml({ path: filePath });
  let html = htmlResult.value;

  // Find start of content (after title)
  let contentStartIndex = html.indexOf(title);
  if (contentStartIndex !== -1) {
    const endOfTitleTag = html.indexOf('>', contentStartIndex);
    if (endOfTitleTag !== -1) contentStartIndex = endOfTitleTag + 1;
  } else {
    throw new Error('Could not find title in HTML to determine content start.');
  }

  // Find end of content (before SEO block)
  const seoBlockMarkers = ['Meta Title:', 'SEO & Meta Details', 'Blog Post:', '1. Meta Data'];
  let contentEndIndex = -1;

  for (const marker of seoBlockMarkers) {
    const markerIndex = html.lastIndexOf(marker);
    if (markerIndex > contentStartIndex) {
      contentEndIndex = markerIndex;
      break;
    }
  }

  if (contentEndIndex !== -1) {
    const openingTagIndex = html.lastIndexOf('<', contentEndIndex);
    if (openingTagIndex !== -1) {
      html = html.substring(0, openingTagIndex);
    }
  }

  let content = html.substring(contentStartIndex).trim();

  if (!content) {
    throw new Error('Could not extract the main content from the document.');
  }

  const processedContent = postProcessHtml(content);

  return { ...metadata, content: processedContent };
}
