export const MVP_FEATURES = {
  examSnipe: true,
  surge: true,
  practicePage: true,
  videoLookup: true,
  highlights: true,
  elaborate: true,
  onboarding: true,
  promo: true,
  shareCourses: false,
  quickLearn: false,
  labAssist: false,
  readAssist: false,
  coSolve: false,
  qrCapture: false,
  lessonTts: false,
  lessonExportPdf: false,
  lessonLars: false,
  lessonInlinePractice: false,
} as const;

export type MVPFeatureKey = keyof typeof MVP_FEATURES;

export function isFeatureEnabled(feature: MVPFeatureKey): boolean {
  return MVP_FEATURES[feature];
}
