# Antigravity Prompt for `ChineseDuo` Anki Import Script

Create a production-ready Node.js script for Windows that imports Mandarin Chinese vocabulary cards into Anki through the local AnkiConnect API at `http://127.0.0.1:8765`.

The script must be fully working, self-contained, and written in modern JavaScript for Node.js 18+.
Do not use TypeScript.
Do not write pseudocode.
Do not omit implementation details.
Use built-in `fetch` and standard Node.js modules only unless a dependency is truly necessary.

## Goal

- Read entries from a UTF-8 text file named `vocab_tts.txt`
- Read matching `.wav` files from a local folder named `speech/`
- Create or verify a custom Anki note type named `ChineseDuo`
- Create a root deck and subdecks based on section headers in `vocab_tts.txt`
- Upload audio files into Anki media via AnkiConnect
- Create notes in Anki without duplicates
- Log everything both to console and to a file named `import.log`

## Use these exact config constants at the top of the script

```js
const DATA_FILE = './vocab_tts.txt'
const AUDIO_DIR = './speech'
const ROOT_DECK_NAME = 'ChineseDuo::Mandarin Audio '
const MODEL_NAME = 'ChineseDuo'
const LOG_FILE = './import.log'
const ANKI_CONNECT_URL = 'http://127.0.0.1:8765'
const ANKI_CONNECT_VERSION = 6
```

## Important root deck rule

- Preserve `ROOT_DECK_NAME` exactly as written above, including the trailing space.
- Any subdeck must be created by appending `::SubdeckName` to `ROOT_DECK_NAME`.
- Because `ROOT_DECK_NAME` already ends with a space, resulting subdecks will look like:
  - `ChineseDuo::Mandarin Audio ::Basics`
  - `ChineseDuo::Mandarin Audio ::Food`
- This is intentional and must not be normalized away.

## Input file format

The file `vocab_tts.txt` contains two kinds of lines.

### 1. Section header lines

Examples:

```text
# Basics
# Food
# Lesson 03
```

These lines define the current subdeck.
All vocabulary entries after such a line must go into:

`ROOT_DECK_NAME + '::' + sanitized section name`

Example:

If `ROOT_DECK_NAME` is:

`ChineseDuo::Mandarin Audio `

and the current header is:

`# Basics`

then the full deck name must become:

`ChineseDuo::Mandarin Audio ::Basics`

Important behavior:
- A section header applies to all following vocabulary lines.
- That subdeck remains active until the next line starting with `#` appears.
- When a new section header appears, switch the current target subdeck.
- The last active subdeck remains in effect until the end of the file.
- If vocabulary lines appear before the first header, place them into the root deck itself.

### 2. Vocabulary entry lines

Each vocabulary line has exactly 5 columns separated by the literal delimiter:

`" | "`

Format:

`hanzi | pinyin | translation | hsk | audioMarkup`

Examples:

```text
稀 | xī | рідкий, розбавлений; рідкісний |  | [sound:xi 1.wav]
稻米的 | dào mǐ de | рисовий (належний до рису) |  | [sound:dao 4 mi 3 de 5.wav]
稻 | dào | рис (рослина, зерно) | HSK 1 | [sound:dao 4.wav]
大 | dà, dài | великий (<i>dà</i>); у складених словах (<i>dài</i>) | HSK 1 | [sound:da 4.wav][sound:dai 4.wav]
```

Meaning of fields:
- `hanzi`: the Chinese word or expression
- `pinyin`: one reading or multiple readings, e.g. `dà, dài`
- `translation`: translated meaning, may contain safe inline HTML such as `<i>...</i>`
- `hsk`: HSK label such as `HSK 1`, or empty
- `audioMarkup`: one or more Anki sound tags in this format: `[sound:filename.wav]`

## General parsing rules

- Read `vocab_tts.txt` as UTF-8.
- Ignore empty lines.
- Lines beginning with `#` are section headers, not comments.
- Trim whitespace around parsed values.
- If a header line is just `#` or becomes empty after trimming, log a warning and ignore it.
- Any non-empty non-header line must be treated as a vocabulary entry.
- A valid vocabulary entry must have exactly 5 parts.
- If a vocabulary line does not split into exactly 5 parts, log a parse error and skip it.
- The script must continue processing after malformed lines.
- Treat visually empty `hsk` values such as `''`, spaces, `&nbsp;`, or Unicode non-breaking space as empty.
- `audioMarkup` may contain multiple sound tags concatenated directly with no separator, for example:
  `[sound:da 4.wav][sound:dai 4.wav]`
