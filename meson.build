project('libexpat.wasm', 'c', version: '2.6.4', meson_version: '>=1.3.0')

simd = get_option('simd')

incs = include_directories('.', 'expat/lib')

core_sources = files(
  'expat/lib/xmlparse.c',
  'expat/lib/xmlrole.c',
  'expat/lib/xmltok.c',
  'expat/lib/xmltok_impl.c',
  'expat/lib/xmltok_ns.c',
)

cargs = []
if simd
  cargs += ['-msimd128']
endif

executable('expat-main',
  files('wasm/expat_wasm_module.c') + core_sources,
  include_directories: incs,
  c_args: cargs,
  link_args: [
    '-sWASM=1','-sMODULARIZE=1','-sEXPORT_ES6=1','-sEXPORT_NAME=ExpatModule',
    '-sALLOW_MEMORY_GROWTH=1','-sNO_FILESYSTEM=1',
    '-sEXPORTED_RUNTIME_METHODS=["cwrap","ccall","UTF8ToString"]',
    '-O3','-flto',
  ],
  install: true,
  install_dir: get_option('bindir')
)

shared_module('expat-side',
  files('wasm/expat_wasm_side.c') + core_sources,
  include_directories: incs,
  name_prefix: '',
  name_suffix: 'wasm',
  c_args: cargs,
  link_args: [
    '-sSIDE_MODULE=2','-fPIC','-O3','-flto',
    '-sEXPORTED_FUNCTIONS=["_expat_wasm_version"]',
  ],
  install: true,
  install_dir: get_option('libdir')
)

static_library('expat',
  core_sources,
  include_directories: incs,
  c_args: cargs,
  install: true,
  install_dir: get_option('libdir')
)

