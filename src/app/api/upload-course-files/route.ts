import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const jszipMod: any = await import("jszip");
    const JSZip = jszipMod.default || jszipMod;
    const zip = await new JSZip().loadAsync(buffer);
    // Prefer main document.xml, plus headers/footers if present
    const readXml = async (path: string): Promise<string> => {
      try {
        const xml = await zip.file(path)?.async("string");
        return xml || "";
      } catch {
        return "";
      }
    };
    const decodeEntities = (s: string) =>
      s
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    const toParagraphText = (xml: string): string => {
      if (!xml) return "";
      // Split by paragraphs <w:p>...</w:p>
      const paras = xml.split(/<\/w:p>/i).map((chunk) => {
        const tPieces = chunk.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/gi) || [];
        const joined = tPieces
          .map((t) => {
            const m = t.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/i);
            return m ? m[1] : "";
          })
          .join("");
        return joined;
      });
      const text = paras
        .map((p) => p.trim())
        .filter(Boolean)
        .join("\n\n");
      return decodeEntities(text);
    };

    const main = await readXml("word/document.xml");
    const header1 = await readXml("word/header1.xml");
    const header2 = await readXml("word/header2.xml");
    const footer1 = await readXml("word/footer1.xml");
    const parts = [header1, header2, main, footer1].filter(Boolean);
    const extracted = parts.map(toParagraphText).filter(Boolean).join("\n\n");
    return extracted.trim();
  } catch (err: any) {
    console.error("Failed to extract DOCX text (JSZip):", err?.message);
    return "";
  }
}

// Create a minimal, standards-compliant single-page PDF from plain text
function textToSimplePdf(text: string): Buffer {
  const escapePdf = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const lines = (text || "")
    .split(/\r?\n/)
    .map((l) => escapePdf(l.trim()))
    .filter((l) => l.length > 0);

  // Build content stream: Helvetica 12pt, start at (50, 770), 14pt leading
  let stream = "BT\n/F1 12 Tf\n1 0 0 1 50 770 Tm\n14 TL\n";
  if (lines.length === 0) {
    stream += "( ) Tj\n";
  } else {
    stream += `(${lines[0]}) Tj\n`;
    for (let i = 1; i < lines.length; i++) {
      stream += "T*\n";
      stream += `(${lines[i]}) Tj\n`;
    }
  }
  stream += "ET";

  const streamBytes = Buffer.from(stream, "utf-8");

  // PDF objects
  const header = "%PDF-1.4\n";
  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  const obj3 =
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n";
  const obj5 =
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
  const obj4Prefix = `4 0 obj\n<< /Length ${streamBytes.length} >>\nstream\n`;
  const obj4Suffix = "\nendstream\nendobj\n";

  // Build xref with byte offsets
  let offset = 0;
  const parts: Buffer[] = [];
  const add = (s: string | Buffer) => {
    const b = Buffer.isBuffer(s) ? s : Buffer.from(s, "utf-8");
    parts.push(b);
    offset += b.length;
  };

  const xrefOffsets: number[] = [];
  add(header); // 0
  xrefOffsets.push(offset);
  add(obj1);
  xrefOffsets.push(offset);
  add(obj2);
  xrefOffsets.push(offset);
  add(obj3);
  xrefOffsets.push(offset);
  add(obj4Prefix);
  add(streamBytes);
  add(obj4Suffix);
  xrefOffsets.push(offset);
  add(obj5);

  const xrefStart = offset;
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  // Objects 1..5
  let running = Buffer.from(header, "utf-8").length;
  const objs = [obj1, obj2, obj3, obj4Prefix + stream + obj4Suffix, obj5];
  for (const obj of objs) {
    const line = String(running).padStart(10, "0") + " 00000 n \n";
    xref += line;
    running += Buffer.from(obj, "utf-8").length;
  }

  const trailer =
    "trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" +
    String(xrefStart) +
    "\n%%EOF";

  add(xref);
  add(trailer);
  return Buffer.concat(parts);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const files = form.getAll("files") as unknown as File[];

    // Extract text server-side and return directly (Path A)
    const docs: Array<{ name: string; text: string }> = [];
    for (const f of files) {
      try {
        const name = f.name || "file";
        const lower = name.toLowerCase();
        const ab = await f.arrayBuffer();
        const buf = Buffer.from(ab);
        let text = "";
        if (lower.endsWith(".pdf")) {
          try {
            const mod: any = await import("pdf-parse");
            const pdfParse = (mod?.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
            const parsed = await pdfParse(buf);
            text = parsed?.text || "";
          } catch (e: any) {
            console.warn("pdf-parse failed:", e?.message);
          }
        } else if (lower.endsWith(".docx")) {
          text = await extractTextFromDocx(buf);
        } else {
          try { text = new TextDecoder().decode(buf); } catch { text = buf.toString("utf-8"); }
        }
        // Normalize and cap
        text = text
          .replace(/[\x00-\x08\x0E-\x1F]/g, "")
          .replace(/\r\n/g, "\n")
          .replace(/\s+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n")
          .slice(0, 180_000)
          .trim();
        if (text) {
          docs.push({ name, text });
        } else {
          console.warn("No extractable text for", name);
        }
      } catch (err: any) {
        console.error("extract error", err?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      docs,
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}




