import { assert, assertEquals, assertExists } from "@std/assert";
import Libexpat from "../../src/lib/index.ts";

Deno.test("SIMD detection and capabilities", async () => {
  const parser = new Libexpat();
  await parser.initialize({ useSIMD: true });

  const capabilities = parser.getSIMDCapabilities();
  assertExists(capabilities);

  // Log SIMD availability for debugging
  console.log(`SIMD supported: ${capabilities.simdSupported}`);
  console.log(`Tokenization accelerated: ${capabilities.tokenizationAccelerated}`);
  console.log(`Character search accelerated: ${capabilities.characterSearchAccelerated}`);
  console.log(`UTF-8 validation accelerated: ${capabilities.utf8ValidationAccelerated}`);

  // SIMD support is environment dependent but structure should be correct
  assert(typeof capabilities.simdSupported === "boolean");
  assert(typeof capabilities.tokenizationAccelerated === "boolean");
  assert(typeof capabilities.characterSearchAccelerated === "boolean");
  assert(typeof capabilities.utf8ValidationAccelerated === "boolean");

  parser.cleanup();
});

Deno.test("SIMD vs non-SIMD performance comparison", async () => {
  // Generate test XML with many elements for meaningful comparison
  const itemCount = 2000;
  const testXml = generateTestXML(itemCount);

  // Test with SIMD enabled
  const simdParser = new Libexpat();
  await simdParser.initialize({ useSIMD: true });
  simdParser.createParser();

  let simdElementCount = 0;
  const simdHandlers = {
    onStartElement: () => { simdElementCount++; }
  };

  const simdStart = performance.now();
  const simdResult = await simdParser.parseString(testXml, simdHandlers);
  const simdEnd = performance.now();
  const simdTime = simdEnd - simdStart;

  assert(simdResult.success);
  assertEquals(simdElementCount, itemCount + 1);

  simdParser.cleanup();

  // Test with SIMD disabled
  const noSIMDParser = new Libexpat();
  await noSIMDParser.initialize({ useSIMD: false });
  noSIMDParser.createParser();

  let noSIMDElementCount = 0;
  const noSIMDHandlers = {
    onStartElement: () => { noSIMDElementCount++; }
  };

  const noSIMDStart = performance.now();
  const noSIMDResult = await noSIMDParser.parseString(testXml, noSIMDHandlers);
  const noSIMDEnd = performance.now();
  const noSIMDTime = noSIMDEnd - noSIMDStart;

  assert(noSIMDResult.success);
  assertEquals(noSIMDElementCount, itemCount + 1);

  noSIMDParser.cleanup();

  // Log performance comparison
  const speedup = noSIMDTime / simdTime;
  console.log(`SIMD time: ${simdTime.toFixed(2)}ms`);
  console.log(`Non-SIMD time: ${noSIMDTime.toFixed(2)}ms`);
  console.log(`Speedup: ${speedup.toFixed(2)}x`);

  // Both should produce the same results
  assertEquals(simdElementCount, noSIMDElementCount);

  // SIMD should be at least as fast (allowing for variance in small tests)
  assert(simdTime <= noSIMDTime * 1.2, `SIMD slower than expected: ${simdTime}ms vs ${noSIMDTime}ms`);
});

