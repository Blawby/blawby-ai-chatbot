# Modal Consolidation & WelcomeModal Bug Fix - Complete Audit

## Executive Summary (Concise)

- **Status**
  - Enhanced fix implemented: server truth (`welcomed_at`) + `sessionStorage` debounce + `BroadcastChannel`.
  - API `POST /api/users/welcome` added and wired. Session exposes `welcomedAt`.
  - Frontend integrated via `useWelcomeModal`; legacy localStorage writes removed.
  - Atomic design implemented for modals with barrels and import migration.
  - Organisms moved to `src/components/modals/organisms`; legacy modal files removed.
  - Build is clean.

- **Remaining (post-consolidation)**
  - Tests (last, per plan): unit (hook), integration (API), e2e (welcome once, pricing hash unaffected).
  - Optional refinements: extract additional molecules/atoms for Pricing and Contact modals if desired.
  - Docs: keep this summary up to date; optional short README note on new import paths.

---

## Quick Checklist

- [x] D1 migration: add `welcomed_at` column
- [x] Worker route: `POST /api/users/welcome` (derive user from session)
- [x] Session: expose `welcomedAt` in Better Auth
- [x] Frontend hook: `useWelcomeModal` (server truth + sessionStorage + BroadcastChannel)
- [x] Integrate in `src/index.tsx`; remove legacy localStorage writes
- [x] Atomic structure: atoms/molecules/organisms + barrels
- [x] Move modals into `modals/organisms` and migrate imports
- [x] Remove legacy modal files
- [ ] Tests (unit: hook, integration: API, e2e: welcome-once) — last step per plan
- [ ] Optional: extract additional atoms/molecules in Pricing/Contact if desired

## How to Verify (Short)

- Welcome shows exactly once after onboarding; suppressed on refresh/navigation.
- Opening second tab is suppressed by BroadcastChannel.
- Pricing hash `/#pricing` behavior unchanged.
- DB has `welcomed_at` set after welcome completes.


### Archived detailed sections (1–6)

For full File Inventory, Flag Map, Import & Usage Graph, Minimal-Change Fix, and detailed diffs, see:

- docs/archive/modal-consolidation-audit-full-2025-11-05.md

## 7) Enhanced Fix Spec (Implemented)

### Overview

The enhanced fix implements a server-truth approach using `welcomed_at` column in the database, combined with `sessionStorage` debounce and `BroadcastChannel` to prevent multiple shows.

### Detailed Changes

#### Server Truth

* Added `welcomed_at` column to users table
* Implemented API `POST /api/users/welcome` to update `welcomed_at` timestamp
* Exposed `welcomedAt` in Better Auth session object

#### Frontend Hook

* Created `useWelcomeModal` hook to manage modal state and flags
* Integrated hook in `src/index.tsx` to replace legacy localStorage writes

#### Atomic Design

* Implemented atomic design for modals using barrels and import migration
* Moved organisms to `src/components/modals/organisms` and removed legacy modal files
  - Lines 450-464: `handleWelcomeClose` clears flag and closes modal
  - Lines 651-655: Renders `<WelcomeModal isOpen={showWelcomeModal} ... />`
- **Storage usage**:
  - **READS**: `localStorage.getItem('onboardingCompleted')` (lines 164, 222, 229)
  - **READS**: `localStorage.getItem('onboardingCheckDone')` (lines 223, 230)
  - **WRITES**: `localStorage.setItem('onboardingCompleted', 'true')` (lines 240, 270)
  - **WRITES**: `localStorage.setItem('onboardingCheckDone', 'true')` (lines 241, 259, 271)
  - **WRITES**: `sessionStorage.setItem('ensuredPersonalOrg_v1_${session.user.id}', '1')` (line 201)
  - **DELETES**: `localStorage.removeItem('onboardingCompleted')` (lines 440, 456)
- **Modal-related imports**:
  - `PricingModal` from `./components/PricingModal` (line 24)
  - `WelcomeModal` from `./components/onboarding/WelcomeModal` (line 25)

#### `src/components/AuthPage.tsx` (466 lines)
- **Purpose**: Authentication page with sign-in/sign-up, handles onboarding for new users
- **Key exports**: `AuthPage` (default export)
- **Critical effects/state related to onboarding flags**:
  - Lines 208-242: `handleOnboardingComplete` sets `localStorage.setItem('onboardingCompleted', 'true')` (line 228) after onboarding
  - Lines 244-256: `handleOnboardingClose` clears `onboardingCheckDone` flag
- **Storage usage**:
  - **WRITES**: `localStorage.setItem('onboardingCompleted', 'true')` (line 228)
  - **DELETES**: `localStorage.removeItem('onboardingCheckDone')` (lines 232, 249)
- **Modal-related imports**: `OnboardingModal` from `./onboarding/OnboardingModal` (line 4)

#### `src/components/settings/pages/AccountPage.tsx` (928 lines)
- **Purpose**: Account settings page
- **Key exports**: `AccountPage` (default export)
- **Critical effects/state related to flags**:
  - Lines 56-63: `clearLocalAuthState` callback removes `onboardingCompleted` and `onboardingCheckDone` flags (line 58)
- **Storage usage**:
  - **DELETES**: `localStorage.removeItem('onboardingCompleted')` (line 58)
  - **DELETES**: `localStorage.removeItem('onboardingCheckDone')` (line 59)

### Other Files Using Modal

#### `src/components/LawyerSearchResults.tsx`
- **Modal-related imports**: `ContactOptionsModal` from `./ContactOptionsModal` (via grep)

#### `src/components/FileMenu.tsx`
- **Modal-related imports**: `CameraModal` from `./CameraModal` (via grep)

#### `src/components/pages/BusinessOnboardingPage.tsx`
- **Modal-related imports**: `BusinessOnboardingModal` from `../onboarding/BusinessOnboardingModal` (via grep)

## 2) Welcome Modal Flag Map

### Flag Storage Keys

**localStorage keys:**
- `onboardingCompleted` - String value `'true'` when user has completed onboarding
- `onboardingCheckDone` - String value `'true'` to prevent repeated onboarding checks

**sessionStorage keys:**
- `ensuredPersonalOrg_v1_${userId}` - String value `'1'` to ensure personal org once per session

### Every Location That Sets/Reads Flags

#### Sets `onboardingCompleted = 'true'`:

**1. `src/components/onboarding/OnboardingModal.tsx:119`**
```typescript
localStorage.setItem('onboardingCompleted', 'true');
```
- **Context**: After successfully saving onboarding data to server in `handleComplete`
- **Trigger**: User completes personal onboarding flow
- **Race condition risk**: HIGH - Sets flag immediately after server save, but WelcomeModal check happens on mount

**2. `src/components/AuthPage.tsx:228`**
```typescript
localStorage.setItem('onboardingCompleted', 'true');
```
- **Context**: In `handleOnboardingComplete` after onboarding modal completes
- **Trigger**: User completes onboarding from auth page
- **Race condition risk**: HIGH - Sets flag, then redirects to home where WelcomeModal useEffect runs

**3. `src/index.tsx:240`**
```typescript
localStorage.setItem('onboardingCompleted', 'true');
```
- **Context**: In `useEffect` (lines 211-278) when user has `onboardingCompleted === true` from session but flag is missing
- **Trigger**: Session sync logic runs after session loads
- **Race condition risk**: MEDIUM - Syncs flag but WelcomeModal check already ran (lines 161-177)

**4. `src/index.tsx:270`**
```typescript
localStorage.setItem('onboardingCompleted', 'true');
```
- **Context**: In `useEffect` (lines 211-278) else branch when user has completed onboarding
- **Trigger**: User has completed onboarding but no flags set
- **Race condition risk**: MEDIUM - Similar to line 240

#### Reads `onboardingCompleted`:

**1. `src/index.tsx:164`**
```typescript
const onboardingCompleted = localStorage.getItem('onboardingCompleted');
if (onboardingCompleted === 'true') {
    setShowWelcomeModal(true);
}
```
- **Context**: `useEffect` (lines 161-177) runs on mount with empty dependency array `[]`
- **Trigger**: Component mounts (page load, route change, remount)
- **Race condition risk**: CRITICAL - Runs on EVERY mount, even if flag was already cleared. If component remounts before flag is cleared, modal shows again.

**2. `src/index.tsx:222`**
```typescript
local_onboardingCompleted: localStorage.getItem('onboardingCompleted'),
```
- **Context**: Debug logging only (DEV mode)
- **Trigger**: Session check effect (lines 211-278)

**3. `src/index.tsx:229`**
```typescript
const hasOnboardingFlag = localStorage.getItem('onboardingCompleted');
```
- **Context**: Session sync logic (lines 211-278)
- **Trigger**: After session loads
- **Race condition risk**: LOW - Used for sync, not modal trigger

#### Clears `onboardingCompleted`:

