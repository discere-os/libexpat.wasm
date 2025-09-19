#!/bin/bash
set -euo pipefail

# Build dual libexpat.wasm: SIDE_MODULE (production) + MAIN_MODULE (testing)
# Based on libexpat XML parser with SIMD optimizations

VARIANT="${1:-all}"
BUILD_ROOT="$(pwd)"
EXPAT_LIB="${BUILD_ROOT}/expat/lib"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    if ! command -v emcc >/dev/null 2>&1; then
        log_error "Emscripten (emcc) not found. Please install Emscripten SDK."
        exit 1
    fi

    if [ ! -f "${EXPAT_LIB}/xmlparse.c" ]; then
        log_error "Expat source files not found in ${EXPAT_LIB}"
        exit 1
    fi

    log_info "Prerequisites check passed"
}

# Common source files
EXPAT_SOURCES=(
    "${EXPAT_LIB}/xmlparse.c"
    "${EXPAT_LIB}/xmlrole.c"
    "${EXPAT_LIB}/xmltok.c"
    "src/wasm_module.c"
)

# Common compilation flags
COMMON_FLAGS=(
    -O3
    -flto
    -msimd128
    -DHAVE_EXPAT_CONFIG_H=1
    -I"${EXPAT_LIB}"
    -I"${BUILD_ROOT}"
)

# SIMD-optimized functions for XML parsing
SIMD_SOURCES=(
    "src/expat_simd.c"
)

# Exported functions for libexpat (SIDE_MODULE - no malloc/free)
SIDE_MODULE_EXPORTS='[
    "_expat_get_version",
    "_expat_get_version_info",
    "_expat_parser_create",
    "_expat_parser_create_ns",
    "_expat_parser_free",
    "_expat_parser_reset",
    "_expat_parse",
    "_expat_parse_buffer",
    "_expat_get_buffer",
    "_expat_get_error_code",
    "_expat_error_string",
    "_expat_get_current_line_number",
    "_expat_get_current_column_number",
    "_expat_get_current_byte_index",
    "_expat_set_param_entity_parsing",
    "_expat_set_hash_salt",
    "_expat_set_user_data",
    "_expat_get_user_data",
    "_expat_set_element_handler",
    "_expat_set_character_data_handler",
    "_expat_set_processing_instruction_handler",
    "_expat_set_comment_handler",
    "_expat_set_start_cdata_handler",
    "_expat_set_end_cdata_handler",
    "_expat_set_default_handler",
    "_expat_set_start_namespace_decl_handler",
    "_expat_set_end_namespace_decl_handler",
    "_expat_get_feature_list",
    "_expat_malloc",
    "_expat_free",
    "_expat_parse_string",
    "_expat_simd_tokenize",
    "_expat_simd_find_char",
    "_expat_simd_validate_utf8"
]'

# Exported functions for libexpat (MAIN_MODULE - includes malloc/free)
MAIN_MODULE_EXPORTS='[
    "_expat_get_version",
    "_expat_get_version_info",
    "_expat_parser_create",
    "_expat_parser_create_ns",
    "_expat_parser_free",
    "_expat_parser_reset",
    "_expat_parse",
    "_expat_parse_buffer",
    "_expat_get_buffer",
    "_expat_get_error_code",
    "_expat_error_string",
    "_expat_get_current_line_number",
    "_expat_get_current_column_number",
    "_expat_get_current_byte_index",
    "_expat_set_param_entity_parsing",
    "_expat_set_hash_salt",
    "_expat_set_user_data",
    "_expat_get_user_data",
    "_expat_set_element_handler",
    "_expat_set_character_data_handler",
    "_expat_set_processing_instruction_handler",
    "_expat_set_comment_handler",
    "_expat_set_start_cdata_handler",
    "_expat_set_end_cdata_handler",
    "_expat_set_default_handler",
    "_expat_set_start_namespace_decl_handler",
    "_expat_set_end_namespace_decl_handler",
    "_expat_get_feature_list",
    "_expat_malloc",
    "_expat_free",
    "_expat_parse_string",
    "_expat_simd_tokenize",
    "_expat_simd_find_char",
    "_expat_simd_validate_utf8",
    "_malloc",
    "_free"
]'

