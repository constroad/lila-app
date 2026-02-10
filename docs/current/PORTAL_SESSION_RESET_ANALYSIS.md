# Portal Session Reset - Breaking Change Analysis

**Date**: 2026-02-09
**Status**: 🔴 BROKEN - Critical functionality missing
**Impact**: Portal's "Reset Session" button does not work

---

## Executive Summary

The Portal's "Reset Session" button in the admin/empresa WhatsApp tab is **completely broken** with the new simplified WhatsApp implementation. The required API endpoint exists in Portal's proxy layer but the corresponding backend functionality is **commented out** in lila-app.

**Impact**:
- ❌ Users cannot fully reset WhatsApp sessions
- ❌ Physical session files persist on disk (credentials remain)
- ❌ Queue files are not cleared
- ❌ Auto-recovery kicks in and restores old sessions

---

## API Call Flow

### Portal → lila-app Request Chain

```
[Portal Frontend]
  ↓
  DELETE /api/whatsapp/v2/sessions/${phone}/delete
  ↓
[Portal API Proxy]
  /src/pages/api/whatsapp/v2/sessions/[phone]/delete.ts:33
  ↓
  POST ${LILA_SERVER_URL}/sessions/${phone}/clear
  ↓
[lila-app]
  POST /api/sessions/:phoneNumber/clear
  ↓
  ❌ ROUTE COMMENTED OUT (session.routes.ts:28-29)
```

---

## Code Evidence

### 1. Portal Frontend Calls (Portal/src/pages/admin/empresa/index.tsx)

**Line 752-773**: Reset Session Handler

```typescript
const handleSessionReset = async (phoneOverride?: string) => {
  const phone = getSessionPhone(phoneOverride);
  if (!phone) return;
  setSessionAction({ phone, action: 'reset' });
  try {
    // Calls Portal's API proxy
    const response = await fetch(`/api/whatsapp/v2/sessions/${phone}/delete${sessionQuery}`, {
      method: 'DELETE',
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || 'No se pudo resetear sesión');
    }
    toast.success('Sesión restablecida');
    setSessionStatus(null);
    setSessionQr(null);
    refetchSessions();
  } catch (error: any) {
    toast.error(error?.message || 'Error restableciendo sesión');
  } finally {
    setSessionAction(null);
  }
};
```

**Line 1422**: User expectation tooltip

```typescript
<Text fontSize="xs" color="gray.500" mt={3}>
  Resetear sesión desconecta, elimina credenciales y limpia backups para evitar auto-recuperación.
</Text>
```

**Expected behavior**:
1. ✅ Disconnect from WhatsApp
2. ✅ Delete credentials (physical files)
3. ✅ Clean backups
4. ✅ Prevent auto-recovery

---

### 2. Portal API Proxy (Portal/src/pages/api/whatsapp/v2/sessions/[phone]/delete.ts)

**Line 23-51**: DELETE handler proxies to lila-app

```typescript
router
  .use(requireAuth)
  .use(withTenant)
  .delete(async (req, res) => {
    try {
      const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
      const companyId = resolveCompanyId(req);

      if (!phone || !companyId) {
        return res.status(400).json({ success: false, error: 'phoneNumber is required' });
      }

      const jwtToken = generateLilaAppToken(companyId);

      // ⚠️ Proxies to lila-app's /sessions/:phone/clear endpoint
      const url = `${LILA_SERVER_URL}/sessions/${phone}/clear`;

      const response = await axios.post(url, {}, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
        timeout: 15000,
      });

      return res.status(200).json(response.data);
    } catch (error: any) {
      console.error('[API] ❌ Error clearing session:', error?.message || error);
      return res.status(500).json({
        success: false,
        error: 'Failed to clear session',
        message: error?.message || 'Unexpected error',
      });
    }
  });
```

**Calls**: `POST ${LILA_SERVER_URL}/sessions/${phone}/clear`
**Expected backend**: `POST /api/sessions/:phoneNumber/clear`

---

### 3. lila-app Route Definition (lila-app/src/api/routes/session.routes.ts)

**Line 28-29**: ❌ COMMENTED OUT

```typescript
// DISABLED: Simple controller doesn't have clearSession (use logout/disconnect)
// router.post('/:phoneNumber/clear', sessionController.clearSession);
```

**Line 41**: Alternative disconnect route (incomplete)

```typescript
// DELETE /api/sessions/:phoneNumber - Desconectar sesión
router.delete('/:phoneNumber', sessionController.disconnectSession);
```

**Problem**: The `clear` endpoint is disabled, and the `disconnect` endpoint doesn't fully reset the session.

---

### 4. Current disconnectSession Implementation (lila-app/src/whatsapp/baileys/sessions.simple.ts)

**Line 278-288**: Incomplete reset logic

