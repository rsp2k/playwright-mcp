# Browser UI Customization Guide 🎨

This guide demonstrates how to customize the Playwright browser interface using the enhanced `browser_configure` tool.

## Available UI Customization Options

### 1. Visual Demonstration Mode (`slowMo`)
Add delays between browser actions for visual demonstration and recording purposes.

```json
{
  "slowMo": 500
}
```

**Use Cases:**
- Screen recording demos where actions need to be clearly visible
- Training videos showing step-by-step browser automation
- Debugging sessions where you want to see actions in slow motion

### 2. Developer Tools Integration (`devtools`)
Automatically open Chrome DevTools when the browser launches.

```json
{
  "devtools": true
}
```

**Use Cases:**
- Development and debugging sessions
- Network monitoring and analysis
- Performance profiling
- DOM inspection and JavaScript debugging

### 3. Custom Browser Arguments (`args`)
Pass custom command-line arguments to modify browser behavior and appearance.

```json
{
  "args": [
    "--force-dark-mode",
    "--enable-features=WebUIDarkMode",
    "--disable-web-security",
    "--start-maximized"
  ]
}
```

**Popular Arguments:**
- `--force-dark-mode`: Enable dark theme for browser UI
- `--enable-features=WebUIDarkMode`: Dark mode for web UI elements
- `--disable-web-security`: Disable CORS for testing (development only)
- `--start-maximized`: Start browser in maximized window
- `--force-color-profile=srgb`: Force consistent color profile
- `--disable-extensions`: Start without extensions
- `--incognito`: Start in incognito mode

### 4. Chromium Sandbox Control (`chromiumSandbox`)
Control the Chromium security sandbox for special deployment environments.

```json
{
  "chromiumSandbox": false
}
```

**Use Cases:**
- Docker containers where sandbox causes issues
- Restricted environments with limited system permissions
- Special testing scenarios requiring elevated access

⚠️ **Security Warning:** Only disable sandbox in controlled, trusted environments.

## Practical Examples

### Example 1: Demo Recording Setup
Perfect for creating professional screen recordings with visual appeal.

```javascript
// Configure browser for demo recording
await browser_configure({
  headless: false,
  slowMo: 500,           // 500ms delay between actions
  devtools: false,       // Keep UI clean for recording
  args: [
    "--start-maximized",
    "--force-color-profile=srgb",
    "--disable-web-security"
  ]
});

// Start recording
await browser_start_recording({
  filename: "product-demo",
  size: { width: 1920, height: 1080 }
});
```

### Example 2: Development & Debugging Setup
Ideal for development work with full debugging capabilities.

```javascript
// Configure browser for development
await browser_configure({
  headless: false,
  slowMo: 100,           // Slight delay to see actions
  devtools: true,        // Open DevTools automatically
  args: [
    "--disable-web-security",
    "--disable-features=VizDisplayCompositor"
  ]
});
```

### Example 3: Dark Mode Interface
Create a distinctive dark-themed browser for differentiation.

```javascript
// Configure dark mode browser
await browser_configure({
  headless: false,
  slowMo: 0,
  devtools: false,
  args: [
    "--force-dark-mode",
    "--enable-features=WebUIDarkMode",
    "--start-maximized"
  ]
});
```

### Example 4: Container Deployment
Configuration for Docker or restricted environments.

```javascript
// Configure for container deployment
await browser_configure({
  headless: true,
  chromiumSandbox: false,  // Disable sandbox for containers
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage"
  ]
});
```

## Best Practices

### 1. **Recording Demos**
- Use `slowMo: 300-800` for clear action visibility
- Keep `devtools: false` for clean recordings
- Use `--start-maximized` for full-screen demos
- Consider `--force-color-profile=srgb` for consistent colors

### 2. **Development Work**
- Enable `devtools: true` for debugging access
- Use moderate `slowMo: 100-200` to observe actions
- Include `--disable-web-security` for local testing only

### 3. **Production Deployments**
- Keep `chromiumSandbox: true` (default) for security
- Use minimal custom args to reduce attack surface
- Test configurations thoroughly before deployment

### 4. **Visual Differentiation**
- Use distinctive browser arguments to differentiate test instances
- Dark mode (`--force-dark-mode`) makes test browsers visually distinct
- Custom window titles with `--title-bar-text="Test Browser"`

## Integration with Video Recording

The UI customizations work seamlessly with the smart video recording system:

```javascript
// Set up visual demo mode
await browser_configure({
  headless: false,
  slowMo: 400,
  args: ["--start-maximized", "--force-dark-mode"]
});

// Start recording with matching viewport
await browser_start_recording({
  filename: "feature-demo",
  size: { width: 1920, height: 1080 },
  autoSetViewport: true
});

// Actions will now be recorded with:
// - 400ms delays between actions
// - Dark mode interface
// - Maximized window
// - Perfect viewport matching
```

## Troubleshooting

### Common Issues

1. **Browser won't start with custom args**
   - Check that arguments are valid for your Chrome version
   - Remove suspicious or deprecated arguments
   - Test without custom args first

2. **Sandbox issues in containers**
   - Set `chromiumSandbox: false`
   - Add `--no-sandbox` and `--disable-setuid-sandbox` to args
   - Ensure proper container permissions

3. **DevTools won't open**
   - Verify `headless: false` is set
   - Ensure `devtools: true` is properly configured
   - Check for conflicting arguments

### Validation Commands

Test your configuration with:
```bash
node test-ui-customization.cjs
```

This comprehensive test validates all UI customization features and provides feedback on successful configuration.

## Security Considerations

- **Never disable sandbox in production** unless absolutely necessary
- **Avoid `--disable-web-security`** in production environments  
- **Validate custom arguments** before deploying to production
- **Use minimal privileges** - only add arguments you specifically need
- **Test thoroughly** with your specific use case and environment

## Conclusion

The browser UI customization features provide powerful control over the Playwright browser appearance and behavior. Whether you're creating demo recordings, developing applications, or deploying in specialized environments, these options give you the flexibility to tailor the browser experience to your exact needs.

🎨 **Key Benefits:**
- ✅ Professional demo recordings with slowMo
- ✅ Enhanced debugging with devtools integration  
- ✅ Visual differentiation with custom themes
- ✅ Container deployment flexibility
- ✅ Seamless video recording integration

The customization system is production-ready and has been thoroughly tested! 🚀