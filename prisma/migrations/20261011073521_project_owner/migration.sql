-- Projects are private to the manager who created them.
-- Add the column nullable, backfill existing projects to the earliest
-- manager, then make it required.
ALTER TABLE "Project" ADD COLUMN "createdById" INTEGER;

UPDATE "Project"
SET "createdById" = (
  SELECT "id" FROM "Employee" WHERE "role" = 'MANAGER' ORDER BY "id" LIMIT 1
)
WHERE "createdById" IS NULL;

ALTER TABLE "Project" ALTER COLUMN "createdById" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Project_createdById_idx" ON "Project"("createdById");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
