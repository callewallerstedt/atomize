# Rendering Process Explanation

## Overview
This document explains how AI-generated lesson content flows from the AI model through processing and into the rendered UI.

---

## 1. AI Response Format

### What the AI Returns
The AI (GPT-4o) returns a **JSON object** with this structure:

```json
{
  "title": "Lesson Title",
  "body": "Markdown content with LaTeX math...",
  "quiz": [
    { "question": "Question 1" },
    { "question": "Question 2" }
  ]
}
```

### Key Details:
- **Model**: `gpt-4o`
- **Response Format**: `response_format: { type: "json_object" }` (enforced JSON)
- **Temperature**: `0.7` (for node-lesson), `0.8` (for exam-snipe)
- **Max Tokens**: `12000` (allows for long, detailed lessons)

### Where This Happens:
- **Primary Route**: `/api/node-lesson/route.ts` (lines 96-120)
- **Called By**: `/api/exam-snipe/generate-lesson/route.ts` (which internally calls node-lesson)

---

## 2. JSON Parsing & Error Handling

### Parsing Process:
```typescript
// From node-lesson/route.ts (lines 107-119)
const content = completion.choices[0]?.message?.content || "{}";
let data: any = {};
try {
  data = JSON.parse(content);
} catch {
  // Fallback: try to extract JSON from text if wrapped
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { 
      data = JSON.parse(content.slice(start, end + 1)); 
    } catch { 
      data = {}; 
    }
  }
}
```

### Why This Matters:
- Sometimes the AI wraps JSON in explanatory text
- The fallback extracts just the JSON portion
- Ensures we always get structured data even if parsing fails initially

---

## 3. Data Sanitization

### What Gets Sanitized:
Before saving to the database, all strings are cleaned:

```typescript
// From exam-snipe/generate-lesson/route.ts (lines 181-192)
const sanitizeString = (s: string) => 
  s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

const sanitizeDeep = (value: any): any => {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeDeep);
  if (value && typeof value === "object") {
    const out: any = Array.isArray(value) ? [] : {};
    for (const k of Object.keys(value)) out[k] = sanitizeDeep(value[k]);
    return out;
  }
  return value;
};
```

### Purpose:
- Removes null bytes and control characters
- Prevents database corruption
- Ensures clean text for rendering

---

## 4. LaTeX Math Format Conversion

### AI Output Format:
The AI is instructed to use **bracket notation**:
- Inline math: `\( ... \)`
- Display math: `\[ ... \]`

### Conversion for Rendering:
Before rendering, we convert to **dollar sign notation** (which ReactMarkdown expects):

```typescript
// From node page (lines 1459-1463)
processedBody = processedBody
  .replace(/\\\[/g, '$$')      // \[ → $$
  .replace(/\\\]/g, '$$')      // \] → $$
  .replace(/\\\(/g, '$')       // \( → $
  .replace(/\\\)/g, '$');      // \) → $
```

### Why Convert?
- ReactMarkdown with `remark-math` expects `$...$` and `$$...$$`
- The AI uses bracket notation to avoid conflicts with markdown
- Conversion happens client-side before rendering

---

## 5. LaTeX Error Detection & Auto-Fixing

### Detection Process:
```typescript
// From katex-fix.ts (lines 12-19)
export function validateKaTeX(latex: string, displayMode: boolean) {
  try {
    katex.renderToString(latex, { throwOnError: true, displayMode });
    return { isValid: true, error: null };
  } catch (error: any) {
    return { isValid: false, error: error.message };
  }
}
```

### Extraction:
The system scans the markdown text for:
- Block math: `$$...$$` or `\[...\]`
- Inline math: `$...$` or `\(...\)`

For each math block found, it validates using KaTeX.

### Auto-Fixing:
If errors are detected:
1. **Extract** the problematic LaTeX
2. **Send to AI** (`/api/fix-latex`) with the error message
3. **Replace** the broken LaTeX with the fixed version
4. **Cache** results to avoid re-fixing the same content