- The script must extract all referenced audio filenames from `audioMarkup`.

## Anki requirements

- Communicate with Anki through AnkiConnect.
- If AnkiConnect is not reachable, exit with a clear message:
  `Open Anki and make sure the AnkiConnect add-on is installed and running.`
- Use a reusable helper function:

```js
invokeAnki(action, params = {})
```

## Root deck and subdecks

- Ensure the root deck exists: `ChineseDuo::Mandarin Audio `
- Whenever a section header is encountered, create a corresponding subdeck if needed.
- Use Anki deck naming hierarchy with `::`.
- Create decks through AnkiConnect `createDeck`.
- Re-creating an existing deck must not be treated as an error.

## Custom model requirements

- The custom note type name must be: `ChineseDuo`
- Required fields in exact order:
  1. `Hanzi`
  2. `Pinyin`
  3. `Meaning`
  4. `Audio`
  5. `AudioButtons`
  6. `Meta`

## Model verification flow

1. Call `modelNames`
2. If `ChineseDuo` does not exist, create it
3. If it exists, verify its fields using `modelFieldNames`
4. The field list must match exactly:

```js
['Hanzi', 'Pinyin', 'Meaning', 'Audio', 'AudioButtons', 'Meta']
```

5. If the model exists but has incompatible fields, abort with a clear error message and do not import anything.

## Why `Meta` exists

- `HSK` must **not** be a model field.
- `HSK` must be stored only as note tags.
- The `Meta` field is a display-only UI field for things like HSK badges or future metadata.
- The note creation request must still pass real Anki tags separately.

## Model creation requirements

Create the model with `createModel` using:
- `modelName = ChineseDuo`
- `inOrderFields = ['Hanzi', 'Pinyin', 'Meaning', 'Audio', 'AudioButtons', 'Meta']`
- one card template named `Card 1`
- custom CSS

## Card design requirements

### Front side

The front side must show:
- `Hanzi`
- a `Show pinyin` toggle button
- hidden `Pinyin` that appears only after clicking the button
- `AudioButtons` as the visible pronunciation controls
- `Meta` only if it contains useful display content
- no autoplay audio

### Back side

The back side must show:
- `Hanzi`
- `Pinyin`
- `AudioButtons`
- `Meaning`
- `Meta`

This is intentionally a two-layer card design:
- **Front:** Hanzi, hidden Pinyin, pronunciation buttons
- **Back:** Hanzi, Pinyin, Meaning, pronunciation buttons, HSK badge from tags rendered via `Meta`

## Very important audio rule

- The audio file must not be actively played by any JavaScript automatically.
- Do not call `audio.play()` automatically on card load.
- Do not create an autoplaying HTML5 `<audio>` element.
- The canonical `Audio` field must contain the original raw Anki sound markup exactly as provided by the source file.
- The visible UI must use `AudioButtons`.
- `AudioButtons` must contain ready-made buttons that trigger the corresponding sound link elements through JavaScript.
- If there is one sound file, show one visible play control.
- If there are multiple sound files, show one visible play control for each pronunciation.
- If pinyin readings and audio files can be matched by index, label each button with that reading.
- If counts do not match, fall back to generic labels such as `Audio 1`, `Audio 2`, etc.
- Do not rely only on the raw `[sound:...]` field as the front-side UI.

## Audio UI mapping rules

Examples:

- `Pinyin: xī`
- `Audio: [sound:xi 1.wav]`

Should produce one button, e.g.:
- `▶ xī`

And:

- `Pinyin: dà, dài`
- `Audio: [sound:da 4.wav][sound:dai 4.wav]`

Should produce two separate buttons, e.g.:
- `▶ dà`
- `▶ dài`

If the number of readings and audio files does not match:
- log a warning
- still build buttons using fallback labels

## Meaning field requirements

- The translation field may already contain safe inline HTML such as `<i>...</i>`.
- Preserve safe inline HTML in `Meaning`.
- Specifically, pinyin fragments inside parentheses such as:
  - `(<i>dà</i>)`
  - `(<i>dài</i>)`
  should be styled differently on the card.
- Render such inline pinyin in dark blue and italic.
- If possible, when the note has multiple readings/audio files, attach a nearby clickable sound control for the corresponding reading.
- At minimum, ensure these inline pinyin fragments are visually distinct and attractive.

