import { NextResponse } from "next/server";
import OpenAI from "openai";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { image, prompt, messages } = await req.json();

    // Allow null image when user explicitly doesn't want to include canvas
    // Only require image if there's no prompt (text-only request)
    if (image === undefined && !prompt) {
      return NextResponse.json(
        { error: "No image or prompt provided" },
        { status: 400 }
      );
    }

    // Keep the full data URL for history storage, but extract base64 for OpenAI
    // Handle null image (when checkbox is unchecked)
    const imageDataUrl = image ? String(image) : null;
    const base64Image = imageDataUrl ? imageDataUrl.replace(/^data:image\/\w+;base64,/, "") : null;

    // Build messages array with conversation history
    const systemMessage = {
      role: "system" as const,
      content: `You are a brilliant tutor helping a student solve problems they've written or drawn on a canvas.

Your role is to:
1. Analyze what the student has written/drawn (could be math equations, diagrams, physics problems, chemistry structures, code, etc.)
2. Understand what they're trying to solve or ask
3. Provide a clear, step-by-step solution or explanation
4. Use LaTeX notation for any mathematical expressions: \\( for inline math \\) and \\[ for block math \\]
5. Be encouraging and educational

Format your response in markdown with:
- Clear section headers when needed
- Bullet points for steps
- LaTeX math expressions properly formatted
- Code blocks with language tags if relevant

If you can't make out the writing clearly, describe what you see and ask for clarification.
If the canvas appears empty or unclear, let them know kindly.`,
    };

    const openaiMessages: any[] = [systemMessage];

    // Add conversation history if provided
    if (Array.isArray(messages) && messages.length > 0) {
      // Convert previous messages to OpenAI format (without images for history)
      for (const msg of messages) {
        if (msg.role === "user" || msg.role === "assistant") {
          openaiMessages.push({
            role: msg.role,
            content: msg.content,
          });
        }
      }
    }

    // Add current message with or without image
    const userContent: any[] = [];
    
    if (prompt) {
      userContent.push({
        type: "text",
        text: prompt,
      });
    } else {
      userContent.push({
        type: "text",
        text: "Please analyze this canvas and help me solve or understand what I've written/drawn:",
      });
    }
    
    // Only add image if provided
    if (base64Image) {
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${base64Image}`,
          detail: "high",
        },
      });
    }

    openaiMessages.push({
      role: "user",
      content: userContent,
    });

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: openaiMessages,
      max_tokens: 4096,
    });

    const aiResponse = response.choices[0]?.message?.content || "I couldn't analyze the canvas. Please try again.";

    const saved = await prisma.coSolveHistory.create({
      data: {
        userId: user.id,
        imageData: imageDataUrl || "", // Store empty string if no image
        response: aiResponse,
      },
      select: {
        id: true,
        createdAt: true,
        imageData: true,
        response: true,
      },
    });

    return NextResponse.json({ response: aiResponse, historyItem: saved });
  } catch (error: any) {
    console.error("CoSolve API error:", error);
    
    // Handle specific OpenAI errors
    if (error?.code === "invalid_api_key") {
      return NextResponse.json(
        { error: "API configuration error", response: "The AI service is not properly configured. Please contact support." },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: "Failed to analyze canvas", response: "Sorry, I couldn't analyze your canvas right now. Please try again." },
      { status: 500 }
    );
  }
}

