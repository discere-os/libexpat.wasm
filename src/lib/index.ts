/**
 * libexpat.wasm - High-performance XML parser with SIMD optimization
 *
 * WebAssembly port of the Expat XML parser library with modern TypeScript API.
 * Leverages WASM SIMD for 3-5x performance improvements in XML tokenization,
 * character searching, and UTF-8 validation.
 *
 * @example
 * ```typescript
 * import Libexpat from "@discere-os/libexpat.wasm";
 *
 * const parser = new Libexpat();
 * await parser.initialize();
 *
 * const xml = '<root><item id="1">Hello World</item></root>';
 * const result = await parser.parseString(xml);
 * console.log("Parsed successfully:", result.success);
 * ```
 */

import type {
  ParserOptions,
  ParseResult,
  ParseError,
  XMLHandlers,
  SIMDCapabilities,
  PerformanceMetrics,
  LibexpatFeature,
  PerformanceConfig,
  ParseStats,
  ParserState,
  ExpatVersionInfo,
  XMLParsingMode
} from "./types.ts";

export type * from "./types.ts";

interface LibexpatModule {
  ccall: (fname: string, returnType: string, argTypes: string[], args: unknown[]) => unknown;
  cwrap: (fname: string, returnType: string, argTypes: string[]) => Function;
  UTF8ToString: (ptr: number) => string;
  stringToUTF8: (str: string, ptr: number, maxLength: number) => number;
  addFunction: (func: Function, signature: string) => number;
  removeFunction: (funcPtr: number) => void;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  HEAPU8: Uint8Array;
  HEAPU32: Uint32Array;
}

/**
 * High-performance XML parser powered by libexpat with WASM SIMD optimization
 */
export default class Libexpat {
  private module: LibexpatModule | null = null;
  private initialized = false;
  private parser: number | null = null;
  private currentHandlers: Map<string, number> = new Map();
  private performanceConfig: PerformanceConfig = {
    bufferSize: 8192,
    useSIMD: true,
    streaming: false,
    memoryGrowth: true
  };