## HSK and tags logic

- Use the `hsk` column as note tags.
- If `hsk` is empty, assign the tag:
  `not-in-HSK`
- If `hsk` is present, normalize it into safe Anki tags.
- Example:
  - `HSK 1` → add tag `HSK-1`
- Tags must be passed in the note creation request.
- `HSK` must not be stored as a dedicated note field.
- The `Meta` field may display a badge generated from the normalized HSK tag or from the source value, but the real source of truth remains the note tags.

## Front template requirements

Use a front template with:
- Hanzi
- a toggle button for pinyin
- hidden pinyin block
- a visual audio controls area using `AudioButtons`
- optional `Meta`

Suggested front template structure:

```html
<div class="card-wrap">
  <div class="hanzi">{{Hanzi}}</div>

  <button type="button" class="toggle-btn" onclick="togglePinyin()">
    Show pinyin
  </button>

  <div id="pinyinBlock" class="pinyin hidden">
    {{Pinyin}}
  </div>

  <div class="audio-controls">
    {{AudioButtons}}
  </div>

  {{#Meta}}
  <div class="meta">{{Meta}}</div>
  {{/Meta}}

  <div class="audio-raw visually-hidden">{{Audio}}</div>
</div>

<script>
function togglePinyin() {
  var el = document.getElementById('pinyinBlock');
  var btn = document.querySelector('.toggle-btn');
  if (!el || !btn) return;
  if (el.classList.contains('hidden')) {
    el.classList.remove('hidden');
    btn.textContent = 'Hide pinyin';
  } else {
    el.classList.add('hidden');
    btn.textContent = 'Show pinyin';
  }
}

function playLinkedSound(id) {
  var el = document.getElementById(id);
  if (!el) return;
  el.click();
}
</script>
```

## Back template requirements

Use a back template with:
- Hanzi
- Pinyin
- AudioButtons
- Meaning
- Meta
- optionally a visually hidden raw Audio field

Suggested back template structure:

```html
<div class="card-wrap">
  <div class="hanzi">{{Hanzi}}</div>
  <div class="pinyin">{{Pinyin}}</div>

  <div class="audio-controls">
    {{AudioButtons}}
  </div>

  <hr id="answer" class="divider">

  <div class="meaning">{{Meaning}}</div>

  {{#Meta}}
  <div class="meta">{{Meta}}</div>
  {{/Meta}}

  <div class="audio-raw visually-hidden">{{Audio}}</div>
</div>
```

## CSS requirements

The card should be clean, modern, readable, and optimized for Mandarin study.

Design goals:
- Hanzi is the visual primary element
- Pinyin is visually secondary
- Meaning is high contrast and easy to scan
- Audio controls are clear compact pills/buttons
- Multiple audio buttons should align horizontally and wrap gracefully
- Inline pinyin inside `Meaning` should be dark blue and italic
- HSK badges in `Meta` should be visually subtle but useful

Use CSS along these lines:

```css
.card {
  font-family: "Noto Sans", "Microsoft YaHei", "PingFang SC", sans-serif;
  font-size: 20px;
  text-align: center;
  color: #222;
  background-color: #fff;
}

.card-wrap {
  padding: 24px 16px;
}

.hanzi {
  font-size: 42px;
  font-weight: 600;
  margin-bottom: 12px;
  line-height: 1.2;
}

.pinyin {
  font-size: 24px;
  color: #666;
  margin-top: 12px;
  margin-bottom: 14px;
}

.meaning {
  font-size: 28px;
  color: #111;
  margin-top: 16px;
  line-height: 1.45;
}

.audio-controls {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  margin-bottom: 14px;
}

.audio-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border: 1px solid #b9c2d0;
  border-radius: 999px;
  background: #f7f9fc;
  color: #24364f;
  cursor: pointer;
  font-size: 16px;
}

.audio-btn:hover {
  background: #eef3fa;
}

.toggle-btn {
  font-size: 16px;
  padding: 8px 14px;
  border: 1px solid #bbb;
  border-radius: 8px;
  background: #f5f5f5;
  cursor: pointer;
}

.hidden {
  display: none;
}

.inline-pinyin {
  color: #1f3b73;
  font-style: italic;
}

.meta {
  margin-top: 14px;
}

.hsk-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 999px;
  background: #eef2f7;
  color: #41556f;
  font-size: 14px;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.divider {
  margin: 18px auto;
  width: 60%;
}
```

