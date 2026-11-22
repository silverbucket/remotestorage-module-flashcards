/**
 * A remoteStorage data module for flashcards.
 *
 * Cards live at `/flashcards/<group>/<id>`. Each group is a folder, so a
 * group exists exactly as long as it holds at least one card.
 *
 * Two names at the top level are not groups: `.settings` (a document of
 * settings shared by every device) and `.log/` (the review log, one
 * document per day).
 *
 * @module flashcards
 */
import { flashcardSchema, reviewLogSchema, reviewStateSchema, settingsSchema } from "./schema.js";

export { flashcardSchema, reviewLogSchema, reviewStateSchema, settingsSchema };

export const DEFAULT_GROUP = "default";
/** Path of the settings document, relative to `/flashcards/`. */
export const SETTINGS_PATH = ".settings";
/** Folder holding the review log, relative to `/flashcards/`. */
export const LOG_FOLDER = ".log";
/** Top-level names used for other data, so they can't be group names. */
const RESERVED_GROUPS = [SETTINGS_PATH, LOG_FOLDER];

/** FSRS card state. 0 = new, 1 = learning, 2 = review, 3 = relearning. */
export type ReviewStateValue = 0 | 1 | 2 | 3;

export interface ReviewState {
    /** Scheduler that produced this state, e.g. "FSRS-7". */
    algorithm?: string;
    due: string;
    stability: number;
    /** FSRS-7 short-term stability component. */
    stabilityFast?: number;
    difficulty: number;
    elapsedDays?: number;
    scheduledDays?: number;
    learningSteps?: number;
    reps: number;
    lapses: number;
    state: ReviewStateValue;
    lastReview?: string;
    /** When the card was first reviewed (left the "new" state). */
    firstReview?: string;
}

/** Which way a card is studied: front → back, back → front, or each on its own schedule. */
export type CardDirection = "forward" | "reverse" | "both";

export interface Flashcard {
    "@id": string;
    "@type": "flashcard";
    frontText: string;
    backText: string;
    hint?: string;
    /** More about the answer (an example, notes, a table), shown with it. */
    extra?: string;
    group: string;
    createdAt: string;
    updatedAt: string;
    /** Scheduling for front → back. */
    review?: ReviewState;
    /** Which way the card is studied. Absent means "forward". */
    direction?: CardDirection;
    /** Scheduling for back → front, separate from `review`. */
    reverseReview?: ReviewState;
    /** @deprecated v1 field, kept so older apps can still read the card. */
    familiarity?: number;
    reviewedCount?: number;
    reviewedAt?: string;
}

/** What callers pass to `store()`: a card with the generated fields optional. */
export type FlashcardInput = Omit<Flashcard, "@id" | "@type" | "group" | "createdAt" | "updatedAt"> &
    Partial<Pick<Flashcard, "@id" | "@type" | "group" | "createdAt" | "updatedAt">>;

/** Settings shared by every device that uses the same storage. */
export interface Settings {
    /** Most new cards to start per day. */
    newCardsPerDay?: number;
    updatedAt?: string;
}

/** A single review, as recorded in the review log. */
export interface ReviewLogEntry {
    /** When the review happened. */
    at: string;
    cardId: string;
    /** The card's group at the time. */
    group?: string;
    /** 1 = again, 2 = hard, 3 = good, 4 = easy. */
    rating: 1 | 2 | 3 | 4;
    /** The card's state before this review (0 = it was new). */
    state: ReviewStateValue;
    /** Set when the back → front direction was reviewed. */
    reverse?: true;
}

export interface StoreOptions {
    /**
     * The group the card was stored under before this write. When it differs
     * from `card.group`, the old copy is removed so the card moves instead of
     * being duplicated.
     */
    previousGroup?: string;
}

/** Minimal shape of the remoteStorage.js BaseClient handed to the builder. */
export interface PrivateClient {
    declareType(alias: string, schema: object): void;
    getAll(path: string, maxAge?: false | number): Promise<unknown>;
    getListing(path?: string, maxAge?: false | number): Promise<unknown>;
    getObject(path: string, maxAge?: false | number): Promise<unknown>;
    storeObject(typeAlias: string, path: string, object: object): Promise<unknown>;
    remove(path: string): Promise<unknown>;
    on(eventName: string, handler: (event: unknown) => void): void;
    removeEventListener(eventName: string, handler: (event: unknown) => void): void;
}

const LEGACY_DATE = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/;

/**
 * Parse a stored date into ISO 8601. Accepts ISO strings and the v1
 * `YYYYMMDD-HHMMSS` (UTC) format. Returns undefined for anything else.
 */
