# StreamPulse contributor notes

## Companion module

The Bitfocus Companion module lives in a separate repo: `jarbochov/companion-module-streampulse` (local: `../companion-module-streampulse`).

When adding or changing StreamPulse controls, API endpoints or live state:

- Check whether the module needs a matching action, feedback or variable (`src/actions.js`, `src/feedbacks.js`, `src/variables.js`, `src/api.js`).
- Update `companion/HELP.md` and the README when the module changes.
- Keep `@companion-module/base` on 1.x (`~1.14.1`); 2.x breaks Companion 5.1.
- Variables use array form in `setVariableDefinitions`.
- Commit and push the module separately with `feat:`/`fix:`/`chore:` prefixes.