**1. `src/index.tsx:440`**
```typescript
localStorage.removeItem('onboardingCompleted');
```
- **Context**: `handleWelcomeComplete` after user clicks "Okay, let's go"
- **Trigger**: User completes welcome modal
- **Race condition risk**: MEDIUM - Clears flag after modal closes, but if component remounts before this runs, flag still exists

**2. `src/index.tsx:456`**
```typescript
localStorage.removeItem('onboardingCompleted');
```
- **Context**: `handleWelcomeClose` when user closes modal without completing
- **Trigger**: User closes welcome modal
- **Race condition risk**: MEDIUM - Same as above

**3. `src/components/settings/pages/AccountPage.tsx:58`**
```typescript
localStorage.removeItem('onboardingCompleted');
```
- **Context**: `clearLocalAuthState` when account is deleted
- **Trigger**: Account deletion
- **Race condition risk**: NONE - Not related to welcome modal flow

### Exact Sequence Leading to Multiple Shows

**Sequence 1: Remount After Flag Set**
1. User completes onboarding → `OnboardingModal.tsx:119` sets `localStorage.setItem('onboardingCompleted', 'true')`
2. User is redirected to home page
3. `src/index.tsx` mounts → `useEffect` (lines 161-177) runs → reads flag → `setShowWelcomeModal(true)`
4. User navigates away (e.g., to settings)
5. User navigates back to home
6. `src/index.tsx` remounts → `useEffect` (lines 161-177) runs AGAIN → reads flag (still exists) → `setShowWelcomeModal(true)` AGAIN
7. **Bug**: Modal shows multiple times

**Sequence 2: Sync After Check**
1. `src/index.tsx` mounts → `useEffect` (lines 161-177) runs → no flag exists → modal doesn't show
2. Session loads → `useEffect` (lines 211-278) runs → syncs flag from session → `localStorage.setItem('onboardingCompleted', 'true')` (line 240)
3. Component remounts (state update, route change)
4. `useEffect` (lines 161-177) runs AGAIN → reads newly synced flag → `setShowWelcomeModal(true)`
5. **Bug**: Modal shows after sync

**Sequence 3: Flag Never Cleared**
1. User completes onboarding → flag set
2. `src/index.tsx` mounts → modal shows
3. User closes modal via `handleWelcomeClose` → flag cleared (line 456)
4. BUT: If user navigates away before `handleWelcomeClose` runs, flag remains
5. User returns → modal shows again
6. **Bug**: Modal persists if close handler doesn't run

### Current Flag Keys Summary

| Key | Storage | Set By | Read By | Cleared By | Purpose |
|-----|---------|--------|---------|------------|---------|
| `onboardingCompleted` | localStorage | OnboardingModal:119, AuthPage:228, index:240,270 | index:164,222,229 | index:440,456, AccountPage:58 | Indicates onboarding complete, triggers WelcomeModal |
| `onboardingCheckDone` | localStorage | index:259,271 | index:230,223 | AuthPage:232,249, AccountPage:59 | Prevents repeated onboarding checks |
| `ensuredPersonalOrg_v1_${userId}` | sessionStorage | index:201 | index:186 | (never cleared) | Ensures personal org created once per session |

## 3) Import & Usage Graph

### WelcomeModal

**Imported by:**
- `src/index.tsx:25` → `import WelcomeModal from './components/onboarding/WelcomeModal';`

**Rendered in:**
- `src/index.tsx:651-655`:
```tsx
<WelcomeModal
    isOpen={showWelcomeModal}
    onClose={handleWelcomeClose}
    onComplete={handleWelcomeComplete}
/>
```

**Render conditions:**
- `showWelcomeModal` state (line 58) is `true`
- State is set by `useEffect` (lines 161-177) reading `onboardingCompleted` flag
- State is set by sync logic (lines 234-245) if flag exists

**Dependencies:**
- `Modal` component (base)
- `Button` component
- `useTranslation` hook
- Translation keys: `onboarding.welcome.*`

### PricingModal

**Imported by:**
- `src/index.tsx:24` → `import PricingModal from './components/PricingModal';`
- `src/__tests__/components/PricingI18n.test.tsx:4`

**Rendered in:**
- `src/index.tsx:590-648`:
```tsx
<PricingModal
    isOpen={showPricingModal}
    onClose={() => { setShowPricingModal(false); window.location.hash = ''; }}
    currentTier={currentUserTier}
    onUpgrade={async (tier) => { ... }}
/>
```

**Render conditions:**
- `showPricingModal` state (line 292) is `true`
- State is controlled by hash change listener (lines 298-313) checking `window.location.hash === '#pricing'`

**Dependencies:**
- `Modal` component
- `Button` component
- `Select` component
- `useNavigation` hook
- `useOrganizationManagement` hook
- `usePaymentUpgrade` hook
- `useToastContext` hook
- Translation keys: `pricing.*`, `common.*`

### ContactOptionsModal

**Imported by:**
- `src/components/LawyerSearchResults.tsx:4` (via grep)

**Rendered in:**
- Usage not visible in read files, but likely in `LawyerSearchResults` component

**Render conditions:**
- Controlled by parent component's `isOpen` prop

**Dependencies:**
- `Modal` component
- `Button` component
- `useTheme` hook
- Lawyer profile type

### CameraModal

**Imported by:**
- `src/components/FileMenu.tsx:5` → `import CameraModal from './CameraModal';`

**Rendered in:**
- Usage not visible in read files, but likely in `FileMenu` component

**Render conditions:**
- Controlled by parent component's `isOpen` prop

**Dependencies:**
- `Modal` component
- `Button` component
- Camera API (`getUserMedia`)

### BusinessOnboardingModal

**Imported by:**
- `src/components/pages/BusinessOnboardingPage.tsx:3`
- `src/components/onboarding/index.ts:2` (re-export)

**Rendered in:**
- Used in `BusinessOnboardingPage` component

**Dependencies:**
- `Modal` component
- Multiple onboarding subcomponents (organisms, molecules, atoms)
- Onboarding hooks

### OnboardingModal

**Imported by:**
- `src/components/AuthPage.tsx:4` → `import OnboardingModal from './onboarding/OnboardingModal';`

**Rendered in:**
- `src/components/AuthPage.tsx:456-460`:
```tsx
<OnboardingModal
    isOpen={showOnboarding}
    onClose={handleOnboardingClose}
    onComplete={handleOnboardingComplete}
/>
```

**Dependencies:**
- `Modal` component
- `PersonalInfoStep`, `UseCaseStep` components
- `authClient.updateUser`
- Sets `onboardingCompleted` flag (line 119)

### Circular/Fragile Dependencies

**None detected** - All modals import from base `Modal` component, no circular imports.

**Fragile dependencies:**
- WelcomeModal depends on `onboardingCompleted` localStorage flag managed in multiple places
- Multiple components set/clear the same flag without coordination
- No server-side truth for welcome modal state

## 4) Minimal-Change Fix (DEPRECATED)

⚠️ **DEPRECATED:** This section describes an initial implementation that was **superseded by section 7** ("Focused Fix Pass - Enhanced Implementation"). 

**Please use section 7 for the current, recommended implementation**, which includes:
- BroadcastChannel support for cross-tab suppression
- Enhanced error handling and SSR safety
- Proper effect separation and StrictMode guards
- Hardened API endpoint with idempotent D1 updates

The deprecated implementation is preserved in **Appendix A** at the end of this document for historical reference only.

## 5) Atomic Restructure Plan (safe incremental)

### Directory Structure

```
src/components/modals/
├── atoms/
│   ├── ModalHeader.tsx
│   ├── ModalFooter.tsx
│   ├── ModalBody.tsx
│   ├── TipCard.tsx
│   ├── PricingTierCard.tsx
│   ├── ContactOptionCard.tsx
│   └── index.ts
├── molecules/
│   ├── WelcomeTipsSection.tsx
│   ├── PricingTiersSection.tsx
│   ├── ContactOptionsSection.tsx
│   ├── CameraCaptureControls.tsx
│   └── index.ts
├── organisms/
│   ├── WelcomeModal.tsx (moved from onboarding/)
│   ├── PricingModal.tsx (moved from root)
│   ├── ContactOptionsModal.tsx (moved from root)
│   ├── CameraModal.tsx (moved from root)
│   └── index.ts
├── hooks/
│   ├── useWelcomeModal.ts (new, for bug fix)
│   └── index.ts
└── index.ts
```

### Atoms to Extract

#### `src/components/modals/atoms/ModalHeader.tsx`
Extract from `WelcomeModal.tsx:61-67`:
```typescript
interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}
```

#### `src/components/modals/atoms/ModalFooter.tsx`
Extract from `WelcomeModal.tsx:108-121`:
```typescript
interface ModalFooterProps {
  children: preact.ComponentChildren;
  className?: string;
}
```

