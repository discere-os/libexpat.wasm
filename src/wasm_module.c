#include "../expat/lib/expat.h"
#include <emscripten/emscripten.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>

// WASM-exported functions for expat XML parsing

EMSCRIPTEN_KEEPALIVE
const XML_LChar* expat_get_version(void) {
    return XML_ExpatVersion();
}

EMSCRIPTEN_KEEPALIVE
XML_Expat_Version expat_get_version_info(void) {
    return XML_ExpatVersionInfo();
}

// Parser creation and destruction
EMSCRIPTEN_KEEPALIVE
XML_Parser expat_parser_create(const XML_Char* encoding) {
    return XML_ParserCreate(encoding);
}

EMSCRIPTEN_KEEPALIVE
XML_Parser expat_parser_create_ns(const XML_Char* encoding, XML_Char separator) {
    return XML_ParserCreateNS(encoding, separator);
}

EMSCRIPTEN_KEEPALIVE
void expat_parser_free(XML_Parser parser) {
    XML_ParserFree(parser);
}

EMSCRIPTEN_KEEPALIVE
XML_Bool expat_parser_reset(XML_Parser parser, const XML_Char* encoding) {
    return XML_ParserReset(parser, encoding);
}

// Parsing functions
EMSCRIPTEN_KEEPALIVE
enum XML_Status expat_parse(XML_Parser parser, const char* s, int len, int isFinal) {
    return XML_Parse(parser, s, len, isFinal);
}

EMSCRIPTEN_KEEPALIVE
enum XML_Status expat_parse_buffer(XML_Parser parser, int len, int isFinal) {
    return XML_ParseBuffer(parser, len, isFinal);
}

EMSCRIPTEN_KEEPALIVE
void* expat_get_buffer(XML_Parser parser, int len) {
    return XML_GetBuffer(parser, len);
}

// Error handling
EMSCRIPTEN_KEEPALIVE
enum XML_Error expat_get_error_code(XML_Parser parser) {
    return XML_GetErrorCode(parser);
}

EMSCRIPTEN_KEEPALIVE
const XML_LChar* expat_error_string(enum XML_Error code) {
    return XML_ErrorString(code);
}

EMSCRIPTEN_KEEPALIVE
XML_Size expat_get_current_line_number(XML_Parser parser) {
    return XML_GetCurrentLineNumber(parser);
}

EMSCRIPTEN_KEEPALIVE
XML_Size expat_get_current_column_number(XML_Parser parser) {
    return XML_GetCurrentColumnNumber(parser);
}

EMSCRIPTEN_KEEPALIVE
XML_Index expat_get_current_byte_index(XML_Parser parser) {
    return XML_GetCurrentByteIndex(parser);
}

// Parser configuration
EMSCRIPTEN_KEEPALIVE
int expat_set_param_entity_parsing(XML_Parser parser, enum XML_ParamEntityParsing parsing) {
    return XML_SetParamEntityParsing(parser, parsing);
}

EMSCRIPTEN_KEEPALIVE
int expat_set_hash_salt(XML_Parser parser, unsigned long hash_salt) {
    return XML_SetHashSalt(parser, hash_salt);
}

// User data
EMSCRIPTEN_KEEPALIVE
void expat_set_user_data(XML_Parser parser, void* userData) {
    XML_SetUserData(parser, userData);
}

EMSCRIPTEN_KEEPALIVE
void* expat_get_user_data(XML_Parser parser) {
    return XML_GetUserData(parser);
}

// Handler callbacks - simplified for WASM usage
// Note: Full callback support would require more complex JavaScript integration

EMSCRIPTEN_KEEPALIVE
void expat_set_element_handler(XML_Parser parser, XML_StartElementHandler start, XML_EndElementHandler end) {
    XML_SetElementHandler(parser, start, end);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_character_data_handler(XML_Parser parser, XML_CharacterDataHandler handler) {
    XML_SetCharacterDataHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_processing_instruction_handler(XML_Parser parser, XML_ProcessingInstructionHandler handler) {
    XML_SetProcessingInstructionHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_comment_handler(XML_Parser parser, XML_CommentHandler handler) {
    XML_SetCommentHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_start_cdata_handler(XML_Parser parser, XML_StartCdataSectionHandler handler) {
    XML_SetStartCdataSectionHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_end_cdata_handler(XML_Parser parser, XML_EndCdataSectionHandler handler) {
    XML_SetEndCdataSectionHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_default_handler(XML_Parser parser, XML_DefaultHandler handler) {
    XML_SetDefaultHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_start_namespace_decl_handler(XML_Parser parser, XML_StartNamespaceDeclHandler handler) {
    XML_SetStartNamespaceDeclHandler(parser, handler);
}

EMSCRIPTEN_KEEPALIVE
void expat_set_end_namespace_decl_handler(XML_Parser parser, XML_EndNamespaceDeclHandler handler) {
    XML_SetEndNamespaceDeclHandler(parser, handler);
}

// Feature testing
EMSCRIPTEN_KEEPALIVE
const XML_Feature* expat_get_feature_list(void) {
    return XML_GetFeatureList();
}

// Memory management utilities for WASM
EMSCRIPTEN_KEEPALIVE
void* expat_malloc(size_t size) {
    return malloc(size);
}

EMSCRIPTEN_KEEPALIVE
void expat_free(void* ptr) {
    free(ptr);
}

// Simple parsing helper for common use cases
EMSCRIPTEN_KEEPALIVE
int expat_parse_string(const char* xml_string, int length) {
    XML_Parser parser = XML_ParserCreate(NULL);
    if (!parser) {
        return -1;
    }
    
    enum XML_Status status = XML_Parse(parser, xml_string, length, XML_TRUE);
    int result = (status == XML_STATUS_OK) ? 0 : 1;
    
    XML_ParserFree(parser);
    return result;
}