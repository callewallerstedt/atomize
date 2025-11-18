-- AlterTable
ALTER TABLE "ExamSnipeHistory" ADD COLUMN "subjectSlug" TEXT;

-- CreateIndex
CREATE INDEX "ExamSnipeHistory_userId_subjectSlug_idx" ON "ExamSnipeHistory"("userId", "subjectSlug");



