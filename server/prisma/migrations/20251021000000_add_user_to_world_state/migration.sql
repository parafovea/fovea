-- AlterTable
ALTER TABLE "world_state" ADD COLUMN "userId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "world_state_userId_key" ON "world_state"("userId");

-- AddForeignKey
ALTER TABLE "world_state" ADD CONSTRAINT "world_state_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
