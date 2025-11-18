export type SurgeQuizStage = "mc" | "harder";

export function buildQuizJsonInstruction(
  stage: SurgeQuizStage,
  courseName: string,
  topicName: string,
  mcQuestions?: string,
  debugInstruction?: string
): string {
  const safeCourse = courseName || "Unknown Course";
  const safeTopic = topicName || safeCourse;

  if (stage === "mc") {
    const lines = [
      "OVERRIDE: Ignore any prior instructions about ◊ delimiters or prose answers.",
      "You are Synapse Surge's QUIZ ENGINE.",
      `COURSE: ${safeCourse}`,
      `CURRENT TOPIC: ${safeTopic}`,
      "- You will be given the full lesson content below. Base ALL questions strictly on that lesson—focus on the exact explanations, examples, and terminology that were just taught.",
      "CRITICAL: Questions MUST focus ONLY on the current topic that was just taught. Do NOT ask about other topics, general course knowledge, or unrelated concepts.",
      "GOAL: Generate EXACTLY 5 multiple-choice questions that progress from EASY to HARD, focusing on understanding and implementation of THE CURRENT TOPIC ONLY.",
      "CRITICAL REQUIREMENTS:",
      "  1. Questions MUST progress in difficulty: Q1 = easiest (basic recall), Q2 = slightly harder, Q3 = moderate (understanding), Q4 = harder (application), Q5 = hardest (implementation/complex reasoning)",
      "  2. ALL questions must be about THE CURRENT TOPIC ONLY - do not ask about other topics or general concepts",
      "  3. Focus on UNDERSTANDING the current topic, not just memorization - test if the user truly grasps what was just taught",
      "  4. Include IMPLEMENTATION questions about the current topic - test how the current topic's concepts are applied in practice",
      "  5. Questions should test comprehension, application, and reasoning of THE CURRENT TOPIC - not just 'what is X?' but 'how does X work?', 'why is X used?', 'what happens when X is applied?'",
      "  6. Later questions (Q4-Q5) should require connecting multiple aspects of THE CURRENT TOPIC or understanding deeper implications of what was just taught",
      "FORMAT: OUTPUT ONLY raw JSON (no markdown, no commentary). Structure:",
      "{",
      '  "mc": [',
      '    {"question": "...", "options": ["...", "...", "...", "..."], "correctOption": "A", "explanation": "..."}',
      "  ],",
      '  "short": []',
      "}",
      "- There must be exactly 5 objects in mc[]. Each options array must have 4 strings that match letters A-D.",
      "- correctOption must be a single letter A-D. explanation must describe WHY that answer is correct, referencing course/exam context.",
      "- Use the provided course context and exam-analysis cues from the system prompt to create realistic questions that test true understanding.",
      "- DO NOT output anything besides that JSON object. No prose.",
    ];
    if (debugInstruction) {
      lines.push(`DEBUG FOCUS: ${debugInstruction}`);
    }
    return lines.join("\n");
  }

  const lines = [
    "OVERRIDE: Ignore any prior instructions about ◊ delimiters or prose answers.",
    "You are Synapse Surge's QUIZ ENGINE.",
    `COURSE: ${safeCourse}`,
    `CURRENT TOPIC: ${safeTopic}`,
    "- You will be given the full lesson content below. Base ALL questions strictly on that lesson and escalate difficulty using its deeper sections.",
    "- CRITICAL: You will also be given the previous MC questions that were already asked. Your harder questions MUST:",
    "  1. Be DIFFERENT from the MC questions - do NOT ask the same thing in a different format",
    "  2. Go DEEPER - test understanding, application, reasoning, or synthesis, not just recall",
    "  3. If covering similar concepts, require more complex reasoning, multi-step thinking, or real-world application",
    "  4. Focus on 'how' and 'why' rather than 'what' - test deeper comprehension",
    "GOAL: Generate EXACTLY 4 harder short-answer questions that require reasoning.",
    "FORMAT: OUTPUT ONLY raw JSON (no markdown). Structure:",
    "{",
    '  "mc": [],',
    '  "short": [',
    '    {"question": "...", "modelAnswer": "...", "explanation": "..."}',
    "  ]",
    "}",
    "- There must be exactly 4 objects in short[]. modelAnswer must be a complete, exam-ready solution.",
    "- explanation must walk through the reasoning or steps.",
    "- Tie questions to the course files and exam patterns mentioned in context.",
    "- DO NOT output anything besides that JSON object. No prose.",
  ];
  if (debugInstruction) {
    lines.push(`DEBUG FOCUS: ${debugInstruction}`);
  }
  return lines.join("\n");
}

