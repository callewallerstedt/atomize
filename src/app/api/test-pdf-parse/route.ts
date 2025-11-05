import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ ok: false, error: 'No file provided' });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Try pdf-parse
    const pdfParse = require('pdf-parse');
    const data = await pdfParse(buffer);

    return NextResponse.json({
      ok: true,
      numPages: data.numpages,
      text: data.text,
      textLength: data.text.length,
    });
  } catch (error: any) {
    console.error('PDF parse error:', error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack,
    });
  }
}

