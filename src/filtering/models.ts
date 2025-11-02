/**
 * TypeScript models for Universal Ripgrep Filtering System in Playwright MCP.
 * 
 * Adapted from MCPlaywright's filtering architecture to work with our
 * differential snapshot system and TypeScript MCP tools.
 */

export enum FilterMode {
    CONTENT = 'content',
    COUNT = 'count',
    FILES_WITH_MATCHES = 'files'
}

/**
 * LLM-friendly filter presets for common scenarios (no jq knowledge required)
 */
export type FilterPreset =
    | 'buttons_only'        // Interactive buttons only
    | 'links_only'          // Links and navigation
    | 'forms_only'          // Form inputs and controls
    | 'errors_only'         // Console errors
    | 'warnings_only'       // Console warnings
    | 'interactive_only'    // All interactive elements (buttons, links, inputs)
    | 'validation_errors'   // Validation/alert messages
    | 'navigation_items'    // Navigation menus and items
    | 'headings_only'       // Page headings (h1-h6)
    | 'images_only'         // Images
    | 'changed_text_only';  // Elements with text changes

export interface UniversalFilterParams {
    /**
     * Ripgrep pattern to filter with (regex supported)
     */
    filter_pattern: string;
    
    /**
     * Specific fields to search within. If not provided, uses default fields.
     * Examples: ["element.text", "element.attributes", "console.message", "url"]
     */
    filter_fields?: string[];
    
    /**
     * Type of filtering output
     */
    filter_mode?: FilterMode;
    
    /**
     * Case sensitive pattern matching (default: true)
     */
    case_sensitive?: boolean;
    
    /**
     * Match whole words only (default: false)
     */
    whole_words?: boolean;
    
    /**
     * Number of context lines around matches (default: none)
     */
    context_lines?: number;
    
    /**
     * Number of context lines before matches
     */
    context_before?: number;
    
    /**
     * Number of context lines after matches
     */
    context_after?: number;
    
    /**
     * Invert match (show non-matches) (default: false)
     */
    invert_match?: boolean;
    
    /**
     * Enable multiline mode where . matches newlines (default: false)
     */
    multiline?: boolean;
    
    /**
     * Maximum number of matches to return
     */
    max_matches?: number;
}

export interface FilterableField {
    field_name: string;
    field_type: 'string' | 'number' | 'object' | 'array';
    searchable: boolean;
    description?: string;
}

export interface ToolFilterConfig {
    tool_name: string;
    filterable_fields: FilterableField[];
    default_fields: string[];
    content_fields: string[];
    supports_streaming: boolean;
    max_response_size?: number;
}

export interface FilterResult {
    /**
     * The filtered data maintaining original structure
     */
    filtered_data: any;
    
    /**
     * Number of pattern matches found
     */
    match_count: number;
    
    /**
     * Total number of items processed
     */
    total_items: number;
    
    /**
     * Number of items that matched and were included
     */
    filtered_items: number;
    
    /**
     * Summary of filter parameters used
     */
    filter_summary: {
        pattern: string;
        mode: FilterMode;
        fields_searched: string[];
        case_sensitive: boolean;
        whole_words: boolean;
        invert_match: boolean;
        context_lines?: number;
    };
    
    /**
     * Execution time in milliseconds
     */
    execution_time_ms: number;
    
    /**
     * Pattern that was used for filtering
     */
    pattern_used: string;
    
    /**
     * Fields that were actually searched
     */
    fields_searched: string[];
}

export interface DifferentialFilterResult extends FilterResult {
    /**
     * Type of differential data that was filtered
     */
    differential_type: 'semantic' | 'simple' | 'both';
    
    /**
     * Breakdown of what changed and matched the filter
     */
    change_breakdown: {
        elements_added_matches: number;
        elements_removed_matches: number;
        elements_modified_matches: number;
        console_activity_matches: number;
        url_change_matches: number;
        title_change_matches: number;
    };
    
    /**
     * Performance metrics specific to differential filtering
     */
    differential_performance: {
        /**
         * Size reduction from original snapshot
         */
        size_reduction_percent: number;
        
        /**
         * Additional reduction from filtering 
         */
        filter_reduction_percent: number;
        
        /**
         * Combined reduction (differential + filter)
         */
        total_reduction_percent: number;
    };
}

/**
 * Configuration for integrating filtering with differential snapshots
 */
export interface DifferentialFilterConfig {
    /**
     * Enable filtering on differential snapshots
     */
    enable_differential_filtering: boolean;
    
    /**
     * Default fields to search in differential changes
     */
    default_differential_fields: string[];
    
    /**
     * Whether to apply filtering before or after differential generation
     */
    filter_timing: 'before_diff' | 'after_diff';
    
    /**
     * Maximum size threshold for enabling streaming differential filtering
     */
    streaming_threshold_lines: number;
}

