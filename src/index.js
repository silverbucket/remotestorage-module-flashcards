/**
 * A remoteStorage data module for flashcards.
 *
 * Maintained by Nick Jennings <nick@silverbucket.net>
 *
 * All flashcards are stored as timestamps.
 *
 * @module flashcards
 */
const flashcardsBuilder = function (privateClient) {

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

      flashcard.id = flashcard.id || date;
      flashcard.group = flashcard.group || "default";

      if (flashcard.createdAt) {
        flashcard.updatedAt = date;
      } else {
        flashcard.createdAt = date;
      }

      return privateClient.storeObject(flashcard.group + "/" + flashcard.id, flashcard)
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
    get: function (id) {
      return privateClient.getObject(id);
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
      const yrs = pad( date.getUTCFullYear().toString().substr(2) );
      const mon = pad( date.getUTCMonth() + 1 );
      const day = pad( date.getUTCDate() );
      const hrs = pad( date.getUTCHours() );
      const min = pad( date.getUTCMinutes() );

      return yrs + mon + day + "-" + hrs + min;
    }
  };

  return { exports: flashcards };
};

export default { name: 'flashcards', builder: flashcardsBuilder };