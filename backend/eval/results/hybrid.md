# Eval results: pallets/itsdangerous

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-11-17 07:42 UTC
- Questions: 18 (0 errored)

| Metric | Value |
|---|---|
| Overall pass rate | 94.4% |
| Answerable questions answered correctly | 93.8% |
| Unanswerable questions honestly refused | 100.0% |
| Citations that resolve to real lines | 100.0% (of 47) |
| Median time to a full answer | 7.5s |
| Mean tool calls per question | 3.4 |
| Mean tokens per question | 8745 |

| Question | Result | Citations (valid/total) | Tools | Time |
|---|---|---|---|---|
| expired-exception | pass | 1/1 | 1 | 3.0s |
| key-order | pass | 4/4 | 4 | 7.8s |
| default-hash | pass | 2/2 | 4 | 7.0s |
| key-derivation | pass | 5/5 | 1 | 4.3s |
| timestamp-signer | pass | 3/3 | 3 | 6.4s |
| loads-unsafe | pass | 4/4 | 5 | 8.7s |
| urlsafe | FAIL | 4/4 | 5 | 9.6s |
| base64-helpers | pass | 2/2 | 2 | 4.6s |
| bad-data | pass | 5/5 | 2 | 4.3s |
| timing-attack | pass | 2/2 | 4 | 7.1s |
| vi-verify | pass | 1/1 | 3 | 7.8s |
| para-shrink | pass | 4/4 | 5 | 8.0s |
| para-bytewise | pass | 1/1 | 5 | 9.0s |
| para-unreadable | pass | 2/2 | 5 | 10.1s |
| para-creation-time | pass | 4/4 | 5 | 9.6s |
| para-rotation | pass | 2/2 | 4 | 10.2s |
| no-database | pass | 0/0 | 1 | 3.5s |
| no-oauth | pass | 1/1 | 3 | 4.4s |

## Why questions failed

- **urlsafe**: answer never mentions: URLSafeSerializer
