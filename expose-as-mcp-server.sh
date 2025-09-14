#!/usr/bin/env bash

# Get the project name from the directory name
PROJECT_NAME=$(basename "$PWD")
SCRIPT_DIR="$( dirname "${BASH_SOURCE[0]}")"

# Function to start MCP server with optional logging
start_mcp_server() {
    local args=("$@")
    local log_file=""
    local filtered_args=()
    
    # Check for --log option and extract log file
    for i in "${!args[@]}"; do
        if [[ "${args[i]}" == "--log" ]]; then
            if [[ -n "${args[i+1]}" && "${args[i+1]}" != --* ]]; then
                log_file="${args[i+1]}"
                # Skip both --log and the filename
                ((i++))
            else
                log_file="mcp-server-${PROJECT_NAME}-$(date +%Y%m%d-%H%M%S).log"
            fi
        elif [[ "${args[i-1]:-}" != "--log" ]]; then
            filtered_args+=("${args[i]}")
        fi
    done
    
    cd "$SCRIPT_DIR"
    
    if [[ -n "$log_file" ]]; then
        echo "🔄 Starting MCP server with logging to: $log_file"
        echo "📝 Log includes all MCP protocol communication (stdin/stdout)"
        # Use script command to capture all I/O including MCP protocol messages
        script -q -f -c "claude mcp serve ${filtered_args[*]}" "$log_file"
    else
        claude mcp serve "${filtered_args[@]}"
    fi
}

# Function to show comprehensive documentation
show_full_documentation() {
    echo "🤖 CLAUDE MCP SERVER - COMPREHENSIVE DOCUMENTATION"
    echo "================================================="
    echo "Project: ${PROJECT_NAME}"
    echo "Location: ${SCRIPT_DIR}"
    echo "Generated: $(date)"
    echo ""
    echo "🎯 PURPOSE:"
    echo "This script enables the '${PROJECT_NAME}' project to function as an MCP (Model Context Protocol)"
    echo "server, allowing OTHER Claude Code projects to access this project's tools, files, and resources."
    echo ""
    echo "🔗 WHAT IS MCP?"
    echo "MCP (Model Context Protocol) allows Claude projects to communicate with each other."
    echo "When you add this project as an MCP server to another project, that project gains access to:"
    echo "  • All files and directories in this project (${SCRIPT_DIR})"
    echo "  • Claude Code tools (Read, Write, Edit, Bash, etc.) scoped to this project"
    echo "  • Any custom tools or resources defined in this project's MCP configuration"
    echo "  • Full filesystem access within this project's boundaries"
    echo ""
    echo "📚 INTEGRATION INSTRUCTIONS:"
    echo ""
    echo "🔧 METHOD 1 - Add as MCP Server to Another Project:"
    echo "   1. Navigate to the TARGET project directory (where you want to USE this server)"
    echo "   2. Run this exact command:"
    echo "      claude mcp add -s local REMOTE-${PROJECT_NAME} ${SCRIPT_DIR}/expose-as-mcp-server.sh"
    echo "   3. The target project can now access this project's resources via MCP"
    echo "   4. Verify with: claude mcp list"
    echo ""
    echo "🚀 METHOD 2 - Start Server Manually (for testing/development):"
    echo "   $0 -launch [options]      # Explicit launch syntax"
    echo "   $0 [options]              # Direct options (shorthand)"
    echo ""
    echo "AVAILABLE MCP SERVER OPTIONS:"
    echo "  -d, --debug   Enable debug mode (shows detailed MCP communication)"
    echo "  --verbose     Override verbose mode setting from config"
    echo "  --log [file]  Capture all MCP protocol communication to file"
    echo "                (auto-generates filename if not specified)"
    echo "  -h, --help    Show Claude MCP serve help"
    echo ""
    echo "USAGE EXAMPLES:"
    echo "  $0                           # Show brief help message"
    echo "  $0 --info                   # Show this comprehensive documentation"
    echo "  $0 -launch                  # Start MCP server"
    echo "  $0 -launch --debug          # Start with debug logging"
    echo "  $0 -launch --log            # Start with auto-generated log file"
    echo "  $0 -launch --log my.log     # Start with custom log file"
    echo "  $0 --debug --log --verbose  # All options combined"
    echo "  $0 --help                   # Show claude mcp serve help"
    echo ""
    echo "🔧 TECHNICAL DETAILS:"
    echo "• Script Location: ${SCRIPT_DIR}/expose-as-mcp-server.sh"
    echo "• Working Directory: Changes to ${SCRIPT_DIR} before starting server"
    echo "• Underlying Command: claude mcp serve [options]"
    echo "• Protocol: JSON-RPC over stdin/stdout (MCP specification)"
    echo "• Tool Scope: All Claude Code tools scoped to this project directory"
    echo "• File Access: Full read/write access within ${SCRIPT_DIR}"
    echo "• Process Model: Synchronous stdio communication"
    echo ""
    echo "🛡️ SECURITY CONSIDERATIONS:"
    echo "• MCP clients get full file system access to this project directory"
    echo "• Bash tool can execute commands within this project context"
    echo "• No network restrictions - server can make web requests if needed"
    echo "• Consider access control if sharing with untrusted projects"
    echo ""
    echo "🐛 TROUBLESHOOTING:"
    echo "• If connection fails: Try with --debug flag for detailed logs"
    echo "• If tools unavailable: Verify Claude Code installation and permissions"
    echo "• If logging issues: Check write permissions in ${SCRIPT_DIR}"
    echo "• For protocol debugging: Use --log option to capture all communication"
    echo ""
    echo "📖 ADDITIONAL RESOURCES:"
    echo "• Claude Code MCP Documentation: https://docs.anthropic.com/en/docs/claude-code/mcp"
    echo "• MCP Specification: https://spec.modelcontextprotocol.io/"
    echo "• Project Repository: Check for README.md in ${SCRIPT_DIR}"
    echo ""
    echo "⚠️  IMPORTANT NOTES FOR AUTOMATED CALLERS:"
    echo "• This script expects to be called from command line or MCP client"
    echo "• Exit code 1 when showing help (normal behavior, not an error)"
    echo "• Exit code 0 when starting server successfully"
    echo "• Server runs indefinitely until interrupted (Ctrl+C to stop)"
    echo "• Log files created in current directory if --log used"
}