```typescript
export async function disconnectSession(sessionId: string): Promise<void> {
  const sock = sessions[sessionId];
  if (sock) {
    await sock.logout();                  // ✅ Logout from WhatsApp
    delete sessions[sessionId];           // ✅ Remove from memory
    delete stores[sessionId];             // ✅ Remove store from memory
    delete qrCodes[sessionId];            // ✅ Clear QR code
    readyClients.delete(sessionId);       // ✅ Remove ready status
    logger.info(`Session ${sessionId} disconnected and removed`);
  }
}
```

**What it does**:
- ✅ Logs out from WhatsApp
- ✅ Clears in-memory dictionaries

**What it DOESN'T do** (but should):
- ❌ Delete physical session files from `data/sessions/{phone}/`
- ❌ Clear queue files from `data/whatsapp/outbox/{phone}.json`
- ❌ Delete backup directories

---

### 5. Legacy clearSession Implementation (Backup reference)

**Old ConnectionManager.clearSession** (backup/2026-02-09/whatsapp/baileys/connection.manager.ts:808-834)

```typescript
async clearSession(sessionPhone: string): Promise<void> {
  try {
    this.disableSession(sessionPhone);              // Disable the session
    this.resetReconnectState(sessionPhone);         // Reset reconnect attempts

    const socket = this.connections.get(sessionPhone);
    if (socket) {
      try {
        await socket.end({ cancel: true });         // End the socket connection
      } catch (error) {
        logger.warn(`Failed to end socket for ${sessionPhone}: ${String(error)}`);
      }
    }

    this.cleanupSession(sessionPhone, { clearQr: true });  // Clean up in-memory state

    const sessionDir = path.join(config.whatsapp.sessionDir, sessionPhone);
    await this.purgeAuthState(sessionPhone, sessionDir);   // ✅ DELETE PHYSICAL FILES
    await this.markSessionCleared(sessionPhone);           // Mark as cleared
    await outboxQueue.clear(sessionPhone);                 // ✅ CLEAR QUEUE FILES

    logger.info(`Session ${sessionPhone} cleared`);
  } catch (error) {
    logger.error(`Error clearing session ${sessionPhone}:`, error);
    throw error;
  }
}
```

**purgeAuthState** (connection.manager.ts:1352-1361):

```typescript
private async purgeAuthState(sessionPhone: string, sessionDir: string): Promise<void> {
  try {
    await fs.remove(sessionDir);       // ✅ DELETE session directory
    const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionPhone);
    await fs.remove(backupDir);        // ✅ DELETE backup directory
    logger.info(`🗑️ Purged auth state and backups for ${sessionPhone}`);
  } catch (error) {
    logger.error(`❌ Failed to purge auth state for ${sessionPhone}:`, error);
  }
}
```

**What the old implementation did**:
1. ✅ End socket connection (logout)
2. ✅ Clean up memory state
3. ✅ **Delete physical session files** from disk
4. ✅ **Delete backup files**
5. ✅ **Clear queue files**
6. ✅ Mark session as cleared (prevents auto-reconnect)

---

## File System Impact

### Session Files Location

**Configuration** (src/config/environment.ts:31):
```typescript
sessionDir: process.env.WHATSAPP_SESSION_DIR || './data/sessions'
```

### Files Created Per Session

When a WhatsApp session is created for phone `51987654321`, the following files are created:

```
data/sessions/51987654321/
├── creds.json                    # ← WhatsApp credentials (auth keys)
├── app-state-sync-key-*.json     # ← Sync state
├── app-state-sync-version-*.json
├── sender-key-*.json
├── session-*.json
└── baileys_store.json            # ← Message/contact store
```

**Queue files**:
```
data/whatsapp/outbox/51987654321.json   # ← Pending messages queue
```

**Backup files** (if backups enabled):
```
data/sessions/backups/51987654321/
└── [timestamped backup files]
```

---

## Current vs Expected Behavior

| Action | Current Behavior | Expected Behavior |
|--------|------------------|-------------------|
| **Socket logout** | ✅ Calls `sock.logout()` | ✅ Calls `sock.logout()` |
| **Memory cleanup** | ✅ Deletes from dictionaries | ✅ Deletes from dictionaries |
| **Physical session files** | ❌ Files remain on disk | ✅ Delete `data/sessions/{phone}/` |
| **Queue files** | ❌ Queue persists | ✅ Delete `data/whatsapp/outbox/{phone}.json` |
| **Backup files** | ❌ Backups remain | ✅ Delete `data/sessions/backups/{phone}/` |
| **Auto-reconnect prevention** | ⚠️ May auto-reconnect | ✅ Prevented |
| **Credentials removed** | ❌ `creds.json` remains | ✅ All auth files deleted |

---

## Consequence of Current Implementation

### Scenario: User clicks "Reset Session"

**What happens now**:
1. ✅ Portal shows success toast
2. ✅ Session logs out from WhatsApp
3. ❌ Physical files remain at `data/sessions/51987654321/`
4. ❌ Queue file remains at `data/whatsapp/outbox/51987654321.json`
5. ❌ On next app restart or reconnect attempt:
   - Auto-recovery detects existing `creds.json`
   - Session automatically reconnects using old credentials
   - Queued messages may be sent unexpectedly

