# Data model

The full schema is `server/prisma/schema.prisma`. This page
summarizes the user-facing tables.

## User

```text
id            String  @id @default(uuid())
username      String  @unique
email         String? @unique
passwordHash  String?
displayName   String
isAdmin       Boolean @default(false)
systemRole    String  @default("user")    -- "system_admin" | "user"
```

Relations: `personas`, `apiKeys`, `sessions`, `worldStates`,
`annotations`, `groupMemberships`, `projectMemberships`,
`ownedProjects`, `videoAssignments`, `sharedByMe`, `sharedWithMe`.

`systemRole` is the source of truth for admin checks.
`isAdmin` is still populated for backward compatibility.

## Session

```text
id              String   @id
userId          String   -> User
token           String   @unique
expiresAt       DateTime
ipAddress       String?
userAgent       String?
lastActivityAt  DateTime
```

## LoginAttempt

```text
id         String   @id
username   String
ipAddress  String?
success    Boolean
failedAt   DateTime
```

Drives the brute-force lockout at the login route.

## ApiKey

```text
id            String  @id
userId        String?  -> User (NULL for admin shared-pool keys)
provider      String
keyName       String
encryptedKey  String
keyMask       String
isActive      Boolean
lastUsed      DateTime?
usageCount    Int
@@unique([userId, provider])
```

## Persona

```text
id                String   @id
userId            String   -> User
name              String
role              String
informationNeed   String
details           String?
isSystemGenerated Boolean  @default(false)
hidden            Boolean  @default(false)
projectId         String?  -> Project
```

`Persona.userId` is the ownership column for CASL.

## Ontology

```text
id              String  @id
personaId       String  @unique  -> Persona
entityTypes     Json
eventTypes      Json
roleTypes       Json
relationTypes   Json
```

## WorldState

```text
id                  String   @id
userId              String   -> User
projectId           String?  -> Project
entities            Json
events              Json
times               Json
entityCollections   Json
eventCollections    Json
timeCollections     Json
relations           Json
@@unique([userId, projectId])
```

`worldLocations` is also part of this document (in the JSON
payload, not as a separate column).

Each user has at most one personal world state (`projectId =
NULL`) and one world state per project they belong to. The
composite unique index above enforces that constraint.

## Video

```text
id                    String   @id
filename              String   @unique
path                  String
duration              Float?
frameRate             Float?
resolution            String?
metadata              Json?
localThumbnailPath    String?
sourcePlatform        String?
platformVideoId       String?
metadataSyncStatus    String?
lastMetadataSync      DateTime?
```

## VideoSummary

```text
id              String  @id
videoId         String  -> Video
personaId       String  -> Persona
summary         Json
visualAnalysis  String?
audioTranscript String?
keyFrames       Json?
confidence      Float?
transcriptJson  Json?
audioLanguage   String?
speakerCount    Int?
audioModelUsed  String?
visualModelUsed String?
fusionStrategy  String?
processingTimeAudio   Float?
processingTimeVisual  Float?
processingTimeFusion  Float?
processedAtAudio   DateTime?
processedAtVisual  DateTime?
processedAtFusion  DateTime?
claimsJson         Json?
claimsVersion      String?
claimsExtractedAt  DateTime?
comment            String?
createdBy          String?
projectId          String?  -> Project
```

`VideoSummary.createdBy` is the ownership column for CASL.

## Annotation

```text
id              String   @id
videoId         String   -> Video
personaId       String?  -> Persona (NULL for object annotations)
userId          String?  -> User    (legacy; kept for back-compat)
createdByUserId String?  -> User    (CASL ownership column)
projectId       String?  -> Project
type            String   "type" | "object"
label           String   typeId or world-object id
linkType        String?  "entity" | "event" | "time" | "location" | NULL
frames          Json     ordered keyframe array
confidence      Float?
source          String   "manual" | "tracking" | "detection"
```

`linkType` is provided by the migration
`20260505000000_add_annotation_link_type`.
`createdByUserId` is the CASL ownership column; the backfill
migration `20260415000000_backfill_rbac_ownership` populated it
from `userId` on existing rows.

## ImportHistory

