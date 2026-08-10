---
name: api-doc-audit
description: Audit an integration adapter against its official API documentation, field by field, and fix every mismatch. Use when API/provider documentation is supplied (pasted, vendored under docs/vendor/, or a URL) and the task is to verify or correct the code that calls that API — e.g. "check the adapter against these docs", "энэ заавартай тулгаж шалга", after a provider publishes a new spec version, or before going live with an integration. Also use when an integration fails at runtime with a provider-side error and the payload is suspect.
---

# API doc ↔ adapter audit

Adapter bugs against a third-party API are almost never visible in tests or
types: the request compiles, the provider returns 200 or a vague error, and the
defect only shows up in production data. The only reliable way to find them is a
**mechanical field-by-field comparison** with the official spec.

This procedure found four shipping bugs in one pass on the eBarimt POS API
adapter (`payments[].amount` should have been `paidAmount`, a required
`billIdSuffix` was never sent, invented status values were accepted as success,
and every receipt claimed the same payment method).

## Getting the documentation

Try in this order and **say which one you used**:

1. **Vendored** — look in `docs/vendor/` first. Specs saved there are exactly
   what previous sessions worked from.
2. **Pasted** — the user pastes it into the conversation. This is the norm here.
3. **Fetched** — `WebFetch` on the doc URL.

> **This repo's environment blocks outbound HTTP.** Every documentation host
> tested returns `EGRESS_BLOCKED` from the egress proxy (verify with
> `curl -sS http://127.0.0.1:44003/__agentproxy/status`). Do not present a
> URL-fetch attempt as a plan — try it once, and when it is blocked, say so
> and ask for a paste. Never reconstruct a spec from memory: a plausible-looking
> guess at a field name is worse than admitting you do not have the doc.

When the user pastes a spec, **save it to `docs/vendor/<provider>-<version>.md`**
in the same commit as the fixes. That is what makes the next audit cheap.

## The audit

Work one endpoint at a time. For each, build a three-column comparison —
**spec field · code field · verdict** — and do not skip a row because it "looks
obviously fine".

1. **Required fields.** List every field the spec marks required. Confirm each
   one is actually emitted. A field that is required but absent is the single
   most common cause of "the provider rejects our request".
2. **Names, exactly.** Compare character by character. `amount` vs `paidAmount`,
   `posNo` vs `posNumber`. Do not pattern-match on meaning.
3. **Enum values.** Collect the spec's permitted values for every enum. Flag any
   value the code sends or accepts that is not in that list — invented values in
   a success check silently turn failures into successes.
4. **Types and shapes.** String vs number, object vs array, nullable vs omitted.
   Note where the spec says "or null" — some providers require the key present.
5. **Response handling.** Which status means success? What does each other
   status mean? Are the failure branches distinguishable to an operator?
6. **Conditional logic.** Fields that depend on a lookup (tax status, payer
   type, currency) must be *derived*, not hardcoded. Ask: what does the code
   assume here, and what does the spec say determines it?
7. **Ownership and identity.** In multi-tenant systems, check which party each
   identifier belongs to. Operator-owned versus merchant-owned identifiers are
   easy to swap and the mistake is invisible until the wrong account is billed
   or a receipt is filed under the wrong entity.
8. **Storage and retention rules.** Specs often carry legal constraints
   ("do not store X other than by printing it"). These bind the schema, not just
   the request. Flag violations explicitly — do not quietly change behaviour the
   product depends on; state the options and let the owner choose.

## Reporting

Lead with a table of defects, most severe first, each stating **what the code
sends** and **what the spec requires**. Separate:

- **Bugs** — the code contradicts the spec. Fix these.
- **Gaps** — the spec offers something the code ignores (a lookup that would
  remove manual entry, an error field that would improve a message). Propose.
- **Decisions** — compliance or product questions the spec raises. Ask.

## Fixing

- Fix the whole set in one commit; a half-corrected payload is harder to reason
  about than an uncorrected one.
- Keep defensive parsing on responses (providers vary field casing and wrap
  payloads differently across versions), but be strict on what you send.
- Where the spec's shape drives non-obvious code, quote the rule in a comment so
  the next reader does not "simplify" it back into a bug.
- Run the repo's typecheck, lint and build before reporting done.

## Anti-patterns

- Auditing only the endpoint that is currently failing — the spec paste usually
  covers several, and the others fail later.
- Treating HTTP 200 as success without checking the body's own status field.
- Assuming a partial-success response (some items accepted, some rejected) is a
  total failure; surface the per-item reasons instead.
- Silently widening an enum check "to be safe" — that hides provider errors.
