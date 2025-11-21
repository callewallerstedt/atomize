# QR Code Camera Feature - Implementation Plan

## Overview
This feature allows users to scan a QR code with their phone, which opens a mobile web page with camera access. Users can take photos, and those photos are automatically sent to the desktop computer and inserted into the text field as payload (likely base64 encoded images or image references).

## Architecture Overview

```
Desktop Browser                    Mobile Browser
     │                                  │
     │ 1. Generate QR Code             │
     │    (with session ID)             │
     │                                  │
     │ 2. Display QR Code               │
     │    ──────────────────────────────>│
     │                                  │ 3. Scan QR Code
     │                                  │    Opens mobile page
     │                                  │
     │ 4. Polling/SSE                  │
     │    ──────────────────────────────>│
     │                                  │ 5. Take Photo(s)
     │                                  │    Upload to server
     │                                  │
     │ 6. Receive images                │
     │    <──────────────────────────────│
     │                                  │
     │ 7. Insert into text field        │
     │                                  │
```

## Implementation Steps

### Phase 1: Backend Infrastructure

#### 1.1 Create Session Management API
**File:** `src/app/api/qr-session/create/route.ts`
- Generate unique session ID (UUID)
- Store session in memory (or database) with:
  - `sessionId`: string
  - `createdAt`: timestamp
  - `images`: array of image data
  - `expiresAt`: timestamp (e.g., 10 minutes)
- Return `{ sessionId, qrUrl }` where `qrUrl` is the mobile page URL

#### 1.2 Create Image Upload Endpoint
**File:** `src/app/api/qr-session/[sessionId]/upload/route.ts`
- Accept POST with FormData containing image(s)
- Validate session exists and hasn't expired
- Convert images to base64 or store as files
- Append to session's images array
- Return success response

#### 1.3 Create Image Polling Endpoint
**File:** `src/app/api/qr-session/[sessionId]/images/route.ts`
- GET endpoint that returns all images for a session
- Used by desktop to poll for new images
- Return `{ images: Array<{ id, data, timestamp }> }`

**Alternative:** Use Server-Sent Events (SSE) for real-time updates
**File:** `src/app/api/qr-session/[sessionId]/stream/route.ts`
- Similar to existing SSE routes in the codebase
- Stream new images as they arrive

### Phase 2: Mobile Web Page

#### 2.1 Create Mobile Camera Page
**File:** `src/app/qr-camera/[sessionId]/page.tsx`
- Mobile-optimized React page
- Request camera permissions using `navigator.mediaDevices.getUserMedia()`
- Display camera preview
- Capture button to take photos
- Support multiple photos (gallery view)
- Upload button to send all photos
- Show upload progress/status

**Key Features:**
- Use `<input type="file" accept="image/*" capture="environment">` for better mobile camera access
- Or use `getUserMedia()` API for live preview
- Convert images to base64 or FormData for upload
- Handle camera permission errors gracefully

#### 2.2 Mobile Page Styling
- Full-screen camera interface
- Large, thumb-friendly buttons
- Portrait orientation optimized
- Dark mode support (match app theme)

### Phase 3: Desktop Integration

#### 3.1 QR Code Generation
**Dependencies needed:**
```bash
npm install qrcode.react
# or
npm install react-qr-code
```

**Component:** Add QR code button/icon next to textarea
- Button to show/hide QR code modal
- Generate QR code with URL: `${window.location.origin}/qr-camera/${sessionId}`
- Display QR code in a modal overlay

#### 3.2 Session Management in Practice Page
**File:** `src/app/subjects/[slug]/practice/page.tsx`

Add state:
```typescript
const [qrSessionId, setQrSessionId] = useState<string | null>(null);
const [showQrModal, setShowQrModal] = useState(false);
const [qrImages, setQrImages] = useState<Array<{id: string, data: string}>>([]);
```

Add functions:
- `createQrSession()` - Call API to create session
- `pollForImages()` - Poll or use SSE to get new images
- `insertImageToInput()` - Insert image data into textarea

#### 3.3 Image Polling/SSE Implementation
**Option A: Polling (Simpler)**
- Use `setInterval` to poll every 1-2 seconds
- Stop polling when modal is closed or session expires

**Option B: Server-Sent Events (Better UX)**
- Similar to existing SSE implementation in codebase
- Real-time updates without constant polling
- More efficient

#### 3.4 Insert Images into Text Field
When images are received:
- Convert to base64 data URLs or markdown image syntax
- Insert at cursor position in textarea
- Format: `![image](data:image/jpeg;base64,...)` or similar
- Support multiple images

### Phase 4: UI Components

#### 4.1 QR Code Modal Component
**Component:** `QRCodeModal`
- Modal overlay with QR code display
- Session status indicator
- Close button
- Instructions text
- Show received images count