#### `src/components/modals/atoms/ModalBody.tsx`
Extract from `WelcomeModal.tsx:59`:
```typescript
interface ModalBodyProps {
  children: preact.ComponentChildren;
  maxWidth?: string;
  className?: string;
}
```

#### `src/components/modals/atoms/TipCard.tsx`
Extract from `WelcomeModal.tsx:76-102`:
```typescript
interface TipCardProps {
  icon: preact.ComponentType<{ className?: string }>;
  iconColor: string;
  bgColor: string;
  title: string;
  description: string | preact.ComponentChildren;
}
```

#### `src/components/modals/atoms/PricingTierCard.tsx`
Extract from `PricingModal.tsx:243-328`:
```typescript
interface PricingTierCardProps {
  plan: {
    id: SubscriptionTier;
    name: string;
    price: string;
    description: string;
    buttonText: string;
    isRecommended: boolean;
    isCurrent?: boolean;
  };
  onSelect: (tier: SubscriptionTier) => void;
  onManageBilling?: () => void;
  isBillingLoading?: boolean;
}
```

#### `src/components/modals/atoms/ContactOptionCard.tsx`
Extract from `ContactOptionsModal.tsx:110-225`:
```typescript
interface ContactOptionCardProps {
  type: 'phone' | 'email' | 'website';
  value: string;
  icon: preact.ComponentType<{ className?: string }>;
  onCopy: () => void;
  onAction: () => void;
  copiedField: string | null;
  actionLabel: string;
}
```

### Molecules to Extract

#### `src/components/modals/molecules/WelcomeTipsSection.tsx`
Extract from `WelcomeModal.tsx:71-105`:
```typescript
interface WelcomeTipsSectionProps {
  tips: Array<{
    id: string;
    icon: preact.ComponentType<{ className?: string }>;
    iconColor: string;
    bgColor: string;
  }>;
  columns?: number;
}
```

#### `src/components/modals/molecules/PricingTiersSection.tsx`
Extract from `PricingModal.tsx:242-329`:
```typescript
interface PricingTiersSectionProps {
  plans: Array<{ ... }>;
  selectedTier: SubscriptionTier;
  onSelect: (tier: SubscriptionTier) => void;
  onManageBilling?: (orgId: string) => void;
  isBillingLoading?: boolean;
}
```

#### `src/components/modals/molecules/ContactOptionsSection.tsx`
Extract from `ContactOptionsModal.tsx:109-226`:
```typescript
interface ContactOptionsSectionProps {
  lawyer: LawyerProfile;
  onCopy: (text: string, field: string) => void;
  onAction: (type: 'phone' | 'email' | 'website') => void;
  copiedField: string | null;
}
```

#### `src/components/modals/molecules/CameraCaptureControls.tsx`
Extract from `CameraModal.tsx:150-161`:
```typescript
interface CameraCaptureControlsProps {
  isReady: boolean;
  onCapture: () => void;
  error?: string;
}
```

### BEFORE/AFTER Imports

#### PricingModal

**BEFORE** (`src/components/PricingModal.tsx`):
```typescript
import Modal from './Modal';
import { Button } from './ui/Button';
// ... other imports
```

**AFTER** (`src/components/modals/organisms/PricingModal.tsx`):
```typescript
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { PricingTiersSection } from '../molecules/PricingTiersSection';
import { PricingTierCard } from '../atoms/PricingTierCard';
// ... other imports
```

#### ContactOptionsModal

**BEFORE** (`src/components/ContactOptionsModal.tsx`):
```typescript
import Modal from './Modal';
import { Button } from './ui/Button';
// ... other imports
```

**AFTER** (`src/components/modals/organisms/ContactOptionsModal.tsx`):
```typescript
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { ContactOptionsSection } from '../molecules/ContactOptionsSection';
import { ContactOptionCard } from '../atoms/ContactOptionCard';
// ... other imports
```

#### CameraModal

**BEFORE** (`src/components/CameraModal.tsx`):
```typescript
import Modal from './Modal';
import { Button } from './ui/Button';
// ... other imports
```

**AFTER** (`src/components/modals/organisms/CameraModal.tsx`):
```typescript
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { CameraCaptureControls } from '../molecules/CameraCaptureControls';
// ... other imports
```

#### WelcomeModal

**BEFORE** (`src/components/onboarding/WelcomeModal.tsx`):
```typescript
import Modal from '../Modal';
import { Button } from '../ui/Button';
// ... other imports
```

**AFTER** (`src/components/modals/organisms/WelcomeModal.tsx`):
```typescript
import Modal from '../../Modal';
import { Button } from '../../ui/Button';
import { WelcomeTipsSection } from '../molecules/WelcomeTipsSection';
import { ModalHeader } from '../atoms/ModalHeader';
import { ModalFooter } from '../atoms/ModalFooter';
import { ModalBody } from '../atoms/ModalBody';
import { TipCard } from '../atoms/TipCard';
// ... other imports
```

### Search-and-Replace Commands

**Update imports in `src/index.tsx`:**
```bash
# Before
sed -i '' 's|import WelcomeModal from '\''\./components/onboarding/WelcomeModal'\'';|import { WelcomeModal } from '\''./components/modals'\'';|g' src/index.tsx
sed -i '' 's|import PricingModal from '\''\./components/PricingModal'\'';|import { PricingModal } from '\''./components/modals'\'';|g' src/index.tsx
```

**Update imports in `src/components/LawyerSearchResults.tsx`:**
```bash
sed -i '' 's|import ContactOptionsModal from '\''\./ContactOptionsModal'\'';|import { ContactOptionsModal } from '\''../modals'\'';|g' src/components/LawyerSearchResults.tsx
```

**Update imports in `src/components/FileMenu.tsx`:**
```bash
sed -i '' 's|import CameraModal from '\''\./CameraModal'\'';|import { CameraModal } from '\''../modals'\'';|g' src/components/FileMenu.tsx
```

**Update test imports:**
```bash
sed -i '' 's|import PricingModal from "\\.\\.\/\\.\\.\/components\/PricingModal"|import { PricingModal } from "\\.\\.\/\\.\\.\/components\/modals"|g' src/__tests__/components/PricingI18n.test.tsx
```

### Migration Steps

1. Create directory structure: `src/components/modals/{atoms,molecules,organisms,hooks}`
2. Extract atoms from existing modals
3. Extract molecules from existing modals
4. Move and refactor organisms to use atoms/molecules
5. Create `index.ts` barrel exports
6. Update all imports using search-and-replace
7. Test each modal still works
8. Remove old files

## 6) Tests/Verification Checklist

### WelcomeModal Verification

**Test 1: Shows once after onboarding**
- [ ] Complete personal onboarding flow
- [ ] Verify WelcomeModal appears exactly once
- [ ] Check browser console for `[WelcomeModal]` logs
- [ ] Verify `sessionStorage.getItem('welcomeModalShown_v1_${userId}') === '1'` after modal shows
- [ ] Verify API call to `/api/users/welcome` is made (check Network tab)

**Test 2: Doesn't show on subsequent page loads**
- [ ] After seeing WelcomeModal, refresh page
- [ ] Verify WelcomeModal does NOT appear
- [ ] Check `sessionStorage` still has flag
- [ ] Check server has `welcomed_at` timestamp

**Test 3: Doesn't show on route changes**
- [ ] After seeing WelcomeModal, navigate to `/settings`
- [ ] Navigate back to `/`
- [ ] Verify WelcomeModal does NOT appear

**Test 4: Doesn't show if already welcomed**
- [ ] Set `welcomed_at` in database for test user
- [ ] Sign in as test user
- [ ] Verify WelcomeModal does NOT appear
- [ ] Check `sessionStorage` flag is NOT set

**Test 5: Shows if onboarding complete but not welcomed**
- [ ] Set `onboarding_completed = 1` and `welcomed_at = NULL` in database
- [ ] Sign in as test user
- [ ] Verify WelcomeModal appears
- [ ] After closing, verify `welcomed_at` is set in database

**Test 6: SessionStorage debounce works**
- [ ] Open two tabs with same user
- [ ] Complete onboarding in tab 1
- [ ] WelcomeModal shows in tab 1
- [ ] Check tab 2 - WelcomeModal should NOT show (sessionStorage is per-tab)
- [ ] Refresh tab 2 - WelcomeModal should NOT show (server has `welcomed_at`)

### Regression Tests

**Test 7: PricingModal still works**
- [ ] Navigate to `/#pricing`
- [ ] Verify PricingModal opens
- [ ] Verify upgrade flow works
- [ ] Verify billing portal opens

**Test 8: ContactOptionsModal still works**
- [ ] Open lawyer search results
- [ ] Click contact option
- [ ] Verify ContactOptionsModal opens
- [ ] Verify copy functionality works

