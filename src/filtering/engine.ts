/**
 * TypeScript Ripgrep Filter Engine for Playwright MCP.
 *
 * High-performance filtering engine adapted from MCPlaywright's proven architecture
 * to work with our differential snapshot system and TypeScript/Node.js environment.
 *
 * Now with jq integration for ultimate filtering power: structural queries + text patterns.
 */

import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
    UniversalFilterParams,
    FilterResult,
    FilterMode,
    DifferentialFilterResult,
    DifferentialFilterParams,
    JqFilterResult,
    FilterPreset
} from './models.js';
import { JqEngine, type JqOptions } from './jqEngine.js';
import type { AccessibilityDiff } from '../context.js';

interface FilterableItem {
    index: number;
    searchable_text: string;
    original_data: any;
    fields_found: string[];
}

interface RipgrepResult {
    matching_items: FilterableItem[];
    total_matches: number;
    match_details: Record<number, string[]>;
}

export class PlaywrightRipgrepEngine {
    private tempDir: string;
    private createdFiles: Set<string> = new Set();
    private jqEngine: JqEngine;

    constructor() {
        this.tempDir = join(tmpdir(), 'playwright-mcp-filtering');
        this.jqEngine = new JqEngine();
        this.ensureTempDir();
    }

    /**
     * Convert filter preset to jq expression
     * LLM-friendly presets that don't require jq knowledge
     */
    static presetToExpression(preset: FilterPreset): string {
        const presetMap: Record<FilterPreset, string> = {
            'buttons_only': '.elements[] | select(.role == "button")',
            'links_only': '.elements[] | select(.role == "link")',
            'forms_only': '.elements[] | select(.role == "textbox" or .role == "combobox" or .role == "checkbox" or .role == "radio" or .role == "searchbox" or .role == "spinbutton")',
            'errors_only': '.console[] | select(.level == "error")',
            'warnings_only': '.console[] | select(.level == "warning")',
            'interactive_only': '.elements[] | select(.role == "button" or .role == "link" or .role == "textbox" or .role == "combobox" or .role == "checkbox" or .role == "radio" or .role == "searchbox")',
            'validation_errors': '.elements[] | select(.role == "alert" or .attributes.role == "alert")',
            'navigation_items': '.elements[] | select(.role == "navigation" or .role == "menuitem" or .role == "tab")',
            'headings_only': '.elements[] | select(.role == "heading")',
            'images_only': '.elements[] | select(.role == "img" or .role == "image")',
            'changed_text_only': '.elements[] | select(.text_changed == true or (.previous_text and .current_text and (.previous_text != .current_text)))'
        };

        return presetMap[preset];
    }

    private async ensureTempDir(): Promise<void> {
        try {
            await fs.mkdir(this.tempDir, { recursive: true });
        } catch (error) {
            // Directory might already exist, ignore
        }
    }
    
    /**
     * Filter any response data using ripgrep patterns
     */
    async filterResponse(
        data: any,
        filterParams: UniversalFilterParams,
        filterableFields: string[],
        contentFields?: string[]
    ): Promise<FilterResult> {
        const startTime = Date.now();
        
        // Determine which fields to search
        const fieldsToSearch = this.determineSearchFields(
            filterParams.filter_fields,
            filterableFields,
            contentFields || []
        );
        
        // Prepare searchable content
        const searchableItems = this.prepareSearchableContent(data, fieldsToSearch);
        
        // Execute ripgrep filtering
        const filteredResults = await this.executeRipgrepFiltering(
            searchableItems,
            filterParams
        );
        
        // Reconstruct filtered response
        const filteredData = this.reconstructResponse(
            data,
            filteredResults,
            filterParams.filter_mode || FilterMode.CONTENT
        );
        
        const executionTime = Date.now() - startTime;
        
        return {
            filtered_data: filteredData,
            match_count: filteredResults.total_matches,
            total_items: Array.isArray(searchableItems) ? searchableItems.length : 1,
            filtered_items: filteredResults.matching_items.length,
            filter_summary: {
                pattern: filterParams.filter_pattern,
                mode: filterParams.filter_mode || FilterMode.CONTENT,
                fields_searched: fieldsToSearch,
                case_sensitive: filterParams.case_sensitive ?? true,
                whole_words: filterParams.whole_words ?? false,
                invert_match: filterParams.invert_match ?? false,
                context_lines: filterParams.context_lines
            },
            execution_time_ms: executionTime,
            pattern_used: filterParams.filter_pattern,
            fields_searched: fieldsToSearch
        };
    }
    
