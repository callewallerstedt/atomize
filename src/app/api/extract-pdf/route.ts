import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Use pdf-parse with custom options to avoid canvas issues
    const pdfParse = require('pdf-parse/lib/pdf-parse.js');
    const data = await pdfParse(buffer, {
      // Custom page render to avoid DOM/canvas dependencies
      pagerender: async (pageData: any) => {
        try {
          const textContent = await pageData.getTextContent();
          return textContent.items.map((item: any) => item.str).join(' ');
        } catch (e) {
          return '';
        }
      }
    });

    // Return extracted text
    return NextResponse.json({
      ok: true,
      text: data.text || 'No text could be extracted from this PDF',
      numPages: data.numpages || 1,
      info: data.info || {},
    });
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to extract PDF text' },
      { status: 500 }
    );
  }
}

