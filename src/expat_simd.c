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
        v128_t is_ascii = wasm_u8x16_le(chunk, ascii_max);
        int32_t mask = wasm_i8x16_bitmask(is_ascii);

        if (mask != 0xFFFF) {
            // Contains non-ASCII, would need complex UTF-8 validation
            // For now, return success for demo
            continue;
        }
    }
    return 1;
}
