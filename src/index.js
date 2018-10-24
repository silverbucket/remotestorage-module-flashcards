/**
 * A remoteStorage data module for flashcards.
 *
 * Maintained by Nick Jennings <nick@silverbucket.net>
 *
 * All flashcards are stored as timestamps.
 *
 * @module flashcards
 */
const Flashcards = function (privateClient, publicClient) {

  privateClient.declareType('flashcard', {
    "type": "object",
    "properties": {
      "@id": {
        "type": "string"
      },
      "@type": {
        "enum": [ "flashcard" ]
      },
      "frontText": {
        "type": "string"
      },
      "backText": {
        "type": "string"
      },
      "hint": {
        "type": "string"
      },
      "familiarity": {
        "type": "number"
      },
      "reviewedCount": {
        "type": "number"
      },
      "group": {
        "type": "string"
      },
      "reviewedAt": {
        "type": "string",
        "format": "date-time"
      },
      "createdAt": {
        "type": "string",
        "format": "date-time"
      },
      "updatedAt": {
        "type": "string",
        "format": "date-time"
      }
    },
    "required": [ "@id", "@type", "frontText", "group", "createdAt" ]
  });

  //
  // Public functions
  //
  const flashcards = {
    name: "flashcards",

    on: privateClient.on,

    /**
     * Stores a flashcard
     *
     * @param {string} frontText - Filename
     * @param {string} backText  - Filename
     *
     * @returns {Promise} A promise, which will be fulfilled with the updated flashcard object
     *
     * @alias module:flashcards
     * @public
     *
     * @example
     *
     * remoteStorage.flashcards.store(flashcard)
     *   .then((flashcard) => { console.log(`the updated flashcard object is: ${flashcard}`)
     */
    store: function (flashcard) {
      const date = this._formattedDate(new Date());

      flashcard['@id'] = flashcard['@id'] || date;
      flashcard.group = flashcard.group || "default";
      flashcard['@type'] = "flashcard";
      flashcard.familiarity = flashcard.familiarity || 0;
      flashcard.reviewedCount = flashcard.reviewedCount || 0;
      flashcard.reviewedAt = flashcard.reviewedAt || date;
      flashcard.updatedAt = date;

      if (! flashcard.createdAt) {
        flashcard.createdAt = date;
      }

      return privateClient.storeObject("flashcard", flashcard.group + "/" + flashcard['@id'] , flashcard).then(() => {
        return this.get(flashcard.group, flashcard['@id']);
      });
    },

    /**
     * Remove a flashcard
     *
     * @param {string} group - The group name of the flashcard
     * @param {string} id - The ID of the flashcard
     *
     * @returns {Promise}
     *
     * @alias module:flashcards
     * @public
     */
    remove: function (group, id) {
      return privateClient.remove(group + "/" + id);
    },

    /**
     * Get a flashcard.
     *
     * @param {string} id - the ID of the flashcard
     *
     * @returns {object} The flashcard object
     *
     * @alias module:flashcards
     * @public
     */
    get: function (group, id) {
      return privateClient.getObject(group + "/" + id);
    },

    /**
     * List all flashcard groups
     *
     * @returns {Promise} Resolves with an array containing the flashcard group names
     *
     * @alias module:flashcards
     * @public
     */
    listGroups: function () {
      return privateClient.getListing('/');
    },

    /**
     * List all flashcards in a group
     *
     * @param {string} group - the name of the group
     *
     * @returns {Promise} Resolves with an array containing all the flashcard objects of that group
     *
     * @alias module:flashcards
     * @public
     */
    getAllByGroup: function (group) {
      group = group || 'default';
      return privateClient.getAll(group + '/');
    },

    /**
     * Helper method for formatting dates for filenames
     *
     * @param {date} date - a Date object
     *
     * @returns {string} A formatted date string, like e.g. '131106-1523'
     *
     * @private
     */

    _formattedDate: function (date) {
      const pad = function (num) {
        num = String(num);
        if (num.length === 1) { num = "0" + num; }
        return num;
      };
      const yrs = pad( date.getUTCFullYear().toString() ),
            mon = pad( date.getUTCMonth() + 1 ),
            day = pad( date.getUTCDate() ),
            hrs = pad( date.getUTCHours() ),
            min = pad( date.getUTCMinutes() ),
            sec = pad( date.getUTCSeconds() );

      return yrs + mon + day + "-" + hrs + min + sec;
    }
  };

  return { exports: flashcards };
};

export default { name: 'flashcards', builder: Flashcards };