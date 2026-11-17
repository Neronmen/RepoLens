# Eval results: pallets/itsdangerous

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-11-17 02:57 UTC
- Questions: 13 (0 errored)

| Metric | Value |
|---|---|
| Overall pass rate | 76.9% |
| Answerable questions answered correctly | 90.9% |
| Unanswerable questions honestly refused | 0.0% |
| Citations that resolve to real lines | 100.0% (of 38) |
| Median time to a full answer | 16.3s |
| Mean tool calls per question | 3.5 |
| Mean tokens per question | 8207 |

| Question | Result | Citations (valid/total) | Tools | Time |
|---|---|---|---|---|
| expired-exception | pass | 1/1 | 3 | 13.8s |
| key-order | FAIL | 4/4 | 4 | 22.5s |
| default-hash | pass | 1/1 | 5 | 16.3s |
| key-derivation | pass | 5/5 | 1 | 3.3s |
| timestamp-signer | pass | 2/2 | 3 | 11.4s |
| loads-unsafe | pass | 5/5 | 3 | 15.9s |
| urlsafe | pass | 5/5 | 5 | 22.1s |
| base64-helpers | pass | 4/4 | 2 | 10.7s |
| bad-data | pass | 7/7 | 2 | 12.8s |
| timing-attack | pass | 1/1 | 5 | 24.9s |
| vi-verify | pass | 3/3 | 5 | 40.2s |
| no-database | FAIL | 0/0 | 4 | 16.4s |
| no-oauth | FAIL | 0/0 | 4 | 22.5s |

## Why questions failed

- **key-order**: answer never mentions: newest|last|most recent|latest
- **no-database**: expected an honest 'not found', but the answer did not say so
- **no-oauth**: expected an honest 'not found', but the answer did not say so