## Audio upload requirements

- For each valid vocabulary entry, parse `audioMarkup` and extract all filenames.
- For each extracted filename:
  - look for the file at `AUDIO_DIR + '/' + filename`
  - if the file does not exist:
    - skip the entry
    - log a warning
    - increment `skippedMissingAudio`
  - if the file exists:
    - read it as binary
    - encode it as base64
    - upload it using AnkiConnect `storeMediaFile`
- Keep the original `audioMarkup` string exactly as-is in the `Audio` field.

## Deck selection logic

- Maintain a current deck name while parsing the file.
- Before the first section header, use `ROOT_DECK_NAME`.
- After a section header, use `ROOT_DECK_NAME + '::' + sanitized subdeck name`.
- The active subdeck remains in effect until the next header line beginning with `#` or until the end of file.
- Section names must be sanitized minimally:
  - trim
  - replace tabs/newlines with spaces
  - collapse repeated whitespace
  - do not strip meaningful punctuation
  - do not remove Unicode characters

## Duplicate detection

- Do not create duplicates within the same deck.
- Treat a note as a duplicate if the same deck already contains a note with the same `Hanzi` and the same `Pinyin`.
- Recommended logic:
  1. Use `findNotes` with deck + Hanzi
  2. If anything is found, call `notesInfo`
  3. Compare the `Pinyin` field in code
- If duplicate found:
  - skip the entry
  - log it
  - increment `skippedDuplicates`

## Field values for each note

- `Hanzi` = escaped hanzi text
- `Pinyin` = escaped pinyin text
- `Meaning` = transformed safe HTML meaning
- `Audio` = original raw audio markup from source, unchanged
- `AudioButtons` = generated HTML buttons that trigger corresponding hidden sound elements through JavaScript
- `Meta` = generated display-only HTML, for example an HSK badge

Do not HTML-escape the `Audio` field.
Preserve safe inline HTML in `Meaning`.
Carefully sanitize everything else.

## Logging requirements

- Log both to console and to `import.log`
- Overwrite `import.log` at the beginning of each run
- Implement a helper:

```js
logger(message, level = 'INFO')
```

- Each log line must include:
  - timestamp
  - level
  - message
- Log:
  - import start
  - deck creation/checks
  - model creation/checks
  - parse errors
  - invalid or empty headers
  - missing audio files
  - duplicate notes
  - pinyin/audio count mismatches
  - successful media uploads
  - successful note creation
  - final summary

Suggested counters:
- `totalLines`
- `parsedEntries`
- `addedNotes`
- `skippedDuplicates`
- `skippedMissingAudio`
- `parseErrors`
- `uploadErrors`
- `addErrors`
- `headerWarnings`
- `mappingWarnings`

## Required helper functions

Create separate functions with these exact names:

- `logger(message, level = 'INFO')`
- `invokeAnki(action, params = {})`
- `ensureRootDeck()`
- `ensureDeck(deckName)`
- `ensureModel()`
- `createChineseDuoModel()`
- `sanitizeSubdeckName(name)`
- `parseVocabFile()`
- `parseEntryLine(line, lineNumber, currentDeckName)`
- `extractAudioFilenames(audioMarkup)`
- `buildAudioButtonsHtml(pinyin, audioMarkup)`
- `normalizeHskToTags(hsk)`
- `formatMeaningHtml(meaning)`
- `buildMetaHtml(tags, rawHsk)`
- `uploadMedia(filename, fullPath)`
- `findExistingNote(deckName, hanzi, pinyin)`
- `addNote(entry)`
- `escapeHtml(value)`
- `main()`

## Behavior and robustness requirements

- Use async/await consistently.
- Handle AnkiConnect errors gracefully.
- If model creation fails, terminate with a clear error.
- If model field verification fails, terminate with a clear error.
- If `storeMediaFile` fails for one entry, log the error and continue.
- If `addNote` fails for one entry, log the error and continue.
- If `createDeck` is called on an existing deck, do not treat that as fatal.
- Correctly handle UTF-8 throughout.

## Output requirements

- Generate exactly one complete file: `import.js`
- After the code, provide short run instructions:
  1. Open Anki
  2. Make sure the AnkiConnect add-on is installed and running
  3. Put `vocab_tts.txt` next to the script
  4. Put all `.wav` files into `speech/`
  5. Run: `node import.js`

Do not produce an explanation-first answer.
Do not describe what you would do.
Generate the actual finished `import.js` file.
