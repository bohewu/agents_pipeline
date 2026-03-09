# Workspace Invite Flow

## Summary

Workspace admins can invite one teammate by email from the members page. The members page should show pending invites immediately, and duplicate pending invites should be blocked with clear feedback.

## Scope

### In Scope

- Send a single invite from the members page
- Show pending invites in the members list
- Block duplicate pending invites for the same email

### Out Of Scope

- Bulk invites
- Editing teammate roles after acceptance
- Changes to the invite acceptance experience

## User Stories

### `story-invite-admin`

As a workspace admin, I want to invite a teammate by email so that they can join the workspace without manual account setup.

Notes:

- The first release supports one email address per action.

## Scenarios

### `sc-send-invite` - Admin sends a new invite

Given:

- The user is a workspace admin.
- The members page is open.
- The target email does not already have a pending invite.

When:

- The admin enters a valid email address.
- The admin submits the invite form.

Then:

- A pending invite is created for that email address.
- The system queues an invite email.
- The members page shows the invite with a pending status.

Linked acceptance criteria:

- `ac-invite-created`
- `ac-pending-visible`

### `sc-block-duplicate-invite` - Admin tries to send a duplicate pending invite

Given:

- The user is a workspace admin.
- A pending invite already exists for the target email address.

When:

- The admin submits the same email address again.

Then:

- A second pending invite is not created.
- The UI explains that an invite is already pending.

Linked acceptance criteria:

- `ac-no-duplicate-pending`

## Acceptance Criteria

- `ac-invite-created`: Submitting a valid new email from the members page creates exactly one pending invite and queues exactly one invite email.
- `ac-pending-visible`: After a successful invite, the members page shows the invited email with a pending status without requiring a page reload.
- `ac-no-duplicate-pending`: Submitting an email that already has a pending invite does not create another invite and returns actionable feedback.

## Test Plan

- `tc-invite-service-creates-pending` (`unit`): Invite service creates one pending invite record and rejects duplicate pending invites.
- `tc-members-page-shows-pending` (`integration`): Members page updates to show the pending invite after a successful submission.
- `tc-admin-sends-invite` (`e2e`): Admin submits a new teammate invite from the members page and sees the pending state.

## Open Questions

- Should expired pending invites be surfaced differently from newly created pending invites?

## Next Steps

1. Implement the approved behavior with task traceability back to the listed ids.
2. Run `/run-pipeline` with `problem-spec.json` and `dev-spec.json` as approved inputs.
