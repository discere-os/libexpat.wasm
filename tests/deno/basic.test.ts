import { assert, assertEquals, assertExists, assertRejects } from "@std/assert";
import Libexpat, { parseXML, validateXML } from "../../src/lib/index.ts";

Deno.test("Libexpat initialization", async () => {
  const parser = new Libexpat();

  // Should not be initialized initially
  assert(!parser.isInitialized());

  // Should initialize successfully
  await parser.initialize();
  assert(parser.isInitialized());

  // Should be idempotent
  await parser.initialize();
  assert(parser.isInitialized());

  parser.cleanup();
});

Deno.test("Version information", async () => {
  const parser = new Libexpat();
  await parser.initialize();

  // Should return version string
  const version = parser.getVersion();
  assertExists(version);
  assert(version.includes("expat"));

  // Should return structured version info
  const versionInfo = parser.getVersionInfo();
  assertExists(versionInfo);
  assert(typeof versionInfo.major === "number");
  assert(typeof versionInfo.minor === "number");
  assert(typeof versionInfo.micro === "number");
  assert(versionInfo.major >= 2);

  parser.cleanup();
});

Deno.test("SIMD capabilities detection", async () => {
  const parser = new Libexpat();
  await parser.initialize();

  const simdCaps = parser.getSIMDCapabilities();
  assertExists(simdCaps);
  assert(typeof simdCaps.simdSupported === "boolean");
  assert(typeof simdCaps.tokenizationAccelerated === "boolean");
  assert(typeof simdCaps.characterSearchAccelerated === "boolean");
  assert(typeof simdCaps.utf8ValidationAccelerated === "boolean");

  parser.cleanup();
});

Deno.test("Library features", async () => {
  const parser = new Libexpat();
  await parser.initialize();

  const features = parser.getFeatures();
  assertExists(features);
  assert(Array.isArray(features));
  assert(features.length > 0);

  // Each feature should have required properties
  features.forEach(feature => {
    assertExists(feature.feature);
    assertExists(feature.name);
    assert(typeof feature.value === "number");
  });

  parser.cleanup();
});

Deno.test("Parser creation and destruction", async () => {
  const parser = new Libexpat();
  await parser.initialize();

  // Should create parser successfully
  parser.createParser();

  // Should be able to get parser state
  const state = parser.getParserState();
  assertExists(state);
  assertEquals(state.position, -1); // Fresh parser hasn't processed any bytes yet
  assertEquals(state.line, 1);
  assertEquals(state.column, 0);
  assert(state.active);
  assert(!state.hasError);

  // Should handle cleanup
  parser.destroyParser();

  // Should be able to create new parser
  parser.createParser({ encoding: "UTF-8" });

  parser.cleanup();
});

Deno.test("Parser options", async () => {
  const parser = new Libexpat();
  await parser.initialize();

  // Should accept various parser options
  parser.createParser({
    encoding: "UTF-8",
    hashSalt: 12345,
    paramEntityParsing: true
  });

  parser.destroyParser();

  // Should handle namespace parser
  parser.createParser({
    namespaceSeparator: "|",
    encoding: "ISO-8859-1"
  });

  parser.cleanup();
});

Deno.test("Simple XML parsing", async () => {
  const xml = '<?xml version="1.0"?><root><item>Hello World</item></root>';

  const parser = new Libexpat();
  await parser.initialize();
  parser.createParser();

  const result = await parser.parseString(xml);

  assert(result.success);
  assertEquals(result.bytesProcessed, xml.length);
  assert(!result.error);

  parser.cleanup();
});

Deno.test("XML parsing with handlers", async () => {
  const xml = '<root id="test"><item type="book">Content</item></root>';

  const elements: Array<{ name: string, attrs: Record<string, string> }> = [];
  const textNodes: string[] = [];

  const result = await parseXML(xml, {
    onStartElement: (name, attrs) => {
      elements.push({ name, attrs });
    },
    onCharacterData: (data) => {
      const trimmed = data.trim();
      if (trimmed.length > 0) {
        textNodes.push(trimmed);
      }
    }
  });

  assert(result.success);
  assertEquals(elements.length, 2);
  assertEquals(elements[0].name, "root");
  assertEquals(elements[0].attrs.id, "test");
  assertEquals(elements[1].name, "item");
  assertEquals(elements[1].attrs.type, "book");
  assertEquals(textNodes.length, 1);
  assertEquals(textNodes[0], "Content");
});

Deno.test("Error handling for malformed XML", async () => {
  const malformedXml = '<root><unclosed>content</root>';

  const result = await parseXML(malformedXml);

  assert(!result.success);
  assertExists(result.error);
  assert(typeof result.error.code === "number");
  assertExists(result.error.message);
  assert(result.error.line > 0);
  assert(result.error.column >= 0);
  assert(result.error.byteIndex >= 0);
});

Deno.test("XML validation helper", async () => {
  const validXml = '<?xml version="1.0"?><root><item>test</item></root>';
  const invalidXml = '<root><unclosed>test</root>';

  const isValid = await validateXML(validXml);
  const isInvalid = await validateXML(invalidXml);

  assert(isValid);
  assert(!isInvalid);
});

Deno.test("Empty and whitespace-only XML", async () => {
  const parser = new Libexpat();
  await parser.initialize();
  parser.createParser();

  // Empty string should fail
  const emptyResult = await parser.parseString("");
  assert(!emptyResult.success);

  // Whitespace only should fail
  const whitespaceResult = await parser.parseString("   \n  \t  ");
  assert(!whitespaceResult.success);

  parser.cleanup();
});

Deno.test("Large XML document", async () => {
  // Generate a reasonably large XML document
  const itemCount = 1000;
  const items = Array.from({ length: itemCount }, (_, i) =>
    `<item id="${i}"><name>Item ${i}</name><value>${Math.random()}</value></item>`
  ).join('\n    ');

  const largeXml = `<?xml version="1.0"?>\n<catalog>\n    ${items}\n</catalog>`;

  let elementCount = 0;
  let attributeCount = 0;

  const startTime = performance.now();

  const result = await parseXML(largeXml, {
    onStartElement: (name, attrs) => {
      elementCount++;
      attributeCount += Object.keys(attrs).length;
    }
  });

  const endTime = performance.now();
  const duration = endTime - startTime;

  assert(result.success);
  assertEquals(elementCount, itemCount + 1); // items + catalog
  assertEquals(attributeCount, itemCount); // one id per item

  // Should parse reasonably quickly (less than 1 second for 1000 items)
  assert(duration < 1000, `Parsing took too long: ${duration}ms`);

  console.log(`Parsed ${itemCount} items in ${duration.toFixed(2)}ms (${(elementCount / duration * 1000).toFixed(0)} elements/sec)`);
});

Deno.test("Resource cleanup", async () => {
  const parser = new Libexpat();
  await parser.initialize();
  parser.createParser();

  // Parse some XML to create handlers
  await parser.parseString('<root>test</root>', {
    onStartElement: () => {},
    onCharacterData: () => {}
  });

  // Cleanup should not throw
  parser.cleanup();

  // Should not be initialized after cleanup
  assert(!parser.isInitialized());

  // Should throw when trying to use after cleanup
  assertRejects(() => parser.parseString('<test/>'));
});