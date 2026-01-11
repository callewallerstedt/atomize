-- AlterTable
ALTER TABLE "PromoCode" ADD COLUMN "validityDays" INTEGER;

-- AlterTable
ALTER TABLE "SubjectData" ADD COLUMN "sharedByUsername" TEXT;

-- CreateTable
CREATE TABLE "CoSolveHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageData" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoSolveHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SharedCourse" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseSlug" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "courseData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoSolveHistory_userId_createdAt_idx" ON "CoSolveHistory"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Feedback_createdAt_idx" ON "Feedback"("createdAt");

-- CreateIndex
CREATE INDEX "Feedback_userId_createdAt_idx" ON "Feedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SharedCourse_shareId_idx" ON "SharedCourse"("shareId");

-- CreateIndex
CREATE UNIQUE INDEX "SharedCourse_shareId_key" ON "SharedCourse"("shareId");

-- CreateIndex
CREATE INDEX "SharedCourse_userId_createdAt_idx" ON "SharedCourse"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CoSolveHistory" ADD CONSTRAINT "CoSolveHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCourse" ADD CONSTRAINT "SharedCourse_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
