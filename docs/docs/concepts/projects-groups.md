---
title: Projects, Groups, and RBAC
sidebar_position: 6
keywords: [projects, groups, rbac, roles, permissions, casl, authorization, sharing, collaboration]
---

# Projects, Groups, and RBAC

FOVEA organizes work into projects and groups with role-based access control (RBAC). Users belong to groups, groups own projects, and each project scopes its own videos, annotations, personas, and world state. A data-driven permission system controls who can do what.

## Overview

Three scopes determine a user's permissions:

1. **System scope** -- the user's global role (system_admin or user)
2. **Group scope** -- the user's role within each group they belong to
3. **Project scope** -- the user's role within each project they are a member of

Permissions from all three scopes are combined (union) to produce the effective permission set for any given request.

## Projects

A project organizes videos, annotations, personas, summaries, claims, and world state around a shared goal. Every project has:

- A unique slug for URL-friendly identification
- An owner (either a user or a group)
- A set of members, each with a project role
- Optional settings stored as JSON
- An archived flag to mark completed work

Projects can be **personal** (owned by a single user) or **group-owned** (owned by a user group). When a user creates a project, they automatically become the project_owner.

### Project Roles

| Role | Permissions |
|------|-------------|
| project_owner | Full control: update, delete, manage members, assign videos, manage all resources |
| project_manager | Update project settings, manage members, assign videos, manage all resources |
| annotator | Create and edit own annotations, summaries, and claims |
| reviewer | Read all project resources, add review comments |
| viewer | Read-only access to all project resources |

## User Groups

A user group is a collection of users who share access to projects and resources. Groups have:

- A unique slug for identification
- A creator (the initial group_owner)
- Members with group-level roles

### Group Roles

| Role | Permissions |
|------|-------------|
| group_owner | Full control: update group, delete group, manage all members |
| group_admin | Update group details, add/remove members, change member roles |
| group_member | View group details and member list |

When a group owns a project, all group members gain access to that project according to their project membership roles.

## Role Hierarchy

The following diagram shows the role hierarchy from highest to lowest privilege:

```
system_admin
    |
    +-- (bypasses all permission checks)
    |
group_owner
    |
    +-- group_admin
    |       |
    +-- group_member
    |
project_owner
    |
    +-- project_manager
    |       |
    +-- annotator
    |       |
    +-- reviewer
    |       |
    +-- viewer
```

System admins bypass all permission checks entirely. All other users receive permissions based on the union of their system, group, and project roles.

## Permission Model

### CASL Authorization Engine

FOVEA uses the [CASL](https://casl.js.org/) library to evaluate permissions at runtime. The server builds a CASL ability instance for each authenticated request by:

1. Loading all rows from the RolePermission table
2. Collecting the user's roles across all scopes (system, group, project)
3. Matching role assignments against RolePermission rows to produce CASL rules
4. Adding ownership-based rules (users always have full access to resources they created)

### Data-Driven Permissions

The RolePermission table stores the permission matrix in the database rather than in application code. Each row specifies:

| Field | Description |
|-------|-------------|
| scope | "system", "group", or "project" |
| role | The role identifier (e.g., "annotator", "group_admin") |
| resourceType | The resource (e.g., "annotation", "video", "project") |
| action | The operation (e.g., "create", "read", "update", "delete") |
| ownOnly | When true, the permission applies only to resources the user created |

This design allows administrators to modify the permission matrix without code changes.

### Actions

| Action | Description |
|--------|-------------|
| create | Create a new resource |
| read | View a resource |
| update | Modify a resource |
| delete | Remove a resource |
| share | Share a resource with another user or group |
| export | Export data |
| assign | Assign videos to projects |
| manage_members | Add, remove, or change roles of members |
| fork | Create a copy of a shared resource |
| review | Add review feedback |
| manage | Full control (CASL built-in, matches all actions) |

### Resource Subjects

| Subject | Prisma Model |
|---------|-------------|
| Annotation | Annotation |
| Claim | Claim |
| Persona | Persona |
| WorldState | WorldState |
| Video | Video |
| VideoSummary | VideoSummary |
| Project | Project |
| UserGroup | UserGroup |
| User | User |

### Permission Resolution Example

Consider a user with:
- System role: `user`
- Group role: `group_admin` in group A
- Project role: `annotator` in project X

The CASL ability builder:
1. Finds all RolePermission rows matching `scope=system, role=user`
2. Finds all RolePermission rows matching `scope=group, role=group_admin` and applies them because the user holds group_admin in at least one group
3. Finds all RolePermission rows matching `scope=project, role=annotator` and scopes them to project X using a `projectId` condition
4. Adds ownership rules so the user can always read, update, and delete their own annotations, summaries, and claims

The final ability is the union of all matched rules.

## Resource Ownership

Regardless of role-based permissions, users always have read, update, and delete access to resources they created. The CASL builder adds these ownership rules automatically based on the `createdByUserId` or `createdBy` field on each resource.

## Video Access

All authenticated users can read video metadata. Access to video content within a project context is determined by project membership: only project members (or system admins) can view videos assigned to that project.

## Resource Sharing

Users can share resources (annotations, summaries, claims, personas, world states) with other users or groups. Each share has a permission level:

- **read_only**: the recipient can view the resource but not modify or copy it
- **forkable**: the recipient can view the resource and create an independent copy (fork) in their own workspace

Shares can optionally have an expiration date. Expired shares are excluded from listing queries. The original sharer (or a system admin) can revoke any share at any time.

When a resource is shared with a group, all members of that group gain the specified permission level on that resource.

### Forking

Forking creates a deep copy of the shared resource owned by the forking user. The copy is independent: changes to the fork do not affect the original, and vice versa. When forking a persona, the associated ontology is also copied.

## Project-Scoped Resources

Personas, world states, annotations, summaries, and claims can be scoped to a project via a `projectId` field. Project-scoped resources are visible to all project members according to their role permissions. Personal (non-project) resources remain private to the user who created them unless explicitly shared.

## Next Steps

- Learn how to [create and manage groups](../user-guides/collaboration/groups.md)
- Learn how to [create and manage projects](../user-guides/collaboration/projects.md)
- Learn how to [share resources](../user-guides/collaboration/sharing.md)
- Explore the [Groups API](../api-reference/groups.md) and [Projects API](../api-reference/projects.md)
