import { beforeEach, describe, expect, test } from "bun:test";
import RemoteStorage from "remotestoragejs";
import Flashcards, {
    type FlashcardsApi,
    normalizeDate,
    normalizeFlashcard,
    normalizeGroup,
    normalizeReviewLog,
} from "./index";

let flashcards: FlashcardsApi;
let rs: RemoteStorage;

beforeEach(async () => {
    rs = new RemoteStorage({ modules: [Flashcards], cache: true, changeEvents: { local: false } });
    rs.access.claim("flashcards", "rw");
    rs.caching.enable("/flashcards/");
    await new Promise<void>((resolve) => rs.on("ready", () => resolve()));
    flashcards = (rs as unknown as { flashcards: FlashcardsApi }).flashcards;
});

describe("normalizeDate", () => {
    test("upgrades v1 compact dates", () => {
        expect(normalizeDate("20181025-143005")).toBe("2018-10-25T14:30:05.000Z");
    });
    test("passes ISO dates through", () => {
        expect(normalizeDate("2026-01-02T03:04:05.000Z")).toBe("2026-01-02T03:04:05.000Z");
    });
    test("rejects garbage", () => {
        expect(normalizeDate("2018293920121")).toBeUndefined();
        expect(normalizeDate(42)).toBeUndefined();
        expect(normalizeDate("")).toBeUndefined();
    });
});

describe("normalizeGroup", () => {
    test("defaults empty names", () => {
        expect(normalizeGroup("")).toBe("default");
        expect(normalizeGroup(undefined)).toBe("default");
    });
    test("keeps names as stored", () => {
        expect(normalizeGroup(" food ")).toBe(" food ");
        expect(normalizeGroup("  ")).toBe("  ");
    });
    test("rejects slashes", () => {
        expect(() => normalizeGroup("a/b")).toThrow();
    });
});

describe("normalizeFlashcard", () => {
    test("ignores sync placeholders", () => {
        expect(normalizeFlashcard(true)).toBeUndefined();
        expect(normalizeFlashcard({})).toBeUndefined();
    });
    test("upgrades a v1 record", () => {
        const card = normalizeFlashcard({
            "@id": "20181025-143005",
            "@type": "flashcard",
            frontText: "pivo",
            group: "food",
            familiarity: 0,
            reviewedCount: 0,
            reviewedAt: "20181025-143005",
            createdAt: "20181025-143005",
            updatedAt: "20181026-090000",
        });
        expect(card).toEqual({
            "@id": "20181025-143005",
            "@type": "flashcard",
            frontText: "pivo",
            backText: "",
            group: "food",
            familiarity: 0,
            reviewedCount: 0,
            reviewedAt: "2018-10-25T14:30:05.000Z",
            createdAt: "2018-10-25T14:30:05.000Z",
            updatedAt: "2018-10-26T09:00:00.000Z",
        });
    });
    test("drops an invalid review state", () => {
        const card = normalizeFlashcard({ "@id": "x", group: "g", review: { due: "nope" } });
        expect(card?.review).toBeUndefined();
    });
});

