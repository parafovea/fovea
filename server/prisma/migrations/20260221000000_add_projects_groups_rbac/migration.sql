-- DropIndex
DROP INDEX "public"."world_state_userId_key";

-- AlterTable
ALTER TABLE "annotations" ADD COLUMN     "createdByUserId" TEXT,
ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "claims" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "systemRole" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "video_summaries" ADD COLUMN     "projectId" TEXT;

-- AlterTable
ALTER TABLE "world_state" ADD COLUMN     "projectId" TEXT;

-- CreateTable
CREATE TABLE "user_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerGroupId" TEXT,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_video_assignments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "videoId" TEXT NOT NULL,
    "assignedUserId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "ruleDefinition" JSONB,
    "assignedBy" TEXT,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_video_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_assignment_rules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "conditions" JSONB NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "video_assignment_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resource_shares" (
    "id" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "sharedByUserId" TEXT NOT NULL,
    "sharedWithUserId" TEXT,
    "sharedWithGroupId" TEXT,
    "permissionLevel" TEXT NOT NULL DEFAULT 'read_only',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resource_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ownOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_groups_slug_key" ON "user_groups"("slug");

-- CreateIndex
CREATE INDEX "group_memberships_userId_idx" ON "group_memberships"("userId");

-- CreateIndex
CREATE INDEX "group_memberships_groupId_idx" ON "group_memberships"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "group_memberships_userId_groupId_key" ON "group_memberships"("userId", "groupId");

-- CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- CreateIndex
CREATE INDEX "project_memberships_userId_idx" ON "project_memberships"("userId");

-- CreateIndex
CREATE INDEX "project_memberships_projectId_idx" ON "project_memberships"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "project_memberships_userId_projectId_key" ON "project_memberships"("userId", "projectId");

-- CreateIndex
CREATE INDEX "project_video_assignments_projectId_idx" ON "project_video_assignments"("projectId");

-- CreateIndex
CREATE INDEX "project_video_assignments_videoId_idx" ON "project_video_assignments"("videoId");

-- CreateIndex
CREATE INDEX "project_video_assignments_assignedUserId_idx" ON "project_video_assignments"("assignedUserId");

-- CreateIndex
CREATE UNIQUE INDEX "project_video_assignments_projectId_videoId_key" ON "project_video_assignments"("projectId", "videoId");

-- CreateIndex
CREATE INDEX "resource_shares_sharedByUserId_idx" ON "resource_shares"("sharedByUserId");

-- CreateIndex
CREATE INDEX "resource_shares_sharedWithUserId_idx" ON "resource_shares"("sharedWithUserId");

-- CreateIndex
CREATE INDEX "resource_shares_sharedWithGroupId_idx" ON "resource_shares"("sharedWithGroupId");

-- CreateIndex
CREATE INDEX "resource_shares_resourceType_resourceId_idx" ON "resource_shares"("resourceType", "resourceId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_scope_role_resourceType_action_key" ON "role_permissions"("scope", "role", "resourceType", "action");

-- CreateIndex
CREATE INDEX "annotations_projectId_idx" ON "annotations"("projectId");

-- CreateIndex
CREATE INDEX "annotations_createdByUserId_idx" ON "annotations"("createdByUserId");

-- CreateIndex
CREATE INDEX "claims_projectId_idx" ON "claims"("projectId");

-- CreateIndex
CREATE INDEX "personas_projectId_idx" ON "personas"("projectId");

-- CreateIndex
CREATE INDEX "video_summaries_projectId_idx" ON "video_summaries"("projectId");

-- CreateIndex
CREATE INDEX "world_state_projectId_idx" ON "world_state"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "world_state_userId_projectId_key" ON "world_state"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "personas" ADD CONSTRAINT "personas_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "world_state" ADD CONSTRAINT "world_state_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_summaries" ADD CONSTRAINT "video_summaries_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annotations" ADD CONSTRAINT "annotations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerGroupId_fkey" FOREIGN KEY ("ownerGroupId") REFERENCES "user_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_video_assignments" ADD CONSTRAINT "project_video_assignments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_video_assignments" ADD CONSTRAINT "project_video_assignments_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "videos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_video_assignments" ADD CONSTRAINT "project_video_assignments_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_sharedWithUserId_fkey" FOREIGN KEY ("sharedWithUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resource_shares" ADD CONSTRAINT "resource_shares_sharedWithGroupId_fkey" FOREIGN KEY ("sharedWithGroupId") REFERENCES "user_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
