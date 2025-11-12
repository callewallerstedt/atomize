# Exam Snipe Lesson Generation - Prompt & Context Documentation

## Overview
When generating a lesson from Exam Snipe, the system builds comprehensive context including:
- Exam pattern analysis
- Main concept information
- **Specific lesson details** (title, summary, objectives)
- Other planned lessons in the same concept (to avoid overlap)
- Other concepts in the course (to avoid overlap)
- Previously generated lessons

---

## 1. Data Sent FROM Exam Snipe TO `/api/exam-snipe/generate-lesson`

**Endpoint:** `POST /api/exam-snipe/generate-lesson`

**Request Body:**
```json
{
  "historySlug": "exam-snipe-slug-123",
  "courseName": "Physics Exam Prep",
  "patternAnalysis": "Analysis of exam patterns...",
  "conceptName": "Kinematics",
  "conceptDescription": "Study of motion without forces",
  "keySkills": ["Calculate velocity", "Solve displacement problems"],
  "examConnections": ["Appears on 3 of 5 exams", "~15 points"],
  "planId": "lesson-plan-456",
  "planTitle": "Velocity and Speed",
  "planSummary": "Understanding the difference between velocity and speed",
  "planObjectives": [
    "Define velocity and speed",
    "Calculate average velocity",
    "Solve problems involving velocity"
  ],
  "detectedLanguage": { "code": "en", "name": "English" }
  // NOTE: lessonData is NOT passed - let it generate with proper context
}
```

---

## 2. Context Built IN `/api/exam-snipe/generate-lesson`

The endpoint builds comprehensive context by:

### A. Fetching Exam Snipe History
- Loads all concepts from the exam analysis
- Loads all previously generated lessons
- Identifies other concepts and their lessons
- Identifies other lessons in the same concept

### B. Building `examContext` (Lines 82-99)
```
Course: Physics Exam Prep
Exam Pattern: [patternAnalysis content]

=== LESSON TO TEACH: Velocity and Speed ===
Lesson Summary: Understanding the difference between velocity and speed
Lesson Objectives:
- Define velocity and speed
- Calculate average velocity
- Solve problems involving velocity

Context: This lesson is part of the broader concept "Kinematics"
Concept Overview (for context only): Study of motion without forces

Key Skills to Master (from exam analysis):
- Calculate velocity
- Solve displacement problems

Exam References:
- Appears on 3 of 5 exams
- ~15 points
```

### C. Building Overlap Prevention Lists
- **Other Concepts:** All other main concepts and their planned lessons
- **Other Lessons in Concept:** All other generated lessons from the same concept
- **Previous Lessons:** Previously generated lessons in the same concept (for continuity)
- **Planned Future Lessons:** Upcoming lessons in the same concept (to avoid overlap)

### D. Building `topicSummary` (Lines 107-120)
```
=== PRIMARY FOCUS: Teach the lesson "Velocity and Speed" ===
Lesson Summary: Understanding the difference between velocity and speed
Lesson Objectives:
- Define velocity and speed
- Calculate average velocity
- Solve problems involving velocity

Context: This lesson is part of the broader concept "Kinematics"
Concept Overview (for context only): Study of motion without forces

[Full examContext from above]

Other Main Concepts in this Course (avoid overlap):
- Dynamics: Study of forces (lessons: Newton's Laws, Friction)
- Energy: Conservation principles (lessons: Kinetic Energy, Potential Energy)

Other Lessons Already Generated for "Kinematics" (avoid duplication):
- Displacement and Distance
- Acceleration Basics
```

---

## 3. Data Sent FROM `/api/exam-snipe/generate-lesson` TO `/api/node-lesson`

**Endpoint:** `POST /api/node-lesson` (called internally)

**Request Body:**
```json
{
  "subject": "Physics Exam Prep",
  "topic": "Velocity and Speed",
  "course_context": "[examContext] + [Other Concepts List] + [Other Lessons List]",
  "combinedText": "",
  "topicSummary": "[Full topicSummary from above]",
  "lessonsMeta": [{ "type": "Concept", "title": "Velocity and Speed" }],
  "lessonIndex": 0,
  "previousLessons": [
    { "index": 0, "title": "Displacement and Distance", "body": "[first 200 chars]" },
    { "index": 1, "title": "Acceleration Basics", "body": "[first 200 chars]" }
  ],
  "generatedLessons": [
    { "index": 0, "title": "Displacement and Distance", "body": "[first 200 chars]" },
    { "index": 1, "title": "Acceleration Basics", "body": "[first 200 chars]" }
  ],
  "otherLessonsMeta": [
    { "type": "Lesson Outline", "title": "Projectile Motion" },
    { "type": "Lesson Outline", "title": "Circular Motion" }
  ],
  "courseTopics": ["Kinematics", "Dynamics", "Energy"],
  "languageName": "English"
}
```

---

## 4. System Prompt in `/api/node-lesson`

**Model:** `gpt-4o`  
**Temperature:** `0.8`  
**Max Tokens:** `8000`

