# MCP Roots Test Workspace

This workspace is used to test the MCP roots functionality with Playwright.

## Expected Behavior

When using Playwright tools from this workspace, they should:
- Detect this directory as the project root
- Save screenshots/videos to this directory
- Use environment-specific browser options

## Test Steps

1. Use browser_navigate to go to a website
2. Take a screenshot - should save to this workspace
3. Start video recording - should save to this workspace  
4. Check environment detection