describe("store", () => {
    test("generates an id and timestamps", async () => {
        const card = await flashcards.store({ frontText: "pivo", backText: "beer", group: "food" });
        expect(card["@id"]).toMatch(/^[0-9a-f-]{36}$/);
        expect(card.createdAt).toBe(card.updatedAt);
        expect(await flashcards.get("food", card["@id"])).toEqual(card);
    });

    test("two cards stored in the same second get different ids", async () => {
        const [a, b] = await Promise.all([
            flashcards.store({ frontText: "a", backText: "a" }),
            flashcards.store({ frontText: "b", backText: "b" }),
        ]);
        expect(a["@id"]).not.toBe(b["@id"]);
        expect(await flashcards.getAllByGroup("default")).toHaveLength(2);
    });

    test("keeps createdAt on update", async () => {
        const card = await flashcards.store({ frontText: "a", backText: "a", createdAt: "2020-01-01T00:00:00.000Z" });
        const updated = await flashcards.store({ ...card, backText: "b" });
        expect(updated.createdAt).toBe("2020-01-01T00:00:00.000Z");
        expect(updated.backText).toBe("b");
    });

    test("moves a card when its group changes", async () => {
        const card = await flashcards.store({ frontText: "a", backText: "a", group: "one" });
        await flashcards.store({ ...card, group: "two" }, { previousGroup: "one" });
        expect(await flashcards.getAllByGroup("one")).toHaveLength(0);
        expect(await flashcards.getAllByGroup("two")).toHaveLength(1);
        expect(await flashcards.listGroups()).toEqual(["two"]);
    });

    test("stores review state", async () => {
        const review = {
            algorithm: "FSRS-7",
            stabilityFast: 2.5,
            due: "2026-02-01T00:00:00.000Z",
            stability: 3.2,
            difficulty: 5.1,
            reps: 1,
            lapses: 0,
            state: 2 as const,
            lastReview: "2026-01-29T00:00:00.000Z",
            firstReview: "2026-01-20T00:00:00.000Z",
        };
        const card = await flashcards.store({ frontText: "a", backText: "a", review });
        expect((await flashcards.get("default", card["@id"]))?.review).toEqual(review);
    });

    test("stores direction and a separate reverse schedule", async () => {
        const reverseReview = {
            due: "2026-03-01T00:00:00.000Z",
            stability: 1,
            difficulty: 5,
            reps: 2,
            lapses: 1,
            state: 2 as const,
        };
        const card = await flashcards.store({ frontText: "a", backText: "a", direction: "both", reverseReview });
        const stored = await flashcards.get("default", card["@id"]);
        expect(stored?.direction).toBe("both");
        expect(stored?.reverseReview).toEqual(reverseReview);
        expect(stored?.review).toBeUndefined();
        // "forward" is the default and isn't written.
        expect(await flashcards.store({ ...card, direction: "forward" })).not.toHaveProperty("direction");
    });

    test("rejects the names used for settings and the log as groups", async () => {
        expect(flashcards.store({ frontText: "a", backText: "a", group: ".log" })).rejects.toThrow();
        expect(flashcards.store({ frontText: "a", backText: "a", group: ".settings" })).rejects.toThrow();
    });

    test("rejects group names with slashes", async () => {
        expect(flashcards.store({ frontText: "a", backText: "a", group: "a/b" })).rejects.toThrow();
    });
});

describe("listing and removal", () => {
    test("lists groups and all cards", async () => {
        await flashcards.store({ frontText: "a", backText: "a", group: "verbs" });
        await flashcards.store({ frontText: "b", backText: "b", group: "food" });
        await flashcards.store({ frontText: "c", backText: "c", group: "food" });
        expect(await flashcards.listGroups()).toEqual(["food", "verbs"]);
        expect(await flashcards.getAll()).toHaveLength(3);
    });

    test("remove and removeGroup", async () => {
        const a = await flashcards.store({ frontText: "a", backText: "a", group: "food" });
        await flashcards.store({ frontText: "b", backText: "b", group: "food" });
        await flashcards.store({ frontText: "c", backText: "c", group: "verbs" });
        await flashcards.remove("food", a["@id"]);
        expect(await flashcards.getAllByGroup("food")).toHaveLength(1);
        await flashcards.removeGroup("food");
        expect(await flashcards.listGroups()).toEqual(["verbs"]);
    });

    test("reads v1 cards whose group has surrounding spaces", async () => {
        const v1 = {
            "@id": "old",
            "@type": "flashcard",
            frontText: "a",
            group: " food ",
            createdAt: "20181025-143005",
        };
        await rs.scope("/flashcards/").storeFile("application/json", " food /old", JSON.stringify(v1));
        expect(await flashcards.listGroups()).toEqual([" food "]);
        expect((await flashcards.get(" food ", "old"))?.group).toBe(" food ");
        expect(await flashcards.getAll()).toHaveLength(1);
        await flashcards.removeGroup(" food ");
        expect(await flashcards.listGroups()).toEqual([]);
    });

    test("empty storage", async () => {
        expect(await flashcards.listGroups()).toEqual([]);
        expect(await flashcards.getAll()).toEqual([]);
        expect(await flashcards.get("default", "missing")).toBeUndefined();
    });
});

