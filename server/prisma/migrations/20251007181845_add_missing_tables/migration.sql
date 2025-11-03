-- CreateTable
CREATE TABLE "world_state" (
    "id" TEXT NOT NULL,
    "entities" JSONB NOT NULL DEFAULT '[]',
    "events" JSONB NOT NULL DEFAULT '[]',
    "times" JSONB NOT NULL DEFAULT '[]',
    "entityCollections" JSONB NOT NULL DEFAULT '[]',
    "eventCollections" JSONB NOT NULL DEFAULT '[]',
    "timeCollections" JSONB NOT NULL DEFAULT '[]',
    "relations" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "world_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_history" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "importedBy" TEXT,
    "importOptions" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "success" BOOLEAN NOT NULL,
    "itemsImported" INTEGER NOT NULL,
    "itemsSkipped" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_history_pkey" PRIMARY KEY ("id")
);
