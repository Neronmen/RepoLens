# Eval results: pallets/itsdangerous

- Model: `gemini-3.5-flash-lite`
- Run at: 2026-11-17 07:33 UTC
- Questions: 18 (1 errored)

| Metric | Value |
|---|---|
| Overall pass rate | 88.9% |
| Answerable questions answered correctly | 87.5% |
| Unanswerable questions honestly refused | 100.0% |
| Citations that resolve to real lines | 100.0% (of 48) |
| Median time to a full answer | 6.6s |
| Mean tool calls per question | 3.6 |
| Mean tokens per question | 8990 |

| Question | Result | Citations (valid/total) | Tools | Time |
|---|---|---|---|---|
| expired-exception | pass | 2/2 | 4 | 6.3s |
| key-order | pass | 1/1 | 5 | 7.7s |
| default-hash | error | 0/0 | 5 | 6.2s |
| key-derivation | pass | 5/5 | 2 | 4.4s |
| timestamp-signer | pass | 3/3 | 5 | 8.0s |
| loads-unsafe | pass | 7/7 | 4 | 6.3s |
| urlsafe | FAIL | 2/2 | 4 | 10.2s |
| base64-helpers | pass | 3/3 | 2 | 8.1s |
| bad-data | pass | 6/6 | 2 | 3.8s |
| timing-attack | pass | 1/1 | 5 | 7.0s |
| vi-verify | pass | 3/3 | 2 | 3.3s |
| para-shrink | pass | 5/5 | 2 | 4.4s |
| para-bytewise | pass | 2/2 | 5 | 8.6s |
| para-unreadable | pass | 1/1 | 5 | 6.6s |
| para-creation-time | pass | 4/4 | 5 | 8.9s |
| para-rotation | pass | 1/1 | 4 | 8.3s |
| no-database | pass | 1/1 | 2 | 3.1s |
| no-oauth | pass | 1/1 | 3 | 4.8s |

## Why questions failed

- **default-hash**: Mình đã tìm hết số lượt cho phép mà chưa ra câu trả lời. Bạn thử hỏi cụ thể hơn, ví dụ nêu tên file hoặc hàm nhé.
- **urlsafe**: answer never mentions: URLSafeSerializer
