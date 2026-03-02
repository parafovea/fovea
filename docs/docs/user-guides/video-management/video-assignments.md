---
sidebar_position: 4
---

# Video Assignments

Assign videos to projects manually or through automated rules based on video metadata.

## Manual Video Assignment

Project owners and managers can assign individual videos to a project:

1. Open the project details page
2. Navigate to the "Videos" tab
3. Click "Assign Video"
4. Select a video from the library
5. Optionally select a user to assign the video to (for task distribution)
6. Confirm

Each video can be assigned to a project at most once (the project-video pair is unique). Assignments track who created them and when.

### Unassigning Videos

To remove a video from a project:

1. Open the project videos list
2. Find the assignment
3. Click "Remove"

Unassigning a video does not delete the video or any annotations; it only removes the project association.

## Bulk Assignment

System administrators can assign multiple videos to a project in a single operation:

1. Open the Admin Panel
2. Navigate to Video Assignments
3. Select a project
4. Select multiple videos
5. Optionally select a user for task assignment
6. Click "Bulk Assign"

Videos that are already assigned to the project are skipped. The response reports how many new assignments were created.

## Assignment Rules

Assignment rules automate video-to-project assignment based on video metadata. When evaluated, each rule checks every video's metadata against a set of conditions and creates assignments for matching videos.

### Creating a Rule

System administrators can create assignment rules:

1. Open the Admin Panel
2. Navigate to Video Assignment Rules
3. Click "Create Rule"
4. Enter a **name** and optional **description**
5. Define one or more **conditions** (all conditions must match for a video to qualify)
6. Select a **target type** (project, user, or group) and **target ID**
7. Save

### Rule Conditions

Each condition specifies a field from the video's metadata JSON, an operator, and a value. All conditions must match for a video to qualify (AND logic).

| Operator | Description | Example |
|----------|-------------|---------|
| equals | Exact string match | `sourcePlatform equals "youtube"` |
| contains | Substring match | `filename contains "interview"` |
| startsWith | Prefix match | `filename startsWith "2025-"` |
| endsWith | Suffix match | `filename endsWith ".mp4"` |
| regex | Regular expression match | `filename regex "^game-\\d{4}"` |

Conditions are evaluated against the video's `metadata` JSON field. Each condition's `field` refers to a key in that JSON object. The field value is converted to a string before comparison.

### Rule Evaluation

Rules can be evaluated in two ways:

**Dry run (single rule)**: evaluates one rule against all videos and returns the count and IDs of matching videos without creating any assignments. Use this to preview what a rule would do before running it.

**Evaluate all**: evaluates all active rules against all videos. For each match where the rule targets a project, creates a ProjectVideoAssignment if one does not already exist. Skips duplicates. Returns the total count of rules evaluated and assignments created.

### Rule Target Types

| Target Type | Behavior |
|-------------|----------|
| project | Creates ProjectVideoAssignment records linking matching videos to the target project |
| user | Reserved for future use |
| group | Reserved for future use |

### Managing Rules

- **Update**: change the name, description, conditions, target, or active status of a rule.
- **Activate/Deactivate**: set `isActive` to true or false. Inactive rules are skipped during "evaluate all" runs.
- **Delete**: permanently remove a rule.

## Video Visibility

Within a project, all members can see the list of assigned videos. The project membership role determines what actions a member can perform on those videos (e.g., annotators can create annotations, viewers can only watch).

## Next Steps

- Learn about [projects](../collaboration/projects.md) for organizing work
- See the [Video Assignments API reference](../../api-reference/video-assignments.md) for programmatic access
