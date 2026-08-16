# CryptoTax Pro — E2E Test Infrastructure Specification (TEST_INFRA.md)

## 1. Test Philosophy

CryptoTax Pro employs a **requirement-driven, opaque-box (black-box) testing methodology**. The testing infrastructure treats internal modules as public specification interfaces, validating input contract compliance, deterministic output calculation, system error tolerance, and data immutability without relying on private implementation details.

### Core Testing Methodologies & Techniques

1. **Category-Partition Testing**:
   - **Exchanges**: Binance Spot, Binance P2P, Bitso Alpha, Fiwind, Ripio Trade, Ripio Classic, Lemon Cash, Bybit, OKX, Bitget, Manual / Custom exchanges.
   - **Input Modalities**: CCXT REST API trades, Ripio native API, native CSV uploads, native XLSX uploads, multi-file compressed archives (ZIP, 7z, RAR).
   - **Operation Types**: Compra, Venta, Swap / Intercambio, Ingreso Cripto, Retiro Cripto, Depósito ARS, Extracción ARS, Ajustes sintéticos.
   - **Transaction Statuses**: Completed, Cancelled, Rejected, Expired, Pending, Disputed (verified via keyword blacklist filtering).

2. **Boundary Value Analysis (BVA)**:
   - **Monetary Amounts**: Zero amounts ($0.0 ARS, 0.0 crypto), micro-quantities ($1\times 10^{-9}$ crypto), extreme high-volume figures ($100,000,000.00 ARS).
   - **Timestamps**: Second boundaries (`23:59:59` to `00:00:00`), leap years (Feb 29), timezone offsets (UTC vs local ISO conversion), same-second timestamp collisions.
   - **File Structures**: 0-byte files, maximum file size limit (100 MB extraction limit), header BOM characters (`\ufeff`), missing mandatory columns, reordered headers.

3. **Pairwise Testing (Combinatorial Interaction)**:
   - Evaluates combinations across **[Exchange Source] $\times$ [Operation Type] $\times$ [Currency Pair] $\times$ [Certification Status]**.
   - Ensures cross-feature interactions (e.g., API Sync + CSV Import + FIFO Recalculation + Tax Report Generation) remain stable without state corruption.

4. **Workload & Stress Testing**:
   - Benchmarks system processing and database write operations across datasets scaling from 1,000 to 50,000+ transactions.
   - Verifies memory consumption stability, SQLite WAL transaction locking, and execution time limits.

---

## 2. Feature Inventory

CryptoTax Pro features are mapped across 12 core requirements, with assigned target test counts for Tiers 1 through 4:

| # | Feature Name | Description | Milestone | Target Test Count (T1 / T2 / T3 / T4) |
|---|--------------|-------------|-----------|--------------------------------------|
| **1** | **Certified Range & Overwrite Protection** | Insertion/deletion/update guards preventing alterations to certified date ranges (`is_certified = 1`). | M1 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **2** | **Timezone & Canonical Hash Normalization** | UTC timestamp conversion, order ID extraction, and canonical exchange root normalization (`compute_canonical_tx_hash`). | M1 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **3** | **Exchange Parser Robustness & Column Tolerance** | Tolerates reordered columns, header aliases (English/Spanish), missing optional columns, and status blacklisting. | M1 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **4** | **Reconciliation Path & Immutability Integration** | Path resolution (`transactions.db`), cross-source (API vs CSV) deduplication, and anomaly classification. | M1 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **5** | **Crypto-Crypto Swaps ARS Valuation** | Prevents $0.0 ARS cost basis in FIFO for crypto-crypto swaps by deriving intermediate ARS quote rates. | M2 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **6** | **Synthetic Balance Gap Valuation** | Automatic balance gap synthetic adjustments assigned valid ARS cost basis to prevent zero-cost basis inflation. | M2 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **7** | **Deterministic Timestamp Collision Sorting** | Secondary/tertiary deterministic sort key (`fecha ASC`, `tipo_operacion priority ASC`, `tx_hash ASC`) for same-second trades. | M2 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **8** | **Argentina Tax Engine Deductions & Accuracy** | Exact Ganancias & IIBB calculations, avoiding double-deduction of `ganancias_deduccion` and enforcing provincial tramos. | M2 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **9** | **Test Infrastructure & Isolated Fixtures** | Isolated temporary SQLite database fixtures (`tmp_path`), clean environment teardowns, and runner discovery. | M3 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **10** | **Corrupted & Edge Case Test Suite** | Resilience against 0-byte files, corrupted archives (ZIP/7z/RAR), bad dates, malformed numbers, and missing headers. | M3 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **11** | **High-Volume Stress Benchmarks** | Benchmark stress tests scaling from 10,000 to 50,000+ transactions, asserting execution time and memory limits. | M3 / M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |
| **12** | **End-to-End Accounting Verification Suite** | Complete accounting pipeline verification from raw multi-exchange file ingestion to certified tax report publication. | M-E2E | T1: 5, T2: 5, T3: 1, T4: 1 |

