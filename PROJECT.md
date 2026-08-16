# Project: CryptoTax Pro

## Architecture
- `webapp/backend/processor_lib.py`: Exchange-specific parsers (Binance, Bitso, Fiwind, Ripio), column validation, status check, normalization.
- `webapp/backend/reconciliation.py`: Reconciliation algorithms, deduplication hash calculations, cross-source transaction matching.
- `webapp/backend/models_v2.py`: Transaction data models, `compute_canonical_tx_hash`, canonical exchange root lookup, schema mappings.
- `webapp/backend/db_manager.py`: SQLite database layer (`transactions.db`), transaction persistence, certified transaction status sync, immutability guards, wipe/delete guards.
- `webapp/backend/fifo_engine.py`: FIFO cost basis engine, multi-currency arbitrage matching, balance gap synthetic adjustments, timestamp collision resolution, tax engine (Ganancias & IIBB Argentina).
- `webapp/backend/test_*.py` & `webapp/backend/conftest.py`: Test suite, isolated DB fixtures, corrupted file tests, accounting edge cases, stress testing benchmarks.

## Feature Inventory
Every feature from the Survey phase is enumerated here with its assigned milestone:
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Certified Range & Overwrite Protection | Prevent insertions into certified date ranges; prevent deletion/update of certified records | M1 | survey |
| 2 | Timezone & Canonical Hash Normalization | UTC conversion before canonical hash generation; fix order ID extraction & exchange root resolution | M1 | survey |
| 3 | Exchange Parser Robustness & Column Tolerance | Status candidate recognition ('Resultado', 'Condition'), Fiwind English aliases ('SWAP', 'DEPOSIT'), Ripio non-ARS fiat pairs, fuzzy column matching | M1 | survey |
| 4 | Reconciliation Path & Immutability Integration | Fix reconciliation DB path (point to transactions.db), verify deduplication across API vs CSV imports | M1 | survey |
| 5 | Crypto-Crypto Swaps ARS Valuation | Prevent $0.0 cost basis in FIFO for crypto-crypto swaps; compute ARS valuation via intermediate rate/quote | M2 | survey |
| 6 | Synthetic Balance Gap Valuation | Synthetic adjustments for unmatched sales assigned proper valuation to prevent $0.0 cost basis inflation | M2 | survey |
| 7 | Deterministic Timestamp Collision Sorting | Secondary/tertiary deterministic sorting for same-second transactions beyond random hash | M2 | survey |
| 8 | Argentina Tax Engine Deductions & Accuracy | Fix double-deduction in `ganancias_deduccion` across sub-reports, exact Ganancias & IIBB calculations | M2 | survey |
| 9 | Test Infrastructure & Isolated Fixtures | `conftest.py` with isolated temp DB, fix discovery of `run_tests`/`run_real_flow_test` | M3 | survey |
| 10 | Corrupted & Edge Case Test Suite | Test malformed/corrupted CSVs/Excels/ZIPs, boundary inputs, missing headers | M3 | survey |
| 11 | High-Volume Stress Benchmarks | 10k to 100k transaction benchmark stress tests, performance assertion | M3 | survey |
| 12 | End-to-End Accounting Verification Suite | Full E2E test suite covering all features Tier 1-4 | M-E2E | survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Dynamic Parsing & Certified Protection | R1 parsing/deduplication hardening & R2 DB immutability guards | none | DONE |
| 2 | FIFO Accounting & Argentina Tax Engine | R3 FIFO cost basis, crypto swaps, balance gap valuation, tax calculations | M1 | PLANNED |
| 3 | Test Infra, Corrupted Files & Stress Suite | R4 Pytest infrastructure, corrupted/malformed files, stress benchmarks | M1, M2 | PLANNED |
| M-E2E | E2E Testing Suite Track | Requirement-driven E2E test suite across Tiers 1-4 | none | DONE |

## Interface Contracts
### `processor_lib.py` / `models_v2.py` ↔ `reconciliation.py` / `db_manager.py`
- `compute_canonical_tx_hash(tx_dict)`: Returns deterministic 32-char hex hash after converting timestamps to UTC ISO format (`YYYY-MM-DD THH:MM:SSZ`) and extracting full order IDs (alphanumeric/short).
- `get_canonical_exchange_root(exchange_str)`: Normalizes exchange string to canonical root.
- `is_certified` protection in `db_manager.py`: `insert_transactions()` must reject/ignore transactions falling in certified date ranges. `delete_transactions_by_exchange()` and `recalculate_fifo_costs_db()` must skip rows where `is_certified == 1`.

### `fifo_engine.py` ↔ `db_manager.py` / `app.py`
- `calculate_fifo(transactions)`: Processes FIFO queue without modifying `cotizacion_compra` of certified rows. Resolves same-second order by (`fecha ASC`, `tx_type_priority ASC`, `id ASC`).
- Crypto-crypto swap valuation: assign ARS value to quote asset at swap timestamp.

## Code Layout
- Main package: `webapp/backend/`
  - `processor_lib.py`, `reconciliation.py`, `models_v2.py`, `db_manager.py`, `fifo_engine.py`, `app.py`
- Test files: `webapp/backend/test_*.py`, `webapp/backend/conftest.py`