```typescript
// From katex-fix.ts (lines 154-199)
export async function fixKaTeXErrors(text: string): Promise<string> {
  const mathBlocks = extractMathBlocks(text);
  const errorsToFix = mathBlocks.filter(block => block.error !== null);
  
  // Fix errors in reverse order to preserve positions
  let fixedText = text;
  for (let i = errorsToFix.length - 1; i >= 0; i--) {
    const block = errorsToFix[i];
    const fixedContent = await fixLaTeXWithAI(block.content, block.error);
    // Replace in text...
  }
  return fixedText;
}
```

---

## 6. Markdown Rendering Pipeline

### Components Used:
1. **ReactMarkdown** - Core markdown renderer
2. **remarkGfm** - GitHub Flavored Markdown support
3. **remarkMath** - Math block detection
4. **rehypeKatex** - LaTeX rendering via KaTeX

### Rendering Flow:
```typescript
// From AutoFixMarkdown.tsx (lines 61-69)
<ReactMarkdown 
  remarkPlugins={[remarkGfm, remarkMath]} 
  rehypePlugins={[rehypeKatex]} 
  {...props}
>
  {fixedText}  {/* Already processed and fixed */}
</ReactMarkdown>
```

### What Happens:
1. **ReactMarkdown** parses the markdown text
2. **remarkMath** identifies math blocks (`$...$` and `$$...$$`)
3. **rehypeKatex** converts LaTeX to HTML using KaTeX
4. **KaTeX** renders beautiful math equations

---

## 7. Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER REQUEST                                              │
│    - User clicks "Generate Lesson"                           │
│    - Frontend sends POST to /api/exam-snipe/generate-lesson │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. CONTEXT BUILDING                                          │
│    - Build examContext with lesson details                  │
│    - Add overlap prevention lists                           │
│    - Format topicSummary                                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. AI GENERATION (/api/node-lesson)                         │
│    - Send system prompt + context to GPT-4o                 │
│    - Request JSON format: {title, body, quiz}              │
│    - Temperature: 0.7, Max Tokens: 12000                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. AI RESPONSE                                               │
│    {                                                         │
│      "title": "Velocity and Speed",                         │
│      "body": "Markdown with \\(math\\) and \\[display\\]", │
│      "quiz": [{question: "..."}]                            │
│    }                                                         │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. JSON PARSING                                              │
│    - Parse JSON response                                     │
│    - Fallback extraction if wrapped in text                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. SANITIZATION                                              │
│    - Remove null bytes and control characters               │
│    - Deep sanitize all strings in the object                │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. DATABASE STORAGE                                          │
│    - Save to Prisma (examSnipeHistory.results)              │
│    - Store in generatedLessons[conceptName][planId]          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. FRONTEND RETRIEVAL                                        │
│    - Load lesson from database/state                        │
│    - Extract body, title, quiz                              │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 9. LATeX CONVERSION                                          │
│    - Convert \( \) → $ $                                    │
│    - Convert \[ \] → $$ $$                                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 10. AUTO-FIX MARKDOWN (AutoFixMarkdown component)           │
│     - Extract all math blocks                               │
│     - Validate each with KaTeX                              │
│     - Fix errors using AI if needed                         │
│     - Cache fixed results                                    │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 11. REACTMARKDOWN RENDERING                                  │
│     - Parse markdown with remarkGfm                         │
│     - Detect math with remarkMath                           │
│     - Render LaTeX with rehypeKatex                         │
│     - Output HTML with styled math                          │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│ 12. DISPLAYED IN UI                                          │
│     - Beautiful formatted lesson content                     │
│     - Rendered math equations                               │
│     - Interactive quiz questions                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Key Files & Their Roles

### Backend Processing:
- **`/api/node-lesson/route.ts`**: Core AI generation endpoint
  - Builds prompts
  - Calls OpenAI API
  - Parses JSON response
  - Returns structured data