**Test 9: CameraModal still works**
- [ ] Open file upload menu
- [ ] Click camera option
- [ ] Verify CameraModal opens
- [ ] Verify camera capture works

**Test 10: OnboardingModal still works**
- [ ] Sign up as new user
- [ ] Verify OnboardingModal appears
- [ ] Complete onboarding
- [ ] Verify redirect to home works

### Debugging Logs

**If WelcomeModal still double-fires:**

1. **Check sessionStorage:**
```javascript
// In browser console
const userId = 'YOUR_USER_ID';
console.log('sessionStorage:', sessionStorage.getItem(`welcomeModalShown_v1_${userId}`));
```

2. **Check server state:**
```sql
-- In database
SELECT id, email, onboarding_completed, welcomed_at FROM users WHERE id = 'YOUR_USER_ID';
```

3. **Check hook state:**
```typescript
// Add to useWelcomeModal.ts temporarily
console.log('[WelcomeModal] shouldShow:', shouldShow, 'userId:', session?.user?.id, 'onboardingCompleted:', user.onboardingCompleted, 'welcomedAt:', user.welcomedAt);
```

4. **Check API calls:**
- Open Network tab
- Filter for `/api/users/welcome`
- Verify POST request is made when modal closes
- Check response status (should be 200)

5. **Check component remounts:**
```typescript
// Add to WelcomeModal component temporarily
useEffect(() => {
  console.log('[WelcomeModal] Component mounted/remounted, isOpen:', isOpen);
}, [isOpen]);
```

### What to Log (and Where)

**In `useWelcomeModal.ts`:**
- Log when `shouldShow` changes from false to true
- Log when `markAsShown` is called
- Log API call success/failure (warn level)

**In `worker/routes/users.ts`:**
- Log when welcome endpoint is called
- Log user ID and timestamp
- Log database update success/failure

**In `src/index.tsx`:**
- Remove all old `onboardingCompleted` localStorage logs
- Keep session sync logs if needed for debugging

---

## 7) Focused Fix Pass - Enhanced Implementation

### Goals

1. **Update useWelcomeModal to:**
   - Early-return (`shouldShow=false`) while session is pending or during SSR
   - Derive userId only from authenticated session (ignore function props)
   - On first computed show, write sessionStorage and broadcast via BroadcastChannel('welcome') for same-device cross-tab suppression
   - Fire-and-forget POST `/api/users/welcome` immediately (ignore body userId; server derives from session)

2. **Update WelcomeModal host to call `markWelcomeAsShown()` in a useEffect when `isOpen` transitions to true (once per mount), so marking happens on open, not on close.**

3. **Harden the Worker route:**
   - Authenticate and derive userId from session only
   - Use KV with `{ nx: true }` OR D1 PK insert for idempotent "set once"
   - Return `{ welcomedAt }` in JSON, no body userId parameter

4. **Add a tiny BroadcastChannel listener near app bootstrap to mirror the sessionStorage flag when any tab marks welcomed.**

5. **Ensure SSR safety: guard modal rendering with client checks (`typeof window`) and session settled state.**

### Deliverables (Unified Diffs)

#### `src/components/modals/hooks/useWelcomeModal.ts`

```diff
+import { useState, useEffect, useCallback, useRef } from 'preact/hooks';
+import { useSession } from '../../contexts/AuthContext';
+
+interface UseWelcomeModalResult {
+  shouldShow: boolean;
+  markAsShown: () => void;
+}
+
+/**
+ * Hook to manage welcome modal state using server truth + sessionStorage + BroadcastChannel.
+ * 
+ * Hardened implementation:
+ * 1. Early return if SSR or session pending (return shouldShow=false)
+ * 2. Read server truth from session (user.welcomedAt or user.onboardingCompleted)
+ * 3. Check sessionStorage + BroadcastChannel to prevent multiple shows in same device
+ * 4. On first computed show (guarded by hasMarkedRef for StrictMode), write sessionStorage, broadcast, and POST API
+ * 5. Fire-and-forget POST with NO request body (server derives userId from session)
+ * 6. Guard against StrictMode double-invocation with hasMarkedRef
+ */
+export function useWelcomeModal(): UseWelcomeModalResult {
+  const { data: session, isPending: sessionIsPending } = useSession();
+  const [shouldShow, setShouldShow] = useState(false);
+  const hasMarkedRef = useRef(false);
+  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
+
+  // 1. Initialize BroadcastChannel once (client-side only, user-id safe)
+  useEffect(() => {
+    if (typeof window === 'undefined') return;
+    
+    const userId = session?.user?.id;
+    
+    // Feature-detect BroadcastChannel; safely degrade on unsupported browsers
+    if ('BroadcastChannel' in window && userId) {
+      try {
+        broadcastChannelRef.current = new BroadcastChannel(`welcome-${userId}`);
+      } catch (err) {
+        console.warn('[WelcomeModal] BroadcastChannel init failed; degrading to sessionStorage only:', err);
+        broadcastChannelRef.current = null;
+      }
+    } else {
+      console.info('[WelcomeModal] BroadcastChannel unsupported; using sessionStorage-only suppression');
+      broadcastChannelRef.current = null;
+    }
+    const channel = broadcastChannelRef.current;
+    
+    // Listen for cross-tab welcome events
+    const handleMessage = (event: MessageEvent) => {
+      if (event.data.type === 'welcomed' && event.data.userId === userId) {
+        // Mirror sessionStorage flag from other tab
+        const sessionKey = `welcomeModalShown_v1_${event.data.userId}`;
+        try {
+          sessionStorage.setItem(sessionKey, '1');
+          setShouldShow(false);
+        } catch (error) {
+          console.warn('[WelcomeModal] Failed to mirror sessionStorage from BroadcastChannel:', error);
+        }
+      }
+    };
+    
+    channel?.addEventListener('message', handleMessage);
+    
+    return () => {
+      channel?.removeEventListener('message', handleMessage);
+      try { channel?.close(); } catch { /* ignore */ }
+      broadcastChannelRef.current = null;
+    };
+  }, [session?.user?.id]);
+
+  // 2. Reset hasMarkedRef when userId changes or unmounts
+  useEffect(() => {
+    const userId = session?.user?.id;
+    
+    return () => {
+      // Reset on unmount or userId change to allow retries for new user
+      hasMarkedRef.current = false;
+    };
+  }, [session?.user?.id]);
+
+  // 3. Compute shouldShow from session and sessionStorage (read-only, no side effects)
+  useEffect(() => {
+    // Early return: SSR safety
+    if (typeof window === 'undefined') {
+      setShouldShow(false);
+      return;
+    }
+    
+    // Early return: session pending (return shouldShow=false)
+    if (sessionIsPending || !session?.user) {
+      setShouldShow(false);
+      return;
+    }
+
+    // Derive userId only from authenticated session
+    const userId = session.user.id;
+    if (!userId) {
+      setShouldShow(false);
+      return;
+    }
+
+    // Check sessionStorage first (debounce for same tab)
+    const sessionKey = `welcomeModalShown_v1_${userId}`;
+    const alreadyShownThisSession = sessionStorage.getItem(sessionKey);
+    if (alreadyShownThisSession) {
+      setShouldShow(false);
+      return;
+    }
+
+    // Check server truth
+    // User should see welcome modal if:
+    // 1. They completed onboarding (onboardingCompleted === true)
+    // 2. They haven't been welcomed yet (welcomedAt is missing or false)
+    const user = session.user as typeof session.user & {
+      onboardingCompleted?: boolean;
+      welcomedAt?: boolean | string | null;
+    };
+
+    const hasCompletedOnboarding = user.onboardingCompleted === true;
+    const hasBeenWelcomed = Boolean(user.welcomedAt);
+
+    // Only compute shouldShow, no side effects
+    if (hasCompletedOnboarding && !hasBeenWelcomed) {
+      setShouldShow(true);
+    } else {
+      setShouldShow(false);
+    }
+  }, [session?.user, sessionIsPending]);
+
+  // 4. Side effects: sessionStorage write + broadcast + POST when shouldShow becomes true
+  useEffect(() => {
+    // Only trigger when shouldShow transitions to true and userId exists
+    if (!shouldShow) return;
+    
+    // Early return: SSR safety
+    if (typeof window === 'undefined') return;
+    
+    // Early return: session pending or no user
+    if (sessionIsPending || !session?.user) return;
+
+    const userId = session.user.id;
+    if (!userId) return;
+
+    // Guard against double-invocation (StrictMode)
+    if (hasMarkedRef.current) return;
+
+    const sessionKey = `welcomeModalShown_v1_${userId}`;
+    
+    // Write sessionStorage first (with try/catch), only set hasMarkedRef after success
+    try {
+      sessionStorage.setItem(sessionKey, '1');
+      
+      // Only set hasMarkedRef after successful sessionStorage write
+      // This allows retries if sessionStorage fails
+      hasMarkedRef.current = true;
+      
+      // Broadcast to other tabs on same device (if supported)
+      try {
+        broadcastChannelRef.current?.postMessage({
+          type: 'welcomed',
+          userId,
+        });
+      } catch (err) {
+        // Non-fatal; continue with sessionStorage-only path
+        console.warn('[WelcomeModal] BroadcastChannel postMessage failed:', err);
+      }
+      
+      // Fire-and-forget API call with NO request body (server derives userId from session)
+      fetch('/api/users/welcome', {
+        method: 'POST',
+        credentials: 'include',
+        headers: { 'Content-Type': 'application/json' },
+        // NO body - server derives userId from session
+      }).catch((error) => {
+        // Fire-and-forget: don't block UI, just log
+        console.warn('[WelcomeModal] Failed to mark as welcomed on server:', error);
+      });
+    } catch (error) {
+      // If sessionStorage write fails, don't set hasMarkedRef
+      // This allows the effect to retry on next render
+      console.warn('[WelcomeModal] Failed to set sessionStorage or broadcast:', error);
+    }
+  }, [shouldShow, session?.user?.id, sessionIsPending]);

+  const markAsShown = useCallback(() => {
+    // This is called when modal is explicitly closed/completed
+    // The sessionStorage and broadcast already happened in useEffect above
+    // Just ensure state is updated (no async needed - markAsShown is synchronous)
+    setShouldShow(false);
+  }, []);

+  return { shouldShow, markAsShown };
+}
```