### Summary of Inventory Counts

- **Tier 1 (Feature Coverage)**: 12 features $\times$ 5 tests = **60 tests**
- **Tier 2 (Boundary & Corner Cases)**: 12 features $\times$ 5 tests = **60 tests**
- **Tier 3 (Cross-Feature Combinations)**: **12 tests** (pairwise cross-feature scenarios)
- **Tier 4 (Real-World Application Scenarios)**: **6 scenarios** (comprehensive E2E multi-exchange accounting lifecycles)
- **Total Test Suite Target**: **138 test cases**

---

## 3. Test Architecture

### Test Runner & Invocation
- **Framework**: `pytest` (v7.4.3+ running on Python 3.11+ / 3.13+).
- **Primary Invocation Command**:
  ```bash
  python -m pytest webapp/backend/ -v
  ```
- **Tier-Specific Invocation Commands**:
  ```bash
  # Run Tier 1: Feature Coverage (60 tests)
  python -m pytest webapp/backend/test_e2e_tier1.py -v

  # Run Tier 2: Boundary & Corner Cases (60 tests)
  python -m pytest webapp/backend/test_e2e_tier2.py -v

  # Run Tier 3: Cross-Feature Combinations (12 tests)
  python -m pytest webapp/backend/test_e2e_tier3.py -v

  # Run Tier 4: Real-World Scenarios (6 scenarios)
  python -m pytest webapp/backend/test_e2e_tier4.py -v

  # Run Master Unified Suite
  python -m pytest webapp/backend/test_e2e_suite.py -v
  ```

### Pass / Fail Semantics
1. **100% Pass Requirement**: All collected test cases must pass with zero unhandled exceptions or assertion failures.
2. **Database Isolation**: No test may write to or depend upon the production database (`webapp/backend/transactions.db`). Every test uses Pytest's `tmp_path` fixture to spin up a temporary, isolated SQLite instance.
3. **Immutability Protection**: Any modification attempt targeting rows with `is_certified = 1` must fail safely (leaving the row unaltered) or be silently skipped.
4. **Precision Assertions**: Financial calculations (ARS amounts, PnL, tax bases) are asserted using `pytest.approx()` with absolute tolerance $1\times 10^{-2}$ for ARS values and $1\times 10^{-8}$ for crypto quantities.

### File Layout Specification

```
webapp/backend/
├── conftest.py                   # Pytest fixtures: temp_db, sample_csv_factory, mock_api_client
├── test_e2e_tier1.py            # Tier 1: Feature Coverage (60 unit/feature test cases)
├── test_e2e_tier2.py            # Tier 2: Boundary & Corner Cases (60 boundary test cases)
├── test_e2e_tier3.py            # Tier 3: Cross-Feature Combinations (12 pairwise test cases)
├── test_e2e_tier4.py            # Tier 4: Real-World Application Scenarios (6 E2E scenarios)
└── test_e2e_suite.py            # Master suite aggregator importing Tiers 1-4
```

---

## 4. Real-World Application Scenarios (Tier 4 Scenarios)

### Scenario 1: Multi-Exchange Arbitrage Lifecycle
- **Workflow**:
  1. User deposits $1,000,000 ARS on **Fiwind** and purchases 1,000 USDT at 1,000 ARS/USDT.
  2. User transfers 1,000 USDT from Fiwind to **Binance Spot**.
  3. User trades 1,000 USDT for 0.02 BTC on Binance Spot.
  4. User transfers 0.02 BTC to **Ripio Trade**.
  5. User sells 0.02 BTC on Ripio Trade for $1,200,000 ARS (60,000,000 ARS/BTC price).
- **Verification**:
  - `recalculate_fifo_costs_db()` calculates exact cost basis of $1,000,000 ARS for the BTC sale.
  - Net PnL is accurately recorded as $200,000 ARS gain.
  - No phantom sale anomalies are flagged during full ledger reconciliation audit.

