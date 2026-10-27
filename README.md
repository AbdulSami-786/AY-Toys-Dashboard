# AY Toys — Wholesale Accounting

A QuickBooks Enterprise–style accounting and inventory dashboard for a toy wholesale business.
Built with **React + Vite**. Data is saved instantly in the browser and synced to **Google Sheets** through a Google Apps Script web app.

## Run it

```bash
npm install
npm run dev        # opens http://localhost:5173
npm run build      # production build in dist/
```

On first launch, click **Add Company**. Tick *Load sample toy-wholesale data* if you want demo customers, vendors, items, invoices and bills to try things out.

## Video walkthrough

A 13-minute captioned screen recording of every feature (English + Roman Urdu captions) is in [`recording/`](recording/):
`AY-Toys-Walkthrough.mp4` (chapters + subtitle track), `AY-Toys-Walkthrough.srt`, and the written step-by-step [`VIDEO-GUIDE.md`](recording/VIDEO-GUIDE.md).

## Features

| Area | What's included |
|---|---|
| **Multiple companies** | Add / edit / delete companies, quick-switch from the title bar. **Each company has its own theme color** (9 presets + custom color picker), light/dark mode and compact rows. |
| **Chart of Accounts** | Standard toy-wholesale chart (QuickBooks account types), account numbers, sub-accounts, opening balances, inactive accounts, registers, QuickReports |
| **Inventory** | Inventory Part / Non-inventory / Service / Other Charge / Discount items, SKU, barcode, category, U/M, reorder points, opening stock, **weighted-average costing**, on hand / on PO / on SO, low-stock alerts, quantity/value adjustments |
| **Customers** | Customer Center, price levels (Retail / Wholesale −10% / Distributor −15%), credit limits & warnings, statements, estimates → sales orders → invoices → payments → deposits, sales receipts, credit memos. **Receive Payments applies credits**: credit memos, earlier overpayments and journal credits (also on their own, with no cash); a payment for exactly one invoice's amount goes to that invoice first |
| **Vendors** | Vendor Center, purchase orders → receive items & enter bill, bills (expense + item tabs), bill credits, pay bills, write checks. **Pay Bills uses vendor credits** (bill credits, overpayments) so only the rest is paid in cash |
| **Banking** | Make deposits (undeposited funds), transfers, registers with running balance |
| **Reports (50+)** | P&L (standard, detail, by month, prior-year comparison), Income by Customer Summary & Detail (net income per customer = income − cost of goods sold), Balance Sheet (standard, detail, comparison), Trial Balance, General Ledger, Journal, A/R & A/P aging, Customer & Vendor Balance Summary/Detail, Open Invoices, Collections, Unpaid Bills, Sales by Customer/Item/Rep, Purchases, Inventory Valuation, Stock Status, Physical Inventory Worksheet, Sales Tax, Audit Trail, list reports. **Double-click any number to QuickZoom.** Print, export to Excel (CSV), memorize. |
| **Form templates** | QuickBooks-style **Lists › Templates**: as many designs per form as you like (invoice, sales receipt, credit memo, estimate, sales order, bill, purchase order, check/voucher, bill credit, payment receipt, bill payment). **Basic Customization** (logo, company info, title, font, colours, table style, paper A4/Letter/Legal/A5/80 mm roll, margins, amount in words), **Customize Data Layout** (Screen / Print / Title for every header field, column and footer field, column order & widths, footer text, signature lines) and a drag-and-drop **Layout Designer** for the data boxes. Pick the template on each form, set a default per form, Print Preview with any template. |
| **Shared party ledgers** | Give any customer or vendor a private link + password to a **view-only** copy of their ledger: every invoice / bill, payment and credit with line items, running balance, overdue status, date filter, print / PDF. Works on any phone. They can't edit or delete anything, and they only ever see their own account. |
| **Productivity** | Multi-window tabs, **customizable icon bar** (View › Customize Shortcuts, or the gear under the icon bar: add any window or report, rename, pick icons, reorder, section headings; right-click a window tab › Add to Shortcuts — saved with the company), QuickBooks keyboard shortcuts, type-ahead lists with `<Add New>`, **Quick Add** (type a new customer or vendor name on any form and press Tab: Quick Add saves just the name, Set Up opens the full form), calculator in amount fields, memorized transactions, Find, transaction history & journal, void/delete/copy, previous/next arrows, printable invoices/bills/receipts, CSV import/export, backup & restore |

## Users & logins (Super Admin)

The first time AY Toys starts it asks to **create the Super Admin** (name, number, email, username, password). After
that everyone logs in with a username and password.