Deno.test("SIMD with complex XML structures", async () => {
  const complexXml = `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns="http://example.com/catalog"
         xmlns:book="http://example.com/book"
         xmlns:price="http://example.com/pricing">
  <!-- Complex structure with mixed content -->
  <metadata>
    <created>2024-01-01T00:00:00Z</created>
    <description><![CDATA[
      This is a complex XML document with:
      - Multiple namespaces
      - CDATA sections
      - Comments
      - Processing instructions
      - Mixed content types
    ]]></description>
  </metadata>
  ${Array.from({ length: 100 }, (_, i) => `
  <book:item book:id="isbn-${i}" book:category="technology">
    <book:title>Book Title ${i}</book:title>
    <book:author email="author${i}@example.com">Author ${i}</book:author>
    <price:cost price:currency="USD" price:tax="included">${(Math.random() * 100).toFixed(2)}</price:cost>
    <book:description><![CDATA[Description for book ${i} with special chars: &<>"']]></book:description>
    <book:tags>
      <book:tag>programming</book:tag>
      <book:tag>webassembly</book:tag>
      <book:tag>performance</book:tag>
    </book:tags>
  </book:item>`).join('')}
</catalog>`;

  const parser = new Libexpat();
  await parser.initialize({ useSIMD: true });
  parser.createParser({ namespaceSeparator: "|" });

  let elements = 0;
  let attributes = 0;
  let cdataSections = 0;
  let comments = 0;
  let namespaces = 0;
  let textNodes = 0;

  const handlers = {
    onStartElement: (name: string, attrs: Record<string, string>) => {
      elements++;
      attributes += Object.keys(attrs).length;
    },
    onCharacterData: (data: string) => {
      if (data.trim().length > 0) {
        textNodes++;
      }
    },
    onStartCDATA: () => {
      cdataSections++;
    },
    onComment: () => {
      comments++;
    },
    onStartNamespace: () => {
      namespaces++;
    }
  };

  const startTime = performance.now();
  const result = await parser.parseString(complexXml, handlers);
  const endTime = performance.now();

  assert(result.success);

  console.log(`Complex XML parsing results:`);
  console.log(`  Elements: ${elements}`);
  console.log(`  Attributes: ${attributes}`);
  console.log(`  CDATA sections: ${cdataSections}`);
  console.log(`  Comments: ${comments}`);
  console.log(`  Namespaces: ${namespaces}`);
  console.log(`  Text nodes: ${textNodes}`);
  console.log(`  Parse time: ${(endTime - startTime).toFixed(2)}ms`);

  // Verify reasonable numbers
  assert(elements > 300); // Should have many elements
  assert(attributes > 300); // Should have many attributes
  assert(cdataSections > 0); // Should have found CDATA sections
  assert(comments > 0); // Should have found comments
  assert(namespaces > 0); // Should have found namespace declarations

  parser.cleanup();
});

Deno.test("SIMD performance with large documents", async () => {
  const sizes = [1000, 5000, 10000];

  for (const size of sizes) {
    const largeXml = generateTestXML(size);
    const xmlSizeMB = (largeXml.length / 1024 / 1024).toFixed(2);

    const parser = new Libexpat();
    await parser.initialize({ useSIMD: true });
    parser.createParser();

    let elementCount = 0;
    let attributeCount = 0;
    const handlers = {
      onStartElement: (_: string, attrs: Record<string, string>) => {
        elementCount++;
        attributeCount += Object.keys(attrs).length;
      }
    };

    const startTime = performance.now();
    const result = await parser.parseString(largeXml, handlers);
    const endTime = performance.now();

    const duration = endTime - startTime;
    const throughputMBps = (largeXml.length / 1024 / 1024) / (duration / 1000);

    assert(result.success);
    assertEquals(elementCount, size + 1);

    console.log(`Size: ${size} items (${xmlSizeMB} MB)`);
    console.log(`  Parse time: ${duration.toFixed(2)}ms`);
    console.log(`  Throughput: ${throughputMBps.toFixed(1)} MB/s`);
    console.log(`  Elements/sec: ${(elementCount / duration * 1000).toLocaleString()}`);

    // Should maintain reasonable performance (at least 10 MB/s)
    assert(throughputMBps > 10, `Throughput too low: ${throughputMBps.toFixed(1)} MB/s`);

    parser.cleanup();
  }
});

function generateTestXML(itemCount: number): string {
  const items = Array.from({ length: itemCount }, (_, i) => `
  <item id="${i}" category="test-${i % 5}" status="active">
    <name>Test Item ${i}</name>
    <description>This is test item number ${i} for performance testing with SIMD optimization</description>
    <value>${Math.random().toFixed(6)}</value>
    <timestamp>${new Date(Date.now() + i * 1000).toISOString()}</timestamp>
    <metadata>
      <created-by>test-generator</created-by>
      <version>1.0</version>
      <tags>
        <tag>performance</tag>
        <tag>simd</tag>
        <tag>webassembly</tag>
      </tags>
    </metadata>
  </item>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns="http://example.com/test" itemCount="${itemCount}">
  <metadata>
    <created>${new Date().toISOString()}</created>
    <generator>libexpat.wasm SIMD test</generator>
    <description><![CDATA[
      Generated test document for SIMD performance evaluation.
      Contains ${itemCount} items with nested structures.
    ]]></description>
  </metadata>
  <items>${items}
  </items>
</catalog>`;
}