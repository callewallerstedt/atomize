import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const mammothModule = mammoth.default || mammoth;
    const result = await mammothModule.extractRawText({ buffer });
    return result.value || "";
  } catch (err: any) {
    console.error("Failed to extract DOCX text:", err?.message);
    return "";
  }
}

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "Missing OPENAI_API_KEY" }, { status: 500 });
    }
    const form = await req.formData();
    const files = form.getAll("files") as unknown as File[];
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const ids: string[] = [];
    
    for (const f of files) {
      try {
        const fileName = f.name.toLowerCase();
        
        // For DOCX files, extract text and upload as text file
        if (fileName.endsWith(".docx")) {
          const arrayBuffer = await f.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const extractedText = await extractTextFromDocx(buffer);
          
          if (extractedText && extractedText.trim().length > 0) {
            // Create a text file from the extracted content
            // Use the original File object but replace its content
            const textBuffer = Buffer.from(extractedText, 'utf-8');
            const textFileName = f.name.replace(/\.docx$/i, ".txt");
            
            // Create a new File object with the extracted text
            // Note: In Node.js, we need to use the Web API File constructor
            // which should be available in Next.js runtime
            const textFile = new File([textBuffer], textFileName, { 
              type: "text/plain",
              lastModified: Date.now()
            });
            
            const up = await client.files.create({ 
              file: textFile as any, 
              purpose: "assistants" 
            });
            ids.push(up.id);
          } else {
            console.warn(`Failed to extract text from DOCX file: ${f.name}`);
          }
        } else {
          // For other files (PDF, TXT, etc.), upload directly
          const up = await client.files.create({ file: f as any, purpose: "assistants" });
          ids.push(up.id);
        }
      } catch (err: any) {
        console.error(`Failed to upload file ${f.name}:`, err?.message);
        // Continue with other files instead of failing completely
      }
    }
    
    return NextResponse.json({ ok: true, fileIds: ids });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




