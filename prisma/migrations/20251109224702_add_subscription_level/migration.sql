-- CreateEnum
CREATE TYPE "SubscriptionLevel" AS ENUM ('Free', 'Paid', 'Tester');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "subscriptionLevel" "SubscriptionLevel" NOT NULL DEFAULT 'Free';
