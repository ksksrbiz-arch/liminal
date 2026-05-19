# Security Spec

1. Data Invariants: SaveData must only be read and written by the authenticated user matching `userId`. Timestamps must be `request.time`. Arrays must be bounded (<= 100).
2. The Dirty Dozen Payloads:
- Unauthenticated user write
- Authenticated user writing to another userId
- Invalid ID format
- Missing `updatedAt` on create
- Spurious/ghost fields added (e.g., `isAdmin: true`)
- Updating unauthorized fields
- Invalid array type (not a list) for `notesFound`
- Array size exceeding 100
- Array containing non-string items (we should add checks if possible, or just limit to types if strictly needed in rules).
- Timestamps from future/past
3. (Tests to verify logic)
