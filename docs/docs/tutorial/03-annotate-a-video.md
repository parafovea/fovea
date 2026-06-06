# Annotate a video

An annotation in Fovea is a sequence of keyframe bounding boxes
plus a label. The label resolves either to a typeId from the
persona's ontology (a "type" annotation, e.g. `player`) or to a
world-state object id (an "object" annotation, e.g. a specific
`worldEntity` representing a named player). Frames between
keyframes are interpolated linearly at render time.

This chapter draws the first annotation against the persona created
in the previous chapter.

## Add a video

Drop an `.mp4` into the `videos/` directory mounted by the
backend, then trigger the sync:

```bash
cp ~/match.mp4 ./videos/match.mp4
curl -s -X POST http://localhost:3001/api/videos/sync \
  --cookie cookies.txt
# {"added":1,"updated":0,"deleted":0,"errors":0,"total":1}
```

The video is now listed at `GET /api/videos`. Save its
`id` as `VIDEO_ID`. The frontend's video browser refreshes on
its own.

## Draw a type annotation

Open the video in the annotation workspace
(`/annotate/<videoId>`). The keyboard model
is documented in [Reference > Keyboard shortcuts](../reference/keyboard-shortcuts.md);
the relevant ones for this chapter:

```text
n          start drawing a new annotation
space      play / pause
right      next frame
k          add a keyframe at the current frame
enter      confirm the annotation in progress
```

To annotate a player across frames 0-60: press `n`, draw a box
around the player at frame 0, advance to frame 60, draw the box
again, press `enter`. The frame range in between gets interpolated.

The equivalent API call:

```bash
curl -s -X POST http://localhost:3001/api/annotations \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d "{
    \"videoId\": \"$VIDEO_ID\",
    \"personaId\": \"$PERSONA_ID\",
    \"type\": \"type\",
    \"label\": \"player\",
    \"frames\": {
      \"boxes\": [
        {\"frameNumber\":0,  \"x\":120, \"y\":80, \"width\":60, \"height\":140, \"isKeyframe\":true},
        {\"frameNumber\":60, \"x\":150, \"y\":85, \"width\":60, \"height\":140, \"isKeyframe\":true}
      ],
      \"interpolationSegments\": [],
      \"visibilityRanges\": [],
      \"totalFrames\": 61, \"keyframeCount\": 2, \"interpolatedFrameCount\": 59
    }
  }"
```

The response carries the assigned `id` and a server-rendered
`linkType` of `null` (this is a type annotation, not an object
annotation, so no `linkType` applies).

## Draw an object annotation

An object annotation is a bounding-box sequence whose label is the
id of a world entity, event, time, or location. The persona's
world state holds those objects. To attach a box to the named
player "Player 9" (a `worldEntity` of type `player`):

1. Create the world entity through the world editor or
   `PUT /api/world`.
2. Draw the bounding-box sequence as in the previous section, but
   set `type` to `object`, `label` to the entity id, and
   `linkType` to `entity`.

```bash
curl -s -X POST http://localhost:3001/api/annotations \
  -H 'Content-Type: application/json' \
  --cookie cookies.txt \
  -d "{
    \"videoId\": \"$VIDEO_ID\",
    \"type\": \"object\",
    \"label\": \"$PLAYER_9_ENTITY_ID\",
    \"linkType\": \"entity\",
    \"frames\": {
      \"boxes\": [
        {\"frameNumber\":0,  \"x\":120, \"y\":80, \"width\":60, \"height\":140, \"isKeyframe\":true},
        {\"frameNumber\":60, \"x\":150, \"y\":85, \"width\":60, \"height\":140, \"isKeyframe\":true}
      ],
      \"interpolationSegments\": [],
      \"visibilityRanges\": [],
      \"totalFrames\": 61, \"keyframeCount\": 2, \"interpolatedFrameCount\": 59
    }
  }"
```

Object annotations linked to events, times, or locations use
`linkType` values `event`, `time`, `location` respectively, so
these annotations round-trip through export and import without
flattening to entity-linked. See
[Guide > Annotations](../guide/annotations.md) for the full state
machine.

## Next

Continue to [Summary and claims](04-summary-and-claims.md) to
generate a VLM summary against the persona and pull claims out of
it.