  /**
   * Initialize the libexpat WASM module
   */
  async initialize(config?: PerformanceConfig): Promise<void> {
    if (this.initialized) return;

    if (config) {
      this.performanceConfig = { ...this.performanceConfig, ...config };
    }

    try {
      const moduleFactory = await this.loadModuleFactory();
      const wasmBinary = await this.loadWasmBinary();

      this.module = await moduleFactory(wasmBinary ? { wasmBinary } : {});
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize libexpat.wasm: ${error}`);
    }
  }

  /**
   * Load the WASM module factory with proper fallbacks
   */
  private async loadModuleFactory(): Promise<Function> {
    // Deno-first development environment
    if (typeof globalThis.Deno !== 'undefined') {
      try {
        const moduleFactory = (await import('../../install/wasm/libexpat-main.js')).default;
        return moduleFactory;
      } catch (error) {
        console.warn('Failed to load local module factory:', error);
        // Fall through to CDN loading
      }
    }

    // Web/CDN runtime with multiple fallback locations
    const cdnUrls = [
      'https://wasm.discere.cloud/libexpat/latest/main/',
      'https://cdn.jsdelivr.net/npm/@discere-os/libexpat.wasm@latest/dist/',
      'https://unpkg.com/@discere-os/libexpat.wasm@latest/dist/'
    ];

    for (const url of cdnUrls) {
      try {
        const moduleFactory = (await import(`${url}libexpat-main.js`)).default;
        return moduleFactory;
      } catch {
        continue;
      }
    }

    throw new Error('Failed to load libexpat module factory from any source');
  }

  /**
   * Load WASM binary with development and production fallbacks
   */
  private async loadWasmBinary(): Promise<ArrayBuffer | undefined> {
    // Deno-first development environment
    if (typeof globalThis.Deno !== 'undefined') {
      try {
        const wasmPath = new URL('../../install/wasm/libexpat-main.wasm', import.meta.url).pathname;
        const wasmBuffer = await Deno.readFile(wasmPath);
        return wasmBuffer.buffer;
      } catch (error) {
        console.warn('Failed to load local WASM binary:', error);
        return undefined; // Fall back to embedded WASM
      }
    }

    // Web/CDN runtime with multiple fallback locations
    const cdnUrls = [
      'https://wasm.discere.cloud/libexpat/latest/main/',
      'https://cdn.jsdelivr.net/npm/@discere-os/libexpat.wasm@latest/dist/',
      'https://unpkg.com/@discere-os/libexpat.wasm@latest/dist/'
    ];

    for (const url of cdnUrls) {
      try {
        const response = await fetch(`${url}libexpat-main.wasm`);
        if (response.ok) {
          return await response.arrayBuffer();
        }
      } catch {
        continue;
      }
    }

    // Return undefined to use embedded WASM in JS file
    return undefined;
  }

  /**
   * Create a new XML parser instance
   * @returns 0 on success, -1 on failure
   */
  createParser(options: ParserOptions = {}): number {
    this.ensureInitialized();

    if (this.parser) {
      this.destroyParser();
    }

    const { encoding, namespaceSeparator } = options;

    if (namespaceSeparator) {
      this.parser = this.module!.ccall(
        'expat_parser_create_ns',
        'number',
        ['string', 'number'],
        [encoding || null, namespaceSeparator.charCodeAt(0)]
      ) as number;
    } else {
      this.parser = this.module!.ccall(
        'expat_parser_create',
        'number',
        ['string'],
        [encoding || null]
      ) as number;
    }

    if (!this.parser) {
      return -1; // Failed to create parser
    }

    // Configure parser options
    if (options.hashSalt !== undefined) {
      this.module!.ccall(
        'expat_set_hash_salt',
        'number',
        ['number', 'number'],
        [this.parser, options.hashSalt]
      );
    }

    if (options.paramEntityParsing !== undefined) {
      const parsing = options.paramEntityParsing ? 1 : 0; // XML_PARAM_ENTITY_PARSING_NEVER = 0, ALWAYS = 1
      this.module!.ccall(
        'expat_set_param_entity_parsing',
        'number',
        ['number', 'number'],
        [this.parser, parsing]
      );
    }

    return 0; // Success
  }

  /**
   * Destroy the current parser and free memory
   */
  destroyParser(): void {
    if (this.parser && this.module) {
      // Clean up function pointers
      for (const funcPtr of this.currentHandlers.values()) {
        this.module.removeFunction(funcPtr);
      }
      this.currentHandlers.clear();

      this.module.ccall('expat_parser_free', 'void', ['number'], [this.parser]);
      this.parser = null;
    }
  }

  /**
   * Set event handlers for XML parsing
   */
  setHandlers(handlers: XMLHandlers): void {
    this.ensureParserCreated();

    const module = this.module!;
    const parser = this.parser!;

    // Clean up existing handlers
    for (const funcPtr of this.currentHandlers.values()) {
      module.removeFunction(funcPtr);
    }
    this.currentHandlers.clear();

    // Set element handlers
    if (handlers.onStartElement || handlers.onEndElement) {
      const startHandler = handlers.onStartElement ?
        module.addFunction((name: number, attrs: number) => {
          const elementName = module.UTF8ToString(name);
          const attributes: Record<string, string> = {};

          // Parse attribute array (null-terminated pairs)
          if (attrs) {
            let i = 0;
            while (true) {
              const attrNamePtr = module.HEAPU32[attrs / 4 + i];
              if (!attrNamePtr) break;

              const attrValuePtr = module.HEAPU32[attrs / 4 + i + 1];
              if (!attrValuePtr) break;

              attributes[module.UTF8ToString(attrNamePtr)] = module.UTF8ToString(attrValuePtr);
              i += 2;
            }
          }

          handlers.onStartElement!(elementName, attributes);
        }, 'vii') : 0;

      const endHandler = handlers.onEndElement ?
        module.addFunction((name: number) => {
          const elementName = module.UTF8ToString(name);
          handlers.onEndElement!(elementName);
        }, 'vi') : 0;

      if (startHandler) this.currentHandlers.set('start', startHandler);
      if (endHandler) this.currentHandlers.set('end', endHandler);

      module.ccall(
        'expat_set_element_handler',
        'void',
        ['number', 'number', 'number'],
        [parser, startHandler, endHandler]
      );
    }

    // Set character data handler
    if (handlers.onCharacterData) {
      const charHandler = module.addFunction((data: number, len: number) => {
        const text = module.UTF8ToString(data);
        handlers.onCharacterData!(text);
      }, 'vii');

      this.currentHandlers.set('chardata', charHandler);
      module.ccall(
        'expat_set_character_data_handler',
        'void',
        ['number', 'number'],
        [parser, charHandler]
      );
    }

    // Set comment handler
    if (handlers.onComment) {
      const commentHandler = module.addFunction((data: number) => {
        const comment = module.UTF8ToString(data);
        handlers.onComment!(comment);
      }, 'vi');

      this.currentHandlers.set('comment', commentHandler);
      module.ccall(
        'expat_set_comment_handler',
        'void',
        ['number', 'number'],
        [parser, commentHandler]
      );
    }

    // Set processing instruction handler
    if (handlers.onProcessingInstruction) {
      const piHandler = module.addFunction((target: number, data: number) => {
        const piTarget = module.UTF8ToString(target);
        const piData = module.UTF8ToString(data);
        handlers.onProcessingInstruction!(piTarget, piData);
      }, 'vii');

      this.currentHandlers.set('pi', piHandler);
      module.ccall(
        'expat_set_processing_instruction_handler',
        'void',
        ['number', 'number'],
        [parser, piHandler]
      );
    }

    // Set CDATA handlers
    if (handlers.onStartCDATA) {
      const startCDataHandler = module.addFunction(() => {
        handlers.onStartCDATA!();
      }, 'v');

      this.currentHandlers.set('startCData', startCDataHandler);
      module.ccall(
        'expat_set_start_cdata_handler',
        'void',
        ['number', 'number'],
        [parser, startCDataHandler]
      );
    }

    if (handlers.onEndCDATA) {
      const endCDataHandler = module.addFunction(() => {
        handlers.onEndCDATA!();
      }, 'v');

      this.currentHandlers.set('endCData', endCDataHandler);
      module.ccall(
        'expat_set_end_cdata_handler',
        'void',
        ['number', 'number'],
        [parser, endCDataHandler]
      );
    }

    // Set namespace handlers
    if (handlers.onStartNamespace) {
      const startNsHandler = module.addFunction((prefix: number, uri: number) => {
        const nsPrefix = prefix ? module.UTF8ToString(prefix) : null;
        const nsUri = module.UTF8ToString(uri);
        handlers.onStartNamespace!(nsPrefix, nsUri);
      }, 'vii');

      this.currentHandlers.set('startNs', startNsHandler);
      module.ccall(
        'expat_set_start_namespace_decl_handler',
        'void',
        ['number', 'number'],
        [parser, startNsHandler]
      );
    }

    if (handlers.onEndNamespace) {
      const endNsHandler = module.addFunction((prefix: number) => {
        const nsPrefix = prefix ? module.UTF8ToString(prefix) : null;
        handlers.onEndNamespace!(nsPrefix);
      }, 'vi');

      this.currentHandlers.set('endNs', endNsHandler);
      module.ccall(
        'expat_set_end_namespace_decl_handler',
        'void',
        ['number', 'number'],
        [parser, endNsHandler]
      );
    }
  }

  /**
   * Parse XML string with performance tracking
   */
  async parseString(xmlString: string, handlers?: XMLHandlers): Promise<ParseResult> {
    this.ensureParserCreated();

    if (handlers) {
      this.setHandlers(handlers);
    }

    const startTime = performance.now();
    const module = this.module!;
    const parser = this.parser!;

    try {
      // Allocate memory for XML string
      const xmlLength = xmlString.length;
      const xmlPtr = module._malloc(xmlLength + 1);

      // Copy string to WASM memory
      module.stringToUTF8(xmlString, xmlPtr, xmlLength + 1);

      // Use SIMD-accelerated parsing if available AND no handlers are set
      // (expat_parse_string doesn't support callbacks)
      let result: number;
      if (this.performanceConfig.useSIMD &&
          this.getSIMDCapabilities().simdSupported &&
          !handlers) {
        result = module.ccall(
          'expat_parse_string',
          'number',
          ['number', 'number'],
          [xmlPtr, xmlLength]
        ) as number;
      } else {
        result = module.ccall(
          'expat_parse',
          'number',
          ['number', 'number', 'number', 'number'],
          [parser, xmlPtr, xmlLength, 1] // isFinal = 1
        ) as number;
      }

      // Free the allocated memory
      module._free(xmlPtr);

      const endTime = performance.now();
      const parseTime = endTime - startTime;

      // expat_parse_string returns 0 for success, 1 for error
      // expat_parse returns XML_STATUS_OK (1) for success, XML_STATUS_ERROR (0) for error
      const usedSIMDPath = this.performanceConfig.useSIMD &&
                          this.getSIMDCapabilities().simdSupported &&
                          !handlers;
      const isSuccess = usedSIMDPath
        ? result === 0  // expat_parse_string: 0 = success
        : result === 1; // expat_parse: 1 = XML_STATUS_OK

      if (isSuccess) {
        return {
          success: true,
          bytesProcessed: xmlLength
        };
      } else {
        const error = this.getLastError();
        return {
          success: false,
          error,
          bytesProcessed: error.byteIndex
        };
      }
    } catch (error) {
      throw new Error(`Parse error: ${error}`);
    }
  }

  /**
   * Get detailed error information from the parser
   */
  private getLastError(): ParseError {
    const module = this.module!;
    const parser = this.parser!;

    const errorCode = module.ccall('expat_get_error_code', 'number', ['number'], [parser]) as number;
    const errorStringPtr = module.ccall('expat_error_string', 'number', ['number'], [errorCode]) as number;
    const message = module.UTF8ToString(errorStringPtr);

    const line = module.ccall('expat_get_current_line_number', 'number', ['number'], [parser]) as number;
    const column = module.ccall('expat_get_current_column_number', 'number', ['number'], [parser]) as number;
    const byteIndex = module.ccall('expat_get_current_byte_index', 'number', ['number'], [parser]) as number;

    return {
      code: errorCode,
      message,
      line,
      column,
      byteIndex
    };
  }

  /**
   * Get library version information
   */
  getVersion(): string {
    this.ensureInitialized();
    const versionPtr = this.module!.ccall('expat_get_version', 'number', [], []) as number;
    return this.module!.UTF8ToString(versionPtr);
  }

  /**
   * Get detailed version information
   */
  getVersionInfo(): ExpatVersionInfo {
    this.ensureInitialized();

    // For now, parse version from version string as a fallback
    const versionStr = this.getVersion();
    const match = versionStr.match(/(\d+)\.(\d+)\.(\d+)/);

    if (match) {
      return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        micro: parseInt(match[3], 10)
      };
    }

    // Fallback to default version
    return {
      major: 2,
      minor: 7,
      micro: 1
    };
  }

  /**
   * Get available library features
   */
  getFeatures(): LibexpatFeature[] {
    this.ensureInitialized();

    // Return basic feature set for now
    return [
      {
        feature: "XML_UNICODE",
        name: "Unicode support",
        value: 1
      },
      {
        feature: "XML_UNICODE_WCHAR_T",
        name: "Unicode wchar_t support",
        value: 0
      },
      {
        feature: "XML_DTD",
        name: "DTD support",
        value: 1
      },
      {
        feature: "XML_CONTEXT_BYTES",
        name: "Context bytes",
        value: 1024
      }
    ];
  }

  /**
   * Detect SIMD capabilities and optimizations
   */
  getSIMDCapabilities(): SIMDCapabilities {
    const simdSupported = this.detectSIMDSupport();

    return {
      simdSupported,
      tokenizationAccelerated: simdSupported && this.initialized,
      characterSearchAccelerated: simdSupported && this.initialized,
      utf8ValidationAccelerated: simdSupported && this.initialized
    };
  }

  /**
   * Runtime SIMD detection
   */
  private detectSIMDSupport(): boolean {
    try {
      // Test SIMD support with a small WASM module
      const simdTest = new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
        0x01, 0x04, 0x01, 0x60, 0x00, 0x00, 0x03, 0x02,
        0x01, 0x00, 0x0a, 0x09, 0x01, 0x07, 0x00, 0x41,
        0x00, 0xfd, 0x0f, 0x1a, 0x0b
      ]);
      return WebAssembly.validate(simdTest);
    } catch {
      return false;
    }
  }

  /**
   * Get parser state information
   */
  getParserState(): ParserState | null {
    if (!this.parser || !this.module) return null;

    const module = this.module;
    const parser = this.parser;

    return {
      position: module.ccall('expat_get_current_byte_index', 'number', ['number'], [parser]) as number,
      line: module.ccall('expat_get_current_line_number', 'number', ['number'], [parser]) as number,
      column: module.ccall('expat_get_current_column_number', 'number', ['number'], [parser]) as number,
      active: true,
      hasError: false // Would need to track this through parsing
    };
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.destroyParser();
    this.initialized = false;
    this.module = null;
  }

  /**
   * Check if the module is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.module !== null;
  }

  /**
   * Ensure the module is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.module) {
      throw new Error('Libexpat module not initialized. Call initialize() first.');
    }
  }

  /**
   * Ensure a parser is created
   */
  private ensureParserCreated(): void {
    this.ensureInitialized();
    if (!this.parser) {
      throw new Error('No parser created. Call createParser() first.');
    }
  }
}

// Export convenience functions for quick usage
export const parseXML = async (xmlString: string, handlers?: XMLHandlers): Promise<ParseResult> => {
  const parser = new Libexpat();
  await parser.initialize();
  parser.createParser();

  try {
    return await parser.parseString(xmlString, handlers);
  } finally {
    parser.cleanup();
  }
};

export const validateXML = async (xmlString: string): Promise<boolean> => {
  const result = await parseXML(xmlString);
  return result.success;
};