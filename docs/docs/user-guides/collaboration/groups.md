---
sidebar_position: 1
---

# Groups

Groups let you organize users into teams that share access to projects and resources.

## What Are Groups

A user group is a named collection of users. Groups serve two purposes:

1. **Project ownership**: a group can own projects, giving all group members access to those projects.
2. **Resource sharing**: resources can be shared with an entire group rather than individual users.

Each group has a unique slug (URL-friendly identifier), a display name, and an optional description.

## Viewing Your Groups

Navigate to the Groups page to see all groups you belong to. Each entry shows:

- Group name and description
- Your role in the group (owner, admin, or member)
- Total member count

## Creating a Group

To create a group:

1. Click "Create Group"
2. Enter a **name** for the group
3. Enter a **slug** (lowercase letters, numbers, and hyphens only; e.g., `research-team`)
4. Optionally add a **description**
5. Click "Create"

You automatically become the group_owner of any group you create. The slug must be unique across all groups in the system.

## Group Roles

| Role | Can view group | Can update group | Can manage members | Can delete group |
|------|:-:|:-:|:-:|:-:|
| group_owner | Yes | Yes | Yes | Yes |
| group_admin | Yes | Yes | Yes | No |
| group_member | Yes | No | No | No |

### Role Details

- **group_owner**: full control over the group, including deletion. Each group must have at least one owner. Owners cannot be demoted by admins.
- **group_admin**: can update the group name and description, add new members, change member roles (except owners), and remove members.
- **group_member**: can view the group details and member list. Cannot modify the group or its membership.

## Managing Members

### Adding a Member

Requires group_admin or group_owner role.

1. Open the group details page
2. Click "Add Member"
3. Select a user
4. Choose a role: group_admin or group_member
5. Click "Add"

The group_owner role cannot be assigned when adding members. Only the initial group creator receives this role automatically.

### Changing a Member's Role

Requires group_admin or group_owner role.

1. Open the group details page
2. Find the member in the list
3. Select a new role: group_admin or group_member

The role of a group_owner cannot be changed. If you need to transfer ownership, add another user as group_owner through the admin panel first.

### Removing a Member

Requires group_admin or group_owner role (unless a member is removing themselves).

1. Open the group details page
2. Find the member in the list
3. Click the remove button

Restrictions:
- The last group_owner cannot be removed. Transfer ownership first.
- Members can remove themselves from a group without admin privileges.

## Group-Owned Projects

Groups can own projects. When a group_admin or group_owner creates a project and selects the group as the owner, the project becomes group-owned. All group members can then be added as project members.

To create a group-owned project:

1. Navigate to the Projects page
2. Click "Create Project"
3. Select the group as the owner (only groups where you are an admin or owner appear)
4. Complete the project details

See [Projects](./projects.md) for full details on project management.

## Deleting a Group

Only the group_owner or a system administrator can delete a group. Deleting a group cascade-deletes all group memberships. Projects owned by the group are not deleted but lose their group association.

## Next Steps

- Learn about [projects](./projects.md) and how groups own them
- Explore [resource sharing](./sharing.md) with groups
- See the [Groups API reference](../../api-reference/groups.md) for programmatic access
