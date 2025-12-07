import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

async function extractTextFromDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth');
    const mammothModule = mammoth.default || mammoth;
    const result = await mammothModule.extractRawText({ buffer });
    return result.value || '';
  } catch (e: any) {
    console.warn(`DOCX extraction failed:`, e?.message);
    return '';
  }
}

async function extractImagesFromDocx(buffer: Buffer): Promise<Array<{ data: string; contentType: string; label: string }>> {
  try {
    const mammoth = await import('mammoth');
    const mammothModule = mammoth.default || mammoth;
    const images: Array<{ data: string; contentType: string; label: string }> = [];
    let figureIndex = 1;
    
    // Use convertToHtml with image handler to extract images
    await mammothModule.convertToHtml(
      { buffer },
      {
        convertImage: mammothModule.images.imgElement((image: any) => {
          return image.read('base64').then((imageBuffer: Buffer) => {
            const base64 = imageBuffer.toString('base64');
            const contentType = image.contentType || 'image/png';
            images.push({
              data: `data:${contentType};base64,${base64}`,
              contentType,
              label: `Figure ${figureIndex++}`
            });
            return { src: `data:${contentType};base64,${base64}` };
          });
        })
      }
    );
    
    return images;
  } catch (e: any) {
    console.warn(`DOCX image extraction failed:`, e?.message);
    return [];
  }
}

async function extractImagesFromPdf(buffer: Buffer): Promise<Array<{ data: string; contentType: string; label: string }>> {
  try {
    const images: Array<{ data: string; contentType: string; label: string }> = [];
    let figureIndex = 1;
    const uint8 = new Uint8Array(buffer);
    
    // Try multiple import paths for pdfjs-dist (similar to exam-snipe route)
    const tryImports = [
      () => import('pdfjs-dist' as any),
      () => import('pdfjs-dist/build/pdf.mjs' as any),
      () => import('pdfjs-dist/legacy/build/pdf.mjs' as any),
    ];
    
    let pdfjsLib: any = null;
    for (const loader of tryImports) {
      try {
        const lib: any = await loader();
        pdfjsLib = lib.getDocument ? lib : (lib?.default?.getDocument ? lib.default : null);
        if (pdfjsLib && pdfjsLib.getDocument) break;
      } catch (err) {
        continue;
      }
    }
    
    if (!pdfjsLib || !pdfjsLib.getDocument) {
      console.warn('pdfjs-dist not available for image extraction');
      return [];
    }
    
    const loadingTask = pdfjsLib.getDocument({ data: uint8, disableWorker: true });
    const pdf = await loadingTask.promise;
    
    // Limit to first 10 pages to avoid performance issues
    const maxPages = Math.min(pdf.numPages, 10);
    
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      try {
        const page = await pdf.getPage(pageNum);
        const operatorList = await page.getOperatorList();
        
        // Look for image operations in the operator list
        for (let i = 0; i < operatorList.fnArray.length; i++) {
          const op = operatorList.fnArray[i];
          // OPS.paintImageXObject = 79, OPS.paintJpegXObject = 80
          if (op === 79 || op === 80) {
            try {
              const imageName = operatorList.argsArray[i][0];
              if (!imageName) continue;
              
              // Get the image object
              const imageDict = await page.objs.get(imageName);
              
              if (imageDict && imageDict.data) {
                const imageData = imageDict.data;
                let contentType = 'image/png';
                
                // Determine content type from filter
                if (imageDict.filter) {
                  const filterName = typeof imageDict.filter === 'string' 
                    ? imageDict.filter 
                    : (imageDict.filter?.name || '');
                  if (filterName === 'DCTDecode' || filterName.includes('DCT')) {
                    contentType = 'image/jpeg';
                  }
                }
                
                // Convert to base64
                const base64 = Buffer.from(imageData).toString('base64');
                
                images.push({
                  data: `data:${contentType};base64,${base64}`,
                  contentType,
                  label: `Figure ${figureIndex++}`
                });
                
                // Limit total images
                if (figureIndex > 50) break;
              }
            } catch (imgErr: any) {
              // Skip this image and continue
              continue;
            }
          }
        }
        
        if (figureIndex > 50) break;
      } catch (pageErr: any) {
        // Skip this page and continue
        continue;
      }
    }
    
    return images;
  } catch (e: any) {
    console.warn(`PDF image extraction failed:`, e?.message);
    return [];
  }
}