**Company › Users & Permissions…** (Super Admin only — also in the user button at the top right):

- add a user: **name, number, email, username, password**, notes, **Active** on/off;
- **Super Admin** (everything) or **Staff**: for staff tick the **pages** they may open — every window and report,
  grouped like the menus, with presets *Everything / Sales counter / Purchases & stock / Accountant* — the **shops**
  they may open, and whether they may **delete and void** transactions, customers, vendors and items;
- set a new password for someone who forgot theirs; switch a user off; delete a user;
- choose after how many minutes without use the screen **locks** (the open windows stay; the password unlocks it).

For a staff user, pages that are not ticked disappear from the menus, the left bar, the Home page and the Report
Center, and their keyboard shortcuts and links (also from inside reports) say "You don't have access". Shop figures
and the All Shops tabs on the start screen are a page too. Everyone may change their own password, lock the screen
and log out. The last active Super Admin cannot be switched off or turned into staff.

Users are stored in the Google Sheet tab **SYSTEM | Users** (passwords only as PBKDF2 hashes, 120,000 rounds), so
every computer has the same users, and on each computer too, so logging in works offline. A new computer must be
online once to download the users before anyone can log in. Forgot a password (even the Super Admin's)? In the
Google Sheet use **AY Toys › Reset a user's password…**: type the username and a temporary password; the user logs in
with it and must choose a new password straight away. The **Start Here** tab lists the users (never the passwords),
and the **SYSTEM | Users** tab is hidden.

This controls what each person can do **in AY Toys**. It does not protect against someone with full access to the
Windows account or the Google Sheet itself — keep those to the owner. In the installed program the developer tools
are switched off.

## Desktop program for Windows (installer)

`npm run release` builds, in `release/` (nothing else is left there):

- **AY Toys Setup 1.12.1.exe** — installer: choose the folder, Start-menu and desktop shortcut, uninstall from
  Windows Settings › Apps. Installs for the current user (no admin rights).
- **AY Toys 1.12.1 Portable.exe** — the same program as one file, runs without installing.
- **AY Toys 1.12.1.zip** — both files in one zip, to send to another computer.

Change `version` in `package.json` for every new release, so the file names show it is new.

The program (Electron, `electron/main.cjs`) shows the app in its own window from a private `app://` address, so it
starts without internet; the books are kept in the program's own storage and sync with the Google Sheet exactly as
described below (offline queue, automatic upload/download). Only one copy runs at a time, links to other sites open in
the normal browser, and the window remembers its size. The small settings store is written to disk every 1.5 s, so a
crash or power cut cannot lose the list of changes still waiting to upload. `npm run app` runs it without packaging.

The installer is not code-signed, so Windows SmartScreen may say "Windows protected your PC" the first time:
**More info › Run anyway**. (A code-signing certificate removes that message.) Updating: run a newer Setup over the
old one — the books stay.

## Works without internet

The installed program (above) works with or without internet:

- Everything is saved on the computer first, so the software works fully **offline**. The top bar then says
  **Offline · N waiting**.
- When the internet comes back the waiting changes **upload by themselves**, and changes from other computers
  **download by themselves** (on opening, when the connection returns, every 5 minutes, and when you come back to the
  window) — nothing to click. Typing while a download runs is never lost.
- A hosted copy of the app (any web server) works the same: after the first visit it keeps a copy of itself
  (`public/sw.js`) and opens without internet, and it can be installed as an app from the browser.

## Shops screen (start)

With more than one shop, AY Toys starts on the **shops screen** once per browser session (the shop switcher in the
title bar, `Ctrl+O`, opens it any time). It has three tabs:

- **Shops** — a card per shop with **Sales**, **Expenses**, **Net profit** and **Cash in hand** for Today / This Month /
  This Year / All Time, and *Open shop*. Cash in hand = the cash account(s) plus payments received but not yet
  deposited. A shop whose books are not on this computer yet shows the figures it last sent to the Google Sheet.
- **All Shops Summary** — totals of all shops and a table per shop: sales, cost of goods sold, gross and net profit,
  cash, bank, receivables, payables and stock value, with a Total column.
- **All Shops Reports** — Profit & Loss, Balance Sheet and Sales by Month with a column per shop and a Total
  (accounts with the same name are added together).

All figures come from the same ledger engine as the shop's own reports, so they always agree.

## On a phone

The whole app works on a phone: the shortcut bar becomes a slide-out menu (☰ in the title bar), forms are one column
with big Save buttons at the bottom, dialogs come up from the bottom, and text fields are 16 px so iPhones don't zoom.
The shops screen and the shared party-ledger page are built for phones first (sticky tabs and filters, large tap
targets, a document opens as a sheet that the phone's Back button closes).

## Invoice & bill designs (templates)

Open **Lists › Templates** (or the **Formatting** tab on any invoice, bill, receipt or voucher):

- **New Template** → pick the form and a design to start from. **Duplicate**, **Make Default**, **Delete** (built-in designs can only be *Reset*).
- **Basic Customization** — logo (upload once in Company Information or here), which company details print, form title, font & size, colour, table header/lines, paper size, orientation, margins, footer at page bottom, PAID/VOID stamp, amount-in-words wording (Lakh/Crore or Million).
- **Customize Data Layout** — like QuickBooks' *Additional Customization*: tick **Screen** to show a field on the entry form, **Print** to put its box on paper, and type a **Title** to rename it (the new name is used on screen too). Columns can be reordered and resized; footer text and signature lines are added here.
- **Layout Designer** — drag any box to move it, drag the handles to resize, arrow keys nudge (Shift = 5 mm), Del removes, Ctrl+D duplicates, Ctrl+Z / Ctrl+Y undo/redo. Add text boxes, logo, signature lines, lines and frames; change font, alignment, colours and borders per box; drag the band handles to make the header or footer taller.
- On a form, choose the design in the **Template** drop-down (top right); **Preview** shows the page with any template before printing.

Templates are saved with the company (and sync to the `Companies` tab of the Google Sheet), so every computer uses the same designs.

## Keyboard shortcuts (same as QuickBooks)

`Ctrl+I` invoice · `Ctrl+A` chart of accounts · `Ctrl+J` customer center · `Ctrl+R` register · `Ctrl+F` find · `Ctrl+L` item list ·
`Ctrl+Q` QuickReport · `Ctrl+E` edit · `Ctrl+D` delete · `Ctrl+M` memorize · `Ctrl+H` history · `Ctrl+Y` journal · `Ctrl+P` print ·
`Alt+S` save & new · `Alt+A` save & close · `Alt+P` / `Alt+N` previous / next · `Ctrl+Ins` / `Ctrl+Del` insert / delete line · `Esc` close ·
date keys `+ - T W K M H Y R [ ] ; '` · menus `Alt+F/E/V/L/C/U/O/B/R/W/H`.

Browsers reserve `Ctrl+W`, `Ctrl+T` and `Ctrl+N`, so use **Alt+K** (Write Checks), **Alt+T** (Memorized list) and **Insert** (new) instead.
Press **F1** in the app for the full list (it includes extra `Alt+Shift+…` keys for bills, pay bills, receive payments, etc.).

## Google Sheet (one sheet for everything, set in the code)

All companies live in **one Google Sheet**. Its address is written into the app, so every computer that opens AY Toys
connects to it by itself — nothing to paste, no keys to copy between computers.

**One-time setup (about 5 minutes):**

1. Create a Google Sheet, e.g. **AY Toys Database**.
2. **Extensions › Apps Script**: delete the sample code, paste all of [`apps-script/Code.gs`](apps-script/Code.gs) and click **Save**.
3. In the toolbar choose the function **`setup`** and click **Run**, then allow the permissions. It creates every tab
   and adds a **Start Here** tab (status, companies, help). After reloading the sheet there is also an **AY Toys** menu:
   *Set up / repair this sheet*, *Refresh status*.
4. **Deploy › New deployment** → type **Web app** → *Execute as*: **Me** → *Who has access*: **Anyone** → Deploy.
5. Copy `src/config.example.js` to `src/config.js`. Copy the Web app URL (it ends with `/exec`) and paste it into it:
   ```js
   export const SHEET_URL = 'https://script.google.com/macros/s/AKfy…/exec';
   ```
6. Build and deploy the app again (`npm run build`). Done — open it on any computer.

What happens then:

- The **Reports** tab (second tab) shows Profit & Loss, Balance Sheet, aging, sales, purchases and stock reports of
  every shop, with a clickable contents list. The app builds them with its own report engine and sends them about
  20 seconds after you stop making changes (or *Company › Google Sheets Sync › Update now*).
- The tabs grow by themselves (a new tab has only 1,000 rows and 26 columns), have their columns in a fixed order, and
  show a warning before anyone edits them by hand — make changes in the app, which overwrites these tabs.
- A new computer lists the companies from the sheet when the app starts; if there is only one, it opens straight into it
  and downloads the books.
- Each company has its own tabs (`<CODE> | Transactions`, `<CODE> | Items`, …) plus the shared `Companies` tab.
- Company settings (theme, templates, shortcuts, company information) follow **the most recent change** from any computer.
- Each computer keeps the books in the browser's own database (IndexedDB — room for hundreds of thousands of
  transactions; older copies kept in the small localStorage area move over automatically). If saving there ever
  fails, a red banner says so — the app never shows "saved" for something it couldn't keep.
- Only **one browser tab** works on the books at a time; a second tab says so and offers *Use this tab instead*
  (the first tab then stops), so two tabs can never overwrite each other.
- The upload queue keeps references, not copies; a record the sheet refuses is set aside (listed in Google Sheets
  Sync with *Try again*) instead of blocking everything else, and values too long for one cell are split over extra
  columns by the script.
- Every change is saved on the computer first, so the app stays fast and works offline; changes upload in the
  background and retry automatically. **Company › Google Sheets Sync** shows the status and has *Sync now* / *Upload all*.

**Keep `src/config.js` private**: it is listed in `.gitignore` and must never be committed or published (the repository
may be public — only `src/config.example.js` belongs in it). The Web app URL is the only address of the books: anyone who has
it can read or change them and read the users' password hashes, and a shared ledger link shows that URL. Never commit the
client's data files either (`old data/` is ignored). The URL is inside every copy of the app, so give the program only to people
who may open the books. If the URL ever leaks, make a **new deployment** (new URL) and put it in `src/config.js`.

**Changing things later**

- Edited `Code.gs`? Paste it, **Save**, run **`setup`** once (it never deletes data), then use **Deploy › Manage
  deployments › Edit › Version: New version** so the URL stays the same. (A *new deployment* gets a new URL, which then
  has to go into `src/config.js` again.)
- Made a mistake in the sheet? **File › Version history** brings back an earlier copy.
- Upgrading from the version with an owner key: paste the new `Code.gs`, Save, run `setup` (it removes the old key) and use
  **Deploy › Manage deployments › Edit › Version: New version**. Until then the app says the Apps Script code is out of date.
- No URL in `src/config.js` yet? The app runs on each computer only and says so on the company screen; everything
  uploads the first time it connects.
- Testing against another sheet: `VITE_SHEET_URL=https://…/exec npm run dev` overrides the URL for that run only.

## Share a party ledger (view-only link)

1. Set up the Google Sheet (above). The shared page is served by the sheet's Apps Script, so it works even if AY Toys only runs on your computer.
2. **Customer Center** or **Vendor Center** → select the party → **Share Ledger** (toolbar, balance box, right-click, or `Ctrl+Shift+L`).
3. Keep the random password or type your own → **Create share link**.
4. **Send on WhatsApp** or **Copy link & password**, and send it to the party.

The party opens the link, types the password and sees:

- their balance (due / payable / advance), overdue amount and number of unpaid invoices or bills;
- the ledger: every invoice / bill, payment, credit memo and adjustment, with debit, credit and running balance;
- filters (invoices / bills, payments, credits, unpaid, orders), date range with opening balance, and search;
- each document in full (items, quantities, rates, tax, totals, the payments applied to it) and **Print / PDF** for the statement or any document.

The page has no edit or delete controls, and the script has no way to change anything from it. Sharing publishes a copy
of just that party's ledger to a hidden `Shared Ledgers` tab. The copy updates by itself a few seconds after you change
anything, and it never includes other parties, item costs or your chart of accounts. The password is stored only as a salted
hash. Eight wrong passwords lock the link for 15 minutes.

In the same dialog you can **change the password** (the old one stops working), make a **New link** (the old link stops
working) or **Stop sharing**. A small share icon marks shared parties in the list.

**Updating from an older version:** paste the new `apps-script/Code.gs` over the old code, **Save**, run **`setup`**,
then **Deploy › Manage deployments › Edit › Version: New version › Deploy**. The URL stays the same.

## Project layout

```
src/config.js              the one Google Sheet (Web App URL) (private, not in git; see config.example.js)
apps-script/Code.gs        Google Apps Script backend (paste into your sheet)
src/lib/ledger.js          double-entry posting engine (journal lines, avg-cost inventory, open balances)
src/lib/reports.js         all report builders
src/lib/commands.js        menus, global shortcuts, shortcut reference
src/store/store.jsx        state, persistence, Google Sheets sync queue
src/store/windows.jsx      multi-window manager + per-window shortcut handlers
src/lib/templates.js       form templates: fields, default layouts, document data for printing
src/lib/share.js           shared party ledgers: snapshot builder, links, passwords
src/windows/templates/     Templates list, template editor and Layout Designer
src/windows/…              Home, centers, lists, transaction forms, reports
```
