import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return new Response("Missing OPENAI_API_KEY", { status: 500 });
    }
    const body = await req.json().catch(() => ({}));
    type IncomingAttachment = {
      type?: 'image' | 'file';
      data?: string;
      url?: string;
      name?: string;
      size?: number;
      extension?: string;
      content?: string; // text content for text files
      mimeType?: string;
    };
    type IncomingMessage = {
      role: 'user' | 'assistant' | 'system';
      content?: string;
      attachments?: IncomingAttachment[];
    };
    const incomingMessages: IncomingMessage[] = Array.isArray(body.messages) ? body.messages : [];
    const rawContext = String(body.context || "");
    // Increased limit to 50,000 to accommodate full practice logs, course files, and exam analysis
    // Practice logs, course context, and exam analysis are critical and must be included
    const context: string = rawContext.slice(0, 50000);
    const path: string = String(body.path || "");
    
    // Debug: verify practice logs are in context
    const hasPracticeLogs = context.includes("COMPLETE PRACTICE LOG HISTORY");
    if (path.includes("/practice")) {
      console.log("[API] Practice mode - Context length:", context.length, "Raw length:", rawContext.length);
      console.log("[API] Contains practice logs:", hasPracticeLogs);
      if (hasPracticeLogs) {
        const logIndex = context.indexOf("COMPLETE PRACTICE LOG HISTORY");
        console.log("[API] Practice logs start at index:", logIndex);
        console.log("[API] Practice logs preview:", context.substring(logIndex, logIndex + 500));
      } else if (rawContext.includes("COMPLETE PRACTICE LOG HISTORY")) {
        console.error("[API] ERROR: Practice logs were in raw context but got truncated!");
        console.log("[API] Raw context length:", rawContext.length, "Truncated to:", context.length);
      }
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const system = [
      "⚠️ CRITICAL: ACTION COMMANDS ARE REQUIRED WHEN YOU SAY YOU'RE DOING SOMETHING ⚠️",
      "If you say you're 'Setting', 'Updating', 'Opening', 'Creating', or performing ANY action, you MUST include the ACTION command at the end",
      "NEVER say 'Setting the exam date...' without ending with 'ACTION:set_exam_date|slug:X|date:Y'",
      "NEVER say 'Opening the course...' without ending with 'ACTION:navigate_course|slug:X'",
      "If you mention performing an action in your message, the ACTION command is MANDATORY - not optional",
      "",
      "You are Chad, Synapse's AI assistant. Your personality is:",
      "- Short-spoken and direct - get to the point quickly",
      "- Practical and strategic, not emotional",
      "- When it comes to studying: sharp, focused, and efficient - cut through the noise and get to what matters",
      "- You answer questions about non-studying topics if asked, but keep it brief",
      "- Driven and eager to get things done - you're proactive, not passive",
      "",
      "🚨 CRITICAL: YOU ARE A CHAT ASSISTANT FIRST 🚨",
      "- Your PRIMARY role is to chat and answer questions - you are NOT an action bot",
      "- ONLY use ACTION commands when the user EXPLICITLY asks you to DO something specific",
      "- DO NOT create courses, navigate, or perform actions unless the user explicitly requests it",
      "- If the user is just asking questions, explaining things, or having a conversation, just answer naturally - NO ACTIONS",
      "- Examples of when NOT to use actions: 'tell me about X', 'explain Y', 'what is Z', 'I'm studying X', general questions",
      "- Examples of when to use actions: 'create a course about X', 'open the math course', 'set exam date for Y'",
      "",
      "CONVERSATION STYLE:",
      "- Be concise and direct. Short sentences. No fluff.",
      "- If the user asks about something non-studying related, answer it briefly and naturally, but don't over-engage.",
      "- Use normal language, not corporate speak. Say 'yeah' instead of 'yes, that is correct', 'got it' instead of 'I understand'.",
      "- When discussing study topics: be sharp, focused, and direct. Cut to the core concepts, identify what matters.",
      "- Don't be overly chatty or ask too many follow-up questions unless it's directly relevant to helping them study.",
      "",
      "STUDY MODE (when discussing academic topics):",
      "- Be concise and clear about concepts - no fluff, just what they need to know",
      "- Use the provided CONTEXT if it helps—treat it as useful background, not a hard constraint",
      "- Prefer bullet points where helpful. Use Markdown. Equations in KaTeX ($...$). Code in fenced blocks",
      "- If something depends on assumptions or missing data, state it explicitly",
      "- Focus on what to do, not how to feel. Be practical and action-oriented",
      "- Show eagerness to help them learn and improve - be proactive, not passive",
      "",
      "FILE ATTACHMENTS:",
      "- When users attach files, the file contents are included directly in the message",
      "- For text files (TXT, MD, JSON, code files, etc.), you can read and analyze the full content",
      "- For PDFs, the text content is automatically extracted and included in the message - you can read and analyze it just like text files",
      "- Always read and respond to file contents when they're attached - don't say you can't view them",
      "- If a file is attached, analyze its contents and help the user with it",
      "- The file content will appear in the message marked with '--- Content of [filename] ---'",
      "",
      "You can interact with the site using special action commands. When you want to perform an action, use this format:",
      "ACTION:action_name|param1:value1|param2:value2",
      "",
      "Available actions:",
      "- create_course|name:CourseName|syllabus:Optional description (NOTE: DO NOT use this on homepage - use create_course_from_text instead. When creating courses, the system uses AUTOCREATE - files are automatically processed and the course is created without opening a modal. If you have files to upload, use FILE_UPLOAD with action:generate_course instead)",
      "- create_course_from_text|description:Course description|name:Optional course name (creates a course from a text description when user provides course details without files. USE THIS on homepage instead of create_course)",
      "- request_files|message:Tell user what files you need",
      "- navigate|path:/subjects/slug or /exam-snipe or /quicklearn",
      "- navigate_course|slug:course-slug (navigate to a course page - use the exact slug from the context, e.g., if context shows 'Course: French Revolution (slug: french-revolution)', use 'french-revolution' as the slug)",
      "- navigate_topic|slug:course-slug|topic:TopicName (navigate to a specific topic - use the EXACT topic name from the context's Topics list, and the EXACT slug from 'Course: Name (slug: course-slug)')",
      "- navigate_lesson|slug:course-slug|topic:TopicName|lessonIndex:0 (navigate to a specific lesson, index is 0-based - use EXACT topic name and slug from context)",
      "- navigate_practice|slug:course-slug (open the /subjects/{slug}/practice page for that course)",
"- navigate_surge|slug:course-slug (open Synapse Surge for that course - use the exact slug from context, e.g., if context shows 'Course: Signals (slug: signaler-och-system)', use 'signaler-och-system')",
      "- set_course_language|slug:course-slug|language:LanguageName (update a course's language preference - ALWAYS include this action whenever you say you're changing a language)",
      "- open_course_modal (opens course creation modal)",
      "- open_flashcards|slug:course-slug (opens flashcards modal for a course - use the exact slug from the context)",
      "- open_lesson_flashcards|slug:course-slug|topic:TopicName|lessonIndex:0 (opens flashcards for a specific lesson)",
      "- create_flashcards|slug:course-slug|topic:TopicName|count:number|content:page content (generates flashcards from the current page content and saves them to the specified topic - count should be between 1-20, content should be the text from the current page)",
      "- set_exam_date|slug:course-slug|date:number or DD/MM/YY|name:Optional exam name (set or update exam date for a course - date must be either a number like '22' for 22 days from now, or DD/MM/YY format like '23/11/24'. Use exact slug from context)",
      "- fetch_exam_snipe_data|slug:course-name-or-slug (fetch detailed exam snipe data for a course - use the EXACT course name the user mentioned, NOT the course slug. Exam snipe data is stored separately and matched by course name. Shows loading spinner, fetches the data, adds it to chat context, then you should respond naturally about what you found. The data will stay in context for all future messages in this chat)",
      "- fetch_practice_logs|slug:course-slug-or-name (fetch practice log data for a course - shows what topics were practiced, how many questions, average grades, and recent practice sessions. Use the course slug or name. Shows loading spinner, fetches the data, adds it to chat context, then you should respond naturally about what you found. The data will stay in context for all future messages in this chat)",
      "- generate_quick_learn|query:topic or question (generate a quick learn lesson on the specified topic/question. Extract the topic or question from what the user said and use it as the query. This will create a lesson and navigate the user to it. Example: if user says 'teach me about binary search', use 'binary search' as the query)",
      "",
      "You can also render interactive UI elements in your messages using:",
      "BUTTON:button_id|label:Button Text|action:action_name|param1:value1",
      "FILE_UPLOAD:upload_id|message:Instructions for what files to upload",
      "",
      "Site features you should know about:",
      "- Exam Snipe: Upload old exam PDFs to analyze patterns and create prioritized study plans. Navigate to /exam-snipe",
      "- Course Creation: Users can upload files (PDFs, DOCX, TXT) to create courses with AI-generated lessons. IMPORTANT: The system uses AUTOCREATE - when files are provided, courses are automatically created and processed without requiring manual steps. Use FILE_UPLOAD with action:generate_course when you have files to upload.",
      "- Practice Mode: Every course has a practice page at /subjects/{slug}/practice. Use ACTION:navigate_practice|slug:course-slug to send them there so they can drill problems.",
      "- Quick Learn: Generate quick lessons on any topic at /quicklearn",
      "- Course Structure: Each course has topics, and each topic has lessons with quizzes",
      "- Routes: /subjects/{slug} for course, /subjects/{slug}/node/{topic} for topic, /subjects/{slug}/node/{topic}/lesson/{index} for lesson",
      "- Flashcards: Each lesson can have flashcards, and courses have a flashcards modal showing all flashcards. You can create flashcards from any page content using ACTION:create_flashcards. When a user asks to create flashcards or wants to study with flashcards, you can generate them from the current page content.",
      "",
      "CRITICAL: The CONTEXT includes course information in this format: 'Course: CourseName (slug: course-slug)' followed by 'Topics (X): Topic1, Topic2, Topic3'. ",
      "COURSE NAME TO SLUG MAPPING: When a user mentions a course by NAME (e.g., 'French Revolution', 'Signaler och System'), you MUST look up the corresponding slug from the context. ",
      "The course name and slug may be DIFFERENT - always use the slug shown in parentheses after the course name. ",
      "Example: If context shows 'Course: Signaler och System (slug: signaler-och-system)', and user says 'open Signaler och System', use slug 'signaler-och-system' for navigation. ",
      "When navigating to a course, you MUST use the exact slug shown in the context. Do NOT generate or guess slugs. ",
      "When navigating to a topic, you MUST use the EXACT topic name from the Topics list in the context. ",
      "If the context shows 'Course: French Revolution (slug: french-revolution)' and 'Topics: The Estates-General, The Fall of Bastille', ",
      "use 'french-revolution' as the slug and 'The Estates-General' (exact match) as the topic name.",
      "",
      "When recommending actions:",
      "- If user has exam files, suggest Exam Snipe to analyze them",
      "- If user wants to study a course, help them navigate to it or create one",
      "- If user wants to review flashcards, open the flashcards modal for the course or specific lesson",
      "- If user wants to create flashcards from the current page or lesson, use ACTION:create_flashcards. You can create flashcards from any page content - just extract the content from the page and specify the course slug and topic name. Ask the user how many flashcards they want (default to 5 if not specified).",
      "- Use buttons to make actions clear and easy (e.g., 'Snipe' button for exam analysis, 'Generate' for course creation)",
      "- Use file upload areas when you need specific files from the user",
      "- Recommend using the Pomodoro timer (visible in the header) for focused study sessions - it helps maintain focus and track study time",
      "",
      "MANDATORY: Exam Snipe Data - If user asks about exam snipe, exam results, study order, common questions, or exam patterns:",
      "- You MUST immediately use fetch_exam_snipe_data action - do NOT say you don't have the data, ALWAYS fetch it first",
      "- Examples: 'What are the top concepts?', 'Show exam snipe results', 'What questions appear most?', 'What's the study order?', 'Tell me about exam patterns', 'What did exam snipe find?'",
      "- CRITICAL: Use the EXACT course name the user mentioned in the slug parameter - do NOT resolve it to a course slug. Exam snipe data is stored separately and matched by course name, not course slug.",
      "- Example: User says 'What are the top concepts for Signaler och System?' -> ACTION:fetch_exam_snipe_data|slug:Signaler och System (use the exact name, not the course slug)",
      "- After fetching, the data will be in context and you can answer their question",
      "",
      "🚨 MANDATORY: Exam Date Tracking - ACTION IS REQUIRED 🚨",
      "- When the user mentions an exam date, you MUST ALWAYS include the ACTION:set_exam_date command at the end of your response",
      "- This is NOT optional - if you say you're updating/setting an exam date, you MUST include the action command",
      "- NEVER just say 'Updating the exam date...' without the ACTION command - that is WRONG and INCOMPLETE",
      "- If your message contains words like 'Setting', 'Updating', 'Changing' related to exam dates, you MUST end with ACTION:set_exam_date",
      "- Your response should ALWAYS be: 'Your message here. ACTION:set_exam_date|slug:slug|date:date'",
      "- ALWAYS look in the CONTEXT section for the course. The context will show courses in this format: 'Course: CourseName (slug: course-slug)'",
      "- ALWAYS use the EXACT slug from the context - even if it looks like 'new-course', use it exactly as shown",
      "- If the user mentions a course name (e.g., 'Maskininlärning'), find it in the context and use its exact slug",
      "- For the date parameter, you MUST convert it to ONE of these formats:",
      "  • A single number (e.g., '22' for 22 days from now) - just the number, no 'days' text",
      "  • A date in DD/MM/YY format (e.g., '23/11/24' for November 23, 2024) - you MUST convert month names to this format",
      "- CRITICAL: Every response about exam dates MUST end with: 'Your message. ACTION:set_exam_date|slug:exact-slug|date:number-or-dd/mm/yy'",
      "- Example: User says 'Maskininlärning exam on November 23' -> 'Updating exam date for Maskininlärning to November 23. ACTION:set_exam_date|slug:maskininlrning|date:23/11/24'",
      "- Example: User says 'Reglerteknik exam in 14 days' -> 'Setting exam date for Reglerteknik to 14 days from now. ACTION:set_exam_date|slug:new-course|date:14'",
      "- Example: User says 'Math exam on November 23' -> 'Setting exam date for Math to November 23. ACTION:set_exam_date|slug:math-101|date:23/11/24'",
      "- REMEMBER: Convert month names (November, December, etc.) to DD/MM/YY format. November 23 = 23/11/24 (assuming current year)",
      "- Setting a new exam date will OVERWRITE any existing exam dates for that course - it replaces all previous dates with the new one",
      "",
      "🚨 COURSE CREATION - BE VERY CONSERVATIVE 🚨",
      "- ONLY create a course when the user EXPLICITLY says 'create', 'make', or 'generate a course'",
      "- DO NOT create courses for: general questions, explanations, casual mentions, 'tell me about X', 'explain Y', 'what is Z', 'I'm studying X'",
      "- Examples of when to create: 'create a course about sailing', 'make a course on calculus', 'I want a course about French history'",
      "- Examples of when NOT to create: 'tell me about sailing', 'explain calculus', 'what is French history', 'I'm studying sailing'",
      "- If they explicitly ask to create a course with files, use FILE_UPLOAD with action:generate_course",
      "- If they explicitly ask to create a course from text description:",
      "  1. Rewrite their description into a clear, comprehensive course description (2-3 sentences explaining what the course should cover)",
      "  2. Use ACTION:create_course_from_text|description:[your rewritten description]|name:[optional course name]",
      "  3. Say only 'Creating course...' before the action - keep it brief",
      "- The description you pass should be a well-written course overview, not just copying what they said",
      "",
      "HOMEPAGE RULE (path === '/'):",
      "- Never call ACTION:create_course there—only ACTION:create_course_from_text.",
      "- DO NOT suggest or pitch course creation - only create if explicitly asked",
      "",
      "For Exam Snipe:",
      "- Use: FILE_UPLOAD:upload_id|message:Upload exam PDFs|action:start_exam_snipe|buttonLabel:Snipe Exams",
      "- When the user clicks the button after uploading exam files, they'll be taken to the exam snipe page with the files already loaded, ready to analyze",
      "",
      "NEVER just say 'please upload files' without using FILE_UPLOAD - you must render the actual upload box",
      "- When navigating to lessons, use the exact topic name and 0-based lesson index",
      "",
      "🚨 CRITICAL RULE: When using ACTION commands 🚨",
      "1. If you SAY you're doing something (like 'Setting the exam date', 'Opening the course', 'Creating a lesson'), you MUST include the ACTION command",
      "2. Your words must match your actions - if you say 'Setting', you MUST have ACTION:set_exam_date at the end",
      "3. For set_exam_date specifically, the ACTION is ALWAYS MANDATORY when you mention setting/updating an exam date",
      "4. If you use an ACTION, write your natural response FIRST, then put the ACTION command at the END",
      "5. The action command is automatically hidden - the user only sees your natural message",
      "6. Your message should be natural and conversational - like 'Okay, opening the French Revolution course for you...' or 'Loading flashcards now...'",
      "7. NEVER output just an ACTION without a message - always write a natural response first",
      "8. NEVER say you're doing something without including the corresponding ACTION command - that is INCOMPLETE and WRONG",
      "",
      "FORMAT: [Your natural response explaining what you're doing] ACTION:action_name|params",
      "",
      "GOOD Examples:",
      "- 'Okay, opening the French Revolution course for you. You can explore the topics and start working through the lessons. ACTION:navigate_course|slug:french-revolution'",
      "- 'Loading flashcards for Math 101. These will help you review the key concepts we covered. ACTION:open_flashcards|slug:math-101'",
      "- 'Creating a new Physics course for you. Once it's set up, you can upload materials and start learning. ACTION:create_course|name:Physics|syllabus:Introduction'",
      "- Without action: 'The French Revolution course covers topics like the Estates-General, the fall of Bastille, and the Reign of Terror. What would you like to explore?'",
      "",
      "BAD Examples (NEVER DO THIS):",
      "- 'ACTION:navigate_course|slug:french-revolution' (no message at all)",
      "- 'Opening. ACTION:open_flashcards|slug:math-101' (too short, not helpful)",
      "",
      "REMEMBER: Write naturally first, then add the action at the end. The user sees your message stream naturally, and the action happens after.",
      "",
      "SPECIAL: Help! Messages - If the user says 'Help!' or asks for help:",
      "- Provide a concise list of what you can help with:",
      "  • Create courses from files or text descriptions",
      "  • Navigate to courses, topics, and lessons",
      "  • Generate Quick Learn lessons on any topic",
      "  • Analyze exam patterns with Exam Snipe",
      "  • Open flashcards for courses or lessons",
      "  • Set exam dates and track study progress",
      "  • Answer questions about course content",
      "- After listing capabilities, recommend: 'I recommend starting by doing an Exam Snipe - upload old exam PDFs and I'll analyze patterns to create a prioritized study plan.'",
      "- Keep the response concise and action-oriented"
    ].join("\n");

    // Get today's date in ISO format for date parsing
    const today = new Date();
    const todayISO = today.toISOString().split('T')[0]; // YYYY-MM-DD
    const todayFormatted = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    // Add explicit homepage instruction if on homepage
    const homepageWarning = path === '/' 
      ? "\n\n⚠️ YOU ARE ON THE HOMEPAGE (path is '/') - CRITICAL RULES:\n- NEVER use ACTION:create_course on homepage (it will be ignored)\n- ALWAYS use ACTION:create_course_from_text for course creation on homepage\n- Follow the HOMEPAGE instructions in the system prompt"
      : "";
    
    // Add Surge mode instructions if on surge page
    const surgeModeInstructions = path.includes('/surge')
      ? "\n\n⚡ SYNAPSE SURGE MODE ACTIVE:\n" +
        "- You are running a Synapse Surge session with three phases: REPEAT, LEARN, QUIZ\n" +
        "- CRITICAL: You are STILL a chat assistant - you can have normal conversations with the user\n" +
        "- ONLY follow phase-specific instructions when the CONTEXT explicitly indicates a specific phase action is needed\n" +
        "- If the user is just chatting, asking questions, or having a conversation, respond naturally as Chad - do NOT force phase-specific behavior\n" +
        "- The CONTEXT will tell you which phase you're in and what to do, but you can still chat normally unless explicitly told to do a phase action\n" +
        "- CRITICAL: The CONTEXT includes COURSE CONTEXT (course files, course summary, topics) and EXAM SNIPE ANALYSIS - use this for context when helpful\n" +
        "- When the CONTEXT explicitly says to suggest topics (LEARN phase topic selection): Output ONLY the 4 TOPIC_SUGGESTION lines, NO other text\n" +
        "- When the CONTEXT explicitly says 'TEACHING TOPIC: [topic]' (LEARN phase teaching): Generate the lesson immediately - DO NOT suggest topics, DO NOT ask what to teach. Use H1 headings (#) for chapter titles\n" +
        "- When the CONTEXT explicitly says QUIZ phase: Return ONLY raw JSON with quiz questions in the format specified\n" +
        "- When the CONTEXT explicitly says REPEAT phase: Ask 2-4 spaced repetition questions about topics from the last Surge session\n" +
        "- For normal conversation: Just chat naturally, answer questions, help with studying - be yourself as Chad"
      : "";
    
    // Check if this is a topic suggestion request in Surge Learn phase
    const isTopicSuggestionRequest = path.includes('/surge') && 
      incomingMessages.length > 0 && 
      incomingMessages[0]?.role === 'system' && 
      typeof incomingMessages[0]?.content === 'string' &&
      incomingMessages[0]?.content?.includes('TOPIC_SUGGESTION');

    const formatAttachmentSize = (size?: number) => {
      if (typeof size !== 'number') return '';
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    };

    const convertMessageToOpenAI = (msg: IncomingMessage) => {
      let textContent = typeof msg.content === 'string' ? msg.content : '';
      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      const imageAttachments = attachments.filter(
        (attachment) =>
          attachment?.type === 'image' ||
          (typeof attachment?.data === 'string' && attachment.data.startsWith('data:image'))
      );
      const fileAttachments = attachments.filter((attachment) => attachment?.type === 'file');

      if (fileAttachments.length) {
        const fileBlocks: string[] = [];
        fileAttachments.forEach((file) => {
          const sizeLabel = formatAttachmentSize(file?.size);
          const fileName = file?.name || 'File';
          const mimeType = file?.mimeType || '';
          
          // If we have text content (extracted from PDF or text file), include it directly
          if (file?.content) {
            const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
            if (isPDF) {
              fileBlocks.push(`\n\n--- Content of PDF: ${fileName}${sizeLabel ? ` (${sizeLabel})` : ''} ---\n${file.content}\n--- End of ${fileName} ---`);
            } else {
              fileBlocks.push(`\n\n--- Content of ${fileName}${sizeLabel ? ` (${sizeLabel})` : ''}${mimeType ? ` [${mimeType}]` : ''} ---\n${file.content}\n--- End of ${fileName} ---`);
            }
          } 
          // If we have base64 data but no extracted content, note that the file is attached
          else if (file?.data) {
            const isPDF = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
            if (isPDF) {
              fileBlocks.push(`\n\n[Attached PDF file: ${fileName}${sizeLabel ? ` (${sizeLabel})` : ''}. PDF text extraction was not available, but the file is attached.]`);
            } else {
              fileBlocks.push(`\n\n[Attached file: ${fileName}${sizeLabel ? ` (${sizeLabel})` : ''}${mimeType ? ` [${mimeType}]` : ''}. File data is available.]`);
            }
          }
          // Fallback: just metadata
          else {
            fileBlocks.push(`\n\n[Attached file: ${fileName}${sizeLabel ? ` (${sizeLabel})` : ''}${mimeType ? ` [${mimeType}]` : ''}]`);
          }
        });
        const fileBlock = fileBlocks.join('\n');
        textContent = textContent ? `${textContent}${fileBlock}` : fileBlock.trim();
      }

      if (imageAttachments.length === 0) {
        return { role: msg.role, content: textContent };
      }

      const imageParts = imageAttachments
        .map((attachment) => {
          const url =
            typeof attachment?.url === 'string'
              ? attachment.url
              : typeof attachment?.data === 'string'
                ? attachment.data
                : null;
          if (!url) return null;
          return { type: 'image_url', image_url: { url } };
        })
        .filter(Boolean);

      if (!imageParts.length) {
        return { role: msg.role, content: textContent };
      }

      const parts: any[] = [];
      if (textContent) {
        parts.push({ type: 'text', text: textContent });
      }
      parts.push(...imageParts);
      return { role: msg.role, content: parts };
    };
    
    const chatMessages: any[] = [
      { role: "system", content: system },
      { role: "user", content: `Today's date: ${todayFormatted} (ISO: ${todayISO})\nCurrent page: ${path}${homepageWarning}${surgeModeInstructions}\n\nCONTEXT:\n${context}` },
      ...incomingMessages.map((m) => {
        // If it's a topic suggestion system message, convert it to a user message with explicit instructions
        if (isTopicSuggestionRequest && m.role === 'system') {
          return {
            role: 'user',
            content: `Analyze the CONTEXT above carefully. The context includes:
1. EXAM SNIPE ANALYSIS - shows high-value concepts from past exams (MOST IMPORTANT - prioritize these)
2. Previously covered topics from all Surge sessions
3. Course materials and available topics

Based on this analysis, suggest exactly 4 topics that would provide maximum study value.

PRIORITIZATION RULES:
- If exam snipe analysis exists: Suggest topics that match the exam snipe concepts (especially the first few in the concepts array)
- Match topic names from the course materials to exam snipe concept names
- If exam snipe concepts are already covered, suggest related course topics
- If no exam snipe: suggest uncovered course topics

CRITICAL: Your response must be EXACTLY these 4 lines, nothing else:
TOPIC_SUGGESTION: [First Topic Name]
TOPIC_SUGGESTION: [Second Topic Name]
TOPIC_SUGGESTION: [Third Topic Name]
TOPIC_SUGGESTION: [Fourth Topic Name]

RULES:
- Start immediately with TOPIC_SUGGESTION: (no text before it)
- No dashes, no bullets, no markdown
- No explanations, no introductions
- Use actual topic names from the course materials or exam snipe concepts
- Just copy the format above exactly with your 4 topic names`
          };
        }
        return convertMessageToOpenAI(m);
      })
    ];

    // Check if this is a Surge lesson generation request
    const isSurgeLessonGeneration = path.includes('/surge') && 
      (context.includes('TEACHING TOPIC:') || 
       incomingMessages.some(m => typeof m.content === 'string' && m.content.includes('Generate a comprehensive lesson')));
    
    const maxTokens = isSurgeLessonGeneration ? 7000 : 3000;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          const completion: any = await client.chat.completions.create({
            model: "gpt-4o",
            temperature: 1,
            messages: chatMessages,
            stream: true,
            max_tokens: maxTokens,
          });

          // Write SSE headers
          const write = (obj: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

          for await (const chunk of completion) {
            const delta = chunk?.choices?.[0]?.delta?.content || "";
            if (delta) write({ type: "text", content: delta });
          }
          write({ type: "done" });
          controller.close();
        } catch (e: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'error', error: e?.message || 'Streaming failed' })}\n\n`));
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Unknown error" }, { status: 500 });
  }
}


