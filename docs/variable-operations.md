# Variable Set operator operations

The Operator Grid saves changed cells, flags and entries independently. Editing a
name cannot replace someone else's score, lineup or roster additions. Color
pickers stay mounted while saving. Search, filters and saved views survive reloads.

## Live workflows

1. Open a Variable Set's **Operator Grid**. Edit a cell or use a counter's **+1**
   and **-1** buttons. Only that value is sent.
2. Linked multi-selection is an ordered lineup: new selections append, removing
   an entry preserves the others' order, and **Up** / **Down** explicitly reorder
   the selection. Search the selection menu to find entries. Buttons work with
   keyboard Tab and Enter/Space; the moved item's controls retain focus.
3. If another operator changed the same cell, saving stops with its current
   value in the error. Pending local edits remain in the page; the status is
   **Unsaved**, never **Saved**. Activate the status to explicitly retry against
   the latest saved data. Confirming retries replaces your changed cells, not
   unrelated remote cells. Reloading discards local pending edits.
4. Before deleting a set or entry, remove the references listed by the deletion
   check. For example, remove the entry from a schedule's lineup, tracker or
   display's saved items/row order, or change the overlay/preset source binding.
   The server repeats this check even when a client skips the UI.
5. OBS browser sources and Companion continue using existing slot assignments
   and generated variables; operator edits update them through the normal live
   variable event. Companion can use the targeted entry actions or GET URLs below.

## Targeted entry API

Base URL: `/api/variables/sets/:setId/entry`.
Successful operations return HTTP 200 with the complete updated set directly:

```json
{
  "id": "show", "name": "Show", "slotsCount": 0,
  "fields": [{"key":"score","label":"Score","type":"counter"}],
  "roster": [{"id":"alex","label":"Alex","enabled":true,"inGroup":true,"values":{"score":"4"}}],
  "slots": [], "slotNames": [], "slotQueues": [], "activeEntry": "",
  "rotation": {}, "group": {}, "updatedAt": 1794850000000
}
```

`rotation` and `group` contain the same full configuration objects returned by
`GET /api/variables/sets/:setId`; no existing set properties are removed.
Values use the set's existing normalization (numbers remain strings, toggles
`"true"` / `"false"`, `ref_list` values arrays, trackers objects).

All operations support **POST**, **PATCH** and Companion-friendly **GET**.
POST/PATCH take JSON bodies (`Content-Type: application/json`). GET takes the same
properties as URL-encoded query parameters. For GET, `expected` must be JSON:
`expected=%224%22` means the string `"4"`, while `expected=true` means a boolean.
Array/object `value` query parameters must also be JSON. Omit `expected` for an
intentional unconditional targeted operation; the Operator always sends it.

| Path | Parameters / JSON properties | Effect |
| --- | --- | --- |
| `/set` | `entry`, `field`, `value`, optional `expected` | Replace one field; compare only that field when `expected` is supplied. |
| `/set` | `entry`, `property`, `value`, optional `expected` | Replace `label`, `enabled` or `inGroup`; flags accept booleans or `"true"` / `"false"`. Use `property` instead of `field`. |
| `/step` | `entry`, `field`, optional finite `delta` (default `1`), optional `expected` | Atomically add to a counter/number field. Without `expected`, simultaneous steps accumulate against the latest value. |
| `/add` | `entry: {id,label?,enabled?,inGroup?,values?,tiers?}` | Add one entry without replacing the roster. A duplicate normalized ID returns a conflict. For GET, use `entry=entry_id&label=New%20entry`; values/flags/tiers can then be edited with targeted operations. Maximum 60 entries. |
| `/remove` | `entry`, optional `expected` (complete entry object) | Delete one unreferenced entry. Also supports **DELETE**, with query parameters (no DELETE body). |
| `/update` | `entry`, `patch: {label?,enabled?,inGroup?,values?,tiers?}`, optional `expected` (complete entry object) | Atomically save an entry edit dialog; merges values and never replaces other roster entries. For GET, JSON-encode `patch`. |

IDs, field names and values are subject to existing Variable Set normalization
and limits. Changing the first field also refreshes the entry's readable label.
Unknown sets, entries, fields/properties, missing values and non-finite numeric
steps return HTTP 400 with `{"error":"..."}`. Unsupported methods return HTTP 405.

Examples:

```sh
curl -X PATCH http://localhost:3000/api/variables/sets/show/entry/set \
  -H 'Content-Type: application/json' \
  -d '{"entry":"alex","field":"score","value":"4","expected":"3"}'

curl 'http://localhost:3000/api/variables/sets/show/entry/step?entry=alex&field=score&delta=1'

curl -X POST http://localhost:3000/api/variables/sets/show/entry/set \
  -H 'Content-Type: application/json' \
  -d '{"entry":"opening","field":"lineup","value":["sam","alex"],"expected":["alex","sam"]}'
```

A stale expected value returns HTTP 409 without applying the operation:

```json
{"error":"This value changed elsewhere (current: \"5\"). Review and retry.","code":"conflict","current":"5"}
```

`current` is the current cell/property or whole entry being compared. Duplicate
entry IDs return `code: "conflict"` without `current`.

## Dependency-aware deletion

**GET** `/api/variables/sets/:setId/dependencies` checks a whole set.
Add `?entry=alex` to check one entry. Response:

```json
{"dependencies":[{"kind":"entry","id":"schedule/opening","label":"Set \"Schedule\" / \"Opening\" — Guests"}]}
```

An empty array permits deletion. The list identifies structured linked fields,
linked selections, trackers, display catalogs/items/table rows/linked columns,
saved overlay/preset display bindings and known saved `{{var.…}}` uses.
Literal text matching an ID is not a dependency. References contained entirely
inside a deleted set do not block deleting that set. Dynamic slot/group
placeholders do not pin any one entry.

Existing **DELETE** `/api/variables/sets/:setId`, targeted `/entry/remove`,
whole-roster saves, CSV replacement and bundle imports enforce referenced-entry
protection. Bundle imports evaluate references after all imported sets are
applied, so coordinated imports that remove both a link and its old target work.
Normal set edits and restores/reloads remain supported.

Blocked deletions return HTTP 409:

```json
{"error":"Remove these references first: …","code":"dependencies","dependencies":[{"kind":"display","id":"guest_cards","label":"Display \"Guest cards\" — saved item / row"}]}
```

Dependency records always include `kind`, `id`, and an actionable `label`.
Add `?field=name` to check a schema field instead. Removing a field, changing its
type, or retargeting a linked field is rejected with the same dependency error
when a display column/image/label, source path, tracker/linked selection,
recognized placeholder or template depends on it. Cosmetic field label/icon
changes and unrelated field additions remain ordinary saves.
Display deletion uses the same shared dependency inspection through
`GET /api/variable-displays/:id/dependencies`.