    /**
     * ULTIMATE FILTERING: Combine jq structural queries with ripgrep pattern matching.
     * This is the revolutionary triple-layer filtering system.
     */
    async filterDifferentialChangesWithJq(
        changes: AccessibilityDiff,
        filterParams: DifferentialFilterParams,
        originalSnapshot?: string
    ): Promise<JqFilterResult> {
        const totalStartTime = Date.now();
        const filterOrder = filterParams.filter_order || 'jq_first';

        // Track performance for each stage
        let jqTime = 0;
        let ripgrepTime = 0;
        let jqReduction = 0;
        let ripgrepReduction = 0;

        let currentData: any = changes;
        let jqExpression: string | undefined;

        // Resolve jq expression from preset or direct expression
        let actualJqExpression: string | undefined;
        if (filterParams.filter_preset) {
            // Preset takes precedence
            actualJqExpression = PlaywrightRipgrepEngine.presetToExpression(filterParams.filter_preset);
        } else if (filterParams.jq_expression) {
            actualJqExpression = filterParams.jq_expression;
        }

        // Build jq options from flattened params (prefer flattened over nested)
        const jqOptions: JqOptions = {
            raw_output: filterParams.jq_raw_output ?? filterParams.jq_options?.raw_output,
            compact: filterParams.jq_compact ?? filterParams.jq_options?.compact,
            sort_keys: filterParams.jq_sort_keys ?? filterParams.jq_options?.sort_keys,
            slurp: filterParams.jq_slurp ?? filterParams.jq_options?.slurp,
            exit_status: filterParams.jq_exit_status ?? filterParams.jq_options?.exit_status,
            null_input: filterParams.jq_null_input ?? filterParams.jq_options?.null_input
        };

        // Stage 1: Apply filters based on order
        if (filterOrder === 'jq_only' || filterOrder === 'jq_first') {
            // Apply jq structural filtering
            if (actualJqExpression) {
                const jqStart = Date.now();
                const jqResult = await this.jqEngine.query(
                    currentData,
                    actualJqExpression,
                    jqOptions
                );
                jqTime = jqResult.performance.execution_time_ms;
                jqReduction = jqResult.performance.reduction_percent;
                jqExpression = jqResult.expression_used;
                currentData = jqResult.data;
            }
        }

        // Stage 2: Apply ripgrep if needed
        let ripgrepResult: DifferentialFilterResult | undefined;
        if (filterOrder === 'ripgrep_only' || (filterOrder === 'jq_first' && filterParams.filter_pattern)) {
            const rgStart = Date.now();
            ripgrepResult = await this.filterDifferentialChanges(
                currentData,
                filterParams,
                originalSnapshot
            );
            ripgrepTime = Date.now() - rgStart;
            currentData = ripgrepResult.filtered_data;
            ripgrepReduction = ripgrepResult.differential_performance.filter_reduction_percent;
        }

        // Stage 3: ripgrep_first order (apply jq after ripgrep)
        if (filterOrder === 'ripgrep_first' && actualJqExpression) {
            const jqStart = Date.now();
            const jqResult = await this.jqEngine.query(
                currentData,
                actualJqExpression,
                jqOptions
            );
            jqTime = jqResult.performance.execution_time_ms;
            jqReduction = jqResult.performance.reduction_percent;
            jqExpression = jqResult.expression_used;
            currentData = jqResult.data;
        }

        const totalTime = Date.now() - totalStartTime;

        // Calculate combined performance metrics
        const differentialReduction = ripgrepResult?.differential_performance.size_reduction_percent || 0;
        const totalReduction = this.calculateTotalReduction(differentialReduction, jqReduction, ripgrepReduction);

        // Build comprehensive result
        const baseResult = ripgrepResult || await this.filterDifferentialChanges(changes, filterParams, originalSnapshot);

        return {
            ...baseResult,
            filtered_data: currentData,
            jq_expression_used: jqExpression,
            jq_performance: jqExpression ? {
                execution_time_ms: jqTime,
                input_size_bytes: JSON.stringify(changes).length,
                output_size_bytes: JSON.stringify(currentData).length,
                reduction_percent: jqReduction
            } : undefined,
            combined_performance: {
                differential_reduction_percent: differentialReduction,
                jq_reduction_percent: jqReduction,
                ripgrep_reduction_percent: ripgrepReduction,
                total_reduction_percent: totalReduction,
                differential_time_ms: 0, // Differential time is included in the base processing
                jq_time_ms: jqTime,
                ripgrep_time_ms: ripgrepTime,
                total_time_ms: totalTime
            }
        };
    }