- **`/api/exam-snipe/generate-lesson/route.ts`**: Exam-snipe wrapper
  - Builds exam-specific context
  - Calls node-lesson internally
  - Sanitizes data
  - Saves to database

### Frontend Rendering:
- **`src/components/AutoFixMarkdown.tsx`**: Wrapper component
  - Detects LaTeX errors
  - Auto-fixes using AI
  - Caches results
  - Renders with ReactMarkdown

- **`src/utils/katex-fix.ts`**: LaTeX validation & fixing
  - Extracts math blocks
  - Validates with KaTeX
  - Calls fix API
  - Manages cache

- **`src/app/subjects/[slug]/node/[name]/page.tsx`**: Lesson display page
  - Converts LaTeX notation
  - Uses AutoFixMarkdown
  - Handles quiz rendering
  - Manages user interactions

---

## 9. Common LaTeX Issues & Fixes

### Issues the AI Sometimes Generates:
1. **Missing backslashes**: `alpha` instead of `\alpha`
2. **Wrong fractions**: `a/b` instead of `\frac{a}{b}`
3. **Unicode symbols**: `√` instead of `\sqrt{}`
4. **Text in math**: `\t{text}` instead of `\text{text}`
5. **Unescaped underscores**: `var_name` instead of `var\_name`

### How We Fix:
- **AI Prompt**: Explicit rules in system prompt (lines 49-58 in node-lesson)
- **Auto-Fix**: Detects errors and fixes them automatically
- **Validation**: KaTeX validates before rendering

---

## 10. Performance Optimizations

### Caching:
- **LaTeX Fix Cache**: Avoids re-fixing the same LaTeX
- **Text Fix Cache**: Avoids re-processing entire texts
- **Cache Limits**: 100 LaTeX fixes, 50 text fixes (prevents memory issues)

### Lazy Processing:
- **AutoFixMarkdown**: Only processes when content changes
- **useEffect**: Watches for content updates
- **Cancellation**: Cancels in-flight requests if content changes

---

## 11. Example: Complete Data Flow

### Input (from frontend):
```json
{
  "historySlug": "exam-123",
  "planTitle": "Velocity and Speed",
  "planSummary": "Understanding velocity vs speed",
  "planObjectives": ["Define velocity", "Calculate velocity"]
}
```

### AI Response:
```json
{
  "title": "Velocity and Speed",
  "body": "# Introduction\n\nVelocity is \\(v = \\frac{\\Delta x}{\\Delta t}\\)...",
  "quiz": [
    {"question": "What is the difference between velocity and speed?"}
  ]
}
```

### After Sanitization:
```json
{
  "title": "Velocity and Speed",
  "body": "# Introduction\n\nVelocity is \\(v = \\frac{\\Delta x}{\\Delta t}\\)...",
  "quiz": [...]
}
```

### After LaTeX Conversion (client-side):
```markdown
# Introduction

Velocity is $v = \frac{\Delta x}{\Delta t}$...
```

### After Auto-Fix (if needed):
```markdown
# Introduction

Velocity is $v = \frac{\Delta x}{\Delta t}$...  [Fixed if errors found]
```

### Final Rendered Output:
- Beautiful HTML with:
  - Formatted headings
  - Styled paragraphs
  - Rendered math equations (KaTeX)
  - Interactive quiz questions

---

## Summary

The rendering process is a **multi-stage pipeline**:

1. **AI generates** JSON with markdown body containing LaTeX
2. **Backend parses** and sanitizes the data
3. **Frontend converts** LaTeX notation (`\(` → `$`)
4. **Auto-fix validates** and fixes LaTeX errors
5. **ReactMarkdown renders** markdown to HTML
6. **KaTeX renders** math equations beautifully

This ensures **reliable, beautiful rendering** even when the AI makes LaTeX mistakes!