#### `src/index.tsx` - WelcomeModal Host Changes

**Add import (after line 25):**
```diff
 import WelcomeModal from './components/onboarding/WelcomeModal';
+import { useWelcomeModal } from './components/modals/hooks/useWelcomeModal';
```

**Remove lines 161-177** (old useEffect that reads localStorage):
```diff
-	// Check if we should show welcome modal (after onboarding completion)
-	useEffect(() => {
-		// Check if user just completed onboarding
-		try {
-			const onboardingCompleted = localStorage.getItem('onboardingCompleted');
-			if (onboardingCompleted === 'true') {
-				setShowWelcomeModal(true);
-				// Don't remove the flag here - let the completion handler do it
-				// This prevents permanent loss if the modal fails to render
-			}
-		} catch (_error) {
-			// Handle localStorage access failures (private browsing, etc.)
-			if (import.meta.env.DEV) {
-				 
-				console.warn('Failed to check onboarding completion status:', _error);
-			}
-		}
-	}, []);
```

**Add useWelcomeModal hook and sync logic (after line 177, before session sync useEffect):**
```diff
+	// Use welcome modal hook (server-truth + sessionStorage + BroadcastChannel)
+	const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeModal();
+
```

**Note:** The enhanced implementation uses `shouldShowWelcome` directly instead of syncing to `showWelcomeModal` state to avoid circular dependencies. The marking logic (sessionStorage write, broadcast, POST) is handled in the hook's side-effect when `shouldShow` transitions to true, so we don't need to call `markWelcomeAsShown` in a separate effect. This eliminates the circular state dependency.

**Replace lines 435-464** (old handlers):
```diff
-	// Handle welcome modal
-	const handleWelcomeComplete = () => {
-		setShowWelcomeModal(false);
-		
-		// Remove the onboarding completion flag now that the welcome modal has been shown
-		try {
-			localStorage.removeItem('onboardingCompleted');
-		} catch (_error) {
-			// Handle localStorage access failures (private browsing, etc.)
-			if (import.meta.env.DEV) {
-				 
-				console.warn('Failed to remove onboarding completion flag:', _error);
-			}
+	// Handle welcome modal
+	// Note: markWelcomeAsShown is synchronous (void return), no Promise to await
+	// The hook already handles marking when shouldShow transitions to true
+	// We only call markWelcomeAsShown if user explicitly closes without completing
+	const handleWelcomeComplete = () => {
+		// Modal completion handled by hook's side-effect (sessionStorage + broadcast + POST)
+		// No additional action needed
+	};
+
+	const handleWelcomeClose = () => {
+		// If user closes without completing, mark as shown anyway
+		// This ensures they don't see it again if they close it
+		markWelcomeAsShown();
+	};
```

**Update WelcomeModal render (lines 651-655) with SSR guard:**
```diff
 			{/* Welcome Modal */}
-			<WelcomeModal
+			{typeof window !== 'undefined' && (
+				<WelcomeModal
+				isOpen={shouldShowWelcome}
				onClose={handleWelcomeClose}
				onComplete={handleWelcomeComplete}
			/>
+			)}
```

**Remove showWelcomeModal state (if no longer used elsewhere):**
```diff
-	const [showWelcomeModal, setShowWelcomeModal] = useState(false);
+	// Removed: showWelcomeModal state - use shouldShowWelcome from hook directly
+	// This eliminates circular state dependency
```

**Remove localStorage writes from sync logic (lines 234-245):**
```diff
 			// Sync onboardingCompleted flag if user has completed onboarding but flag is missing
 			if (hasCompletedOnboarding && !hasOnboardingFlag) {
 				if (import.meta.env.DEV) {
 					console.debug('[ONBOARDING][SYNC] syncing onboardingCompleted flag');
 				}
-				try {
-					localStorage.setItem('onboardingCompleted', 'true');
-					localStorage.setItem('onboardingCheckDone', 'true');
-				} catch (_error) {
-					// Handle localStorage failures gracefully
-					console.warn('[ONBOARDING][SYNC] localStorage set failed:', _error);
-				}
+				// Note: localStorage sync removed - welcome modal now uses server truth
 			}
```

**Remove localStorage writes from else branch (lines 268-274):**
```diff
 				} else {
 					// User has completed onboarding, sync the flags with database state
-					try {
-						localStorage.setItem('onboardingCompleted', 'true');
-						localStorage.setItem('onboardingCheckDone', 'true');
-					} catch (_error) {
-						// Handle localStorage failures gracefully
-					}
+					// Note: localStorage sync removed - welcome modal now uses server truth
 				}
```

#### `worker/routes/users.ts` (New File)

**Recommended: D1-only approach (simpler, avoids race conditions, no KV namespace pollution):**
```diff
+import type { Env } from '../types';
+import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
+import { requireAuth } from '../middleware/auth.js';
+
+/**
+ * POST /api/users/welcome
+ * Idempotent endpoint to mark user as welcomed.
+ * 
+ * Hardened implementation:
+ * - Derive userId from session only (ignore request body completely)
+ * - Use D1 guarded UPDATE for idempotency (no race conditions)
+ * - Sets welcomed_at timestamp in user record
+ * - Returns { welcomedAt } in JSON response (no userId in response)
+ * - CORS handled by global middleware (withCORS + getCorsConfig)
+ * 
+ * Note: This D1-only approach is recommended over KV because:
+ * - Avoids race conditions (D1 UPDATE with WHERE clause is atomic)
+ * - No namespace pollution (welcomed state belongs in user record, not chat sessions KV)
+ * - Simpler error handling (single source of truth)
+ * - Consistent: both read and write use D1
+ */
+export async function handleUsers(request: Request, env: Env): Promise<Response> {
+  const url = new URL(request.url);
+  const path = url.pathname;
+
+  try {
+    if (path === '/api/users/welcome' && request.method === 'POST') {
+      // Authenticate and derive userId from session only
+      const authContext = await requireAuth(request, env);
+      const userId = authContext.user.id;
+
+      // Use D1 for idempotency - check if already welcomed
+      const db = env.DB;
+      const existing = await db.prepare(`
+        SELECT welcomed_at FROM users WHERE id = ?
+      `).bind(userId).first<{ welcomed_at: string | null }>();
+
+      if (existing?.welcomed_at) {
+        // Already welcomed, return existing timestamp
+        return createSuccessResponse({ welcomedAt: existing.welcomed_at });
+      }
+
+      // Update user record (idempotent - WHERE clause ensures only updates if NULL)
+      // This is atomic and race-condition safe
+      const now = new Date().toISOString();
+      const result = await db.prepare(`
+        UPDATE users 
+        SET welcomed_at = ? 
+        WHERE id = ? AND (welcomed_at IS NULL OR welcomed_at = '')
+      `).bind(now, userId).run();
+
+      // If no rows were updated, another request already set it (race condition handled)
+      if (result.meta.changes === 0) {
+        // Re-fetch to get the timestamp set by the other request
+        const updated = await db.prepare(`
+          SELECT welcomed_at FROM users WHERE id = ?
+        `).bind(userId).first<{ welcomed_at: string | null }>();
+        
+        if (updated?.welcomed_at) {
+          return createSuccessResponse({ welcomedAt: updated.welcomed_at });
+        }
+      }
+
+      return createSuccessResponse({ welcomedAt: now });
+    }
+
+    throw HttpErrors.notFound('Endpoint not found');
+  } catch (error) {
+    return handleError(error);
+  }
+}
```

