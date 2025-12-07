import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requirePremiumAccess } from "@/lib/premium";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });

export async function POST(req: NextRequest) {
  try {
    // Check premium access
    const premiumCheck = await requirePremiumAccess();
    if (!premiumCheck.ok) {
      return NextResponse.json({ ok: false, error: premiumCheck.error }, { status: 403 });
    }

    const body = await req.json();
    const { labTitle, sourceFileName, originalLabText, currentStep, previousStep, nextStep } = body;

    if (!currentStep) {
      return NextResponse.json({ ok: false, error: 'Current step is required' }, { status: 400 });
    }

    // Build context for the AI
    let context = `Lab: ${labTitle || 'Unknown'}\nSource File: ${sourceFileName || 'Unknown'}\n\n`;
    
    // Include original lab instructions if available
    if (originalLabText && originalLabText.trim()) {
      context += `Original Lab Instructions:\n${originalLabText}\n\n---\n\n`;
    }
    
    if (previousStep) {
      context += `Previous Step (Step ${previousStep.index}): ${previousStep.title}\n${previousStep.mainInstruction}\n\n`;
    }
    
    context += `Current Step (Step ${currentStep.index}): ${currentStep.title}\n${currentStep.mainInstruction}\n\n`;
    
    if (nextStep) {
      context += `Next Step (Step ${nextStep.index}): ${nextStep.title}\n${nextStep.mainInstruction}\n\n`;
    }

    const systemPrompt = 
      "You are a helpful lab assistant providing additional clarification on a specific lab step. " +
      "Your task is to explain what the user needs to do in this step with more detail and clarity than the original instruction.\n\n" +
      "IMPORTANT FORMATTING REQUIREMENTS:\n" +
      "1. **You MUST use Markdown formatting** - write actual markdown syntax:\n" +
      "   - Use **bold** for important UI elements, buttons, labels, menu items\n" +
      "   - Use *italic* for emphasis\n" +
      "   - Use bullet lists (- or *) for multiple actions\n" +
      "   - Use numbered lists (1. 2. 3.) for sequential actions\n" +
      "   - Use `inline code` with backticks for specific values, file names, or technical terms\n" +
      "   - For flowcharts: Use `→→` on its own line (centered) to create a synapse-style arrow\n\n" +
      "2. **You MUST use LaTeX for all mathematical expressions**:\n" +
      "   - For inline math: use \\( ... \\) syntax\n" +
      "   - For block/display math: use \\[ ... \\] syntax\n" +
      "   - Always use LaTeX notation for equations, formulas, units, variables, etc.\n\n" +
      "3. **Content Guidelines**:\n" +
      "   - Use the original lab instructions to understand the full context and provide accurate details\n" +
      "   - Focus on explaining what to do and how to do it clearly\n" +
      "   - Break down complex actions into smaller, clearer steps\n" +
      "   - Explain any technical terms or concepts that might be unclear\n" +
      "   - Reference the previous and next steps only when it helps clarify the current step\n" +
      "   - Write in a direct, helpful tone - like explaining to a friend\n" +
      "   - DO NOT structure it like a lesson with sections like 'Conclusion', 'Things to Avoid', 'Summary', etc.\n" +
      "   - DO NOT add unnecessary sections or formal structure\n" +
      "   - Just provide a clear, detailed explanation of the step\n\n" +
      "4. **Keep it focused** - Only explain what's relevant to completing this specific step.\n\n" +
      "Return ONLY the explanation in Markdown format with LaTeX math support. Write it as a natural, flowing explanation, not a structured document.";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Please provide a detailed, in-depth explanation for this step:\n\n${context}` }
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const explanation = completion.choices[0]?.message?.content?.trim() || '';

    if (!explanation) {
      return NextResponse.json({ ok: false, error: 'Failed to generate explanation' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, explanation });
  } catch (error: any) {
    console.error('Error in dive-deeper:', error);
    return NextResponse.json(
      { ok: false, error: error?.message || 'Failed to generate detailed explanation' },
      { status: 500 }
    );
  }
}

