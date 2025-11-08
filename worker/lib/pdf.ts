// Basic PDF text extraction for Cloudflare Workers
// Note: PDF.js and OCR libraries are not available in Workers runtime
// This implementation uses pattern matching for text extraction

export async function extractPdfText(buf: ArrayBuffer) {
  // Enhanced PDF processing using Cloudflare AI vision model for better text extraction
  // This approach is more reliable than regex-based text extraction for complex PDFs
  
  console.log('PDF buffer size:', buf.byteLength);
  console.log('First 100 bytes as hex:', Array.from(new Uint8Array(buf.slice(0, 100))).map(b => b.toString(16).padStart(2, '0')).join(' '));
  
  // For now, fall back to basic text extraction as a foundation
  // Note: Could integrate with Cloudflare AI vision model for enhanced PDF processing
  const textDecoder = new TextDecoder('utf-8');
  const pdfContent = textDecoder.decode(buf);
  
  console.log('Raw PDF content length:', pdfContent.length);
  console.log('Raw PDF content preview:', pdfContent.substring(0, 500));
  
  const pages: string[] = [];
  let extractedText = '';
  
  // First, try to extract text using PDF-specific patterns
  const textStreamMatches = pdfContent.match(/BT[\s\S]*?ET/g);
  if (textStreamMatches && textStreamMatches.length > 0) {
    extractedText = textStreamMatches.join(' ').replace(/BT|ET/g, ' ').trim();
    console.log('Found text streams, length:', extractedText.length);
  }
  
  // Look for text between parentheses (common in PDFs)
  const parenMatches = pdfContent.match(/\(([^)]+)\)/g);
  if (parenMatches && parenMatches.length > 0) {
    const parenText = parenMatches.join(' ').replace(/[()]/g, ' ').trim();
    extractedText += ' ' + parenText;
    console.log('Found parentheses text, length:', parenText.length);
  }
  
  // Look for text between quotes
  const quoteMatches = pdfContent.match(/"([^"]+)"/g);
  if (quoteMatches && quoteMatches.length > 0) {
    const quoteText = quoteMatches.join(' ').replace(/"/g, ' ').trim();
    extractedText += ' ' + quoteText;
    console.log('Found quote text, length:', quoteText.length);
  }
  
  // Look for text after /Text operators
  const textOperatorMatches = pdfContent.match(/\/Text\s+([^\s]+)/g);
  if (textOperatorMatches && textOperatorMatches.length > 0) {
    const textOpText = textOperatorMatches.join(' ').replace(/\/Text/g, ' ').trim();
    extractedText += ' ' + textOpText;
    console.log('Found text operators, length:', textOpText.length);
  }
  
  // If we found structured text, use it
  if (extractedText.length > 10) {
    console.log('Using structured text extraction, length:', extractedText.length);
    pages.push(normalize(extractedText));
  } else {
    // Fallback: extract readable ASCII text
    console.log('Using fallback text extraction');
    const fallbackText = pdfContent.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ').trim();
    
    // Remove any [object Object] artifacts
    const cleanText = fallbackText.replace(/\[object Object\]/g, '').trim();
    
    if (cleanText.length > 10) {
      pages.push(normalize(cleanText));
    } else {
      // Last resort: try to find any readable text
      const anyText = pdfContent.match(/[A-Za-z0-9\s]{10,}/g);
      if (anyText && anyText.length > 0) {
        pages.push(normalize(anyText.join(' ')));
      } else {
        pages.push('PDF document - unable to extract text content');
      }
    }
  }

  const result: { pages: string[]; fullText: string; pageCount: number } = { 
    pages, 
    fullText: pages.join("\n\n---\n\n"),
    pageCount: pages.length
  };
  console.log('Final extracted text length:', result.fullText.length);
  console.log('Final text preview:', result.fullText.substring(0, 200));

  // Check text quality and clean if needed
  const printableChars = result.fullText.replace(/[^\x20-\x7E\n\r\t]/g, '').length;
  const totalChars = result.fullText.length;
  const printableRatio = totalChars > 0 ? printableChars / totalChars : 0;
  
  console.log('Text quality check:', {
    totalChars,
    printableChars,
    printableRatio,
    isGarbled: printableRatio < 0.7
  });

  // If text is mostly garbled, try to clean it up
  if (printableRatio < 0.7 && totalChars > 100) {
    console.log('PDF text appears to be garbled, attempting to clean it up');
    
    // Try to extract only the cleanest parts
    const cleanText = result.fullText
      .replace(/[^\x20-\x7E\n\r\t]/g, ' ') // Replace non-printable with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
    
    const cleanRatio = cleanText.length > 0 ? cleanText.replace(/[^\x20-\x7E]/g, '').length / cleanText.length : 0;
    
    console.log('Cleaned text quality:', {
      originalLength: result.fullText.length,
      cleanedLength: cleanText.length,
      cleanRatio,
      isClean: cleanRatio > 0.8
    });
    
    if (cleanRatio > 0.8 && cleanText.length > 50) {
      console.log('Using cleaned text instead of garbled text');
      result.fullText = cleanText;
      
      // Update pages to stay consistent with cleaned fullText
      // Split using the same delimiter consumers expect
      const pageDelimiter = "\n\n---\n\n";
      if (cleanText.includes(pageDelimiter)) {
        result.pages = cleanText.split(pageDelimiter);
      } else {
        // If delimiter not present, treat as single page
        result.pages = [cleanText];
      }
      
      // Update page count metadata
      result.pageCount = result.pages.length;
      
      console.log('Updated pages after cleaning:', {
        pageCount: result.pageCount,
        pagesLength: result.pages.length
      });
    } else {
      console.log('Cleaned text still too garbled, will throw error for fallback');
      throw new Error('PDF text extraction produced garbled content, using fallback strategy');
    }
  }

  // Extract key information for legal intake
  const keyInfo = extractKeyLegalInfo(result.fullText);
  console.log('Key legal info extracted:', keyInfo);

  return { ...result, keyInfo };
}

