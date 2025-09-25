#include <emscripten.h>
#include "expat/lib/expat.h"

EMSCRIPTEN_KEEPALIVE
const char* expat_wasm_version(void) {
  return XML_ExpatVersion();
}