# Check for special flags
if [[ "$1" == "-launch" ]]; then
    # Pass any additional arguments to the MCP server function
    start_mcp_server "${@:2}"
elif [[ "$1" == "--info" || "$1" == "--help-full" || "$1" == "--explain" || "$1" == "--about" ]]; then
    # Show comprehensive documentation
    show_full_documentation
elif [[ $# -gt 0 ]]; then
    # If any other arguments are passed, pass them directly to MCP server function
    start_mcp_server "$@"
else
    echo "🤖 Claude MCP Server: ${PROJECT_NAME}"
    echo ""
    echo "This script exposes the '${PROJECT_NAME}' project as an MCP server,"
    echo "allowing other Claude projects to access its files and tools."
    echo ""
    echo "📋 QUICK START:"
    echo "• To add this server to another project:"
    echo "  claude mcp add -s local -- REMOTE-${PROJECT_NAME} ${SCRIPT_DIR}/expose-as-mcp-server.sh -launch"
    echo "   * NOTE, cause of shell -  /\ - this tells `claude` that any remaining arguments `-` or `--` should be ignored by it."
    eho  "   *  - those 'ignored' arguments are passed to it's 'command'  (see claude mcp --help)"
    echo ""
    echo "• To start server manually:"
    echo "  $0 -launch [options]"
    echo ""
    echo "📚 MORE OPTIONS:"
    echo "  $0 --info         # Comprehensive documentation"
    echo "  $0 --debug        # Start with debug logging"
    echo "  $0 --log          # Start with protocol logging"
    echo "  $0 --help         # Show claude mcp serve help"
    echo ""
    echo "MCP allows Claude projects to share tools and files across projects."
    echo "Run '$0 --info' for detailed documentation."
    exit 1
fi
