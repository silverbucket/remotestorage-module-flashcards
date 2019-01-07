<a name="module_flashcards"></a>

## flashcards
A remoteStorage data module for flashcards.

Maintained by Nick Jennings <nick@silverbucket.net>

All flashcards are stored as timestamps.


* [flashcards](#module_flashcards)
    * [store(frontText, backText)](#exp_module_flashcards--store) ⇒ <code>Promise</code> ⏏
    * [remove(group, id)](#exp_module_flashcards--remove) ⇒ <code>Promise</code> ⏏
    * [get(id)](#exp_module_flashcards--get) ⇒ <code>object</code> ⏏
    * [listGroups()](#exp_module_flashcards--listGroups) ⇒ <code>Promise</code> ⏏
    * [getAllByGroup(group)](#exp_module_flashcards--getAllByGroup) ⇒ <code>Promise</code> ⏏

<a name="exp_module_flashcards--store"></a>

### store(frontText, backText) ⇒ <code>Promise</code> ⏏
Stores a flashcard

**Kind**: Exported function  
**Returns**: <code>Promise</code> - A promise, which will be fulfilled with the updated flashcard object  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| frontText | <code>string</code> | Filename |
| backText | <code>string</code> | Filename |

**Example**  
```js
remoteStorage.flashcards.store(flashcard)
  .then((flashcard) => { console.log(`the updated flashcard object is: ${flashcard}`)
```
<a name="exp_module_flashcards--remove"></a>

### remove(group, id) ⇒ <code>Promise</code> ⏏
Remove a flashcard

**Kind**: Exported function  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| group | <code>string</code> | The group name of the flashcard |
| id | <code>string</code> | The ID of the flashcard |

<a name="exp_module_flashcards--get"></a>

### get(id) ⇒ <code>object</code> ⏏
Get a flashcard.

**Kind**: Exported function  
**Returns**: <code>object</code> - The flashcard object  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| id | <code>string</code> | the ID of the flashcard |

<a name="exp_module_flashcards--listGroups"></a>

### listGroups() ⇒ <code>Promise</code> ⏏
List all flashcard groups

**Kind**: Exported function  
**Returns**: <code>Promise</code> - Resolves with an array containing the flashcard group names  
**Access**: public  
<a name="exp_module_flashcards--getAllByGroup"></a>

### getAllByGroup(group) ⇒ <code>Promise</code> ⏏
List all flashcards in a group

**Kind**: Exported function  
**Returns**: <code>Promise</code> - Resolves with an array containing all the flashcard objects of that group  
**Access**: public  

| Param | Type | Description |
| --- | --- | --- |
| group | <code>string</code> | the name of the group |