export function normalizeDate(value: unknown): string | undefined {
    if (typeof value !== "string" || value === "") return undefined;
    const legacy = LEGACY_DATE.exec(value);
    const date = legacy
        ? new Date(Date.UTC(+legacy[1], +legacy[2] - 1, +legacy[3], +legacy[4], +legacy[5], +legacy[6]))
        : new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * Normalize a group name: `default` when empty, otherwise unchanged so that
 * v1 groups stay at the path they were stored under. Group names become a
 * path segment, so `/` is not allowed.
 */
export function normalizeGroup(group: unknown): string {
    const name = typeof group === "string" ? group : "";
    if (name.includes("/")) {
        throw new Error(`Group names cannot contain "/": ${name}`);
    }
    return name || DEFAULT_GROUP;
}

/** A group name that cards can be stored under or removed from: not one of the reserved names. */
function cardGroup(group: unknown): string {
    const name = normalizeGroup(group);
    if (RESERVED_GROUPS.includes(name)) throw new Error(`"${name}" can't be used as a group name`);
    return name;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Turn a stored object into a valid current-format Flashcard, upgrading v1
 * records (compact dates, missing backText/updatedAt). Returns undefined for
 * values that are not flashcards, including the `true` placeholders
 * remoteStorage.js returns for documents whose bodies haven't synced yet.
 */
export function normalizeFlashcard(value: unknown, fallbackDate = new Date().toISOString()): Flashcard | undefined {
    if (!isRecord(value) || typeof value["@id"] !== "string" || value["@id"] === "") return undefined;

    const createdAt = normalizeDate(value.createdAt) ?? normalizeDate(value.updatedAt) ?? fallbackDate;
    const card: Flashcard = {
        "@id": value["@id"],
        "@type": "flashcard",
        frontText: typeof value.frontText === "string" ? value.frontText : "",
        backText: typeof value.backText === "string" ? value.backText : "",
        group: normalizeGroup(value.group),
        createdAt,
        updatedAt: normalizeDate(value.updatedAt) ?? createdAt,
    };
    if (typeof value.hint === "string" && value.hint !== "") card.hint = value.hint;
    if (typeof value.extra === "string" && value.extra !== "") card.extra = value.extra;

    const review = normalizeReviewState(value.review);
    if (review) card.review = review;
    if (value.direction === "reverse" || value.direction === "both") card.direction = value.direction;
    const reverseReview = normalizeReviewState(value.reverseReview);
    if (reverseReview) card.reverseReview = reverseReview;
    if (typeof value.familiarity === "number") card.familiarity = value.familiarity;
    if (Number.isInteger(value.reviewedCount) && (value.reviewedCount as number) >= 0) {
        card.reviewedCount = value.reviewedCount as number;
    }
    const reviewedAt = normalizeDate(value.reviewedAt);
    if (reviewedAt) card.reviewedAt = reviewedAt;
    return card;
}

function normalizeReviewState(value: unknown): ReviewState | undefined {
    if (!isRecord(value)) return undefined;
    const due = normalizeDate(value.due);
    const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);
    const int = (v: unknown) => (Number.isInteger(v) && (v as number) >= 0 ? (v as number) : undefined);
    const stability = num(value.stability);
    const difficulty = num(value.difficulty);
    const reps = int(value.reps);
    const lapses = int(value.lapses);
    const state = int(value.state);
    if (!due || stability === undefined || difficulty === undefined || reps === undefined || lapses === undefined) {
        return undefined;
    }
    if (state === undefined || state > 3) return undefined;

    const review: ReviewState = { due, stability, difficulty, reps, lapses, state: state as ReviewStateValue };
    if (typeof value.algorithm === "string" && value.algorithm !== "") review.algorithm = value.algorithm;
    const stabilityFast = num(value.stabilityFast);
    if (stabilityFast !== undefined) review.stabilityFast = stabilityFast;
    const elapsedDays = num(value.elapsedDays);
    const scheduledDays = num(value.scheduledDays);
    const learningSteps = int(value.learningSteps);
    const lastReview = normalizeDate(value.lastReview);
    if (elapsedDays !== undefined) review.elapsedDays = elapsedDays;
    if (scheduledDays !== undefined) review.scheduledDays = scheduledDays;
    if (learningSteps !== undefined) review.learningSteps = learningSteps;
    if (lastReview) review.lastReview = lastReview;
    const firstReview = normalizeDate(value.firstReview);
    if (firstReview) review.firstReview = firstReview;
    return review;
}

/** Turn a stored settings document into `Settings`, dropping anything invalid. */
export function normalizeSettings(value: unknown): Settings {
    const settings: Settings = {};
    if (!isRecord(value)) return settings;
    if (Number.isInteger(value.newCardsPerDay) && (value.newCardsPerDay as number) >= 0) {
        settings.newCardsPerDay = value.newCardsPerDay as number;
    }
    const updatedAt = normalizeDate(value.updatedAt);
    if (updatedAt) settings.updatedAt = updatedAt;
    return settings;
}

function normalizeLogEntry(value: unknown): ReviewLogEntry | undefined {
    if (!isRecord(value)) return undefined;
    const at = normalizeDate(value.at);
    const { cardId, rating, state } = value;
    if (!at || typeof cardId !== "string" || cardId === "") return undefined;
    if (!Number.isInteger(rating) || (rating as number) < 1 || (rating as number) > 4) return undefined;
    if (!Number.isInteger(state) || (state as number) < 0 || (state as number) > 3) return undefined;
    const entry: ReviewLogEntry = {
        at,
        cardId,
        rating: rating as ReviewLogEntry["rating"],
        state: state as ReviewStateValue,
    };
    if (typeof value.group === "string" && value.group !== "") entry.group = value.group;
    if (value.reverse === true) entry.reverse = true;
    return entry;
}

/**
 * The valid entries of a stored review-log document (one day), oldest
 * first. Returns an empty list for anything that isn't a log document.
 */
export function normalizeReviewLog(value: unknown): ReviewLogEntry[] {
    if (!isRecord(value) || !Array.isArray(value.entries)) return [];
    const entries: ReviewLogEntry[] = [];
    for (const item of value.entries) {
        const entry = normalizeLogEntry(item);
        if (entry) entries.push(entry);
    }
    return entries.sort((a, b) => a.at.localeCompare(b.at));
}

const sameReview = (a: ReviewLogEntry, b: ReviewLogEntry) =>
    a.at === b.at && a.cardId === b.cardId && !a.reverse === !b.reverse;

function generateId(): string {
    return globalThis.crypto.randomUUID();
}

const cardPath = (group: string, id: string) => `${group}/${id}`;
/** Log documents are named after the UTC day of their reviews. */
const logPath = (at: string) => `${LOG_FOLDER}/${at.slice(0, 10)}`;

function toCards(items: unknown): Flashcard[] {
    if (!isRecord(items)) return [];
    const cards: Flashcard[] = [];
    for (const value of Object.values(items)) {
        const card = normalizeFlashcard(value);
        if (card) cards.push(card);
    }
    return cards;
}

export function createFlashcardsApi(privateClient: PrivateClient) {
    privateClient.declareType("flashcard", flashcardSchema);
    privateClient.declareType("settings", settingsSchema);
    privateClient.declareType("review-log", reviewLogSchema);

    // Log writes read a day's document and store it back, so they run one at a time.
    let logQueue: Promise<unknown> = Promise.resolve();
    function updateLog(entry: ReviewLogEntry, change: (entries: ReviewLogEntry[]) => ReviewLogEntry[]): Promise<void> {
        const run = async () => {
            const path = logPath(entry.at);
            const before = normalizeReviewLog(await privateClient.getObject(path, false));
            const entries = change(before);
            if (entries.length === 0) {
                if (before.length > 0) await privateClient.remove(path);
            } else {
                await privateClient.storeObject("review-log", path, { date: entry.at.slice(0, 10), entries });
            }
        };
        const result = logQueue.then(run, run);
        logQueue = result.catch(() => {});
        return result;
    }

    return {
        name: "flashcards" as const,

        /** Subscribe to remoteStorage.js events (`change`) on the flashcards scope. */
        on(eventName: "change", handler: (event: unknown) => void): void {
            privateClient.on(eventName, handler);
        },

        removeEventListener(eventName: "change", handler: (event: unknown) => void): void {
            privateClient.removeEventListener(eventName, handler);
        },

        /**
         * Create or update a card. Generates `@id` and timestamps as needed and
         * resolves with the stored card. Pass `previousGroup` when the group
         * may have changed so the card is moved rather than copied.
         */
        async store(input: FlashcardInput, options: StoreOptions = {}): Promise<Flashcard> {
            const now = new Date().toISOString();
            const card = normalizeFlashcard({ ...input, "@id": input["@id"] || generateId(), updatedAt: now }, now);
            if (!card) throw new Error("Invalid flashcard");
            cardGroup(card.group);
            const previousGroup = options.previousGroup === undefined ? undefined : cardGroup(options.previousGroup);

            // storeObject() mutates its argument (adds @context), so hand it a copy.
            await privateClient.storeObject("flashcard", cardPath(card.group, card["@id"]), { ...card });

            if (previousGroup !== undefined && previousGroup !== card.group) {
                await privateClient.remove(cardPath(previousGroup, card["@id"]));
            }
            return card;
        },

        /** Get a single card, or undefined if it doesn't exist. */
        async get(group: string, id: string, maxAge?: false | number): Promise<Flashcard | undefined> {
            return normalizeFlashcard(await privateClient.getObject(cardPath(normalizeGroup(group), id), maxAge));
        },

        /** Remove a single card. */
        async remove(group: string, id: string): Promise<void> {
            await privateClient.remove(cardPath(cardGroup(group), id));
        },

        /** Names of all groups that contain at least one card, sorted. */
        async listGroups(maxAge?: false | number): Promise<string[]> {
            const listing = await privateClient.getListing("", maxAge);
            if (!isRecord(listing)) return [];
            return Object.keys(listing)
                .filter((key) => key.endsWith("/"))
                .map((key) => key.slice(0, -1))
                .filter((name) => !RESERVED_GROUPS.includes(name))
                .sort((a, b) => a.localeCompare(b));
        },

        /** All cards in one group. */
        async getAllByGroup(group: string, maxAge?: false | number): Promise<Flashcard[]> {
            return toCards(await privateClient.getAll(`${normalizeGroup(group)}/`, maxAge));
        },

        /** All cards in all groups. */
        async getAll(maxAge?: false | number): Promise<Flashcard[]> {
            const groups = await this.listGroups(maxAge);
            const perGroup = await Promise.all(groups.map((group) => this.getAllByGroup(group, maxAge)));
            return perGroup.flat();
        },

        /** Remove every card in a group (and with it, the group). */
        async removeGroup(group: string): Promise<void> {
            const name = cardGroup(group);
            const listing = await privateClient.getListing(`${name}/`);
            if (!isRecord(listing)) return;
            await Promise.all(
                Object.keys(listing)
                    .filter((key) => !key.endsWith("/"))
                    .map((id) => privateClient.remove(cardPath(name, id))),
            );
        },

        /** Settings shared by every device. Empty when none have been saved. */
        async getSettings(maxAge?: false | number): Promise<Settings> {
            return normalizeSettings(await privateClient.getObject(SETTINGS_PATH, maxAge));
        },

        /** Change some settings, keeping the others. Resolves with all of them. */
        async setSettings(changes: Omit<Settings, "updatedAt">): Promise<Settings> {
            const stored = await privateClient.getObject(SETTINGS_PATH, false);
            // Fields this version doesn't know (from a newer app) are kept as they are.
            const next = { ...(isRecord(stored) ? stored : {}), ...changes, updatedAt: new Date().toISOString() };
            // Rejects values the settings schema doesn't allow.
            await privateClient.storeObject("settings", SETTINGS_PATH, next);
            return normalizeSettings(next);
        },

        /** Add a review to the log. */
        async logReview(entry: ReviewLogEntry): Promise<void> {
            const valid = normalizeLogEntry(entry);
            if (!valid) throw new Error("Invalid review log entry");
            // Logging the same review again (a retry) doesn't count it twice.
            await updateLog(valid, (entries) =>
                entries.some((e) => sameReview(e, valid)) ? entries : [...entries, valid],
            );
        },

        /** Take a review back out of the log (when it is undone). */
        async unlogReview(entry: ReviewLogEntry): Promise<void> {
            const valid = normalizeLogEntry(entry);
            if (!valid) throw new Error("Invalid review log entry");
            await updateLog(valid, (entries) => entries.filter((e) => !sameReview(e, valid)));
        },

        /** Every logged review, oldest first. */
        async getReviewLog(maxAge?: false | number): Promise<ReviewLogEntry[]> {
            const days = await privateClient.getAll(`${LOG_FOLDER}/`, maxAge);
            if (!isRecord(days)) return [];
            return Object.values(days)
                .flatMap(normalizeReviewLog)
                .sort((a, b) => a.at.localeCompare(b.at));
        },
    };
}

export type FlashcardsApi = ReturnType<typeof createFlashcardsApi>;

const Flashcards = {
    name: "flashcards",
    builder(privateClient: PrivateClient) {
        return { exports: createFlashcardsApi(privateClient) };
    },
};

export default Flashcards;
