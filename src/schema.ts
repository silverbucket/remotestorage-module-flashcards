/**
 * JSON schemas for the flashcards module.
 *
 * Dates are ISO 8601 strings. Records written by v1 of this module used a
 * compact `YYYYMMDD-HHMMSS` format; `normalizeFlashcard()` upgrades those on
 * read and on write, so the schema only has to describe the current shape.
 */

/** Spaced-repetition state. Field names follow the FSRS card model. */
export const reviewStateSchema = {
    type: "object",
    properties: {
        /** Scheduler that produced this state, e.g. "FSRS-7". */
        algorithm: { type: "string" },
        due: { type: "string", format: "date-time" },
        stability: { type: "number", minimum: 0 },
        /** FSRS-7 short-term stability component. */
        stabilityFast: { type: "number", minimum: 0 },
        difficulty: { type: "number", minimum: 0 },
        elapsedDays: { type: "number", minimum: 0 },
        scheduledDays: { type: "number", minimum: 0 },
        learningSteps: { type: "integer", minimum: 0 },
        reps: { type: "integer", minimum: 0 },
        lapses: { type: "integer", minimum: 0 },
        /** 0 = new, 1 = learning, 2 = review, 3 = relearning */
        state: { type: "integer", enum: [0, 1, 2, 3] },
        lastReview: { type: "string", format: "date-time" },
    },
    required: ["due", "stability", "difficulty", "reps", "lapses", "state"],
} as const;

export const flashcardSchema = {
    type: "object",
    properties: {
        "@id": { type: "string", minLength: 1 },
        "@type": { enum: ["flashcard"] },
        frontText: { type: "string" },
        backText: { type: "string" },
        hint: { type: "string" },
        group: { type: "string", minLength: 1 },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        review: reviewStateSchema,
        // Kept for compatibility with v1 consumers; derived from `review`.
        familiarity: { type: "number" },
        reviewedCount: { type: "integer", minimum: 0 },
        reviewedAt: { type: "string", format: "date-time" },
    },
    required: ["@id", "@type", "frontText", "backText", "group", "createdAt", "updatedAt"],
} as const;