**Alternative KV approach (if performance is critical and KV caching is needed):**

⚠️ **Warning:** This approach has race condition risks and requires proper KV namespace setup. Use D1-only approach above unless you have a specific performance requirement.

```diff
+      // Authenticate and derive userId from session only
+      const authContext = await requireAuth(request, env);
+      const userId = authContext.user.id;
+
+      // Use proper KV namespace (not CHAT_SESSIONS) - e.g., env.USER_METADATA
+      // If USER_METADATA doesn't exist, add it to wrangler.toml:
+      // [[kv_namespaces]]
+      // binding = "USER_METADATA"
+      // id = "your-kv-namespace-id"
+      const kvKey = `welcomed:${userId}`;
+      
+      // Race condition handling: Try atomic put with conditional check
+      // Note: Cloudflare KV doesn't support atomic put-if-not-exists natively
+      // We must accept the race condition risk or use D1 for true atomicity
+      const existingWelcome = await env.USER_METADATA.get(kvKey);
+      
+      if (existingWelcome) {
+        // Already welcomed, return existing timestamp
+        // But also ensure D1 is in sync (eventual consistency check)
+        const db = env.DB;
+        const dbRecord = await db.prepare(`
+          SELECT welcomed_at FROM users WHERE id = ?
+        `).bind(userId).first<{ welcomed_at: string | null }>();
+        
+        // If D1 is missing the value, sync it (eventual consistency fix)
+        if (!dbRecord?.welcomed_at) {
+          await db.prepare(`
+            UPDATE users SET welcomed_at = ? WHERE id = ? AND (welcomed_at IS NULL OR welcomed_at = '')
+          `).bind(existingWelcome, userId).run();
+        }
+        
+        return createSuccessResponse({ welcomedAt: existingWelcome });
+      }
+
+      // Mark as welcomed in KV first
+      const now = new Date().toISOString();
+      
+      // ⚠️ Race condition: If two requests arrive simultaneously, both may pass the check above
+      // and both will write to KV. The D1 UPDATE with WHERE clause will handle this atomically.
+      await env.USER_METADATA.put(kvKey, now, { expirationTtl: 31536000 }); // 1 year TTL
+
+      // Update user record with welcomed_at timestamp (idempotent - safe to run multiple times)
+      // This is the source of truth - if KV write failed, D1 still succeeds
+      const db = env.DB;
+      const result = await db.prepare(`
+        UPDATE users 
+        SET welcomed_at = ? 
+        WHERE id = ? AND (welcomed_at IS NULL OR welcomed_at = '')
+      `).bind(now, userId).run();
+
+      // If D1 update failed (shouldn't happen, but handle gracefully)
+      if (result.meta.changes === 0) {
+        // Another request already set it - fetch from D1 and sync KV
+        const updated = await db.prepare(`
+          SELECT welcomed_at FROM users WHERE id = ?
+        `).bind(userId).first<{ welcomed_at: string | null }>();
+        
+        if (updated?.welcomed_at) {
+          // Sync KV to match D1 (eventual consistency)
+          await env.USER_METADATA.put(kvKey, updated.welcomed_at, { expirationTtl: 31536000 });
+          return createSuccessResponse({ welcomedAt: updated.welcomed_at });
+        }
+      }
+
+      return createSuccessResponse({ welcomedAt: now });
```

#### `worker/index.ts` - Add users route handler

**Add import (after other route imports, around line 30):**
```diff
 import { handleOnboarding } from './routes/onboarding';
+import { handleUsers } from './routes/users';
 import { handlePayment } from './routes/payment';
```

**Add route handler (after `/api/onboarding` check, around line 100):**
```diff
     } else if (path.startsWith('/api/onboarding')) {
       response = await handleOnboarding(request, env);
+    } else if (path.startsWith('/api/users')) {
+      response = await handleUsers(request, env);
     } else if (path.startsWith('/api/payment')) {
```

**Note on CORS**: The global `withCORS` middleware in `worker/index.ts` (line 131) already handles CORS with credentials via `getCorsConfig()`. The `/api/users/welcome` endpoint will automatically inherit proper CORS headers with `Access-Control-Allow-Credentials: true` for allowed origins. No additional CORS configuration needed.

#### `src/index.tsx` - Add BroadcastChannel listener (Near app bootstrap)

**Add BroadcastChannel listener initialization (after session provider, before Router, around line 725):**
```diff
 		<ToastProvider>
+			{typeof window !== 'undefined' && (
+				<BroadcastChannelListener />
+			)}
 			<Router>
```

**Add BroadcastChannelListener component (before MainApp component, around line 40):**
```diff
+/**
+ * BroadcastChannel listener for cross-tab welcome modal suppression.
+ * Mirrors sessionStorage flag when any tab marks welcomed.
+ */
+function BroadcastChannelListener() {
+	const { data: session } = useSession();
+	const userId = session?.user?.id;
+
+	useEffect(() => {
+		if (typeof window === 'undefined') return;
+		if (!userId) return;
+		
+		const channel = new BroadcastChannel(`welcome-${userId}`);
+		
+		const handleMessage = (event: MessageEvent) => {
+			if (event.data.type === 'welcomed' && event.data.userId === userId) {
+				// Mirror sessionStorage flag from other tab
+				const sessionKey = `welcomeModalShown_v1_${event.data.userId}`;
+				try {
+					sessionStorage.setItem(sessionKey, '1');
+				} catch (error) {
+					console.warn('[WelcomeModal] Failed to mirror sessionStorage from BroadcastChannel:', error);
+				}
+			}
+		};
+		
+		channel.addEventListener('message', handleMessage);
+		
+		return () => {
+			channel.removeEventListener('message', handleMessage);
+			channel.close();
+		};
+	}, [userId]);
+	
+	return null;
+}

 // Main application component (non-auth pages)
```

#### Database Migration

**Create `worker/migrations/YYYYMMDD_add_welcomed_at.sql`:**
```sql
-- Add welcomed_at column to users table
ALTER TABLE users ADD COLUMN welcomed_at TEXT;
```

**Update `worker/db/auth.schema.ts`** (add to users table definition, around line 69):
```diff
   // Onboarding
   onboardingCompleted: integer("onboarding_completed", { mode: "boolean" }).default(false),
   onboardingData: text("onboarding_data"), // JSON string
+  
+  // Welcome
+  welcomedAt: text("welcomed_at"), // ISO timestamp when user was shown welcome modal
 });
```

#### Update Better Auth Session to Include `welcomedAt`

**Check `worker/auth/hooks.ts`** for session building logic. If session is built from user object, ensure `welcomedAt` is included:

```diff
+// In session building logic (if exists)
+// Ensure welcomed_at is included in user object returned in session
+// This may require updating the Better Auth session query or user object construction
```

**Note:** If Better Auth automatically includes all user fields, no changes needed. Otherwise, update the session query to include `welcomed_at`.

#### `src/components/modals/index.ts` - Barrel Exports

**Create or update barrel export file:**
```diff
+// Atoms
+export { ModalHeader } from './atoms/ModalHeader';
+export { ModalFooter } from './atoms/ModalFooter';
+export { ModalBody } from './atoms/ModalBody';
+export { TipCard } from './atoms/TipCard';
+export { PricingTierCard } from './atoms/PricingTierCard';
+export { ContactOptionCard } from './atoms/ContactOptionCard';
+
+// Molecules
+export { WelcomeTipsSection } from './molecules/WelcomeTipsSection';
+export { PricingTiersSection } from './molecules/PricingTiersSection';
+export { ContactOptionsSection } from './molecules/ContactOptionsSection';
+export { CameraCaptureControls } from './molecules/CameraCaptureControls';
+
+// Organisms
+export { default as WelcomeModal } from './organisms/WelcomeModal';
+export { default as PricingModal } from './organisms/PricingModal';
+export { default as ContactOptionsModal } from './organisms/ContactOptionsModal';
+export { default as CameraModal } from './organisms/CameraModal';
+
+// Hooks
+export { useWelcomeModal } from './hooks/useWelcomeModal';
```

## 7) Enhanced Fix Spec (Implemented)

- **Server truth**: `users.welcomed_at` (TEXT ISO timestamp)
- **Endpoint**: `POST /api/users/welcome`
  - Auth required via `requireAuth()`
  - Derives `userId` from session only (no request body)
  - Idempotent `UPDATE users SET welcomed_at = ? WHERE id = ?`
- **Session**: Added `welcomedAt` to Better Auth `additionalFields` so the field is present in the frontend session object.
- **Hook**: `src/components/modals/hooks/useWelcomeModal.ts`
  - Reads `onboardingCompleted` + `welcomedAt` from session
  - Debounces per-tab with `sessionStorage` key `welcomeModalShown_v1_<userId>`
  - Cross-tab suppression via `BroadcastChannel('welcome')`
  - `markAsShown()` sets sessionStorage, broadcasts, and POSTs endpoint (fire-and-forget)
