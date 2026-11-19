# remotestorage-module-flashcards

A [remoteStorage.js](https://remotestorage.io) data module for flashcards,
including spaced-repetition review state (FSRS card model).

Cards are stored at `/flashcards/<group>/<id>`. A group exists as long as it
contains at least one card.

## Install

```sh
bun add remotestorage-module-flashcards remotestoragejs
```

Requires remoteStorage.js 2.x.

## Usage

```ts
import RemoteStorage from "remotestoragejs";
import Flashcards, { type FlashcardsApi } from "remotestorage-module-flashcards";

const rs = new RemoteStorage({ modules: [Flashcards] });
rs.access.claim("flashcards", "rw");
rs.caching.enable("/flashcards/");

const flashcards = (rs as unknown as { flashcards: FlashcardsApi }).flashcards;

const card = await flashcards.store({ frontText: "pivo", backText: "beer", group: "food" });
await flashcards.store({ ...card, group: "drinks" }, { previousGroup: "food" }); // moves the card
```

## API

| Method | Description |
| --- | --- |
| `store(card, { previousGroup? })` | Create or update a card. Generates `@id` (UUID) and ISO timestamps. When `previousGroup` differs from `card.group`, the old copy is removed. Resolves with the stored card. |
| `get(group, id, maxAge?)` | One card, or `undefined`. |
| `remove(group, id)` | Delete one card. |
| `listGroups(maxAge?)` | Sorted group names. |
| `getAllByGroup(group, maxAge?)` | Cards in a group. |
| `getAll(maxAge?)` | Cards in all groups. |
| `removeGroup(group)` | Delete every card in a group. |
| `on("change", handler)` / `removeEventListener(...)` | remoteStorage.js change events for the scope. |

`maxAge` is passed through to remoteStorage.js; use `false` to read from the
local cache without waiting for a sync.

Also exported: `normalizeFlashcard`, `normalizeDate`, `normalizeGroup`, the
JSON schemas, and the `Flashcard` / `ReviewState` types.

## Data format

```jsonc
{
  "@id": "3f0c…",              // UUID (v1 used YYYYMMDD-HHMMSS)
  "@type": "flashcard",
  "frontText": "pivo",
  "backText": "beer",
  "hint": "magical drink",     // optional
  "group": "food",
  "createdAt": "2026-01-02T03:04:05.000Z",
  "updatedAt": "2026-01-02T03:04:05.000Z",
  "review": {                  // optional, absent until first review
    "algorithm": "FSRS-7",
    "due": "2026-01-05T03:04:05.000Z",
    "stability": 3.17,
    "stabilityFast": 2.81,     // FSRS-7 only
    "difficulty": 5.28,
    "elapsedDays": 0,
    "scheduledDays": 3,
    "learningSteps": 0,
    "reps": 1,
    "lapses": 0,
    "state": 2,                // 0 new, 1 learning, 2 review, 3 relearning
    "lastReview": "2026-01-02T03:04:05.000Z",
    "firstReview": "2026-01-02T03:04:05.000Z" // when it stopped being new
  },
  "reviewedCount": 1,          // kept for v1 readers
  "reviewedAt": "2026-01-02T03:04:05.000Z"
}
```

## Upgrading from 1.x

- Requires remoteStorage.js 2.x; ships ESM and TypeScript types.
- Dates are ISO 8601. v1 records (`YYYYMMDD-HHMMSS`) are upgraded when read
  and rewritten in the new format the next time they're stored.
- New cards get UUID ids, so cards created in the same second no longer collide.
- `store()` takes `{ previousGroup }` to move cards between groups.
- `listGroups()` resolves with an array of names (it used to resolve with the
  raw folder listing). `getAllByGroup()` resolves with an array.
- `familiarity` is no longer written; scheduling state lives in `review`.

## Development

```sh
bun install
bun test
bun run typecheck
bun run build
```

## Releasing

In GitHub, open Actions > Publish > Run workflow and pick `patch`, `minor`, or
`major`. The workflow bumps the version, runs the checks, publishes to npm with
provenance, and pushes the version commit and tag to master.
