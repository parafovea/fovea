# Keyboard shortcuts

The frontend's command registry
(`annotation-tool/src/lib/commands/commands.ts`) declares every
shortcut. `mod` is `Cmd` on macOS and `Ctrl` elsewhere. Press `?`
in any view to open the shortcuts dialog with the live list.

## Global

```text
mod+1            Go to Video Browser
mod+2            Go to Ontology Builder
mod+3            Go to Object Builder
o                Toggle Ontology Builder
w                Toggle World Builder
v                Return to last active video
mod+s            Save current work
mod+e            Export data
mod+shift+p      Open command palette
?                Open keyboard shortcuts dialog
escape           Close current dialog
```

## Video playback (annotation workspace)

```text
space            Play / pause
right            Next frame
left             Previous frame
shift+right      Jump 10 frames forward
shift+left       Jump 10 frames backward
mod+right        Jump to next keyframe
mod+left         Jump to previous keyframe
home             Jump to frame 0
end              Jump to last frame
f                Toggle fullscreen
t                Toggle timeline
```

## Annotation editing (annotation workspace)

```text
n                Start drawing a new annotation
escape           Cancel drawing in progress
enter            Confirm drawing in progress
k                Add keyframe at current frame
c                Copy bounding box from previous keyframe
v                Toggle annotation visibility at current frame
delete           Delete keyframe at current frame
                 (when keyframe selected; otherwise deletes the annotation)
tab              Select next annotation
shift+tab        Select previous annotation
plus / equals    Zoom timeline in
minus            Zoom timeline out
```

## Ontology workspace

```text
n                Create new type (context-aware)
enter            Edit selected type
delete           Delete selected type
mod+d            Duplicate selected type
/                Focus search field
mod+shift+s      Generate type suggestions with AI
```
