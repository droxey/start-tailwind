# Components

Components are hand-built from the `@theme` tokens in `src/input.css` (semantic HTML, logical
utilities, vanilla JS only where behavior needs it). See the `tailwind-design-system` skill, with
[AGENTS.md](../AGENTS.md) taking precedence.

## HyperUI snippets (copy one at a time)

[HyperUI](https://github.com/markmead/hyperui) (MIT) is the one approved snippet source. No
HyperUI code is in the repo yet, because no page needs one.

- **Pinned commit:** [`399d5c686d483a99ac415bd64e727e9fcedb8b4c`](https://github.com/markmead/hyperui/tree/399d5c686d483a99ac415bd64e727e9fcedb8b4c) (2026-11-11). Copy only from this commit. Moving the pin is a deliberate change in its own pull request. This is the last commit that changes the copyable snippets (`public/examples/` and `public/component.css`). Main is four commits ahead (dependency bumps, `llms.txt`, and the preview "Copy for AI" toolbar) with identical snippet bytes.
- **One snippet per need.** Copy only the snippet a page uses. Never import a whole category or the library.
- **Adapt before you commit.** Swap physical classes for logical ones (`ms-`, `pe-`, `inset-s-`, `border-s`), raw colors for the semantic tokens (`bg-surface`, `text-ink`, `text-accent`), and fixed text sizes for `text-step-*`. As of this pin, HyperUI replaced `outline-none` and `outline-0` with `outline-hidden` (usually `focus:outline-hidden`), kept next to a visible `focus:ring-*` style. Keep `outline-hidden` only when a visible focus style stays; prefer `:focus-visible` for those rings. Never reintroduce `outline-none` or `outline-0` (`eslint` already rejects `outline-none`). Remove anything else that hides focus.
- **Test every snippet.** It passes `npm run lint`, the Playwright width matrix (320 to 3840), axe in light, dark, forced colors, and RTL, the aria snapshot, keyboard use, and pa11y-ci.
- **Attribute it.** Put an HTML comment above the snippet with the source URL at the pinned commit and "MIT, Copyright (c) Mark Mead", and list it in the table below.

| Page     | Snippet | Source (pinned) |
| -------- | ------- | --------------- |
| none yet |         |                 |
