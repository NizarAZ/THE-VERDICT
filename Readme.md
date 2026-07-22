# THE VERDICT — Product Spec

## What this is
A GenLayer Intelligent Contract dApp: two players stake GEN, debate a topic,
an LLM judges via GenLayer's Non-Comparative Equivalence Principle, winner
takes the pot, reputation/leaderboard updates on-chain.

## Contract: the_verdict.py
Reference: docs.genlayer.com/developers/intelligent-contracts
- Use `gl.vm.run_nondet` (not run_nondet_unsafe) for the judgment call —
  it's non-comparative, so validators assess against criteria, not replicate.
- `leader_fn` must return `response_format="json"` with schema:
  {"winner": "pro"|"con", "score_pro": int, "score_con": int, "reasoning": str}
- `validator_fn` MUST compare only `winner`, `score_pro`, `score_con` fields
  — never compare `reasoning` (it will differ; that's expected and fine).
- CoinGecko web-data pulls: extract only {price, market_cap} — drop
  timestamps/24h-change/volume before returning from leader_fn, or
  validator consensus will fail. See "Extract Stable Fields" pattern.
- Use `[EXPECTED]` prefix for business-logic reverts (wrong stake, not your
  turn, duel already judged) and `[EXTERNAL]` for CoinGecko/API failures.
- Pre-validate argument length (50-800 chars) deterministically in Python
  BEFORE calling the LLM — don't let the LLM judge on length.
- Optional but recommended: use the "Ground LLM Judgments with Programmatic
  Facts" pattern — e.g. programmatically check "did each side cite at least
  one number/date" via gl.vm.spawn_sandbox, then feed that into the judge
  prompt as ground truth, so the LLM doesn't hallucinate about citation
  presence.

## Frontend stack (non-negotiable)
- React 19 + TypeScript + Vite (existing)
- Framer Motion — page/state transitions, the status pill animations,
  the "PRO/CON" assignment reveal, timer ring
- GSAP — the leaderboard entrance stagger, number count-up (W/D/L, %),
  scroll-triggered reveals if we add a landing/marketing view
- 21st.dev components — as the base primitive layer (buttons, cards, dialog,
  textarea) then re-skinned to match the dark/indigo/orange "Verdict" theme
  already established in the current screens
- Apply UI/UX pro skill conventions: consistent spacing scale, one accent
  color doing real work (indigo for "your action", orange for "opponent"),
  motion with purpose (state changes only, never decorative-only)

## Design language already established (from current screenshots)
- Near-black bg (#0a0a0a-ish), indigo (#6366f1-ish) primary, orange accent
  for opponent/CryptoKnight-style avatars
- Bold uppercase condensed headers for topic titles ("GTA 6 WILL BE DELAYED
  AGAIN") — keep this, it's a strong identity marker, don't soften it
- Status pills (PENDING ACCEPTANCE, YOUR TURN) — small dot + label, keep
  consistent across all views
- Circular countdown timer (41:27) — this needs real motion: SVG stroke-
  dashoffset animated with Framer Motion or GSAP, not a static ring