async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    const mod: any = await import("pdf-parse");
    const pdfParse = (mod?.default ?? mod) as (data: Buffer) => Promise<{ text: string }>;
    const parsed = await pdfParse(buffer);
    return parsed?.text || '';
  } catch (e: any) {
    console.warn("pdf-parse failed:", e?.message);
    return '';
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

    const formData = await req.formData();
    const labFiles = formData.getAll('files') as File[];

    if (labFiles.length === 0) {
      return NextResponse.json({ ok: false, error: 'No lab files provided' }, { status: 400 });
    }

    // Extract text and images from all files
    const labTexts: { name: string; text: string }[] = [];
    const allImages: Array<{ data: string; contentType: string; label: string; sourceFile: string }> = [];
    let imageCounter = 1;

    for (const file of labFiles) {
      try {
        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        const fileName = file.name.toLowerCase();
        let extractedText = '';
        let extractedImages: Array<{ data: string; contentType: string; label: string }> = [];

        if (fileName.endsWith('.docx')) {
          extractedText = await extractTextFromDocx(buffer);
          extractedImages = await extractImagesFromDocx(buffer);
        } else if (fileName.endsWith('.pdf')) {
          extractedText = await extractTextFromPdf(buffer);
          extractedImages = await extractImagesFromPdf(buffer);
        } else {
          extractedText = new TextDecoder().decode(buffer);
        }

        // Label images with source file and sequential numbering
        extractedImages.forEach((img) => {
          allImages.push({
            ...img,
            label: `Figure ${imageCounter++} (from ${file.name})`,
            sourceFile: file.name
          });
        });

        if (extractedText.trim()) {
          labTexts.push({
            name: file.name,
            text: extractedText.trim()
          });
        }
      } catch (err: any) {
        console.error(`Failed to extract text from ${file.name}:`, err);
      }
    }

    if (labTexts.length === 0) {
      return NextResponse.json({ ok: false, error: 'Could not extract text from lab files' }, { status: 400 });
    }

    // Combine all lab texts
    const combinedText = labTexts.map(lt => `=== ${lt.name} ===\n\n${lt.text}`).join('\n\n---\n\n');
    
    // Create image reference text for AI
    const imageReferences = allImages.length > 0 
      ? `\n\n=== AVAILABLE IMAGES ===\n\n${allImages.map((img, idx) => 
          `${img.label}: [Image ${idx + 1} - ${img.contentType}]`
        ).join('\n')}\n\nYou can reference these images in your steps using their labels (e.g., "See Figure 1" or "Refer to Figure 2"). When referencing an image, include its label in the imageUrls array for that step.\n\n`
      : '';

    // Use AI to structure the lab into steps
    const systemPrompt =
      "You are an expert at converting messy lab instructions into super clear, detailed, step-by-step guides that anyone can follow. Your task is to analyze lab instruction documents and break them down into many small, detailed steps with explicit instructions.\n\n" +
      "Return a JSON object with this exact structure:\n" +
      "{\n" +
      '  "title": "Lab title (e.g., \'Lab 3: Oscilloscope basics\')",\n' +
      '  "steps": [\n' +
      "    {\n" +
      '      "id": "step-1",\n' +
      '      "index": 1,\n' +
      '      "title": "Short step title (e.g., \'Turn on the oscilloscope\')",\n' +
      '      "mainInstruction": "Detailed, explicit instructions written in MARKDOWN format with LaTeX math support. The instruction should guide the user through EVERY action they need to take - be extremely explicit. IMPORTANT: You MUST write actual markdown syntax (use ** for bold, * for italic, - or * for lists, ` for code, etc.). The content will be rendered as markdown, so write markdown directly. See formatting rules below.",\n' +
      '      "imageUrls": ["Figure 1", "Figure 2"] or [] - Array of image labels (from the available images list) that are relevant to this step. Use the exact label format like "Figure 1 (from filename.pdf)".\n' +
      "    }\n" +
      "  ]\n" +
      "}\n\n" +
      "CRITICAL REQUIREMENTS:\n\n" +
      "**FORMATTING REQUIREMENTS (MANDATORY):**\n" +
      "1. **You MUST use Markdown formatting** in mainInstruction. The content will be rendered as markdown, so you MUST write actual markdown syntax:\n" +
      "   - Use **bold** for important UI elements, buttons, labels, menu items. Example: Click the **Start** button\n" +
      "   - Use *italic* for emphasis. Example: *Important*: Wait 30 seconds\n" +
      "   - Use bullet lists with - or * for multiple actions. Example:\n" +
      "     - First action\n" +
      "     - Second action\n" +
      "   - Use numbered lists (1. 2. 3.) for sequential actions. Example:\n" +
      "     1. First step\n" +
      "     2. Second step\n" +
      "   - Use `inline code` with backticks for specific values, file names, or technical terms. Example: Set the value to `3.5`\n" +
      "   - Use proper markdown syntax - the text will be rendered as markdown, so write markdown directly\n" +
      "   - **For flowcharts and arrows**: Use the special arrow symbol `→→` on its own line (centered) to create a synapse-style arrow. This is perfect for showing flow between steps, decision points, or process flows. Example:\n" +
      "     Step 1: Turn on the device\n" +
      "     →→\n" +
      "     Step 2: Check the display\n\n" +
      "2. **You MUST use LaTeX for all mathematical expressions**:\n" +
      "   - For inline math: use \\( ... \\) syntax. Example: The voltage is \\( V = IR \\) where \\( R = 10 \\Omega \\)\n" +
      "   - For block/display math: use \\[ ... \\] syntax. Example: \\[ E = mc^2 \\]\n" +
      "   - Always use LaTeX notation for equations, formulas, units, variables, etc.\n" +
      "   - Example: Set the frequency to \\( f = 1 \\text{ kHz} \\) and the amplitude to \\( A = 5 \\text{ V} \\)\n\n" +
      "**CONTENT REQUIREMENTS:**\n" +
      "3. **Break down into MANY small steps** - Don't combine multiple actions into one step. Each step should be a single, specific action or a very small set of related actions. You MUST include ALL important steps from the lab - do not skip any steps, no matter how small they seem. Aim for 20-50+ steps for a typical lab, not just 10-12. Break everything down into the smallest possible actions. For example, instead of \"Turn on the device and check the display\", make it two separate steps: \"Turn on the device\" and \"Check the display\".\n\n" +
      "4. **Be extremely explicit and detailed** - Don't just copy the lab instructions. Instead, guide the user through every single action they need to take. Be MUCH more detailed than the original lab instructions. Explain every click, every setting change, every measurement, every connection. Each action should be its own step. Use phrases like:\n" +
      '   - "Click on the button labeled **Start** in the top-right corner"\n' +
      '   - "Navigate to the **Settings** menu by clicking the gear icon"\n' +
      '   - "Enter the value 3.5 into the input field"\n' +
      '   - "Wait for 30 seconds until the indicator light turns green"\n' +
      '   - "Locate the red wire and connect it to terminal **A**"\n\n' +
      "5. **Don't copy lab instructions verbatim** - The lab instructions may be unclear or assume prior knowledge. Your job is to make them crystal clear for someone who has never done this before. Explain WHERE to click, WHAT to look for, HOW to do it. Add details that the original lab might have skipped.\n\n" +
      "6. **Include ALL steps** - You must include every single step from the lab instructions. Do not skip steps, even if they seem obvious or minor. If the lab mentions checking something, turning something on, setting a value, connecting something, measuring something - it ALL needs to be a separate, detailed step.\n\n" +
      "7. **Number steps sequentially starting from 1**\n\n" +
      "8. **Extract a meaningful title from the lab document**\n\n" +
      "9. **For imageUrls**: Include the exact labels of images that are relevant to each step. For example, if a step references \"Figure 1 (from lab.pdf)\", include that exact string in the imageUrls array. Only include images that are directly relevant to the step.\n\n" +
      "10. **Make the instructions conversational and easy to follow** - Write as if you're guiding someone step-by-step in person.\n\n" +
      "11. **Be MORE detailed than the original** - If the lab says \"connect the wires\", you should break it into multiple steps: Step 1: \"Locate the red wire from the power supply\", Step 2: \"Connect the red wire to the positive terminal (marked with a + sign) on the circuit board\", Step 3: \"Locate the black wire\", Step 4: \"Connect the black wire to the negative terminal (marked with a - sign)\". Break every complex action into multiple small steps. The more steps, the better - aim for maximum granularity.\n\n" +
      "The goal is to make the lab so easy to follow that someone with no prior experience can complete it successfully.";

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Convert this lab instruction document into clean, step-by-step format:\n\n${combinedText.slice(0, 150000)}${imageReferences}`
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 8000
    });

    const responseText = completion.choices[0]?.message?.content || '';
    let labData: any;

    try {
      labData = JSON.parse(responseText);
    } catch (e) {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        labData = JSON.parse(jsonMatch[1]);
      } else {
        throw new Error('Failed to parse AI response as JSON');
      }
    }

    // Validate and normalize the structure
    if (!labData.title || typeof labData.title !== 'string') {
      labData.title = labTexts[0]?.name?.replace(/\.(pdf|docx)$/i, '') || 'Lab Instructions';
    }

    if (!Array.isArray(labData.steps)) {
      return NextResponse.json({ ok: false, error: 'Invalid step structure from AI' }, { status: 500 });
    }

    // Create image map for quick lookup
    const imageMap = new Map<string, string>();
    allImages.forEach((img) => {
      imageMap.set(img.label, img.data);
    });

    // Normalize steps and map image labels to actual image data URLs
    const normalizedSteps = labData.steps.map((step: any, idx: number) => {
      const imageLabels = Array.isArray(step.imageUrls) ? step.imageUrls : [];
      const imageDataUrls = imageLabels
        .map((label: string) => imageMap.get(label))
        .filter((url: string | undefined): url is string => !!url);
      
      return {
        id: step.id || `step-${idx + 1}`,
        index: typeof step.index === 'number' ? step.index : idx + 1,
        title: typeof step.title === 'string' ? step.title.trim() : `Step ${idx + 1}`,
        mainInstruction: typeof step.mainInstruction === 'string' ? step.mainInstruction.trim() : '',
        imageUrls: imageDataUrls, // Store actual data URLs instead of labels
        imageLabels: imageLabels // Keep labels for reference
      };
    }).filter((step: any) => step.mainInstruction.length > 0);

    // Generate a unique lab ID
    const labId = `lab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    const result = {
      ok: true,
      lab: {
        id: labId,
        title: labData.title.trim(),
        sourceFileName: labTexts.map(lt => lt.name).join(', '),
        originalText: combinedText, // Store original file content for dive-deeper
        images: allImages.map(img => ({ label: img.label, data: img.data, contentType: img.contentType })), // Store all images
        steps: normalizedSteps
      }
    };

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Lab Assist processing error:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to process lab files' },
      { status: 500 }
    );
  }
}