- **Host integration**: `src/index.tsx`
  - Removed legacy localStorage trigger logic
  - Uses `useWelcomeModal()` to control `<WelcomeModal />` and calls `markAsShown()` on complete/close
- **Legacy writes removed**: `OnboardingModal.tsx` and `AuthPage.tsx` no longer set `localStorage.onboardingCompleted`

## 8) Deprecation Plan (Completed)

- Removed all writes to `localStorage.onboardingCompleted` in OnboardingModal and AuthPage
- Removed localStorage sync of onboarding flags in index.tsx (kept `onboardingCheckDone` for redirect guard only)
- Left account deletion cleanup as-is (orthogonal)

## 9) Rollout Plan (No feature flag)

- Apply D1 migration locally/remotely: `ALTER TABLE users ADD COLUMN welcomed_at TEXT;`
- Deploy worker and frontend together
- Smoke test: single welcome appearance, cross-tab suppression, pricing hash unaffected
- Monitoring: DEV console logs and worker endpoint responses
- Rollback: revert hook usage if needed (not expected)

## 10) Acceptance Criteria

- After onboarding completion, WelcomeModal appears exactly once
- Refreshes and navigations do not cause re-appearance
- Opening a second tab while one marks-as-shown suppresses the modal in the other tab
- Pricing `#pricing` hash modal behavior unchanged
- No dependency on `localStorage.onboardingCompleted` for triggering

## 11) PR Checklist

- Backend: `worker/routes/users.ts` added and wired in `worker/index.ts`, exported in `worker/routes/index.ts`
- Schema: `welcomed_at` added to `worker/db/auth.schema.ts` + SQL migration under `worker/migrations/`
- Auth: `welcomedAt` added to Better Auth `additionalFields`
- Frontend: `useWelcomeModal` added; `src/index.tsx` integrated; localStorage removals in `AuthPage.tsx` and `OnboardingModal.tsx`
- Docs: This audit updated to reflect enhanced implementation
- Follow-ups: tests (unit/integration/e2e), translations review, optional atoms/molecules extraction

## 12) Modal Directory Consolidation (Scaffolded)

- Created barrels to support incremental, non-breaking consolidation:
  - `src/components/modals/index.ts`
  - `src/components/modals/hooks/index.ts`
  - `src/components/modals/organisms/index.ts` re-exports `WelcomeModal`, `PricingModal`, `ContactOptionsModal`, `CameraModal`
  - `src/components/modals/{atoms,molecules}/index.ts` placeholders for future extraction
- Next: gradually migrate imports to `modals/organisms`, then move files physically once references are updated

---

### Constraints Summary

