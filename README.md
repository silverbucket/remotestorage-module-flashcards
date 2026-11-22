# remotestorage-module-flashcards

A [remoteStorage.js](https://remotestorage.io) data module for flashcards,
including spaced-repetition review state (FSRS card model).

Cards are stored at `/flashcards/<group>/<id>`. A group exists as long as it
contains at least one card. Settings shared between devices and a log of
reviews are stored next to them.

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
| `getSettings(maxAge?)` | Settings shared by every device (`{}` until some are saved). |
| `setSettings(changes)` | Change some settings and keep the rest. Resolves with all of them. |
| `logReview(entry)` | Add a review to the log. |
| `unlogReview(entry)` | Take a review back out (same `at`, `cardId` and direction). |
| `getReviewLog(maxAge?)` | Every logged review, oldest first. |
| `on("change", handler)` / `removeEventListener(...)` | remoteStorage.js change events for the scope, including the settings (`.settings`) and log (`.log/<day>`) documents. |

`maxAge` is passed through to remoteStorage.js; use `false` to read from the
local cache without waiting for a sync.

Also exported: `normalizeFlashcard`, `normalizeSettings`, `normalizeReviewLog`
(for the `newValue` of change events), `normalizeDate`, `normalizeGroup`,
`SETTINGS_PATH`, `LOG_FOLDER`, the JSON schemas, and the `Flashcard` /
`ReviewState` / `Settings` / `ReviewLogEntry` types.

## Data format

```jsonc
{
  "@id": "3f0c…",              // UUID (v1 used YYYYMMDD-HHMMSS)
  "@type": "flashcard",
  "frontText": "pivo",
  "backText": "beer",
  "hint": "magical drink",     // optional
  "extra": "Jedno pivo, prosím.", // optional: more about the answer, shown with it
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
  "direction": "both",         // optional: "reverse" (back → front) or "both"; absent = front → back
  "reverseReview": { /* same shape as review, for back → front */ },
  "reviewedCount": 1,          // kept for v1 readers
  "reviewedAt": "2026-01-02T03:04:05.000Z"
}
```

### Settings

One document at `/flashcards/.settings`, so every device uses the same values:

```jsonc
{
  "newCardsPerDay": 20,        // optional
  "updatedAt": "2026-01-02T03:04:05.000Z"
}
```

`setSettings()` keeps fields it doesn't know, so apps can add their own.

### Review log

One document per UTC day at `/flashcards/.log/<YYYY-MM-DD>`, so each review is
a small write:

```jsonc
{
  "date": "2026-01-02",
  "entries": [
    {
      "at": "2026-01-02T03:04:05.000Z",
      "cardId": "3f0c…",
      "group": "food",         // the card's group at the time
      "rating": 3,             // 1 again, 2 hard, 3 good, 4 easy
      "state": 0,              // the card's state before the review (0 = it was new)
      "reverse": true          // only for back → front reviews
    }
  ]
}
```

If two devices log reviews for the same day before syncing with each other,
remoteStorage keeps the server's copy of that day and the other device's
entries for it are lost. The cards themselves are not affected.

`.settings` and `.log` can't be used as group names.

Apps on a version of this module before 2.2 find no cards in either, but:

- their `listGroups()` includes `.log`, and removing that "group" deletes the
  review log;
- they drop `direction` and `reverseReview` from a card when they save it.

So update every app that uses the same storage.

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
