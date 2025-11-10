import { SubscriptionLevel } from "@prisma/client";

export type SubscriptionLimits = {
  maxCourses: number;
  maxLessonsPerCourse: number;
  maxApiCallsPerMonth: number;
  canUseAdvancedFeatures: boolean;
  canExportPDF: boolean;
  canUseQuickLearn: boolean;
};

export const SUBSCRIPTION_LIMITS: Record<SubscriptionLevel, SubscriptionLimits> = {
  Free: {
    maxCourses: 3,
    maxLessonsPerCourse: 10,
    maxApiCallsPerMonth: 100,
    canUseAdvancedFeatures: false,
    canExportPDF: false,
    canUseQuickLearn: false,
  },
  Paid: {
    maxCourses: Infinity,
    maxLessonsPerCourse: Infinity,
    maxApiCallsPerMonth: Infinity,
    canUseAdvancedFeatures: true,
    canExportPDF: true,
    canUseQuickLearn: true,
  },
  Tester: {
    maxCourses: Infinity,
    maxLessonsPerCourse: Infinity,
    maxApiCallsPerMonth: Infinity,
    canUseAdvancedFeatures: true,
    canExportPDF: true,
    canUseQuickLearn: true,
  },
};

export function getSubscriptionLimits(level: SubscriptionLevel): SubscriptionLimits {
  return SUBSCRIPTION_LIMITS[level];
}

export function canCreateCourse(
  level: SubscriptionLevel,
  currentCourseCount: number
): { allowed: boolean; reason?: string } {
  const limits = getSubscriptionLimits(level);
  if (currentCourseCount >= limits.maxCourses) {
    return {
      allowed: false,
      reason: `Free plan limited to ${limits.maxCourses} courses. Upgrade to create unlimited courses.`,
    };
  }
  return { allowed: true };
}

export function canGenerateLesson(
  level: SubscriptionLevel,
  currentLessonCount: number
): { allowed: boolean; reason?: string } {
  const limits = getSubscriptionLimits(level);
  if (currentLessonCount >= limits.maxLessonsPerCourse) {
    return {
      allowed: false,
      reason: `Free plan limited to ${limits.maxLessonsPerCourse} lessons per course. Upgrade for unlimited lessons.`,
    };
  }
  return { allowed: true };
}

export function canUseFeature(
  level: SubscriptionLevel,
  feature: keyof Pick<SubscriptionLimits, "canUseAdvancedFeatures" | "canExportPDF" | "canUseQuickLearn">
): boolean {
  const limits = getSubscriptionLimits(level);
  return limits[feature];
}


