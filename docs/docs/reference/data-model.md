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
```

Relations: `personas`, `apiKeys`, `sessions`, `worldState` (1:1),
`annotations`.

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
```

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
id                  String  @id
userId              String  @unique  -> User
entities            Json
events              Json
times               Json
entityCollections   Json
eventCollections    Json
timeCollections     Json
relations           Json
```

`worldLocations` is also part of this document (in the JSON
payload, not as a separate column).

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
```

## Annotation

```text
id          String   @id
videoId     String   -> Video
personaId   String?  -> Persona (NULL for object annotations)
userId      String?  -> User    (set on object annotations and on imports)
type        String   "type" | "object"
label       String   typeId or world-object id
linkType    String?  "entity" | "event" | "time" | "location" | NULL
frames      Json     ordered keyframe array
confidence  Float?
source      String   "manual" | "tracking" | "detection"
```

`linkType` was added by migration
`20260429000000_add_annotation_link_type` (v0.1.8).

## ImportHistory

```text
id              String   @id
filename        String
importedBy      String?  -> User (set in v0.1.8)
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
```

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

## Migrations

Migrations live in `server/prisma/migrations/`. Notable recent
ones:

```text
20260128095411_add_modality_metadata_to_claims
20260128153121_change_modality_metadata_to_arrays
20260130011500_add_comment_fields
20260310000000_add_annotation_userid
20260429000000_add_annotation_link_type    (v0.1.8)
```

Migrations are stable. Never rewrite a landed migration; add a
new one. See [Project > Stability](../project/stability.md).
