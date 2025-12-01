# Mock Chat Mode

Mock chat mode allows you to preview and develop the chat UI without needing a working backend.

## Quick Start

### Enable Mock Mode

**Option 1: Browser Console**
```javascript
localStorage.setItem('mockChatEnabled', 'true');
location.reload();
```

**Option 2: Environment Variable**
Add to your `.env` file:
```
VITE_ENABLE_MOCK_CHAT=true
```

**Option 3: Use MockChatControls Component**
Add `<MockChatControls />` to your dev tools or settings page.

### Disable Mock Mode

**Browser Console:**
```javascript
localStorage.removeItem('mockChatEnabled');
location.reload();
```

Or click the "Disable" button in the yellow banner when mock mode is active.

## Features

- ✅ Pre-populated demo messages
- ✅ Avatar support (with mock data sets)
- ✅ File attachment examples
- ✅ Simulated message sending (with auto-responses)
- ✅ Multiple mock data sets (default, avatars, files)

## Mock Data Sets

### Default Set
Basic conversation with text messages.

### Avatars Set
Messages with avatar metadata to test avatar alignment.

### Files Set
Messages with file attachments (PDFs, images, etc.).

## Usage in Code

```typescript
import { useMockChat } from '../../hooks/useMockChat';

const { messages, sendMessage, practiceConfig, isMockMode, setMockMode } = useMockChat();
```

## Customizing Mock Data

Edit `src/components/chat/mock/mockChatData.ts` to customize:
- Message content
- Avatar data
- File attachments
- Practice config

## Notes

- Mock mode is automatically detected on app load
- Mock messages are stored in component state (not persisted)
- Real backend calls are bypassed when mock mode is enabled
- The yellow banner indicates when mock mode is active

