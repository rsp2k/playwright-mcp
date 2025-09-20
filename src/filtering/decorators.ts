/**
 * TypeScript decorators for applying universal filtering to Playwright MCP tool responses.
 * 
 * Adapted from MCPlaywright's proven decorator architecture to work with our
 * TypeScript MCP tools and differential snapshot system.
 */

import { PlaywrightRipgrepEngine } from './engine.js';
import { UniversalFilterParams, ToolFilterConfig, FilterableField } from './models.js';

interface FilterDecoratorOptions {
    /**
     * List of fields that can be filtered
     */
    filterable_fields: string[];
    
    /**
     * Fields containing large text content for full-text search
     */
    content_fields?: string[];
    
    /**
     * Default fields to search when none specified
     */
    default_fields?: string[];
    
    /**
     * Whether tool supports streaming for large responses
     */
    supports_streaming?: boolean;
    
    /**
     * Size threshold for recommending streaming
     */
    max_response_size?: number;
}

/**
 * Extract filter parameters from MCP tool parameters.
 * This integrates with our MCP tool parameter structure.
 */
function extractFilterParams(params: any): UniversalFilterParams | null {
    if (!params || typeof params !== 'object') {
        return null;
    }
    
    // Look for filter parameters in the params object
    const filterData: Partial<UniversalFilterParams> = {};
    
    const filterParamNames = [
        'filter_pattern', 'filter_fields', 'filter_mode', 'case_sensitive',
        'whole_words', 'context_lines', 'context_before', 'context_after',
        'invert_match', 'multiline', 'max_matches'
    ] as const;
    
    for (const paramName of filterParamNames) {
        if (paramName in params && params[paramName] !== undefined) {
            (filterData as any)[paramName] = params[paramName];
        }
    }
    
    // Only create filter params if we have a pattern
    if (filterData.filter_pattern) {
        return filterData as UniversalFilterParams;
    }
    
    return null;
}

/**
 * Apply filtering to MCP tool response while preserving structure.
 */
async function applyFiltering(
    response: any,
    filterParams: UniversalFilterParams,
    options: FilterDecoratorOptions
): Promise<any> {
    try {
        const engine = new PlaywrightRipgrepEngine();
        
        // Determine content fields for searching
        const contentFields = options.content_fields || options.default_fields || options.filterable_fields.slice(0, 3);
        
        // Apply filtering
        const filterResult = await engine.filterResponse(
            response,
            filterParams,
            options.filterable_fields,
            contentFields
        );
        
        // Return filtered data with metadata
        return prepareFilteredResponse(response, filterResult);
        
    } catch (error) {
        console.warn('Filtering failed, returning original response:', error);
        return response;
    }
}

/**
 * Prepare the final filtered response with metadata.
 * Maintains compatibility with MCP response structure.
 */
function prepareFilteredResponse(originalResponse: any, filterResult: any): any {
    // For responses that look like they might be paginated or structured
    if (typeof originalResponse === 'object' && originalResponse !== null && !Array.isArray(originalResponse)) {
        if ('data' in originalResponse) {
            // Paginated response structure
            return {
                ...originalResponse,
                data: filterResult.filtered_data,
                filter_applied: true,
                filter_metadata: {
                    match_count: filterResult.match_count,
                    total_items: filterResult.total_items,
                    filtered_items: filterResult.filtered_items,
                    execution_time_ms: filterResult.execution_time_ms,
                    pattern_used: filterResult.pattern_used,
                    fields_searched: filterResult.fields_searched,
                    performance: {
                        size_reduction: `${Math.round((1 - filterResult.filtered_items / filterResult.total_items) * 100)}%`,
                        filter_efficiency: filterResult.match_count > 0 ? 'high' : 'no_matches'
                    }
                }
            };
        }
    }
    
    // For list responses or simple data
    if (Array.isArray(filterResult.filtered_data) || typeof filterResult.filtered_data === 'object') {
        return {
            data: filterResult.filtered_data,
            filter_applied: true,
            filter_metadata: {
                match_count: filterResult.match_count,
                total_items: filterResult.total_items,
                filtered_items: filterResult.filtered_items,
                execution_time_ms: filterResult.execution_time_ms,
                pattern_used: filterResult.pattern_used,
                fields_searched: filterResult.fields_searched,
                performance: {
                    size_reduction: `${Math.round((1 - filterResult.filtered_items / filterResult.total_items) * 100)}%`,
                    filter_efficiency: filterResult.match_count > 0 ? 'high' : 'no_matches'
                }
            }
        };
    }
    
    // For simple responses, return the filtered data directly
    return filterResult.filtered_data;
}

/**
 * Decorator factory for adding filtering capabilities to MCP tools.
 * 
 * This creates a wrapper that intercepts tool calls and applies filtering
 * when filter parameters are provided.
 */