describe("settings", () => {
    test("are empty until saved, then merge", async () => {
        expect(await flashcards.getSettings()).toEqual({});
        const saved = await flashcards.setSettings({ newCardsPerDay: 5 });
        expect(saved.newCardsPerDay).toBe(5);
        expect(saved.updatedAt).toBeString();
        expect(await flashcards.getSettings()).toEqual(saved);
    });

    test("keep fields this version doesn't know", async () => {
        await rs.scope("/flashcards/").storeFile("application/json", ".settings", JSON.stringify({ theme: "dark" }));
        await flashcards.setSettings({ newCardsPerDay: 0 });
        const raw = (await rs.scope("/flashcards/").getObject(".settings")) as Record<string, unknown>;
        expect(raw.theme).toBe("dark");
        expect(raw.newCardsPerDay).toBe(0);
    });

    test("reject invalid values", async () => {
        expect(flashcards.setSettings({ newCardsPerDay: -1 })).rejects.toThrow();
        expect(flashcards.setSettings({ newCardsPerDay: 1.5 })).rejects.toThrow();
        expect(await flashcards.getSettings()).toEqual({});
    });

    test("don't show up as a group or a card", async () => {
        await flashcards.setSettings({ newCardsPerDay: 5 });
        expect(await flashcards.listGroups()).toEqual([]);
        expect(await flashcards.getAll()).toEqual([]);
    });
});

describe("review log", () => {
    const first = { at: "2026-01-02T23:59:00.000Z", cardId: "a", group: "food", rating: 3 as const, state: 0 as const };
    const second = { at: "2026-01-03T00:01:00.000Z", cardId: "a", rating: 1 as const, state: 2 as const };

    test("stores reviews one document per UTC day and reads them back in order", async () => {
        // Logged at once, out of order: writes to one day must not overwrite each other.
        const third = { ...second, at: "2026-01-03T08:00:00.000Z", cardId: "b", reverse: true as const };
        await Promise.all([flashcards.logReview(third), flashcards.logReview(second), flashcards.logReview(first)]);
        expect(await flashcards.getReviewLog()).toEqual([first, second, third]);
        const listing = await rs.scope("/flashcards/").getListing(".log/");
        expect(Object.keys(listing as object).sort()).toEqual(["2026-01-02", "2026-01-03"]);
    });

    test("unlogReview removes just that review", async () => {
        const reverse = { ...first, reverse: true as const };
        await flashcards.logReview(first);
        await flashcards.logReview(reverse);
        await flashcards.unlogReview(first);
        expect(await flashcards.getReviewLog()).toEqual([reverse]);
        await flashcards.unlogReview(reverse);
        expect(await flashcards.getReviewLog()).toEqual([]);
    });

    test("rejects invalid entries", async () => {
        expect(flashcards.logReview({ ...first, rating: 5 as never })).rejects.toThrow();
        expect(flashcards.logReview({ ...first, at: "yesterday" })).rejects.toThrow();
    });

    test("isn't a group, and can't be removed as one", async () => {
        await flashcards.logReview(first);
        expect(await flashcards.listGroups()).toEqual([]);
        expect(await flashcards.getAll()).toEqual([]);
        expect(flashcards.removeGroup(".log")).rejects.toThrow();
        expect(flashcards.remove(".log", "2026-01-02")).rejects.toThrow();
        expect(flashcards.store({ frontText: "a", backText: "a" }, { previousGroup: ".log" })).rejects.toThrow();
        expect(await flashcards.getReviewLog()).toEqual([first]);
    });

    test("logging the same review twice counts it once", async () => {
        await flashcards.logReview(first);
        await flashcards.logReview(first);
        expect(await flashcards.getReviewLog()).toEqual([first]);
    });

    test("normalizeReviewLog skips placeholders and bad entries", () => {
        expect(normalizeReviewLog(true)).toEqual([]);
        expect(normalizeReviewLog({ entries: [first, { at: "x" }, null] })).toEqual([first]);
    });
});