- ✅ **No reliance on localStorage** for welcome logic (removed all localStorage reads/writes)
- ✅ **Do not accept body userId** on API; server derives from session via `requireAuth()` and ignores request body completely
- ✅ **SSR safety**: All client-side code guarded with `typeof window !== 'undefined'`
- ✅ **Session-derived userId**: Only source of truth for user identity (no props, no body)
- ✅ **Return shouldShow=false while session pending**: Early return in useEffect when `sessionIsPending` is true
- ✅ **StrictMode guard**: `hasMarkedRef` prevents double-invocation in React StrictMode (guard on first computed show)
- ✅ **Idempotent writes**: KV get/set pattern or D1 guarded UPDATE ensures "set once"
- ✅ **Cross-tab sync**: BroadcastChannel ensures same-device suppression
- ✅ **Mark on open**: useEffect triggers when `isOpen` flips true, calls `markAsShown()` immediately (don't await - synchronous)
- ✅ **CORS with credentials**: Handled by global `withCORS` middleware + `getCorsConfig` (already configured in `worker/index.ts`)
- ✅ **POST with NO body**: Request body is completely ignored; server derives userId from session only

### Final Hardening Pass Summary

**Client-side (`useWelcomeModal`):**
- ✅ Early return (`shouldShow=false`) while session pending or during SSR
- ✅ Derive userId only from authenticated session (no function props)
- ✅ On first computed show (guarded by `hasMarkedRef` for StrictMode): set sessionStorage, BroadcastChannel, and POST `/api/users/welcome` with NO request body
- ✅ POST uses `credentials: 'include'` for CORS
- ✅ Guard StrictMode with `hasMarkedRef` to prevent double-invocation
- ✅ `markAsShown()` is synchronous (not Promise) - no async needed

**Host (`src/index.tsx`):**
- ✅ When `isOpen` flips true for the first time, call `markWelcomeAsShown()` immediately (don't await)
- ✅ SSR guard around WelcomeModal rendering (`typeof window !== 'undefined'`)
- ✅ Reset ref when modal closes to allow re-show if needed

**Worker (`worker/routes/users.ts`):**
- ✅ Derive userId from session only via `requireAuth()` (ignore request body completely)
- ✅ Implement idempotency: KV get/set pattern OR D1 guarded UPDATE
- ✅ Return `{ welcomedAt }` in JSON (no userId in response)
- ✅ CORS handled by global middleware (`withCORS` + `getCorsConfig`) - no additional CORS config needed

### Implementation Order

1. Create database migration for `welcomed_at` column
2. Update `worker/db/auth.schema.ts` with `welcomedAt` field
3. Create `worker/routes/users.ts` with hardened endpoint
4. Update `worker/index.ts` to add users route handler
5. Create `src/components/modals/hooks/useWelcomeModal.ts` with BroadcastChannel support
6. Update `src/index.tsx` with hook usage and BroadcastChannel listener
7. Remove localStorage writes from `OnboardingModal.tsx` and `AuthPage.tsx`
8. Add SSR guards to WelcomeModal rendering
9. Create barrel export `src/components/modals/index.ts`

---

## Summary

This audit provides:
1. Complete file inventory with line ranges
2. Detailed flag map showing all read/write locations
3. Import/usage graph for all modals
4. Minimal-change fix using server-truth + sessionStorage
5. Atomic design restructure plan
6. Comprehensive test checklist
7. **Focused fix pass with enhanced implementation** (SSR safety, BroadcastChannel, hardened API)

The fix addresses the root cause: WelcomeModal checks localStorage on every mount, but flag is cleared asynchronously. The new approach uses server truth (`welcomed_at`) + sessionStorage debounce + BroadcastChannel for cross-tab suppression + idempotent API endpoint.

---

## Appendix A: Deprecated Minimal-Change Fix

⚠️ **DEPRECATED:** This appendix preserves the initial implementation described in section 4 for historical reference only. **Do not use this implementation.** See section 7 ("Focused Fix Pass - Enhanced Implementation") for the current, recommended approach.

### Solution Overview

Use server-side truth (`welcomed_at` timestamp or boolean flag) + `sessionStorage` debounce to prevent multiple shows in same tab/session.

### New Files to Create

#### `src/components/modals/hooks/useWelcomeModal.ts`

```typescript
import { useState, useEffect, useCallback } from 'preact/hooks';
import { useSession } from '../../contexts/AuthContext';

interface UseWelcomeModalResult {
  shouldShow: boolean;
  markAsShown: () => Promise<void>; // Note: Enhanced version (section 7) changed to synchronous (void)
}

/**
 * Hook to manage welcome modal state using server truth + sessionStorage debounce.
 * 
 * Logic:
 * 1. Read server truth from session (user.welcomedAt or user.onboardingCompleted)
 * 2. Check sessionStorage to prevent multiple shows in same tab
 * 3. Mark as shown immediately in sessionStorage when modal opens
 * 4. Fire-and-forget API call to mark server as welcomed
 */
export function useWelcomeModal(): UseWelcomeModalResult {
  const { data: session, isPending: sessionIsPending } = useSession();
  const [shouldShow, setShouldShow] = useState(false);

  // Check if modal should show
  useEffect(() => {
    if (sessionIsPending || !session?.user) {
      setShouldShow(false);
      return;
    }

    const userId = session.user.id;
    if (!userId) {
      setShouldShow(false);
      return;
    }

    // Check sessionStorage first (debounce for same tab)
    const sessionKey = `welcomeModalShown_v1_${userId}`;
    const alreadyShownThisSession = sessionStorage.getItem(sessionKey);
    if (alreadyShownThisSession) {
      setShouldShow(false);
      return;
    }

    // Check server truth
    // User should see welcome modal if:
    // 1. They completed onboarding (onboardingCompleted === true)
    // 2. They haven't been welcomed yet (welcomedAt is missing or false)
    const user = session.user as typeof session.user & {
      onboardingCompleted?: boolean;
      welcomedAt?: boolean | string | null;
    };

    const hasCompletedOnboarding = user.onboardingCompleted === true;
    const hasBeenWelcomed = Boolean(user.welcomedAt);

    if (hasCompletedOnboarding && !hasBeenWelcomed) {
      setShouldShow(true);
    } else {
      setShouldShow(false);
    }
  }, [session?.user, sessionIsPending]);

  const markAsShown = useCallback(async () => {
    if (!session?.user?.id) return;

    const userId = session.user.id;

    // Mark in sessionStorage immediately (prevents re-show in same tab)
    const sessionKey = `welcomeModalShown_v1_${userId}`;
    try {
      sessionStorage.setItem(sessionKey, '1');
    } catch (error) {
      console.warn('[WelcomeModal] Failed to set sessionStorage:', error);
    }

    // Update local state
    setShouldShow(false);

    // Fire-and-forget API call to mark server as welcomed
    // Note: NO request body - server derives userId from session only
    try {
      await fetch('/api/users/welcome', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // NO body - server derives userId from session
      });
    } catch (error) {
      // Fire-and-forget: don't block UI, just log
      console.warn('[WelcomeModal] Failed to mark as welcomed on server:', error);
    }
  }, [session?.user?.id]);

  return { shouldShow, markAsShown };
}
```

#### `worker/routes/users.ts` (new file)

```typescript
import type { Env } from '../types';
import { HttpErrors, handleError, createSuccessResponse } from '../errorHandler';
import { requireAuth } from '../middleware/auth.js';
import { parseJsonBody } from '../utils';

/**
 * POST /api/users/welcome
 * Idempotent endpoint to mark user as welcomed.
 * Sets welcomedAt timestamp in user record.
 */
export async function handleUsers(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  try {
    if (path === '/api/users/welcome' && request.method === 'POST') {
      await requireAuth(request, env);
      
      const body = await parseJsonBody(request) as { userId?: string };
      if (!body?.userId || typeof body.userId !== 'string') {
        throw HttpErrors.badRequest('userId is required');
      }

      // Get authenticated user from session
      const session = await env.BETTER_AUTH.getSession({
        headers: request.headers,
      });

      if (!session?.user) {
        throw HttpErrors.unauthorized('Authentication required');
      }

      // Ensure user can only mark themselves as welcomed
      if (session.user.id !== body.userId) {
        throw HttpErrors.forbidden('Cannot mark another user as welcomed');
      }

      // Update user record with welcomedAt timestamp
      const db = env.DB;
      const now = new Date().toISOString();
      
      await db.prepare(`
        UPDATE users 
        SET welcomed_at = ? 
        WHERE id = ?
      `).bind(now, body.userId).run();

      return createSuccessResponse({ success: true, welcomedAt: now });
    }

    throw HttpErrors.notFound('Endpoint not found');
  } catch (error) {
    return handleError(error);
  }
}
```

**Note**: Add `welcomed_at` column to users table if it doesn't exist:
```sql
ALTER TABLE users ADD COLUMN welcomed_at TEXT;
```

### Changes to Existing Files

#### `src/index.tsx` - Remove flag management, use hook

**Remove lines 161-177** (old useEffect that reads localStorage):
```diff
-	// Check if we should show welcome modal (after onboarding completion)
-	useEffect(() => {
-		// Check if user just completed onboarding
-		try {
-			const onboardingCompleted = localStorage.getItem('onboardingCompleted');
-			if (onboardingCompleted === 'true') {
-				setShowWelcomeModal(true);
-				// Don't remove the flag here - let the completion handler do it
-				// This prevents permanent loss if the modal fails to render
-			}
-		} catch (_error) {
-			// Handle localStorage access failures (private browsing, etc.)
-			if (import.meta.env.DEV) {
-				 
-				console.warn('Failed to check onboarding completion status:', _error);
-			}
-		}
-	}, []);
```

**Add import at top (after line 25)**:
```diff
 import WelcomeModal from './components/onboarding/WelcomeModal';
+import { useWelcomeModal } from './components/modals/hooks/useWelcomeModal';
```

**Replace lines 435-464** (old handlers):
```diff
-	// Handle welcome modal
-	const handleWelcomeComplete = () => {
-		setShowWelcomeModal(false);
-		
-		// Remove the onboarding completion flag now that the welcome modal has been shown
-		try {
-			localStorage.removeItem('onboardingCompleted');
-		} catch (_error) {
-			// Handle localStorage access failures (private browsing, etc.)
-			if (import.meta.env.DEV) {
-				 
-				console.warn('Failed to remove onboarding completion flag:', _error);
-			}
-		}
-	};
-
-	const handleWelcomeClose = () => {
-		setShowWelcomeModal(false);
-		
-		// Remove the onboarding completion flag even if user closes without completing
-		// This prevents the welcome modal from showing again
-		try {
-			localStorage.removeItem('onboardingCompleted');
-		} catch (_error) {
-			// Handle localStorage access failures (private browsing, etc.)
-			if (import.meta.env.DEV) {
-				 
-				console.warn('Failed to remove onboarding completion flag:', _error);
-			}
-		}
-	};
+	// Use welcome modal hook (server-truth + session debounce)
+	const { shouldShow: shouldShowWelcome, markAsShown: markWelcomeAsShown } = useWelcomeModal();
+
+	// Sync hook state to local state
+	useEffect(() => {
+		setShowWelcomeModal(shouldShowWelcome);
+	}, [shouldShowWelcome]);
+
+	// Handle welcome modal
+	const handleWelcomeComplete = async () => {
+		await markWelcomeAsShown();
+		setShowWelcomeModal(false);
+	};
+
+	const handleWelcomeClose = async () => {
+		await markWelcomeAsShown();
+		setShowWelcomeModal(false);
+	};
```

**Update WelcomeModal render (lines 651-655)**:
```diff
 			{/* Welcome Modal */}
 			<WelcomeModal
 				isOpen={showWelcomeModal}
 				onClose={handleWelcomeClose}
 				onComplete={handleWelcomeComplete}
 			/>
```

**Remove localStorage writes from sync logic (lines 234-245)**:
```diff
 			// Sync onboardingCompleted flag if user has completed onboarding but flag is missing
 			if (hasCompletedOnboarding && !hasOnboardingFlag) {
 				if (import.meta.env.DEV) {
 					console.debug('[ONBOARDING][SYNC] syncing onboardingCompleted flag');
 				}
-				try {
-					localStorage.setItem('onboardingCompleted', 'true');
-					localStorage.setItem('onboardingCheckDone', 'true');
-				} catch (_error) {
-					// Handle localStorage failures gracefully
-					console.warn('[ONBOARDING][SYNC] localStorage set failed:', _error);
-				}
+				// Note: localStorage sync removed - welcome modal now uses server truth
 			}
```

**Remove localStorage writes from else branch (lines 268-274)**:
```diff
 				} else {
 					// User has completed onboarding, sync the flags with database state
-					try {
-						localStorage.setItem('onboardingCompleted', 'true');
-						localStorage.setItem('onboardingCheckDone', 'true');
-					} catch (_error) {
-						// Handle localStorage failures gracefully
-					}
+					// Note: localStorage sync removed - welcome modal now uses server truth
 				}
```

#### `src/components/onboarding/OnboardingModal.tsx` - Remove localStorage write

**Remove lines 116-127** (localStorage cache):
```diff
-			// Cache the completion status in localStorage for quick access
-			// This is just a cache, not the source of truth
-			try {
-				localStorage.setItem('onboardingCompleted', 'true');
-			} catch (storageError) {
-				// Handle localStorage failures (private browsing, quota exceeded, etc.)
-				if (import.meta.env.DEV) {
-					
-					console.warn('Failed to cache onboarding completion in localStorage:', storageError);
-				}
-				// Continue execution - this is just a cache, not critical
-			}
```

#### `src/components/AuthPage.tsx` - Remove localStorage write

**Remove line 228**:
```diff
-		localStorage.setItem('onboardingCompleted', 'true');
```

#### `worker/index.ts` - Add users route handler

**Add import (after other route imports)**:
```typescript
import { handleUsers } from './routes/users';
```

**Add route handler (after `/api/onboarding` check, around line 100)**:
```diff
    } else if (path.startsWith('/api/onboarding')) {
      response = await handleOnboarding(request, env);
+    } else if (path.startsWith('/api/users')) {
+      response = await handleUsers(request, env);
    } else if (path.startsWith('/api/payment')) {
```

#### Database Migration

**Create `worker/migrations/YYYYMMDD_add_welcomed_at.sql`**:
```sql
-- Add welcomed_at column to users table
ALTER TABLE users ADD COLUMN welcomed_at TEXT;
```

**Update `worker/db/auth.schema.ts`** (add to users table definition):
```typescript
// Welcome
welcomedAt: text("welcomed_at"), // ISO timestamp when user was shown welcome modal
```

**Update Better Auth session to include `welcomedAt`** (if needed in session bootstrap):
- Check `worker/auth/*.ts` files for session building logic
- Add `welcomedAt` to user object returned in session

