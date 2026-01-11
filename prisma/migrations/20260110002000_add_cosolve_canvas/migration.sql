-- CreateTable
CREATE TABLE "CoSolveCanvas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "strokes" JSONB NOT NULL,
    "textElements" JSONB NOT NULL,
    "canvasBg" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoSolveCanvas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoSolveCanvas_userId_updatedAt_idx" ON "CoSolveCanvas"("userId", "updatedAt");

-- AddForeignKey
ALTER TABLE "CoSolveCanvas" ADD CONSTRAINT "CoSolveCanvas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
