---
sidebar_position: 2
---

# Projects

Projects organize videos, annotations, personas, summaries, claims, and world state around a shared analytical goal.

## What Are Projects

A project is the primary unit of collaboration in FOVEA. Each project contains:

- A set of assigned videos
- Project-scoped personas and ontologies
- Project-scoped world state (per user)
- Annotations, summaries, and claims created within the project
- A team of members with defined roles

Projects can be **personal** (owned by a single user) or **group-owned** (owned by a user group).

## Creating a Personal Project

1. Navigate to the Projects page
2. Click "Create Project"
3. Enter a **name** for the project
4. Enter a **slug** (lowercase letters, numbers, and hyphens only)
5. Optionally add a **description**
6. Leave the group owner field empty for a personal project
7. Click "Create"

You automatically become the project_owner.

## Creating a Group-Owned Project

1. Navigate to the Projects page
2. Click "Create Project"
3. Enter name, slug, and description
4. Select a **group** as the owner (only groups where you are a group_admin or group_owner appear)
5. Click "Create"

You become the project_owner. Other group members can be added as project members with appropriate roles.

## Switching Project Context

Use the project selector in the toolbar to switch between projects. The selected project determines which videos, personas, and world state are displayed. Selecting no project shows your personal (non-project-scoped) workspace.

## Project Roles

| Role | View resources | Create/edit own | Manage all resources | Manage members | Update project | Delete project |
|------|:-:|:-:|:-:|:-:|:-:|:-:|
| project_owner | Yes | Yes | Yes | Yes | Yes | Yes |
| project_manager | Yes | Yes | Yes | Yes | Yes | No |
| annotator | Yes | Yes | No | No | No | No |
| reviewer | Yes | No | No | No | No | No |
| viewer | Yes | No | No | No | No | No |

### Role Details

- **project_owner**: full control over the project. Can update settings, manage members, assign videos, and delete the project. The last project_owner cannot be removed.
- **project_manager**: same as project_owner except cannot delete the project. Intended for team leads who manage day-to-day operations.
- **annotator**: can create and edit their own annotations, summaries, and claims within the project. Can view all project resources.
- **reviewer**: read-only access to all project resources. Intended for quality review workflows.
- **viewer**: read-only access to all project resources. Intended for stakeholders who need visibility without edit capability.

## Managing Project Members

### Adding a Member

Requires project_owner or project_manager role.

1. Open the project details page
2. Click "Add Member"
3. Select a user
4. Choose a role: project_manager, annotator, reviewer, or viewer
5. Click "Add"

The project_owner role is assigned only during project creation.

### Changing a Member's Role

Requires project_owner or project_manager role.

1. Open the project details page
2. Find the member in the list
3. Select a new role

You cannot change your own role.

### Removing a Member

Requires project_owner or project_manager role (unless removing yourself).

1. Open the project details page
2. Find the member
3. Click "Remove"

The last project_owner cannot be removed.

## Project Settings

Project owners and managers can update project settings:

- **Name**: display name for the project
- **Description**: text describing the project's purpose
- **Settings**: JSON configuration for project-specific preferences
- **Archived**: mark a project as archived to indicate completed work

## Archiving Projects

To archive a project:

1. Open the project settings
2. Toggle the "Archived" flag
3. Save

Archived projects remain accessible but signal that active work has concluded. You can unarchive a project at any time.

## Deleting a Project

Only the project_owner or a system administrator can delete a project. Deletion cascade-deletes:

- All project memberships
- All video assignments for the project

Project-scoped personas, annotations, summaries, claims, and world states lose their project association (the projectId field is set to null) rather than being deleted.

## Project-Scoped Personas and World State

Each project has its own set of personas and per-user world states:

- **Personas**: when you create a persona within a project context, it is scoped to that project and visible to all project members.
- **World State**: each user has a separate world state per project. This allows different annotators to maintain their own entity, event, and relation instances within the same project.

Use the project personas endpoint (`GET /api/projects/:projectId/personas`) to list personas for a project, and the project world state endpoints to read or update your world state within a project.

## Next Steps

- Learn about [video assignments](../video-management/video-assignments.md) to add videos to projects
- Learn about [resource sharing](./sharing.md) between users and groups
- See the [Projects API reference](../../api-reference/projects.md) for programmatic access
