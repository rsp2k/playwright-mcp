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
}