#### 4.2 Camera Icon Button
- Add camera icon button next to textarea (similar to difficulty buttons)
- Position: Left side of textarea or in the button group
- Opens QR modal when clicked

### Phase 5: Image Format & Payload

#### 5.1 Image Storage Options

**Option A: Base64 in Text Field (Simple)**
- Convert images to base64 data URLs
- Insert directly into textarea
- Pros: No file storage needed, works offline
- Cons: Large payload, may hit textarea size limits

**Option B: Upload to Server, Store URLs**
- Upload images to server/storage
- Get URLs back
- Insert markdown image syntax: `![alt](url)`
- Pros: Smaller payload, better performance
- Cons: Requires file storage, images need to persist

**Option C: Hybrid**
- Small images: base64
- Large images: upload and use URLs

#### 5.2 Image Processing
- Compress images on mobile before upload
- Resize if too large
- Support common formats: JPEG, PNG, WebP

### Phase 6: Error Handling & Edge Cases

#### 6.1 Session Expiration
- Sessions expire after 10-15 minutes
- Show expiration message
- Allow creating new session

#### 6.2 Camera Permissions
- Handle denied permissions gracefully
- Show instructions to enable in browser settings
- Fallback to file picker if camera unavailable

#### 6.3 Network Issues
- Handle upload failures
- Retry mechanism
- Show error messages

#### 6.4 Multiple Devices
- One session per desktop instance
- Prevent conflicts if multiple tabs open

## Technical Details

### Dependencies to Add
```json
{
  "qrcode.react": "^3.1.0",  // or react-qr-code
  "@types/qrcode.react": "^3.0.0"  // if using TypeScript types
}
```

### API Route Structure
```
/api/qr-session/
  ├── create/          POST - Create new session
  ├── [sessionId]/
  │   ├── upload/      POST - Upload images
  │   ├── images/      GET - Get all images (polling)
  │   └── stream/      GET - SSE stream for real-time updates
```

### Session Storage
**Option 1: In-Memory (Simple, for MVP)**
- Use Map or object to store sessions
- Clear expired sessions periodically
- Lost on server restart

**Option 2: Database (Production)**
- Store in Prisma database
- Persist across restarts
- Better for scaling

**Option 3: Redis (Advanced)**
- Fast, in-memory with expiration
- Good for production at scale

### Mobile Page URL Structure
```
/qr-camera/[sessionId]
```
Example: `https://yourapp.com/qr-camera/abc123-def456-ghi789`

### QR Code Data Format
```
https://yourapp.com/qr-camera/{sessionId}
```

## Implementation Order

1. **Backend APIs** (Phase 1)
   - Session creation
   - Image upload
   - Image retrieval (polling first, SSE later)

2. **Mobile Page** (Phase 2)
   - Basic camera access
   - Photo capture
   - Upload functionality

3. **Desktop Integration** (Phase 3)
   - QR code generation
   - Session management
   - Image polling
   - Text field insertion

4. **UI Polish** (Phase 4)
   - Modal design
   - Button placement
   - Status indicators

5. **Optimization** (Phase 5-6)
   - Image compression
   - Error handling
   - Performance improvements

## Security Considerations

1. **Session Validation**
   - Validate session IDs are valid UUIDs
   - Check expiration
   - Rate limit uploads per session

2. **Image Validation**
   - Validate file types
   - Check file sizes
   - Sanitize filenames

3. **CORS**
   - Ensure mobile page can upload to API
   - Configure CORS headers if needed

4. **Rate Limiting**
   - Limit uploads per session
   - Prevent abuse

## Testing Checklist

- [ ] QR code generates correctly
- [ ] Mobile page opens when QR code scanned
- [ ] Camera permissions requested properly
- [ ] Photos can be captured
- [ ] Multiple photos can be taken
- [ ] Images upload successfully
- [ ] Desktop receives images via polling/SSE
- [ ] Images insert into text field correctly
- [ ] Session expiration works
- [ ] Error handling for network issues
- [ ] Works on iOS Safari
- [ ] Works on Android Chrome
- [ ] Works on different screen sizes

## Future Enhancements

1. **Image Preview**
   - Show thumbnails in text field
   - Allow removing images before sending

2. **OCR Integration**
   - Extract text from images automatically
   - Insert text into field

3. **Drawing/Annotation**
   - Allow drawing on images before upload
   - Add text annotations

4. **Batch Processing**
   - Process multiple images at once
   - Show progress for large batches

5. **Cloud Storage**
   - Store images in S3/Cloudinary
   - Generate permanent URLs

## Estimated Complexity

- **Backend APIs**: Medium (2-3 hours)
- **Mobile Page**: Medium-High (3-4 hours)
- **Desktop Integration**: Medium (2-3 hours)
- **UI/UX Polish**: Low-Medium (1-2 hours)
- **Testing & Bug Fixes**: Medium (2-3 hours)

**Total**: ~10-15 hours for full implementation





