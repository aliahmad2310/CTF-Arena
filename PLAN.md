# Engineering Plan: CTF Arena Platform Audit, Admin Modal Unification, Lab Management, and User Experience Refinements

## 1. Executive Summary & Audit Findings

An end-to-end architectural audit of the CTF Arena codebase was conducted covering:
- Backend: FastAPI, Supabase PostgREST client, PostgreSQL schema definitions, and migration scripts.
- Frontend: Vanilla JavaScript, modular CSS design system, admin management interfaces, and competitor user flows.

### Key Audit Findings

1. **Root Cause of Custom Team Capacity Migration Error**:
   - In `backend/app/services/team_service.py` (`insert_team_compatible`), when a team insertion fails due to PostgREST error `PGRST204` (column `max_members` missing in the schema cache), the function checked `if requested_capacity != 4:` and raised a hard `RuntimeError`:
     `"This database has not been migrated for custom team capacity. Apply supabase/migrations/20261021_add_team_max_members.sql and reload the PostgREST schema cache."`
   - In `backend/app/routers/admin.py`, the payload default or admin form passed `max_members`. When the column was absent from Supabase, this threw a 409 error that halted team creation completely.
   - Solution: Implement a resilient fallback in `team_service.py` and `admin.py`. When `max_members` is missing, fallback smoothly to inserting the team without `max_members` so team creation always succeeds regardless of whether the migration SQL was applied. In addition, provide the exact idempotent SQL script so administrators who desire per-team capacity storage can execute it in the Supabase SQL editor.

2. **Modal Dialog Inconsistency**:
   - The "Edit Championship" popup uses a clean, integrated design (`.countdown-editor-backdrop` + `.card.countdown-editor-dialog` + `.card-body` containing an `<h2>` heading and bottom-right buttons) with no partitioned `.card-header` bar or borders.
   - The standard `showModal()` utility in `frontend/js/ui.js` used a partitioned structure (`.card-header`, `.card-body`, `.card-footer`), giving "Establish New Squad", "Create User Account", and deletion dialogs an inconsistent, clunky look.
   - Solution: Refactor `showModal()` in `frontend/js/ui.js` and update related CSS so that all modal dialogs share the exact clean presentation, typography, and button placement as "Edit Championship".

3. **User Directory Counter and Pagination Requirements**:
   - The top right of the Competitor Directory card currently displays `"Showing 1-7 of 7 accounts"`. The requirement is to display total accounts as `"4 accounts"` (or `"{total} accounts"`).
   - Fixed page size: exactly 6 accounts per page (`PAGE_SIZE = 6`).
   - Bottom pagination controls: display `"Page 1 of 3"` immediately to the left of the `Previous` button, followed by `Previous` and `Next` buttons.

4. **Admin Lab CRUD & Safe File Attachment Protocol**:
   - Remove the artificial URL query restriction in `frontend/js/admin/labs.js` (`manage=1` bounce).
   - Provide full CRUD on labs (create, edit, delete) with fields: `Title`, `Description`, and `File Attachment` (images, PDFs, or challenge archive files).
   - Strict Security Rule: Uploaded files must never execute on the server. Backend file upload endpoint validates file MIME types, sanitizes names, rejects executable extensions (`.py`, `.sh`, `.exe`, `.bat`, `.cmd`, `.ps1`, `.php`), saves as static objects, and serves them with static attachment headers (`Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`).

5. **Competitor User Account Experience**:
   - When a normal competitor logs in, redirect to `https://ctf-arena-frontend.vercel.app/` (or current web root `/`).
   - Remove the `Dashboard` button from the navbar for non-admin users in `frontend/js/layout.js`.
   - On the competitor Team Hub page (`frontend/team.html` and `frontend/js/pages/team.js`):
     - Credentials and teams are pre-assigned by the admin.
     - Strictly display: Team Position (Rank), Team Points (Score), Individual Person Points, Labs Solved, and Team Members roster.
     - Remove recruitment codes, invite code inputs, captain transfer/disband forms, and leave squad buttons.

---

## 2. Phased Implementation Plan

### Phase 1: Database Team Capacity Migration Fallback
- **Target Files**:
  - `backend/app/services/team_service.py`
  - `backend/app/routers/admin.py`
  - `backend/tests/test_admin_api_lists.py`
- **Actions**:
  - Update `insert_team_compatible()` in `team_service.py` so that if `max_members` column is missing, it logs a warning and inserts the record without `max_members` rather than raising a blocking `RuntimeError`.
  - Update capacity update endpoints in `backend/app/routers/admin.py` to handle missing column gracefully.
  - Update automated tests to verify smooth team insertion with or without the database column.

