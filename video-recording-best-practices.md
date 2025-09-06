# 🎬 Video Recording Best Practices Guide

## 🖼️ Viewport and Video Size Matching

### The Gray Border Problem
When video recording size doesn't match browser viewport size, you get **gray space around browser content** in the final video. This happens because:

- **Video Canvas**: The recording area (e.g., 1280x720)
- **Browser Viewport**: The actual browser content area (e.g., 800x600)
- **Result**: Small browser window inside larger video canvas = gray borders

### ✅ Solution: Match Viewport to Video Size

```javascript
// RECOMMENDED: Automatic viewport matching (default behavior)
browser_start_recording({
  size: { width: 1280, height: 720 },
  autoSetViewport: true  // Default: true
})

// MANUAL: Set viewport separately if needed
browser_configure({
  viewport: { width: 1280, height: 720 }
})
browser_start_recording({
  size: { width: 1280, height: 720 },
  autoSetViewport: false
})
```

## 📐 Recommended Video Sizes

### For Marketing/Demo Videos:
- **1280x720 (HD 720p)** - Most common, great for demos
- **1920x1080 (Full HD)** - Higher quality, larger files
- **1024x768 (4:3)** - Good for web applications

### For Mobile/Responsive Testing:
- **375x667 (iPhone)** - Mobile portrait
- **768x1024 (iPad)** - Tablet portrait
- **1024x768 (iPad Landscape)** - Tablet landscape

### For Ultrawide/Desktop Apps:
- **1440x900** - Ultrawide format
- **1600x1200** - Large desktop format

## 🎯 Recording Mode Guide

### Smart Mode (Recommended for Demos)
```javascript
browser_set_recording_mode({ mode: "smart" })
browser_start_recording()
// Auto-pauses during waits, resumes during actions
// Perfect for clean marketing videos
```

### Continuous Mode (Traditional)
```javascript
browser_set_recording_mode({ mode: "continuous" })
browser_start_recording()
// Records everything including waits
// May have dead time, but captures everything
```

### Action-Only Mode (Minimal)
```javascript
browser_set_recording_mode({ mode: "action-only" })
browser_start_recording()
// Only records during browser interactions
// Very focused, minimal file sizes
```

### Segment Mode (Individual Clips)
```javascript
browser_set_recording_mode({ mode: "segment" })
browser_start_recording()
// Creates separate video files for each action
// Great for breaking demos into clips
```

## 🛠️ Complete Demo Recording Workflow

### Perfect Marketing Demo Setup:
```javascript
// 1. Set smart mode for auto-pause/resume
browser_set_recording_mode({ mode: "smart" })

// 2. Start recording with optimal size (auto-sets viewport)
browser_start_recording({
  size: { width: 1280, height: 720 },
  filename: "product-demo"
})

// 3. Perform demo actions (recording manages itself)
browser_navigate({ url: "https://example.com" })
browser_click({ element: "login button", ref: "..." })
browser_type({ element: "email field", ref: "...", text: "demo@example.org" })
browser_wait_for({ time: 3 })  // Auto-pauses here
browser_click({ element: "submit", ref: "..." })

// 4. Finalize recording
const videos = browser_stop_recording()
// Returns: ["path/to/product-demo-segment1.webm"]
```

### Multiple Segment Workflow:
```javascript
// Create separate clips for each feature
browser_set_recording_mode({ mode: "segment" })
browser_start_recording({ filename: "feature-demo" })

browser_navigate(...)     // Creates feature-demo-segment-1.webm
browser_click(...)        // Creates feature-demo-segment-2.webm
browser_type(...)         // Creates feature-demo-segment-3.webm

const segments = browser_stop_recording()
// Returns: ["segment-1.webm", "segment-2.webm", "segment-3.webm"]
```

## 🎨 Visual Quality Tips

### 1. Always Match Viewport to Video Size
- Use `autoSetViewport: true` (default) in `browser_start_recording`
- Or manually set with `browser_configure({ viewport: {...} })`

### 2. Choose Appropriate Video Size
- **1280x720** for most demos (HD quality, reasonable file size)
- **1920x1080** for high-quality presentations
- **1024x768** for web app demos (good for older projectors)

### 3. Consider Your Content
- **Wide layouts**: Use 16:9 aspect ratio (1280x720, 1920x1080)
- **Square content**: Use 1:1 or 4:3 ratios
- **Mobile apps**: Use mobile device dimensions

### 4. Test Your Setup
```javascript
// Quick test workflow
browser_reveal_artifact_paths()  // See where videos will be saved
browser_start_recording({ size: { width: 1280, height: 720 } })
browser_navigate({ url: "https://example.com" })
browser_take_screenshot()  // Compare screenshot to video dimensions
browser_stop_recording()
```

## 🚀 Common Use Cases

### Marketing Demo:
```javascript
browser_set_recording_mode({ mode: "smart" })
browser_start_recording({
  size: { width: 1280, height: 720 },
  filename: "product-demo"
})
// Perfect for marketing with auto-pause/resume
```

### Feature Testing Documentation:
```javascript
browser_set_recording_mode({ mode: "segment" })
browser_start_recording({
  size: { width: 1440, height: 900 },
  filename: "feature-test-clips"
})
// Creates individual clips for each test
```

### Debugging Session:
```javascript
browser_set_recording_mode({ mode: "continuous" })
browser_start_recording({
  size: { width: 1920, height: 1080 },
  filename: "debug-session"
})
// Records everything for later analysis
```

## 🔍 Troubleshooting

### Problem: Gray borders around browser content
**Solution**: Ensure viewport matches video size
```javascript
browser_start_recording({
  size: { width: 1280, height: 720 },
  autoSetViewport: true  // This fixes it
})
```

### Problem: Video files not found
**Solution**: Use path revelation tool
```javascript
browser_reveal_artifact_paths()  // Shows exact file locations
```

### Problem: Too much dead time in videos
**Solution**: Use smart mode
```javascript
browser_set_recording_mode({ mode: "smart" })  // Auto-eliminates dead time
```

### Problem: Need separate clips
**Solution**: Use segment mode
```javascript
browser_set_recording_mode({ mode: "segment" })  // Creates individual files
```

---

## 📋 Quick Reference Commands

- `browser_start_recording()` - Begin recording with auto-viewport matching
- `browser_set_recording_mode()` - Choose recording behavior
- `browser_pause_recording()` - Manual pause control
- `browser_resume_recording()` - Manual resume control
- `browser_recording_status()` - Check current state
- `browser_stop_recording()` - Finalize and get video paths
- `browser_reveal_artifact_paths()` - Find where videos are saved
- `browser_configure()` - Set viewport and other browser settings