function normalize(s: string) {
  return s.replace(/\s+/g, " ").replace(/\u00AD/g, "") // soft hyphen
          .replace(/-\s+/g, "-").trim();
}

function extractKeyLegalInfo(text: string): string {
  // Extract key information for legal intake analysis
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  
  // Look for common legal document patterns
  const _keySections: string[] = [];
  
  // Extract names (common patterns)
  const _namePatterns = [
    /(?:name|full name|client|tenant|landlord|defendant|plaintiff):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:LLC|Inc|Corp|Company|Associates)/gi,
    /(?:Mr\.|Ms\.|Mrs\.|Dr\.)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/gi
  ];
  
  // Extract dates
  const _datePatterns = [
    /(?:date|signed|effective|expires?):\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi,
    /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/gi
  ];
  
  // Extract amounts
  const _amountPatterns = [
    /\$[\d,]+(?:\.\d{2})?/g,
    /(?:amount|payment|value):\s*\$[\d,]+(?:\.\d{2})?/gi
  ];
  
  // Extract addresses
  const _addressPatterns = [
    /(?:address|location):\s*([^,\n]+(?:,\s*[A-Z]{2}\s+\d{5})?)/gi,
    /([^,\n]+(?:,\s*[A-Z]{2}\s+\d{5})?)/gi
  ];
  
  // Extract document types
  const _docTypePatterns = [
    /(?:contract|agreement|lease|deed|will|trust|petition|complaint|motion|order)/gi,
    /(?:form|application|notice|letter|resume|invoice|receipt)/gi
  ];
  
  // Combine all found information
  const foundInfo: string[] = [];
  
  // Add first few lines (usually contain title/header)
  if (lines.length > 0) {
    foundInfo.push(`Document Title/Header: ${lines[0]}`);
  }
  
  // Add any lines that seem important (contain key words)
  const importantKeywords = ['name', 'date', 'address', 'phone', 'email', 'amount', 'contract', 'agreement', 'lease', 'deed', 'will', 'trust', 'petition', 'complaint'];
  
  for (const line of lines.slice(1, 20)) { // Check first 20 lines
    const lowerLine = line.toLowerCase();
    if (importantKeywords.some(keyword => lowerLine.includes(keyword))) {
      foundInfo.push(line);
    }
  }
  
  // Limit to reasonable size
  const summary = foundInfo.join('\n').substring(0, 1000);
  
  return summary || 'Document content extracted but no specific legal information identified';
}