    /**
     * Calculate combined reduction percentage from multiple filtering stages
     */
    private calculateTotalReduction(
        differentialReduction: number,
        jqReduction: number,
        ripgrepReduction: number
    ): number {
        // Each stage reduces from the previous stage's output
        // Formula: 1 - ((1 - r1) * (1 - r2) * (1 - r3))
        const remaining1 = 1 - (differentialReduction / 100);
        const remaining2 = 1 - (jqReduction / 100);
        const remaining3 = 1 - (ripgrepReduction / 100);
        const totalRemaining = remaining1 * remaining2 * remaining3;
        return (1 - totalRemaining) * 100;
    }

    /**
     * Filter differential snapshot changes using ripgrep patterns.
     * This is the key integration with our revolutionary differential system.
     */
    async filterDifferentialChanges(
        changes: AccessibilityDiff,
        filterParams: DifferentialFilterParams,
        originalSnapshot?: string
    ): Promise<DifferentialFilterResult> {
        const startTime = Date.now();
        
        // Convert differential changes to filterable content
        const filterableContent = this.extractDifferentialFilterableContent(
            changes, 
            filterParams.filter_fields
        );
        
        // Execute ripgrep filtering
        const filteredResults = await this.executeRipgrepFiltering(
            filterableContent,
            filterParams
        );
        
        // Reconstruct filtered differential response
        const filteredChanges = this.reconstructDifferentialResponse(
            changes,
            filteredResults
        );
        
        const executionTime = Date.now() - startTime;
        
        // Calculate performance metrics
        const performanceMetrics = this.calculateDifferentialPerformance(
            originalSnapshot,
            changes,
            filteredResults
        );
        
        return {
            filtered_data: filteredChanges,
            match_count: filteredResults.total_matches,
            total_items: filterableContent.length,
            filtered_items: filteredResults.matching_items.length,
            filter_summary: {
                pattern: filterParams.filter_pattern,
                mode: filterParams.filter_mode || FilterMode.CONTENT,
                fields_searched: filterParams.filter_fields || ['element.text', 'console.message'],
                case_sensitive: filterParams.case_sensitive ?? true,
                whole_words: filterParams.whole_words ?? false,
                invert_match: filterParams.invert_match ?? false,
                context_lines: filterParams.context_lines
            },
            execution_time_ms: executionTime,
            pattern_used: filterParams.filter_pattern,
            fields_searched: filterParams.filter_fields || ['element.text', 'console.message'],
            differential_type: 'semantic', // Will be enhanced to support all modes
            change_breakdown: this.analyzeChangeBreakdown(filteredResults, changes),
            differential_performance: performanceMetrics
        };
    }
    
    private determineSearchFields(
        requestedFields: string[] | undefined,
        availableFields: string[],
        contentFields: string[]
    ): string[] {
        if (requestedFields) {
            // Validate requested fields are available
            const invalidFields = requestedFields.filter(f => !availableFields.includes(f));
            if (invalidFields.length > 0) {
                console.warn(`Requested fields not available: ${invalidFields.join(', ')}`);
            }
            return requestedFields.filter(f => availableFields.includes(f));
        }
        
        // Default to content fields if available, otherwise all fields
        return contentFields.length > 0 ? contentFields : availableFields;
    }
    