**System Prompt:**
```
You generate ONE lesson for a SPECIFIC topic using the provided course context and materials.
Return JSON: { title: string; body: string; quiz: { question: string }[] }
CRITICAL: You MUST focus EXCLUSIVELY on the topic specified in the 'Topic:' field. Do NOT generate content about other topics.
Rules:
- The lesson MUST be about the exact topic specified in the 'Topic:' field - nothing else.
- Use the detailed course context to identify and teach SPECIFIC concepts, methods, and skills related to THIS SPECIFIC TOPIC ONLY.
- Body should be clean, well-structured Markdown using proper KaTeX math syntax. Use $...$ for inline math and $$...$$ for display math.
- CRITICAL LANGUAGE RULE: You MUST write the ENTIRE lesson (title, body, quiz questions) in English. Even if the source material is in a different language (Spanish, German, etc.), you MUST translate and write everything in English. This is non-negotiable.
- CRITICAL LaTeX rules:
  * ALL Greek letters MUST use backslash: \alpha, \beta, \eta, \theta, \pi, NOT alpha, beta, eta, theta, pi
  * For fractions: \frac{numerator}{denominator}, NOT a/b or unicode fractions
  * For square roots: \sqrt{expression}, NOT √ or sqrt()
  * For text in math: \text{proper text here}, NOT \t, NOT ext{text}, NEVER use \t as it's a tab character
  * Escape underscores: \_ (e.g., \text{var\_name})
  * Common errors to avoid: '\tSpam' → '\text{Spam}', 'eta_0' → '\eta_0', 'ext{text}' → '\text{text}', 'L/g' → '\frac{L}{g}'
- For code and function names in text, use proper LaTeX: \text{sem\_wait(\&semaphore)} not \text{sem extunderscore wait(&semaphore)}

TEACHING APPROACH:
Design each lesson to build deep understanding by:
- Starting with what students already know and connecting new ideas to prior knowledge
- Using multiple representations (verbal, visual, mathematical) when helpful
- Providing concrete examples before abstract concepts
- Including practice opportunities that reinforce learning
- Creating logical connections between ideas

STRUCTURE FLEXIBILITY:
Choose the lesson structure that best serves the content and learning goals.
Common effective patterns include:
- Problem-based approach (present challenge, work through solution)
- Concept development (build from simple to complex)
- Skills progression (practice basic skills before advanced application)
- Mixed approaches combining explanation, examples, and practice

CONTENT ORGANIZATION:
Organize the lesson in whatever way makes the material clearest and most learnable.
Use headings, lists, and formatting to improve readability and comprehension.

Additional teaching rules:
- Use simple, conversational language - explain like you're helping a friend understand
- Break complex ideas into small digestible chunks with clear headings
- When introducing formulas, explain what each variable represents in plain language BEFORE showing the math
- Use concrete numbers and realistic scenarios in examples
- Connect new concepts to what students already know from previous lessons
- Focus on teaching the specific concepts, methods, and procedures outlined in the course context
- Use clear headings, short paragraphs, and lists for readability.

PRACTICE PROBLEMS (quiz field):
- The 'quiz' field must contain 2-4 practice problems that test understanding and application
- Make them practical problems students can actually work through, not just 'what is X?' questions
- Include a mix: conceptual understanding, calculations, and real-world application
- Word them as actual problems to solve, not just recall questions
- DO NOT include any quiz content inside the body - they go in the quiz array only

- Avoid overlap: do not repeat content already covered by other lessons; follow the planned division and prior generated lessons.
```

---

## 5. User Context in `/api/node-lesson`

**User Message (Context):**
```
==================================================
TOPIC TO TEACH: Velocity and Speed
==================================================
Subject: Physics Exam Prep
Course summary: [examContext + Other Concepts + Other Lessons]
Topic summary for "Velocity and Speed": [Full topicSummary]
Course topics (for context only - focus on "Velocity and Speed"): Kinematics, Dynamics, Energy
Target lesson: Concept — Velocity and Speed
Relevant material (truncated): [empty for exam-snipe]

Previous lessons recap (for continuity): 
Displacement and Distance: [first 300 chars] | Acceleration Basics: [first 300 chars]

Planned other lessons (avoid overlapping): 
L1 Lesson Outline — Projectile Motion; L2 Lesson Outline — Circular Motion

Already generated lessons (avoid repeating these): 
Displacement and Distance: [first 200 chars] | Acceleration Basics: [first 200 chars]
```

---

## Summary

**Key Points:**
1. ✅ **Lesson-specific focus:** The prompt prioritizes the specific lesson (title, summary, objectives) over the broader concept
2. ✅ **Overlap prevention:** Includes lists of other concepts and other lessons to avoid duplication
3. ✅ **Continuity:** Includes previous lessons for context and continuity
4. ✅ **Exam context:** Includes exam pattern analysis and exam connections
5. ✅ **Main concept context:** Includes concept description for broader understanding (but marked as "for context only")

**The AI is instructed to:**
- Focus EXCLUSIVELY on the specific lesson topic
- Avoid overlapping with other lessons in the concept
- Avoid overlapping with other concepts
- Build on previous lessons for continuity
- Use exam context to prioritize high-value content