**User expectation** (from Portal tooltip):
> "Resetear sesión desconecta, elimina credenciales y limpia backups para evitar auto-recuperación"

**Reality**: Only disconnects, credentials and backups remain → auto-recovery still possible ❌

---

## Other Potential Breaking Points

### Portal WhatsApp API Calls

Portal makes the following API calls that need verification:

| Portal Endpoint | Expected lila-app Route | Status |
|----------------|------------------------|--------|
| `GET /api/whatsapp/v2/sessions` | `GET /api/sessions` | ⚠️ Need to verify |
| `GET /api/whatsapp/v2/sessions/:phone/status` | `GET /api/sessions/:phone/status` | ✅ Exists |
| `GET /api/whatsapp/v2/sessions/:phone/qr` | `GET /api/sessions/:phone/qr` | ✅ Exists |
| `POST /api/whatsapp/v2/sessions/:phone/pairing-code` | `POST /api/sessions/:phone/request-pairing-code` | ⚠️ Path mismatch |
| `DELETE /api/whatsapp/v2/sessions/:phone/delete` | `POST /api/sessions/:phone/clear` | ❌ BROKEN |
| `GET /api/whatsapp/v2/groups` | `GET /api/sessions/:phone/groups` | ⚠️ Need to verify |
| `GET /api/whatsapp/v2/contacts` | `GET /api/sessions/:phone/contacts` | ⚠️ Need to verify |

**Note**: Portal has proxy API routes at `/src/pages/api/whatsapp/v2/` that translate these calls to lila-app's endpoints.

---

## Solution Required

### 1. Implement `clearSession` function

**Location**: `src/whatsapp/baileys/sessions.simple.ts`

**Required functionality**:
```typescript
export async function clearSession(sessionId: string): Promise<void> {
  // 1. Logout if connected
  const sock = sessions[sessionId];
  if (sock) {
    try {
      await sock.logout();
    } catch (error) {
      logger.warn(`Failed to logout ${sessionId}:`, error);
    }
  }

  // 2. Clean up memory
  delete sessions[sessionId];
  delete stores[sessionId];
  delete qrCodes[sessionId];
  readyClients.delete(sessionId);

  // 3. Delete physical session files
  const sessionDir = path.join(config.whatsapp.sessionDir, sessionId);
  await fs.remove(sessionDir);

  // 4. Delete backup files (if exist)
  const backupDir = path.join(config.whatsapp.sessionDir, 'backups', sessionId);
  await fs.remove(backupDir);

  // 5. Clear queue files
  await outboxQueue.clear(sessionId);

  logger.info(`✅ Session ${sessionId} completely cleared`);
}
```

### 2. Create controller handler

**Location**: `src/api/controllers/session.controller.simple.ts`

```typescript
export async function clearSessionHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const { phoneNumber } = req.params;

    if (!phoneNumber) {
      const error: CustomError = new Error('phoneNumber is required');
      error.statusCode = HTTP_STATUS.BAD_REQUEST;
      return next(error);
    }

    await clearSession(phoneNumber);

    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: `Session ${phoneNumber} cleared completely`,
    });
  } catch (error) {
    next(error);
  }
}
```

### 3. Enable the route

**Location**: `src/api/routes/session.routes.ts`

**Uncomment line 28-29**:
```typescript
// Enable full session reset
router.post('/:phoneNumber/clear', sessionController.clearSession);
```

---

## Testing Checklist

After implementing the fix:

- [ ] Portal "Reset Session" button calls endpoint successfully
- [ ] Physical session files deleted from `data/sessions/{phone}/`
- [ ] Queue file deleted from `data/whatsapp/outbox/{phone}.json`
- [ ] Backup files deleted (if exist)
- [ ] Session does NOT auto-reconnect after reset
- [ ] New QR generated successfully when creating session again
- [ ] No orphaned files remain in data directories

---

## Additional Observations

### Auto-Recovery Risk

The current implementation's auto-reconnect logic (sessions.simple.ts:176-178) will attempt to reconnect if physical files exist:

```typescript
if (code !== DisconnectReason.loggedOut) {
  logger.info(`🔁 Reconnecting session ${sessionId}...`);
  setTimeout(() => startSession(sessionId, qrCb), 3000);
}
```

**Problem**: If `disconnectSession` is called but files remain, a subsequent connection drop will trigger auto-reconnect using the old credentials.

**Solution**: `clearSession` must delete physical files to prevent this behavior.

---

## Recommendation

**Priority**: 🔴 HIGH - This breaks core functionality expected by Portal users

**Action**:
1. Implement `clearSession` function in `sessions.simple.ts`
2. Add `clearSessionHandler` to `session.controller.simple.ts`
3. Enable the route in `session.routes.ts`
4. Add comprehensive tests
5. Verify Portal integration end-to-end

---

**Document Status**: Ready for implementation
**Last Updated**: 2026-02-09
