## Agent workflow

Follow `docs/agents/dev-flow.md`. Plans in `docs/plans/` are the spec for each PR.
Prove changes with the `verify-receipt-splitter` skill. The first PR of the first plan creates it.

## UI work

The site must not look AI-generated. Any PR that touches UI loads `emil-design-eng`, `apple-design` and `mobile-native` before writing it, uses `animate-expo` (native) or `animate` (web) for motion, and runs `review-animations` and `unslop` (for UI text) before the PR. Screenshots from `verify-receipt-splitter` are the proof.