/**
 * Extended filter params specifically for differential snapshots
 */
export interface DifferentialFilterParams extends UniversalFilterParams {
    /**
     * Types of changes to include in filtering
     */
    change_types?: ('added' | 'removed' | 'modified' | 'console' | 'url' | 'title')[];

    /**
     * Whether to include change context in filter results
     */
    include_change_context?: boolean;

    /**
     * Minimum confidence threshold for semantic changes (0-1)
     */
    semantic_confidence_threshold?: number;

    // jq Integration Parameters

    /**
     * Filter preset for common scenarios (LLM-friendly, no jq knowledge needed)
     * Takes precedence over jq_expression if both are provided
     */
    filter_preset?: FilterPreset;

    /**
     * jq expression for structural JSON querying
     * Examples: '.changes[] | select(.type == "added")', '[.changes[]] | length'
     */
    jq_expression?: string;

    /**
     * jq options for controlling output format and behavior (nested, for backwards compatibility)
     * @deprecated Use flattened jq_* parameters instead for better LLM ergonomics
     */
    jq_options?: {
        /** Output raw strings (jq -r flag) */
        raw_output?: boolean;

        /** Compact output (jq -c flag) */
        compact?: boolean;

        /** Sort object keys (jq -S flag) */
        sort_keys?: boolean;

        /** Null input (jq -n flag) */
        null_input?: boolean;

        /** Exit status based on output (jq -e flag) */
        exit_status?: boolean;

        /** Slurp - read entire input stream into array (jq -s flag) */
        slurp?: boolean;
    };

    // Flattened jq Options (LLM-friendly, preferred over jq_options)

    /** Output raw strings instead of JSON (jq -r flag) */
    jq_raw_output?: boolean;

    /** Compact JSON output without whitespace (jq -c flag) */
    jq_compact?: boolean;

    /** Sort object keys in output (jq -S flag) */
    jq_sort_keys?: boolean;

    /** Read entire input into array and process once (jq -s flag) */
    jq_slurp?: boolean;

    /** Set exit code based on output (jq -e flag) */
    jq_exit_status?: boolean;

    /** Use null as input instead of reading data (jq -n flag) */
    jq_null_input?: boolean;

    /**
     * Order of filter application
     * - 'jq_first': Apply jq structural filter, then ripgrep pattern (default, recommended)
     * - 'ripgrep_first': Apply ripgrep pattern, then jq structural filter
     * - 'jq_only': Only apply jq filtering, skip ripgrep
     * - 'ripgrep_only': Only apply ripgrep filtering, skip jq
     */
    filter_order?: 'jq_first' | 'ripgrep_first' | 'jq_only' | 'ripgrep_only';
}

/**
 * Enhanced filter result with jq metrics
 */
export interface JqFilterResult extends DifferentialFilterResult {
    /**
     * jq expression that was applied
     */
    jq_expression_used?: string;

    /**
     * jq execution metrics
     */
    jq_performance?: {
        execution_time_ms: number;
        input_size_bytes: number;
        output_size_bytes: number;
        reduction_percent: number;
    };

    /**
     * Combined filtering metrics (differential + jq + ripgrep)
     */
    combined_performance: {
        differential_reduction_percent: number;  // From differential processing
        jq_reduction_percent: number;            // From jq structural filtering
        ripgrep_reduction_percent: number;       // From ripgrep pattern matching
        total_reduction_percent: number;         // Combined total (can reach 99.9%+)

        differential_time_ms: number;
        jq_time_ms: number;
        ripgrep_time_ms: number;
        total_time_ms: number;
    };
}

/**
 * Shared filter override interface for per-operation filtering
 * Can be used by any interactive tool (click, type, navigate, etc.)
 * to override global snapshot filter configuration
 */
export interface SnapshotFilterOverride {
    /**
     * Filter preset (LLM-friendly, no jq knowledge needed)
     */
    filterPreset?: FilterPreset;

    /**
     * jq expression for structural filtering
     */
    jqExpression?: string;

    /**
     * Ripgrep pattern for text matching
     */
    filterPattern?: string;

    /**
     * Filter order (default: jq_first)
     */
    filterOrder?: 'jq_first' | 'ripgrep_first' | 'jq_only' | 'ripgrep_only';

    // Flattened jq options
    jqRawOutput?: boolean;
    jqCompact?: boolean;
    jqSortKeys?: boolean;
    jqSlurp?: boolean;
    jqExitStatus?: boolean;
    jqNullInput?: boolean;

    // Ripgrep options
    filterFields?: string[];
    filterMode?: 'content' | 'count' | 'files';
    caseSensitive?: boolean;
    wholeWords?: boolean;
    contextLines?: number;
    invertMatch?: boolean;
    maxMatches?: number;
}