Based on character-card-skills by the Foreverse Team (https://foreverse.app), CC BY 4.0.

Source: https://github.com/foreverse-app/character-card-skills
Pinned commit: dab0da437810b2ea4b5eec414c10c8fa35e779f8
License: https://creativecommons.org/licenses/by/4.0/

Four JSON cards are preserved byte-for-byte from Git. Parent research copies each add one final LF, verified separately in manifest.json. No upstream scripts, covers or PNG cards are used.

At import, character_book is converted using the original pinned SillyTavern convertCharacterBook implementation into one independently bound book per card; it is removed from the active character payload to prevent double injection. Primary greeting only; alternate greetings remain available in the raw source but are not selected by this UI. HTML stays literal text, never executed or rendered. Global app post-history instructions are appended explicitly. Imported templates keep source attribution; edits are adapted versions, not upstream originals.