### Phase 2: Unify Admin Modal Dialogs with "Edit Championship" Design
- **Target Files**:
  - `frontend/js/ui.js`
  - `frontend/css/components.css`
  - `frontend/js/admin/teams.js`
  - `frontend/js/admin/users.js`
- **Actions**:
  - Refactor `showModal()` in `ui.js`:
    - Remove partitioned `.card-header` bar and separate `.card-footer`.
    - Place `<h2 id="modal-heading" style="font-size:var(--text-lg); margin:0 0 var(--space-4);">${title}</h2>` directly inside `.card-body`.
    - Place action buttons (Cancel and Confirm) inside `.card-body` with `display: flex; gap: var(--space-2); justify-content: flex-end; margin-top: var(--space-6);`.
  - Update dialog styling to match `.countdown-editor-dialog`: clean carbon card, subtle border glow, and smooth backdrop.
  - Ensure "Establish New Squad", "Create User Account", "Delete User Account", and "Disband Team/Squad" all use this unified popup style.

### Phase 3: Competitor Directory Pagination & Count Controls
- **Target Files**:
  - `frontend/admin/users.html`
  - `frontend/js/admin/users.js`
- **Actions**:
  - In `users.html`:
    - Add a header counter element `#users-total-count` inside the card header on the right.
    - Structure the bottom footer pagination layout with `#users-page-info` immediately to the left of `#users-prev` and `#users-next`.
  - In `users.js`:
    - Set `PAGE_SIZE = 6`.
    - In `renderPagination(total)`:
      - Update `#users-total-count` to display `"{total} accounts"` (e.g., `"4 accounts"`).
      - Update `#users-page-info` to display `"Page {currentPage} of {totalPages}"`.
      - Enable/disable `#users-prev` and `#users-next` properly based on the 6-per-page boundary.

### Phase 4: Admin Lab Authoring, Editing, Deletion & Secure File Handling
- **Target Files**:
  - `backend/app/routers/admin.py`
  - `frontend/js/admin/labs.js`
  - `frontend/admin/labs.html`
- **Actions**:
  - Remove URL bounce restriction in `labs.js` so `/admin/labs.html` loads cleanly.
  - In backend:
    - Add/verify `/api/admin/rooms` CRUD endpoints (Create, Read, Update, Delete).
    - Add safe static file attachment upload endpoint `/api/admin/labs/upload-attachment`:
      - Validates MIME type and extension (`.png`, `.jpg`, `.jpeg`, `.webp`, `.pdf`, `.txt`, `.zip`, `.tar.gz`, `.pcap`).
      - Strictly forbids executable files (`.py`, `.sh`, `.exe`, `.bat`, `.cmd`, `.ps1`, `.php`).
      - Saves file as a static non-executable object with a UUID filename.
      - Serves files with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`.
  - In frontend modal:
    - Create/Edit Lab modal includes Title, Description, Difficulty, Tags, Order, and File Attachment upload.
    - Delete Lab modal prompts with unified modal popup and removes lab room and associated items.

### Phase 5: Competitor Login Flow, Navbar Cleanup & Minimal Team Hub
- **Target Files**:
  - `frontend/js/pages/login.js`
  - `frontend/js/layout.js`
  - `frontend/team.html`
  - `frontend/js/pages/team.js`
- **Actions**:
  - In `login.js`: verify redirect sends non-admin users to `/` (`https://ctf-arena-frontend.vercel.app/`).
  - In `layout.js`: remove the `Dashboard` link for non-admin users; keep `Labs`, `Leaderboard`, and `Team`.
  - In `team.html` and `team.js`:
    - Strip out recruitment codes, invite code inputs, captain disband/transfer controls, and squad creation/join tabs.
    - Present a clean, focused scoreboard view displaying exclusively:
      1. Team Position (Rank)
      2. Team Points (Score)
      3. Individual Member Points
      4. Labs Solved
      5. Team Members Roster

---

## 3. Verification & Testing Strategy
- Run all backend pytest suites: `pytest backend/tests/` to verify zero regressions.
- Test team creation fallback when `max_members` is omitted or column is not in PostgREST cache.
- Test modal styling and responsiveness across all 4 admin popups.
- Test users directory pagination with `PAGE_SIZE = 6` and counter string format.
- Test safe lab file upload and verify execution prevention headers.
- Test competitor login redirect, navbar links, and simplified team hub view.
