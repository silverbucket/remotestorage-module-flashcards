/**
 * A remoteStorage data module for flashcards.
 *
 * Cards live at `/flashcards/<group>/<id>`. Each group is a folder, so a
 * group exists exactly as long as it holds at least one card.
 *
 * @module flashcards
 */
import { flashcardSchema, reviewStateSchema } from "./schema.js";

export { flashcardSchema, reviewStateSchema };

export const DEFAULT_GROUP = "default";

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
}

export interface Flashcard {
    "@id": string;
    "@type": "flashcard";
    frontText: string;
    backText: string;
    hint?: string;
    group: string;
    createdAt: string;
    updatedAt: string;
    review?: ReviewState;
    /** @deprecated v1 field, kept so older apps can still read the card. */
    familiarity?: number;
    reviewedCount?: number;
    reviewedAt?: string;
}

/** What callers pass to `store()`: a card with the generated fields optional. */
export type FlashcardInput = Omit<Flashcard, "@id" | "@type" | "group" | "createdAt" | "updatedAt"> &
    Partial<Pick<Flashcard, "@id" | "@type" | "group" | "createdAt" | "updatedAt">>;

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
 * Normalize a group name: trimmed, `default` when empty. Group names become
 * a path segment, so `/` is not allowed.
 */
export function normalizeGroup(group: unknown): string {
    const name = typeof group === "string" ? group.trim() : "";
    if (name.includes("/")) {
        throw new Error(`Group names cannot contain "/": ${name}`);
    }
    return name || DEFAULT_GROUP;
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

    const review = normalizeReviewState(value.review);
    if (review) card.review = review;
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
    return review;
}

function generateId(): string {
    return globalThis.crypto.randomUUID();
}

const cardPath = (group: string, id: string) => `${group}/${id}`;

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

            // storeObject() mutates its argument (adds @context), so hand it a copy.
            await privateClient.storeObject("flashcard", cardPath(card.group, card["@id"]), { ...card });

            if (options.previousGroup !== undefined) {
                const previousGroup = normalizeGroup(options.previousGroup);
                if (previousGroup !== card.group) {
                    await privateClient.remove(cardPath(previousGroup, card["@id"]));
                }
            }
            return card;
        },

        /** Get a single card, or undefined if it doesn't exist. */
        async get(group: string, id: string, maxAge?: false | number): Promise<Flashcard | undefined> {
            return normalizeFlashcard(await privateClient.getObject(cardPath(normalizeGroup(group), id), maxAge));
        },

        /** Remove a single card. */
        async remove(group: string, id: string): Promise<void> {
            await privateClient.remove(cardPath(normalizeGroup(group), id));
        },

        /** Names of all groups that contain at least one card, sorted. */
        async listGroups(maxAge?: false | number): Promise<string[]> {
            const listing = await privateClient.getListing("", maxAge);
            if (!isRecord(listing)) return [];
            return Object.keys(listing)
                .filter((key) => key.endsWith("/"))
                .map((key) => key.slice(0, -1))
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
            const name = normalizeGroup(group);
            const listing = await privateClient.getListing(`${name}/`, false);
            if (!isRecord(listing)) return;
            await Promise.all(
                Object.keys(listing)
                    .filter((key) => !key.endsWith("/"))
                    .map((id) => privateClient.remove(cardPath(name, id))),
            );
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
