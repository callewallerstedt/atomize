const DEFAULT_QUALITY_MODEL = "gpt-5.2";
const DEFAULT_UTILITY_MODEL = "gpt-4o-mini";

export type ModelTask =
  | "courseSummary"
  | "courseFromText"
  | "topicSuggestion"
  | "nodePlan"
  | "topicExtraction"
  | "nodeLesson"
  | "nodeLessonStream"
  | "examSnipeAnalysis"
  | "examSnipeAnalysisStream"
  | "examSnipePlan"
  | "examSnipeLesson"
  | "chatAssistant"
  | "surgeQuiz"
  | "flashcards"
  | "mcQuiz"
  | "paragraphSimplify"
  | "videoSearch"
  | "highlightElaboration"
  | "welcomeMessage"
  | "languageDetection"
  | "quizCheck"
  | "titleDetection"
  | "fileDetection";

const TASK_MODEL_MAP: Record<ModelTask, string> = {
  courseSummary: DEFAULT_QUALITY_MODEL,
  courseFromText: DEFAULT_QUALITY_MODEL,
  topicSuggestion: DEFAULT_QUALITY_MODEL,
  nodePlan: DEFAULT_QUALITY_MODEL,
  topicExtraction: DEFAULT_QUALITY_MODEL,
  nodeLesson: DEFAULT_QUALITY_MODEL,
  nodeLessonStream: DEFAULT_QUALITY_MODEL,
  examSnipeAnalysis: DEFAULT_QUALITY_MODEL,
  examSnipeAnalysisStream: DEFAULT_QUALITY_MODEL,
  examSnipePlan: DEFAULT_QUALITY_MODEL,
  examSnipeLesson: DEFAULT_QUALITY_MODEL,
  chatAssistant: DEFAULT_QUALITY_MODEL,
  surgeQuiz: DEFAULT_QUALITY_MODEL,
  flashcards: DEFAULT_QUALITY_MODEL,
  mcQuiz: DEFAULT_QUALITY_MODEL,
  paragraphSimplify: DEFAULT_QUALITY_MODEL,
  videoSearch: DEFAULT_QUALITY_MODEL,
  highlightElaboration: DEFAULT_QUALITY_MODEL,
  welcomeMessage: "gpt-5-nano",
  languageDetection: DEFAULT_UTILITY_MODEL,
  quizCheck: DEFAULT_UTILITY_MODEL,
  titleDetection: DEFAULT_UTILITY_MODEL,
  fileDetection: DEFAULT_UTILITY_MODEL,
};

function toEnvKey(task: ModelTask): string {
  return task.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
}

export function modelForTask(task: ModelTask): string {
  const env = process.env[`OPENAI_MODEL_${toEnvKey(task)}`];
  if (env && env.trim()) {
    return env.trim();
  }
  return TASK_MODEL_MAP[task];
}