```text
id              String   @id
filename        String
importedBy      String?  // user id by convention; no FK to User
importOptions   Json
result          Json
success         Boolean
itemsImported   Int
itemsSkipped    Int
```

## Claim

```text
id                  String  @id
summaryId           String  -> VideoSummary
summaryType         String  "video" | "collection"
text                Text
gloss               Json
parentClaimId       String?
textSpans           Json?
claimerType         String?
claimerGloss        Json?
claimRelation       Json?
claimEventId        String?
claimTimeId         String?
claimLocationId     String?
audio               Json?
video               Json?
metadata            Json?
confidence          Float?
modelUsed           String?
extractionStrategy  String?
comment             Text?
createdBy           String?
projectId           String?
```

`Claim.createdBy` is the ownership column for CASL.

## ClaimRelation

```text
id              String   @id
sourceClaimId   String   -> Claim
targetClaimId   String   -> Claim
relationTypeId  String
sourceSpans     Json?
targetSpans     Json?
confidence      Float?
notes           Text?
createdBy       String?
```

## UserGroup

```text
id           String   @id
name         String
description  String?
slug         String   @unique
createdBy    String
```

Relations: `members` (GroupMembership), `projects`,
`resourceShares`. `UserGroup.createdBy` is the ownership column
for CASL.

## GroupMembership

```text
id        String   @id
userId    String   -> User
groupId   String   -> UserGroup
role      String   "group_owner" | "group_admin" | "group_member"
joinedAt  DateTime
@@unique([userId, groupId])
```

## Project

```text
id            String   @id
name          String
description   String?
slug          String   @unique
ownerUserId   String?  -> User
ownerGroupId  String?  -> UserGroup
settings      Json     @default("{}")
isArchived    Boolean  @default(false)
createdBy     String
```

Relations: `members` (ProjectMembership), `videoAssignments`
(ProjectVideoAssignment), `personas`, `worldStates`,
`annotations`, `videoSummaries`, `claims`.
`Project.ownerUserId` is the ownership column for CASL.

## ProjectMembership

```text
id         String   @id
userId     String   -> User
projectId  String   -> Project
role       String   "project_owner" | "project_manager" | "annotator"
                  | "reviewer" | "viewer"
joinedAt   DateTime
@@unique([userId, projectId])
```

## ProjectVideoAssignment

```text
id              String   @id
projectId       String   -> Project
videoId         String   -> Video
assignedUserId  String?  -> User
source          String   @default("manual")    -- "manual" | "rule"
ruleDefinition  Json?
assignedBy      String?
assignedAt      DateTime
@@unique([projectId, videoId])
```

## VideoAssignmentRule

```text
id          String   @id
name        String
description String?
conditions  Json     -- [{field, operator, value}]
targetType  String   -- "user" | "project" | "group"
targetId    String
isActive    Boolean  @default(true)
createdBy   String
```

## ResourceShare

```text
id                 String   @id
resourceType       String   -- "annotation" | "summary" | "claim"
                            --   | "persona" | "world_state"
resourceId         String
sharedByUserId     String   -> User
sharedWithUserId   String?  -> User
sharedWithGroupId  String?  -> UserGroup
permissionLevel    String   @default("read_only")  -- | "forkable"
expiresAt          DateTime?
```

Exactly one of `sharedWithUserId` / `sharedWithGroupId` is set.

## RolePermission

```text
id            String   @id
scope         String   -- "system" | "group" | "project"
role          String
resourceType  String
action        String
ownOnly       Boolean  @default(false)
@@unique([scope, role, resourceType, action])
```

The CASL ability builder reads this table per request to compile
the user's `Ability`. See [Concepts > RBAC](../concepts/rbac.md)
and [Reference > RBAC permissions](rbac-permissions.md).

## Migrations

Migrations live in `server/prisma/migrations/`. Notable recent
ones:

```text
20260128095411_add_modality_metadata_to_claims
20260128153121_change_modality_metadata_to_arrays
20260130011500_add_comment_fields
20260221000000_add_projects_groups_rbac
20260310000000_add_annotation_userid
20260415000000_backfill_rbac_ownership
20260505000000_add_annotation_link_type
```

Migrations are stable. Never rewrite a landed migration; add a
new one. See [Project > Stability](../project/stability.md).
