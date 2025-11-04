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

    // Use pdf-parse to extract text
    const pdf = require('pdf-parse');
    const data = await pdf(buffer);

    // Return extracted text
    return NextResponse.json({
      ok: true,
      text: data.text,
      numPages: data.numpages,
      info: data.info,
    });
  } catch (error: any) {
    console.error('PDF extraction error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to extract PDF text' },
      { status: 500 }
    );
  }
}