### Scenario 2: Certified Period Audit & Retroactive Import Attempt
- **Workflow**:
  1. CPA certifies accounting period from `2024-01-01 00:00:00` to `2024-12-31 23:59:59` (`is_certified = 1` applied to all 2024 transactions).
  2. User attempts to re-import a modified 2024 CSV file containing duplicate and altered records.
  3. User triggers `delete_transactions_by_exchange('Binance Spot')`.
  4. User runs `recalculate_fifo_costs_db()`.
- **Verification**:
  - `insert_transactions()` skips/ignores attempts to overwrite certified date ranges.
  - `delete_transactions_by_exchange()` deletes only uncertified transactions (`is_certified = 0`), preserving all certified records.
  - FIFO cost calculations preserve `cotizacion_compra` values on certified rows.

### Scenario 3: Corrupted & Truncated Multi-Exchange File Upload Recovery
- **Workflow**:
  1. User uploads a compressed ZIP archive containing:
     - Valid Binance Spot CSV (50 trades).
     - Malformed Bitso XLSX file missing the mandatory `'Major Fee'` column.
     - Corrupted/truncated RAR archive.
     - Empty 0-byte CSV file.
- **Verification**:
  - System extracts valid Binance CSV and imports all 50 trades without failing the batch.
  - `MissingColumnsError` is cleanly caught for Bitso XLSX and logged in response metadata.
  - Corrupted archive and empty file raise handled warnings without crashing the server thread.

### Scenario 4: High-Volume Multi-Asset FIFO Queue & Collision Resolution
- **Workflow**:
  1. Ingestion of 10,000 synthetic transactions generated across 5 coins (BTC, ETH, USDT, SOL, ADA).
  2. 500 transactions share the exact same second timestamp (`2025-06-15 12:00:00`).
- **Verification**:
  - Secondary/tertiary deterministic sorting orders buys before sells (`tipo_operacion priority ASC`), followed by `tx_hash ASC`.
  - FIFO queue resolves with zero negative balance errors.
  - Execution completes within 5.0 seconds and memory consumption remains stable.

### Scenario 5: Argentina Tax Year Closing (Ganancias & IIBB)
- **Workflow**:
  1. Ledger contains mixed certified (2024) and provisional (2025) transactions for an Argentine taxpayer in Catamarca province.
  2. Total taxable sell volume = $4,000,000,000 ARS; Net Ganancias PnL = $500,000,000 ARS.
  3. Configured `ganancias_deduccion` = $30,000,000 ARS.
- **Verification**:
  - `get_tax_report(2025)` applies $30,000,000 ARS deduction once on overall net gain base.
  - Catamarca IIBB progressive bracket selects Tramo 2 (5% up to 3.255B, 6% above 3.255B up to 26.97B ARS).
  - Tax report correctly segregates certified vs provisional sub-totals.

### Scenario 6: Hybrid API & File Sync Deduplication
- **Workflow**:
  1. User syncs 100 trades via CCXT Binance API connector.
  2. User manually uploads the official Binance Spot CSV file covering the exact same date range and order IDs.
- **Verification**:
  - `compute_canonical_tx_hash` generates identical 32-character hex hashes for API and CSV versions of the same trade.
  - `insert_transactions()` reports 100 inserted, 100 skipped (duplicates).
  - Total database transaction count remains exactly 100.

---

## 5. Coverage Thresholds

To achieve formal verification and publication readiness for the CryptoTax Pro testing suite (`TEST_READY.md`), the test suite must satisfy the following strict quantitative thresholds:

| Metric | Target Threshold | Compliance Criteria |
|--------|------------------|---------------------|
| **Tier 1 (Feature Coverage)** | $\ge 60$ tests | 100% pass rate across all 12 core features (5 tests/feature) |
| **Tier 2 (Boundary & Corner Cases)** | $\ge 60$ tests | 100% pass rate across all boundary conditions (5 tests/feature) |
| **Tier 3 (Cross-Feature Combinations)** | $\ge 12$ tests | 100% pass rate across pairwise feature interaction tests |
| **Tier 4 (Real-World Application Scenarios)** | $\ge 6$ scenarios | 100% pass rate across E2E multi-exchange lifecycles |
| **Total Test Suite Count** | **$\ge 138$ tests** | **100% pass rate (0 failures, 0 uncaught exceptions)** |
| **Database Isolation** | 100% | 0 modifications to production `transactions.db` |
| **Execution Performance** | $< 15.0$ seconds | Total suite execution time under pytest runner |

---
*Specification document generated by Specification Miner (`e2e_spec_miner_1`) for M-E2E track.*
