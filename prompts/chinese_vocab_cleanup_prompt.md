# Prompt for correcting a Chinese vocabulary file (Stage: AI Cleanup)

You are an expert in Modern Standard Chinese (Putonghua), pinyin, lexical frequency, classifier usage, HSK vocabulary grading, and high-quality Ukrainian translation.

You will receive a list of lines in this exact format (from GTX translation):

```text
汉字 | pinyin | raw_translation
```

Your task is to review, correct, and enrich each line while converting the file to a consistent **four-column** pipe-delimited structure:

```text
汉字 | pinyin | corrected_translation | HSK level
```

## Goals

For each entry, verify the pinyin and the Ukrainian translation, correct inaccurate meanings, prioritize grammatical or service-word uses when they are common, add frequent alternative meanings when appropriate, add alternative pinyin readings when they correspond to those meanings, and determine the HSK 3.0 level. 

## Rules

### 1. Translation review

- Correct the translation into natural, accurate **Ukrainian** only.
- If the word is polysemous, keep **1 to 3** of the most common meanings only.
- Separate multiple meanings with `; <br />`.

### 2. Service words & Classifiers

- If the word is a classifier or a function word, state it clearly (e.g., `класифікатор для...`, `частка...`).

### 3. Pinyin verification

- Check and correct tone marks.
- If multiple common readings exist, list them separated by commas: `zhǐ, zhī`.
- Ensure the translation column matches the order of pinyin if multiple readings are given (use italics for pinyin in translations if needed: `(<i>zhǐ</i>)`).

### 4. HSK 3.0 column (IMPORTANT)

- The **fourth column** is the HSK level.
- Use HSK 3.0 standards.
- Values: `HSK 1`, `HSK 2`, `HSK 3`, `HSK 4`, `HSK 5`, `HSK 6`, `HSK 7-9`.
- For phrases or expressions, or if no HSK level applies, leave the field **empty**.

### 5. Validation and Filtering (CRITICAL)

You must check if the provided Hanzi/phrase is a valid, natural expression in Modern Standard Chinese.

Mark a line as **INVALID** if it meets any of these criteria:
- **Grammatically incorrect**: Obvious errors in word order or particle usage (common in Duolingo's distractors).
- **Archaic**: Expressions no longer used in modern speech (unless they are very common Chengyu).
- **Japanese contamination**: Japanese-only kanji (like `込`, `峠`), Japanese names, or purely Japanese vocabulary/grammar.
- **Nonsense**: Random combinations of characters that don't form a meaningful unit.

If a line is invalid, output it in this format (still 4 columns):
`汉字 | INVALID: [reason] | [original translation] | `
*(The reason should be in English or Ukrainian, keep it short).*

## Output format

Every line must use this exact **four-column** structure (exactly **3** pipe symbols `|`):

```text
汉字 | pinyin | corrected_translation | HSK level
```
OR for invalid entries:
```text
汉字 | INVALID: reason | original_translation | 
```

- Do **not** add columns for audio (this happens in a later stage).
- Do **not** add comments, numbering, or explanations.
- Keep the original order of lines.

## Example

### Input
```text
只 | zhǐ | только
与 | yǔ | и
有时间 | yǒu shíjiān | иметь время
```

### Output
```text
只 | zhǐ, zhī | частка обмеження «лише» (<i>zhǐ</i>); <br /> класифікатор для тварин, парних предметів (<i>zhī</i>) | HSK 3
与 | yǔ, yù | і (<i>yǔ</i>); <br /> з (<i>yù</i>) | HSK 4
有时间 | yǒu shíjiān | мати час; <br /> бути вільним | 
```

## Final instruction

Process every line according to these rules and output only the corrected 4-column lines.
