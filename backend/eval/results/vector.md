# Eval results: pallets/itsdangerous

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-11-17 07:50 UTC
- Questions: 18 (0 errored)

| Metric | Value |
|---|---|
| Overall pass rate | 94.4% |
| Answerable questions answered correctly | 93.8% |
| Unanswerable questions honestly refused | 100.0% |
| Citations that resolve to real lines | 100.0% (of 51) |
| Median time to a full answer | 6.8s |
| Mean tool calls per question | 3.6 |
| Mean tokens per question | 9052 |

| Question | Result | Citations (valid/total) | Tools | Time |
|---|---|---|---|---|
| expired-exception | pass | 1/1 | 1 | 4.2s |
| key-order | pass | 4/4 | 4 | 7.5s |
| default-hash | pass | 2/2 | 4 | 6.8s |
| key-derivation | pass | 5/5 | 2 | 6.7s |
| timestamp-signer | pass | 3/3 | 5 | 8.4s |
| loads-unsafe | pass | 4/4 | 4 | 6.7s |
| urlsafe | FAIL | 3/3 | 3 | 6.8s |
| base64-helpers | pass | 3/3 | 2 | 4.3s |
| bad-data | pass | 6/6 | 2 | 4.5s |
| timing-attack | pass | 1/1 | 4 | 6.6s |
| vi-verify | pass | 3/3 | 5 | 12.2s |
| para-shrink | pass | 8/8 | 4 | 6.9s |
| para-bytewise | pass | 1/1 | 5 | 8.3s |
| para-unreadable | pass | 2/2 | 5 | 11.2s |
| para-creation-time | pass | 1/1 | 5 | 9.3s |
| para-rotation | pass | 3/3 | 4 | 9.7s |
| no-database | pass | 1/1 | 3 | 11.3s |
| no-oauth | pass | 0/0 | 3 | 5.4s |

## Why questions failed

- **urlsafe**: answer never mentions: URLSafeSerializer
