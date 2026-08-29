# SoleTrader

Private, local-first bookkeeping for UK sole traders. Free and open source.

All data is stored in a local SQLite database on your own computer — nothing is sent to the cloud. The optional app PIN controls access to the app; it does not encrypt the database or backup files.

---

## Features

- **Invoices & sales** — Create, issue, and manage invoices with PDF export; record partial payments; handle quotes and recurring billing; CIS and self-billing support
- **Expenses** — Log expenses by HMRC category, attach receipts, track recurring costs, batch categorise
- **Receipt capture** — Scan receipts from your phone using a private QR code link on your local network; OCR auto-reads supplier and amount
- **Bank import** — Import CSV, OFX, QIF, and QFX statements; auto-match transactions to existing invoices and expenses
- **VAT management** — Quarterly VAT return preparation for standard, flat-rate, and cash-accounting schemes; MTD readiness tracking; period-by-period history
- **Tax calculator** — Transparent self-assessment estimate showing income tax, National Insurance, and payment-on-account breakdowns using your live records
- **Tax confidence dashboard** — At-a-glance view of what to set aside, forecasted liability, and upcoming HMRC deadlines
- **Vehicles & mileage** — HMRC mileage allowance or actual cost method per vehicle; journey log with purpose tracking
- **Capital allowances** — AIA, writing-down allowance, and balancing charge calculations
- **Clients** — Client directory with outstanding balance and invoice history
- **Reports & export** — Profit & loss, VAT schedules, HMRC SA103 schedule, mileage summary; CSV and PDF export
- **Accountant package** — One-click export of all records, ledgers, and receipts into an organised folder for your accountant
- **Reminders** — Custom reminders and automatic HMRC deadline alerts (Self Assessment, VAT, payments on account)
- **PIN lock** — Optional app lock with configurable idle timeout
- **Multiple businesses** — Separate, isolated workspaces for different business identities
- **Automatic updates** — In-app update check with one-click install

---

## Installation

Download the latest installer from the [**Releases**](../../releases) page:

| File                             | Use                               |
| -------------------------------- | --------------------------------- |
| `SoleTrader_x.x.x_x64-setup.exe` | Recommended for most users        |
| `SoleTrader_x.x.x_x64_en-US.msi` | Managed or enterprise deployments |

**Requirements:** Windows 10 or later (64-bit).

When using the phone receipt capture feature, Windows may ask to allow the app through the firewall — allow access on private networks only.

---

## Building from source

You'll need [Node.js 20+](https://nodejs.org/) and [Rust stable](https://rustup.rs/).

```bash
# Clone the repo
git clone https://github.com/Jaydon1004/SoleTrader.git
cd SoleTrader

# Install JS dependencies
npm install

# Start the development build (hot-reload)
npm run tauri dev

# Build a production installer
npm run tauri build
```

The NSIS installer and MSI are written to `src-tauri/target/release/bundle/`.

### Running tests

```bash
# Frontend tests with coverage
npm run test:coverage

# Rust tests
cd src-tauri && cargo test
```

---

## HMRC tax rates

Income tax bands, NIC thresholds, and other HMRC rates are configured per tax year in **Settings → Tax Years**. The defaults shipped with this release reflect **April 2026** rates.

Each April when HMRC publishes updated rates, update the figures in Settings and save. Community contributions updating the defaults for new tax years are welcome.

---

## Releasing a new version

1. Update the `version` field in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml` to match (e.g. `1.0.1`).
2. Commit the changes: `git commit -am "chore: bump version to 1.0.1"`
3. Tag the commit: `git tag v1.0.1`
4. Push: `git push && git push --tags`

GitHub Actions builds the installers and creates a release automatically. The app notifies existing users that an update is available.

### First-time GitHub Actions setup

Before the release workflow can sign updates, add these two repository secrets in **Settings → Secrets and variables → Actions**:

| Secret                               | Value                                                           |
| ------------------------------------ | --------------------------------------------------------------- |
| `TAURI_SIGNING_PRIVATE_KEY`          | The private key printed when the signing key pair was generated |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Leave blank if no password was set                              |

Also replace `YOUR_USERNAME` in `src-tauri/tauri.conf.json` with your actual GitHub username so the auto-updater endpoint points at the right repository.

---

## Licence

[MIT](LICENSE)

The installer:

- installs for the current Windows user without requiring administrator access;
- creates Desktop and Start Menu shortcuts;
- adds SoleTrader to Windows Installed Apps for uninstallation;
- installs Microsoft WebView2 from Microsoft when it is not already available.

The MSI package is intended for managed or scripted deployment:

`src-tauri/target/release/bundle/msi/SoleTrader_1.0.0_x64_en-US.msi`

The unbundled executable at `src-tauri/target/release/sole-trader-app.exe` can be used for local testing, but the installer is the supported distribution method because it handles shortcuts, uninstallation, and WebView2.

Business databases and attachments are stored separately from the installed program under `%APPDATA%\com.jaydo.soletrader`. Back up each business from inside SoleTrader before moving computers or making major changes. Uninstalling the program does not serve as a business-data backup.

## Supported statement imports

Bank imports accept CSV, TSV, labelled plain-text statements, QIF, and OFX/QFX files. CSV and TSV files must contain a transaction date, description, and either a signed amount or separate money-in and money-out columns. QFX uses the OFX parser. Files with a `.dat` extension are accepted only when their content matches one of these formats.

PDF statements, scanned images, and arbitrary free-form documents are not supported for bank import. Export one of the formats above from the bank, and split statements into smaller date ranges if a file exceeds 10 MB or an import exceeds 2,000 new transactions. Imports are previewed and deduplicated before records are committed atomically.

## Build

Prerequisites are Node.js, npm, Rust, and the Windows Tauri build requirements.

```powershell
npm install
npm test
npm run tauri -- build
```

Fresh Windows installers are written under `src-tauri/target/release/bundle`.

For development:

```powershell
npm run tauri -- dev
```

## Release Requirements

Current local builds are unsigned and may trigger Microsoft Defender SmartScreen with an Unknown Publisher warning. Obtain an Authenticode code-signing certificate and sign the EXE and MSI before distributing broadly.

Automatic updates are disabled until a signed HTTPS update feed and Tauri updater public key are configured. Until then, upgrades must be delivered with a newer installer.

### Compliance boundaries

SoleTrader prepares VAT and Self Assessment figures locally but does not submit returns to HMRC. It does not connect directly to banks or provide open banking. Import statements using CSV, TSV, QIF, OFX, or QFX, review the results, and have unusual or final filings checked by an accountant. Protect the Windows device and keep verified backups because local database and backup files are not encrypted by the app.
