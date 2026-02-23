---
sidebar_position: 3
---

# Sharing Resources

Share annotations, summaries, claims, personas, and world states with other users or groups.

## Overview

FOVEA supports sharing individual resources between users and groups. Sharing does not move or copy a resource; it grants the recipient permission to view or fork the original. The original owner retains full control.

## Shareable Resource Types

| Resource Type | Description |
|---------------|-------------|
| annotation | Bounding box sequence annotations on videos |
| summary | Video summaries (AI-generated or manual) |
| claim | Extracted claims from summaries |
| persona | Analyst persona with ontology |
| world_state | World state containing entities, events, times, and relations |

## Sharing with Users vs Groups

You can share a resource with exactly one target per share operation:

- **Share with a user**: the specified user gains access to the resource.
- **Share with a group**: all current members of the group gain access to the resource.

To share with multiple users or groups, create separate shares for each.

## Permission Levels

Each share has a permission level that controls what the recipient can do:

### read_only

The recipient can view the resource but cannot modify it or create a copy. This is the default permission level.

### forkable

The recipient can view the resource and create an independent copy (fork) in their own workspace. The fork is a deep copy: changes to the fork do not affect the original, and changes to the original do not affect the fork.

## Creating a Share

To share a resource:

1. Navigate to the resource you want to share
2. Click the "Share" action
3. Select either a user or a group as the recipient
4. Choose a permission level (read_only or forkable)
5. Confirm

Requirements:
- You must own the resource, or you must have a forkable share on it (which grants permission to re-share).
- You cannot specify both a user and a group in the same share; create separate shares if needed.

## Forking Shared Resources

When you have a forkable share on a resource, you can create an independent copy:

1. View the list of resources shared with you
2. Find the resource you want to fork
3. Click "Fork"

The system creates a deep copy owned by you. For personas, the associated ontology is also copied. The fork has no ongoing connection to the original.

## Viewing Shares

### Resources Shared with You

Navigate to your received shares list to see all resources shared with you, either directly or through your group memberships. Expired shares are automatically excluded.

Each entry shows:
- Resource type and identifier
- Who shared it
- Permission level
- When it was shared

### Resources You Have Shared

Navigate to your sent shares list to see all resources you have shared with others. Each entry shows the recipient (user or group), permission level, and creation date.

## Revoking Shares

The original sharer or a system administrator can revoke any share:

1. View your sent shares
2. Find the share to revoke
3. Click "Revoke"

Revoking a share immediately removes the recipient's access. If the recipient previously forked the resource, the fork is not affected (it is an independent copy).

## Share Expiration

Shares can optionally have an expiration date. After expiration:

- The share no longer appears in the recipient's received shares list
- The recipient loses access to the resource
- The share record remains in the database until explicitly deleted

Expiration is set at share creation time via the API.

## Next Steps

- Learn about [groups](./groups.md) for team-based sharing
- Learn about [projects](./projects.md) for organizing collaborative work
- See the [Sharing API reference](../../api-reference/sharing.md) for programmatic access