export function filterResponse(options: FilterDecoratorOptions) {
    return function<T extends (...args: any[]) => Promise<any>>(target: T): T {
        const wrappedFunction = async function(this: any, ...args: any[]) {
            // Extract parameters from MCP tool call
            // MCP tools typically receive a single params object
            const params = args[0] || {};
            
            // Extract filter parameters
            const filterParams = extractFilterParams(params);
            
            // If no filtering requested, execute normally
            if (!filterParams) {
                return await target.apply(this, args);
            }
            
            // Execute the original function to get full response
            const response = await target.apply(this, args);
            
            // Apply filtering to the response
            const filteredResponse = await applyFiltering(response, filterParams, options);
            
            return filteredResponse;
        } as T;
        
        // Add metadata about filtering capabilities
        (wrappedFunction as any)._filter_config = {
            tool_name: target.name,
            filterable_fields: options.filterable_fields.map(field => ({
                field_name: field,
                field_type: 'string', // Could be enhanced to detect types
                searchable: true,
                description: `Searchable field: ${field}`
            } as FilterableField)),
            default_fields: options.default_fields || options.filterable_fields.slice(0, 3),
            content_fields: options.content_fields || [],
            supports_streaming: options.supports_streaming || false,
            max_response_size: options.max_response_size
        } as ToolFilterConfig;
        
        return wrappedFunction;
    };
}

/**
 * Enhanced decorator specifically for differential snapshot filtering.
 * This integrates directly with our revolutionary differential system.
 */
export function filterDifferentialResponse(options: FilterDecoratorOptions) {
    return function<T extends (...args: any[]) => Promise<any>>(target: T): T {
        const wrappedFunction = async function(this: any, ...args: any[]) {
            const params = args[0] || {};
            const filterParams = extractFilterParams(params);
            
            if (!filterParams) {
                return await target.apply(this, args);
            }
            
            // Execute the original function to get differential response
            const response = await target.apply(this, args);
            
            // Apply differential-specific filtering
            try {
                const engine = new PlaywrightRipgrepEngine();
                
                // Check if this is a differential snapshot response
                if (typeof response === 'string' && response.includes('🔄 Differential Snapshot')) {
                    // This is a formatted differential response
                    // We would need to parse it back to structured data for filtering
                    // For now, apply standard filtering to the string content
                    const filterResult = await engine.filterResponse(
                        { content: response },
                        filterParams,
                        ['content'],
                        ['content']
                    );
                    
                    if (filterResult.match_count > 0) {
                        return `🔍 Filtered ${response}\n\n📊 **Filter Results:** ${filterResult.match_count} matches found\n- Pattern: "${filterParams.filter_pattern}"\n- Execution time: ${filterResult.execution_time_ms}ms\n- Filter efficiency: ${Math.round((filterResult.match_count / filterResult.total_items) * 100)}% match rate`;
                    } else {
                        return `🚫 **No matches found in differential changes**\n- Pattern: "${filterParams.filter_pattern}"\n- Original changes available but didn't match filter\n- Try a different pattern or remove filter to see all changes`;
                    }
                }
                
                // For other response types, apply standard filtering
                return await applyFiltering(response, filterParams, options);
                
            } catch (error) {
                console.warn('Differential filtering failed, returning original response:', error);
                return response;
            }
        } as T;
        
        // Add enhanced metadata for differential filtering
        (wrappedFunction as any)._filter_config = {
            tool_name: target.name,
            filterable_fields: [
                ...options.filterable_fields.map(field => ({
                    field_name: field,
                    field_type: 'string',
                    searchable: true,
                    description: `Searchable field: ${field}`
                } as FilterableField)),
                // Add differential-specific fields
                { field_name: 'element.text', field_type: 'string', searchable: true, description: 'Text content of accessibility elements' },
                { field_name: 'element.attributes', field_type: 'object', searchable: true, description: 'HTML attributes of elements' },
                { field_name: 'element.role', field_type: 'string', searchable: true, description: 'ARIA role of elements' },
                { field_name: 'element.ref', field_type: 'string', searchable: true, description: 'Unique element reference for actions' },
                { field_name: 'console.message', field_type: 'string', searchable: true, description: 'Console log messages' },
                { field_name: 'url', field_type: 'string', searchable: true, description: 'URL changes' },
                { field_name: 'title', field_type: 'string', searchable: true, description: 'Page title changes' }
            ],
            default_fields: ['element.text', 'element.role', 'console.message'],
            content_fields: ['element.text', 'console.message'],
            supports_streaming: false, // Differential responses are typically small
            max_response_size: undefined
        } as ToolFilterConfig;
        
        return wrappedFunction;
    };
}

/**
 * Get filter configuration for a decorated tool function.
 */
export function getToolFilterConfig(func: Function): ToolFilterConfig | null {
    return (func as any)._filter_config || null;
}

/**
 * Registry for tracking filterable tools and their configurations.
 */
export class FilterRegistry {
    private tools: Map<string, ToolFilterConfig> = new Map();
    
    registerTool(toolName: string, config: ToolFilterConfig): void {
        this.tools.set(toolName, config);
    }
    
    getToolConfig(toolName: string): ToolFilterConfig | undefined {
        return this.tools.get(toolName);
    }
    
    listFilterableTools(): Record<string, ToolFilterConfig> {
        return Object.fromEntries(this.tools.entries());
    }
    
    getAvailableFields(toolName: string): string[] {
        const config = this.tools.get(toolName);
        return config ? config.filterable_fields.map(f => f.field_name) : [];
    }
}

// Global filter registry instance
export const filterRegistry = new FilterRegistry();