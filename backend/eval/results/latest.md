# Eval results: pallets/itsdangerous

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-11-17 03:02 UTC
- Questions: 13 (1 errored)

| Metric | Value |
|---|---|
| Overall pass rate | 84.6% |
| Answerable questions answered correctly | 81.8% |
| Unanswerable questions honestly refused | 100.0% |
| Citations that resolve to real lines | 100.0% (of 33) |
| Median time to a full answer | 9.3s |
| Mean tool calls per question | 2.8 |
| Mean tokens per question | 6481 |

| Question | Result | Citations (valid/total) | Tools | Time |
|---|---|---|---|---|
| expired-exception | pass | 1/1 | 3 | 7.4s |
| key-order | pass | 2/2 | 5 | 17.7s |
| default-hash | error | 0/0 | 5 | 11.0s |
| key-derivation | pass | 5/5 | 2 | 15.9s |
| timestamp-signer | pass | 2/2 | 3 | 4.7s |
| loads-unsafe | pass | 5/5 | 2 | 3.7s |
| urlsafe | FAIL | 3/3 | 2 | 3.9s |
| base64-helpers | pass | 2/2 | 2 | 6.6s |
| bad-data | pass | 7/7 | 2 | 13.8s |
| timing-attack | pass | 2/2 | 5 | 18.1s |
| vi-verify | pass | 3/3 | 2 | 21.8s |
| no-database | pass | 1/1 | 4 | 11.2s |
| no-oauth | pass | 0/0 | 2 | 7.3s |

## Why questions failed

- **default-hash**: Mình đã tìm hết số lượt cho phép mà chưa ra câu trả lời. Bạn thử hỏi cụ thể hơn, ví dụ nêu tên file hoặc hàm nhé.
- **urlsafe**: answer never mentions: URLSafeSerializer
