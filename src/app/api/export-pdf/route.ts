import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import MarkdownIt from "markdown-it";

export async function POST(request: NextRequest) {
  let browser;
  let title: string = '';
  let content: string = '';
  let subject: string = '';
  let topic: string = '';

  try {
    const requestData = await request.json();
    title = requestData.title || '';
    content = requestData.content || '';
    subject = requestData.subject || '';
    topic = requestData.topic || '';

    console.log('PDF Export request:', { title: title?.substring(0, 50), contentLength: content?.length, subject, topic });

    if (!content || !title) {
      console.log('Missing content or title');
      return NextResponse.json({ error: "Missing content or title" }, { status: 400 });
    }

    // Convert markdown to HTML using markdown-it
    let htmlContent;
    try {
      const md = new MarkdownIt({
        html: true,
        linkify: true,
        typographer: true,
      });

      htmlContent = md.render(content);
      console.log('Markdown converted to HTML, length:', htmlContent.length);
    } catch (mdError) {
      console.error('Markdown processing error:', mdError);
      throw new Error('Failed to process markdown content');
    }

    // Create HTML with proper styling for PDF
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>${title}</title>
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
          <style>
            body {
              font-family: 'Times New Roman', serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px;
            }

            h1 {
              font-size: 24pt;
              font-weight: bold;
              margin-bottom: 20pt;
              margin-top: 40pt;
              page-break-after: avoid;
              color: #000;
            }

            h2 {
              font-size: 18pt;
              font-weight: bold;
              margin-bottom: 15pt;
              margin-top: 30pt;
              page-break-after: avoid;
              color: #000;
            }

            h3 {
              font-size: 14pt;
              font-weight: bold;
              margin-bottom: 12pt;
              margin-top: 25pt;
              page-break-after: avoid;
              color: #000;
            }

            p {
              margin-bottom: 12pt;
              text-align: justify;
              orphans: 3;
              widows: 3;
            }

            .lesson-content p {
              margin-bottom: 10pt;
            }

            ul, ol {
              margin-bottom: 12pt;
              padding-left: 20pt;
            }

            li {
              margin-bottom: 6pt;
            }

            code {
              font-family: 'Courier New', monospace;
              background-color: #f5f5f5;
              padding: 2px 4px;
              border-radius: 3px;
              font-size: 10pt;
            }

            pre {
              background-color: #f8f8f8;
              border: 1px solid #e0e0e0;
              border-radius: 4px;
              padding: 12pt;
              margin: 12pt 0;
              font-family: 'Courier New', monospace;
              font-size: 10pt;
              line-height: 1.4;
              overflow-x: auto;
              white-space: pre-wrap;
            }

            blockquote {
              border-left: 4px solid #ccc;
              padding-left: 16pt;
              margin: 16pt 0;
              font-style: italic;
              color: #666;
            }

            table {
              border-collapse: collapse;
              width: 100%;
              margin: 16pt 0;
            }

            th, td {
              border: 1px solid #ddd;
              padding: 8pt;
              text-align: left;
            }

            th {
              background-color: #f5f5f5;
              font-weight: bold;
            }

            .katex {
              font-size: 1.1em;
            }

            .katex-display {
              margin: 16pt 0;
              text-align: center;
            }

            @page {
              margin: 1in;
              size: letter;
            }

            @media print {
              body {
                margin: 0;
                padding: 0;
              }
            }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="metadata" style="margin-bottom: 30pt; font-size: 10pt; color: #666;">
            <p><strong>Subject:</strong> ${subject}</p>
            <p><strong>Topic:</strong> ${topic}</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleDateString()}</p>
          </div>
          <div class="lesson-content">
            ${htmlContent}
          </div>
        </body>
      </html>
    `;

    console.log('Starting Puppeteer...');

    // Launch puppeteer and generate PDF
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    console.log('Puppeteer launched successfully');

    const page = await browser.newPage();
    console.log('Page created');

    // Set content and wait for page to load
    await page.setContent(html, { waitUntil: 'networkidle0' });
    console.log('HTML content set');

    // Wait a moment for rendering
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log('Page ready for PDF generation');

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '1in',
        right: '1in',
        bottom: '1in',
        left: '1in'
      },
      displayHeaderFooter: false,
      preferCSSPageSize: false,
    });
    console.log('PDF generated, size:', pdfBuffer.length);

    await browser.close();
    console.log('Browser closed');

    // Return PDF as response
    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf"`,
      },
    });

  } catch (error: any) {
    console.error("PDF export error:", error);
    console.error("Error stack:", error.stack);

    // Try a simple fallback PDF
    try {
      console.log("Trying simple fallback PDF...");
      const simpleHtml = `
        <!DOCTYPE html>
        <html>
          <head><title>${title || 'Lesson'}</title></head>
          <body>
            <h1>${title || 'Lesson'}</h1>
            <pre>${content || 'PDF generation failed. Please try again.'}</pre>
          </body>
        </html>
      `;

      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setContent(simpleHtml);
      const pdfBuffer = await page.pdf({ format: 'A4' });
      await browser.close();

      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${(title || 'lesson').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf"`,
        },
      });
    } catch (fallbackError) {
      console.error("Fallback PDF also failed:", fallbackError);
    }

    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error("Error closing browser:", closeError);
      }
    }

    return NextResponse.json(
      { error: error.message || "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