    private prepareSearchableContent(data: any, fieldsToSearch: string[]): FilterableItem[] {
        if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
            // Handle object response (single item)
            return [this.extractSearchableFields(data, fieldsToSearch, 0)];
        } else if (Array.isArray(data)) {
            // Handle array response (multiple items)
            return data.map((item, index) => 
                this.extractSearchableFields(item, fieldsToSearch, index)
            );
        } else {
            // Handle primitive response
            return [{
                index: 0,
                searchable_text: String(data),
                original_data: data,
                fields_found: ['_value']
            }];
        }
    }
    
    private extractSearchableFields(
        item: any,
        fieldsToSearch: string[],
        itemIndex: number
    ): FilterableItem {
        const searchableParts: string[] = [];
        const fieldsFound: string[] = [];
        
        for (const field of fieldsToSearch) {
            const value = this.getNestedFieldValue(item, field);
            if (value !== null && value !== undefined) {
                const textValue = this.valueToSearchableText(value);
                if (textValue) {
                    searchableParts.push(`${field}:${textValue}`);
                    fieldsFound.push(field);
                }
            }
        }
        
        return {
            index: itemIndex,
            searchable_text: searchableParts.join(' '),
            original_data: item,
            fields_found: fieldsFound
        };
    }
    
    private getNestedFieldValue(item: any, fieldPath: string): any {
        try {
            let value = item;
            for (const part of fieldPath.split('.')) {
                if (typeof value === 'object' && value !== null) {
                    value = value[part];
                } else if (Array.isArray(value) && /^\d+$/.test(part)) {
                    value = value[parseInt(part, 10)];
                } else {
                    return null;
                }
            }
            return value;
        } catch {
            return null;
        }
    }
    
    private valueToSearchableText(value: any): string {
        if (typeof value === 'string') {
            return value;
        } else if (typeof value === 'number' || typeof value === 'boolean') {
            return String(value);
        } else if (typeof value === 'object' && value !== null) {
            if (Array.isArray(value)) {
                return value.map(item => this.valueToSearchableText(item)).join(' ');
            } else {
                return JSON.stringify(value);
            }
        }
        return String(value);
    }
    
    private async executeRipgrepFiltering(
        searchableItems: FilterableItem[],
        filterParams: UniversalFilterParams
    ): Promise<RipgrepResult> {
        // Create temporary file with searchable content
        const tempFile = join(this.tempDir, `search_${Date.now()}.txt`);
        this.createdFiles.add(tempFile);
        
        try {
            // Write searchable content to temporary file
            const content = searchableItems.map(item => 
                `ITEM_INDEX:${item.index}\n${item.searchable_text}\n---ITEM_END---`
            ).join('\n');
            
            await fs.writeFile(tempFile, content, 'utf-8');
            
            // Build ripgrep command
            const rgCmd = this.buildRipgrepCommand(filterParams, tempFile);
            
            // Execute ripgrep
            const rgResults = await this.runRipgrepCommand(rgCmd);
            
            // Process ripgrep results
            return this.processRipgrepResults(rgResults, searchableItems, filterParams.filter_mode || FilterMode.CONTENT);
            
        } finally {
            // Clean up temporary file
            try {
                await fs.unlink(tempFile);
                this.createdFiles.delete(tempFile);
            } catch {
                // Ignore cleanup errors
            }
        }
    }
    
    private buildRipgrepCommand(filterParams: UniversalFilterParams, tempFile: string): string[] {
        const cmd = ['rg'];
        
        // Add pattern
        cmd.push(filterParams.filter_pattern);
        
        // Add flags based on parameters
        if (filterParams.case_sensitive === false) {
            cmd.push('-i');
        }
        
        if (filterParams.whole_words) {
            cmd.push('-w');
        }
        
        if (filterParams.invert_match) {
            cmd.push('-v');
        }
        
        if (filterParams.multiline) {
            cmd.push('-U', '--multiline-dotall');
        }
        
        // Context lines
        if (filterParams.context_lines !== undefined) {
            cmd.push('-C', String(filterParams.context_lines));
        } else if (filterParams.context_before !== undefined) {
            cmd.push('-B', String(filterParams.context_before));
        } else if (filterParams.context_after !== undefined) {
            cmd.push('-A', String(filterParams.context_after));
        }
        
        // Output format
        if (filterParams.filter_mode === FilterMode.COUNT) {
            cmd.push('-c');
        } else if (filterParams.filter_mode === FilterMode.FILES_WITH_MATCHES) {
            cmd.push('-l');
        } else {
            cmd.push('-n', '--no-heading');
        }
        
        // Max matches
        if (filterParams.max_matches) {
            cmd.push('-m', String(filterParams.max_matches));
        }
        
        // Add file path
        cmd.push(tempFile);
        
        return cmd;
    }
    
    private async runRipgrepCommand(cmd: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const process = spawn(cmd[0], cmd.slice(1));
            let stdout = '';
            let stderr = '';
            
            process.stdout.on('data', (data) => {
                stdout += data.toString();
            });
            
            process.stderr.on('data', (data) => {
                stderr += data.toString();
            });
            
            process.on('close', (code) => {
                if (code === 0 || code === 1) { // 1 is normal "no matches" exit code
                    resolve(stdout);
                } else {
                    reject(new Error(`Ripgrep failed: ${stderr}`));
                }
            });
            
            process.on('error', (error) => {
                if (error.message.includes('ENOENT')) {
                    reject(new Error('ripgrep not found. Please install ripgrep for filtering functionality.'));
                } else {
                    reject(error);
                }
            });
        });
    }
    
    private processRipgrepResults(
        rgOutput: string,
        searchableItems: FilterableItem[],
        mode: FilterMode
    ): RipgrepResult {
        if (!rgOutput.trim()) {
            return {
                matching_items: [],
                total_matches: 0,
                match_details: {}
            };
        }
        
        const matchingIndices = new Set<number>();
        const matchDetails: Record<number, string[]> = {};
        let totalMatches = 0;
        
        if (mode === FilterMode.COUNT) {
            // Count mode - just count total matches
            totalMatches = rgOutput.split('\n')
                .filter(line => line.trim())
                .reduce((sum, line) => sum + parseInt(line, 10), 0);
        } else {
            // Extract item indices from ripgrep output with line numbers
            for (const line of rgOutput.split('\n')) {
                if (!line.trim()) continue;
                
                // Parse line number and content from ripgrep output (format: "line_num:content")
                const lineMatch = line.match(/^(\d+):(.+)$/);
                if (lineMatch) {
                    const lineNumber = parseInt(lineMatch[1], 10);
                    const content = lineMatch[2].trim();
                    
                    // Calculate item index based on file structure:
                    // Line 1: ITEM_INDEX:0, Line 2: content, Line 3: ---ITEM_END---
                    // So content lines are: 2, 5, 8, ... = 3*n + 2 where n is item_index
                    if ((lineNumber - 2) % 3 === 0 && lineNumber >= 2) {
                        const itemIndex = (lineNumber - 2) / 3;
                        matchingIndices.add(itemIndex);
                        
                        if (!matchDetails[itemIndex]) {
                            matchDetails[itemIndex] = [];
                        }
                        
                        matchDetails[itemIndex].push(content);
                        totalMatches++;
                    }
                }
            }
        }
        
        // Get matching items
        const matchingItems = Array.from(matchingIndices)
            .filter(i => i < searchableItems.length)
            .map(i => searchableItems[i]);
        
        return {
            matching_items: matchingItems,
            total_matches: totalMatches,
            match_details: matchDetails
        };
    }
    
    private reconstructResponse(originalData: any, filteredResults: RipgrepResult, mode: FilterMode): any {
        if (mode === FilterMode.COUNT) {
            return {
                total_matches: filteredResults.total_matches,
                matching_items_count: filteredResults.matching_items.length,
                original_item_count: Array.isArray(originalData) ? originalData.length : 1
            };
        }
        
        const { matching_items } = filteredResults;
        
        if (matching_items.length === 0) {
            return Array.isArray(originalData) ? [] : null;
        }
        
        if (Array.isArray(originalData)) {
            return matching_items.map(item => item.original_data);
        } else {
            return matching_items[0]?.original_data || null;
        }
    }
    
    /**
     * Extract filterable content from differential changes.
     * This is where we integrate with our revolutionary differential snapshot system.
     */
    private extractDifferentialFilterableContent(
        changes: AccessibilityDiff,
        filterFields?: string[]
    ): FilterableItem[] {
        const content: FilterableItem[] = [];
        let index = 0;
        
        // Extract added elements
        for (const element of changes.added) {
            content.push({
                index: index++,
                searchable_text: this.elementToSearchableText(element, filterFields),
                original_data: { type: 'added', element },
                fields_found: this.getElementFields(element, filterFields)
            });
        }
        
        // Extract removed elements
        for (const element of changes.removed) {
            content.push({
                index: index++,
                searchable_text: this.elementToSearchableText(element, filterFields),
                original_data: { type: 'removed', element },
                fields_found: this.getElementFields(element, filterFields)
            });
        }
        
        // Extract modified elements
        for (const modification of changes.modified) {
            content.push({
                index: index++,
                searchable_text: this.elementToSearchableText(modification.after, filterFields),
                original_data: { type: 'modified', before: modification.before, after: modification.after },
                fields_found: this.getElementFields(modification.after, filterFields)
            });
        }
        
        return content;
    }
    
    private elementToSearchableText(element: any, filterFields?: string[]): string {
        const parts: string[] = [];
        
        if (!filterFields || filterFields.includes('element.text')) {
            if (element.text) parts.push(`text:${element.text}`);
        }
        
        if (!filterFields || filterFields.includes('element.attributes')) {
            if (element.attributes) {
                for (const [key, value] of Object.entries(element.attributes)) {
                    parts.push(`${key}:${value}`);
                }
            }
        }
        
        if (!filterFields || filterFields.includes('element.role')) {
            if (element.role) parts.push(`role:${element.role}`);
        }
        
        if (!filterFields || filterFields.includes('element.ref')) {
            if (element.ref) parts.push(`ref:${element.ref}`);
        }
        
        return parts.join(' ');
    }
    
    private getElementFields(element: any, filterFields?: string[]): string[] {
        const fields: string[] = [];
        
        if ((!filterFields || filterFields.includes('element.text')) && element.text) {
            fields.push('element.text');
        }
        
        if ((!filterFields || filterFields.includes('element.attributes')) && element.attributes) {
            fields.push('element.attributes');
        }
        
        if ((!filterFields || filterFields.includes('element.role')) && element.role) {
            fields.push('element.role');
        }
        
        if ((!filterFields || filterFields.includes('element.ref')) && element.ref) {
            fields.push('element.ref');
        }
        
        return fields;
    }
    
    private reconstructDifferentialResponse(
        originalChanges: AccessibilityDiff,
        filteredResults: RipgrepResult
    ): AccessibilityDiff {
        const filteredChanges: AccessibilityDiff = {
            added: [],
            removed: [],
            modified: []
        };
        
        for (const item of filteredResults.matching_items) {
            const changeData = item.original_data;
            
            switch (changeData.type) {
                case 'added':
                    filteredChanges.added.push(changeData.element);
                    break;
                case 'removed':
                    filteredChanges.removed.push(changeData.element);
                    break;
                case 'modified':
                    filteredChanges.modified.push({
                        before: changeData.before,
                        after: changeData.after
                    });
                    break;
            }
        }
        
        return filteredChanges;
    }
    
    private analyzeChangeBreakdown(filteredResults: RipgrepResult, originalChanges: AccessibilityDiff) {
        let elementsAddedMatches = 0;
        let elementsRemovedMatches = 0;
        let elementsModifiedMatches = 0;
        
        for (const item of filteredResults.matching_items) {
            const changeData = item.original_data;
            switch (changeData.type) {
                case 'added':
                    elementsAddedMatches++;
                    break;
                case 'removed':
                    elementsRemovedMatches++;
                    break;
                case 'modified':
                    elementsModifiedMatches++;
                    break;
            }
        }
        
        return {
            elements_added_matches: elementsAddedMatches,
            elements_removed_matches: elementsRemovedMatches,
            elements_modified_matches: elementsModifiedMatches,
            console_activity_matches: 0, // TODO: Add console filtering support
            url_change_matches: 0, // TODO: Add URL change filtering support
            title_change_matches: 0 // TODO: Add title change filtering support
        };
    }
    
    private calculateDifferentialPerformance(
        originalSnapshot: string | undefined,
        changes: AccessibilityDiff,
        filteredResults: RipgrepResult
    ) {
        // Calculate our revolutionary performance metrics
        const originalLines = originalSnapshot ? originalSnapshot.split('\n').length : 1000; // Estimate if not provided
        const totalChanges = changes.added.length + changes.removed.length + changes.modified.length;
        const filteredChanges = filteredResults.matching_items.length;
        
        const sizeReductionPercent = Math.round((1 - totalChanges / originalLines) * 100);
        const filterReductionPercent = totalChanges > 0 ? Math.round((1 - filteredChanges / totalChanges) * 100) : 0;
        const totalReductionPercent = Math.round((1 - filteredChanges / originalLines) * 100);
        
        return {
            size_reduction_percent: Math.max(0, sizeReductionPercent),
            filter_reduction_percent: Math.max(0, filterReductionPercent),
            total_reduction_percent: Math.max(0, totalReductionPercent)
        };
    }

    /**
     * Cleanup method to prevent memory leaks
     */
    async cleanup(): Promise<void> {
        try {
            // Clean up any remaining temporary files
            for (const filePath of this.createdFiles) {
                try {
                    await fs.unlink(filePath);
                } catch {
                    // File might already be deleted, ignore
                }
            }
            this.createdFiles.clear();

            // Try to remove temp directory if empty
            try {
                await fs.rmdir(this.tempDir);
            } catch {
                // Directory might not be empty or not exist, ignore
            }
        } catch (error) {
            // Log but don't throw during cleanup
            console.warn('Error during ripgrep engine cleanup:', error);
        }
    }
}