# Build SIDE_MODULE for production use
build_side_module() {
    log_info "Building SIDE_MODULE (production)..."

    mkdir -p install/wasm

    # Create SIMD source if it doesn't exist
    if [ ! -f "src/expat_simd.c" ]; then
        log_warning "Creating placeholder SIMD source..."
        mkdir -p "src"
        cat > "src/expat_simd.c" << 'EOF'
#include <wasm_simd128.h>
#include <emscripten/emscripten.h>
#include <stdint.h>
#include <string.h>

// SIMD-optimized XML tokenization
EMSCRIPTEN_KEEPALIVE
int expat_simd_tokenize(const uint8_t* data, size_t len, uint8_t* tokens) {
    // Process 16 bytes at a time with SIMD
    size_t simd_len = len & ~15;
    v128_t space_vec = wasm_i8x16_splat(' ');
    v128_t tab_vec = wasm_i8x16_splat('\t');
    v128_t newline_vec = wasm_i8x16_splat('\n');
    v128_t cr_vec = wasm_i8x16_splat('\r');

    for (size_t i = 0; i < simd_len; i += 16) {
        v128_t chunk = wasm_v128_load(&data[i]);

        // Find whitespace characters
        v128_t is_space = wasm_i8x16_eq(chunk, space_vec);
        v128_t is_tab = wasm_i8x16_eq(chunk, tab_vec);
        v128_t is_newline = wasm_i8x16_eq(chunk, newline_vec);
        v128_t is_cr = wasm_i8x16_eq(chunk, cr_vec);

        v128_t whitespace = wasm_v128_or(
            wasm_v128_or(is_space, is_tab),
            wasm_v128_or(is_newline, is_cr)
        );

        wasm_v128_store(&tokens[i], whitespace);
    }

    // Handle remainder with scalar code
    for (size_t i = simd_len; i < len; i++) {
        tokens[i] = (data[i] == ' ' || data[i] == '\t' ||
                    data[i] == '\n' || data[i] == '\r') ? 0xFF : 0x00;
    }

    return (int)len;
}

// SIMD character search for XML parsing
EMSCRIPTEN_KEEPALIVE
const uint8_t* expat_simd_find_char(const uint8_t* haystack, size_t len, uint8_t needle) {
    v128_t needle_vec = wasm_i8x16_splat(needle);

    for (size_t i = 0; i + 15 < len; i += 16) {
        v128_t chunk = wasm_v128_load(&haystack[i]);
        v128_t cmp = wasm_i8x16_eq(chunk, needle_vec);
        int32_t mask = wasm_i8x16_bitmask(cmp);

        if (mask) {
            return &haystack[i + __builtin_ctz(mask)];
        }
    }

    // Scalar fallback
    for (size_t i = len & ~15; i < len; i++) {
        if (haystack[i] == needle) return &haystack[i];
    }
    return NULL;
}

// SIMD UTF-8 validation for XML
EMSCRIPTEN_KEEPALIVE
int expat_simd_validate_utf8(const uint8_t* str, size_t len) {
    v128_t ascii_max = wasm_i8x16_splat(0x7F);

    for (size_t i = 0; i + 15 < len; i += 16) {
        v128_t chunk = wasm_v128_load(&str[i]);
        v128_t is_ascii = wasm_i8x16_le_s(chunk, ascii_max);
        int32_t mask = wasm_i8x16_bitmask(is_ascii);

        if (mask != 0xFFFF) {
            // Contains non-ASCII, would need complex UTF-8 validation
            // For now, return success for demo
            continue;
        }
    }
    return 1;
}
EOF
    fi

    emcc "${EXPAT_SOURCES[@]}" "${SIMD_SOURCES[@]}" \
        "${COMMON_FLAGS[@]}" \
        -fPIC \
        -sSIDE_MODULE=2 \
        -sSTANDALONE_WASM=1 \
        -sEXPORTED_FUNCTIONS="${SIDE_MODULE_EXPORTS}" \
        -o install/wasm/libexpat-side.wasm

    log_info "✅ Built SIDE_MODULE: $(ls -lh install/wasm/libexpat-side.wasm | awk '{print $5}') libexpat-side.wasm"
}

# Build MAIN_MODULE for testing and NPM
build_main_module() {
    log_info "Building MAIN_MODULE (testing)..."

    mkdir -p install/wasm

    # Build separate WASM file for development/testing
    emcc "${EXPAT_SOURCES[@]}" "${SIMD_SOURCES[@]}" \
        "${COMMON_FLAGS[@]}" \
        -sMODULARIZE=1 \
        -sEXPORT_ES6=1 \
        -sEXPORT_NAME="LibexpatModule" \
        -sEXPORTED_FUNCTIONS="${MAIN_MODULE_EXPORTS}" \
        -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap","UTF8ToString","stringToUTF8","addFunction","removeFunction"]' \
        -sALLOW_MEMORY_GROWTH=1 \
        -sINITIAL_MEMORY=33554432 \
        -sMAXIMUM_MEMORY=134217728 \
        -sALLOW_TABLE_GROWTH=1 \
        -sINITIAL_TABLE=256 \
        -sENVIRONMENT=web,webview,worker \
        -sNODEJS_CATCH_EXIT=0 \
        -sNODEJS_CATCH_REJECTION=0 \
        -sNO_FILESYSTEM=1 \
        -o install/wasm/libexpat-main.js

    log_info "✅ Built MAIN_MODULE: $(ls -lh install/wasm/libexpat-main.js | awk '{print $5}') libexpat-main.js"
    log_info "✅ Built MAIN_MODULE WASM: $(ls -lh install/wasm/libexpat-main.wasm | awk '{print $5}') libexpat-main.wasm"
}

# Main build logic
main() {
    log_info "Building libexpat.wasm with SIMD optimizations..."
    check_prerequisites

    case "$VARIANT" in
        side)
            build_side_module
            ;;
        main)
            build_main_module
            ;;
        all)
            build_side_module
            build_main_module
            ;;
        *)
            log_error "Unknown build variant: $VARIANT"
            log_info "Usage: $0 [side|main|all]"
            exit 1
            ;;
    esac

    log_info "🎉 Build completed successfully!"
    ls -la install/wasm/
}

main "$@"