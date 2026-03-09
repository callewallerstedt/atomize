export type ExamSnipeCommonQuestion = {
  question: string;
  examCount: number;
  averagePoints: number;
};

export type ExamSnipeLessonPlan = {
  summary: string;
  focusAreas: string[];
  keySkills: string[];
  practiceApproach: string;
  examConnections: string[];
  lessons: Array<{
    id?: string;
    title: string;
    summary: string;
    objectives: string[];
    estimatedTime?: string;
  }>;
};

export type ExamSnipeConcept = {
  name: string;
  description: string;
  lessonPlan: ExamSnipeLessonPlan;
};

export type ExamSnipeResult = {
  courseName: string | null;
  gradeInfo: string | null;
  patternAnalysis: string | null;
  commonQuestions: ExamSnipeCommonQuestion[];
  concepts: ExamSnipeConcept[];
  detectedLanguage?: { code: string; name: string };
};

function cleanString(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function dedupeStrings(values: unknown[], { min = 1, max = 12 }: { min?: number; max?: number } = {}) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const text = cleanString(value);
    if (text.length < min) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= max) break;
  }
  return output;
}

export function extractJsonObject(raw: string): any {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {}

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1]);
    } catch {}
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }

  return {};
}

export function normalizeExamSnipeResult(
  raw: any,
  detectedLanguage?: { code?: string; name?: string } | null
): ExamSnipeResult {
  const conceptsRaw = Array.isArray(raw?.concepts) ? raw.concepts : [];
  const commonQuestionsRaw = Array.isArray(raw?.commonQuestions) ? raw.commonQuestions : [];

  const concepts = conceptsRaw
    .map((concept: any, index: number) => {
      const name = cleanString(concept?.name || `Concept ${index + 1}`);
      const description = cleanString(concept?.description || concept?.summary);
      const lessonPlan = concept?.lessonPlan || {};
      const lessonsRaw = Array.isArray(lessonPlan?.lessons) ? lessonPlan.lessons : [];
      const lessons = lessonsRaw
        .map((lesson: any, lessonIndex: number) => ({
          id: cleanString(lesson?.id || `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${lessonIndex}`),
          title: cleanString(lesson?.title || `Lesson ${lessonIndex + 1}`),
          summary: cleanString(lesson?.summary),
          objectives: dedupeStrings(Array.isArray(lesson?.objectives) ? lesson.objectives : [], { min: 2, max: 5 }),
          estimatedTime: cleanString(lesson?.estimatedTime) || undefined,
        }))
        .filter((lesson: any) => lesson.title);

      return {
        name,
        description,
        lessonPlan: {
          summary: cleanString(lessonPlan?.summary || description),
          focusAreas: dedupeStrings(
            Array.isArray(lessonPlan?.focusAreas)
              ? lessonPlan.focusAreas
              : Array.isArray(lessonPlan?.focus)
                ? lessonPlan.focus
                : [],
            { min: 2, max: 6 }
          ),
          keySkills: dedupeStrings(Array.isArray(lessonPlan?.keySkills) ? lessonPlan.keySkills : [], { min: 2, max: 6 }),
          practiceApproach: cleanString(lessonPlan?.practiceApproach || lessonPlan?.studyApproach),
          examConnections: dedupeStrings(Array.isArray(lessonPlan?.examConnections) ? lessonPlan.examConnections : [], { min: 2, max: 6 }),
          lessons,
        },
      };
    })
    .filter((concept: ExamSnipeConcept) => concept.name)
    .sort((a: ExamSnipeConcept, b: ExamSnipeConcept) => {
      const aSignals =
        a.lessonPlan.examConnections.length * 2 +
        a.lessonPlan.keySkills.length +
        a.lessonPlan.lessons.length;
      const bSignals =
        b.lessonPlan.examConnections.length * 2 +
        b.lessonPlan.keySkills.length +
        b.lessonPlan.lessons.length;
      return bSignals - aSignals;
    });

  const commonQuestions = commonQuestionsRaw
    .map((question: any) => ({
      question: cleanString(question?.question),
      examCount: Number.isFinite(Number(question?.examCount)) ? Number(question.examCount) : 0,
      averagePoints: Number.isFinite(Number(question?.averagePoints))
        ? Number(question.averagePoints)
        : 0,
    }))
    .filter((question: ExamSnipeCommonQuestion) => question.question)
    .sort((a: ExamSnipeCommonQuestion, b: ExamSnipeCommonQuestion) => {
      if (b.examCount !== a.examCount) return b.examCount - a.examCount;
      return b.averagePoints - a.averagePoints;
    })
    .slice(0, 7);

  return {
    courseName: cleanString(raw?.courseName) || null,
    gradeInfo: cleanString(raw?.gradeInfo) || null,
    patternAnalysis: cleanString(raw?.patternAnalysis) || null,
    commonQuestions,
    concepts,
    detectedLanguage: detectedLanguage?.name
      ? {
          code: cleanString(detectedLanguage.code || "en"),
          name: cleanString(detectedLanguage.name || "English"),
        }
      : undefined,
  };
}
