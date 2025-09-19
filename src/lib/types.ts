/**
 * TypeScript definitions for libexpat.wasm
 * High-performance XML parser with SIMD optimizations
 */

export interface ExpatVersionInfo {
  major: number;
  minor: number;
  micro: number;
}

export interface ParserOptions {
  /** Character encoding (default: "UTF-8") */
  encoding?: string;
  /** Namespace separator character (for namespace-aware parsing) */
  namespaceSeparator?: string;
  /** Hash salt for internal hash tables */
  hashSalt?: number;
  /** Enable parameter entity parsing */
  paramEntityParsing?: boolean;
}

export interface ParseError {
  code: number;
  message: string;
  line: number;
  column: number;
  byteIndex: number;
}

export interface ParseResult {
  success: boolean;
  error?: ParseError;
  bytesProcessed: number;
}

export interface XMLHandlers {
  /** Called when an opening tag is found */
  onStartElement?: (name: string, attributes: Record<string, string>) => void;
  /** Called when a closing tag is found */
  onEndElement?: (name: string) => void;
  /** Called for character data between tags */
  onCharacterData?: (data: string) => void;
  /** Called for processing instructions */
  onProcessingInstruction?: (target: string, data: string) => void;
  /** Called for XML comments */
  onComment?: (comment: string) => void;
  /** Called for CDATA section start */
  onStartCDATA?: () => void;
  /** Called for CDATA section end */
  onEndCDATA?: () => void;
  /** Called for namespace declaration start */
  onStartNamespace?: (prefix: string, uri: string) => void;
  /** Called for namespace declaration end */
  onEndNamespace?: (prefix: string) => void;
}

export interface SIMDCapabilities {
  /** WASM SIMD support detected */
  simdSupported: boolean;
  /** SIMD tokenization available */
  tokenizationAccelerated: boolean;
  /** SIMD character search available */
  characterSearchAccelerated: boolean;
  /** SIMD UTF-8 validation available */
  utf8ValidationAccelerated: boolean;
}

export interface PerformanceMetrics {
  /** Parsing throughput in MB/s */
  throughputMBps: number;
  /** Characters processed per second */
  charactersPerSecond: number;
  /** SIMD speedup factor */
  simdSpeedup: number;
  /** Total parsing time in milliseconds */
  totalTimeMs: number;
}

export interface LibexpatFeature {
  feature: string;
  name: string;
  value: number;
}

/**
 * Configuration for XML parser performance tuning
 */
export interface PerformanceConfig {
  /** Buffer size for parsing (bytes) */
  bufferSize?: number;
  /** Enable SIMD optimizations where available */
  useSIMD?: boolean;
  /** Enable streaming mode for large documents */
  streaming?: boolean;
  /** Memory growth strategy */
  memoryGrowth?: boolean;
}

/**
 * XML parsing statistics
 */
export interface ParseStats {
  /** Total bytes processed */
  bytesProcessed: number;
  /** Number of elements parsed */
  elementCount: number;
  /** Number of attributes parsed */
  attributeCount: number;
  /** Parse time in milliseconds */
  parseTimeMs: number;
  /** Peak memory usage in bytes */
  peakMemoryBytes: number;
}

/**
 * Parser state information
 */
export interface ParserState {
  /** Current parsing position */
  position: number;
  /** Current line number */
  line: number;
  /** Current column number */
  column: number;
  /** Parser is currently parsing */
  active: boolean;
  /** Parser has encountered an error */
  hasError: boolean;
}

export type XMLParsingMode = "strict" | "lenient" | "streaming";
export type XMLValidationType = "none" | "basic" | "full";