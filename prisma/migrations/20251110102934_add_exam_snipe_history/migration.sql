-- CreateTable
CREATE TABLE "ExamSnipeHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "fileNames" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSnipeHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExamSnipeHistory_userId_createdAt_idx" ON "ExamSnipeHistory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSnipeHistory_userId_slug_key" ON "ExamSnipeHistory"("userId", "slug");

-- AddForeignKey
ALTER TABLE "ExamSnipeHistory" ADD CONSTRAINT "ExamSnipeHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
