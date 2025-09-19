/**
 * Performance benchmarks for libexpat.wasm
 *
 * These benchmarks measure XML parsing performance across different scenarios:
 * - SIMD vs non-SIMD performance
 * - Various document sizes and complexities
 * - Memory usage patterns
 * - Throughput measurements
 */

import Libexpat, { parseXML } from "../src/lib/index.ts";

// Generate test XML documents of various sizes and complexities
function generateSimpleXML(itemCount: number): string {
  const items = Array.from({ length: itemCount }, (_, i) =>
    `<item id="${i}"><name>Item ${i}</name><value>${Math.random().toFixed(6)}</value></item>`
  ).join('\n  ');

  return `<?xml version="1.0"?>\n<root>\n  ${items}\n</root>`;
}

function generateComplexXML(itemCount: number): string {
  const items = Array.from({ length: itemCount }, (_, i) => `
    <book id="book-${i}" category="fiction" year="${2000 + (i % 24)}">
      <title lang="en">The Adventures of Item ${i}</title>
      <author>
        <first-name>Author${i}</first-name>
        <last-name>Writer</last-name>
        <email>author${i}@example.com</email>
      </author>
      <price currency="USD">${(10 + Math.random() * 40).toFixed(2)}</price>
      <description><![CDATA[
        This is a detailed description of book ${i}.
        It contains various special characters: &<>"'
        And multiple lines of text content.
      ]]></description>
      <tags>
        <tag>fiction</tag>
        <tag>adventure</tag>
        <tag>bestseller</tag>
      </tags>
      <metadata>
        <isbn>978-${String(i).padStart(10, '0')}</isbn>
        <pages>${200 + Math.floor(Math.random() * 500)}</pages>
        <weight unit="g">${300 + Math.floor(Math.random() * 800)}</weight>
      </metadata>
    </book>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<catalog xmlns="http://example.com/books"
         xmlns:meta="http://example.com/metadata"
         totalItems="${itemCount}">
  <header>
    <created>${new Date().toISOString()}</created>
    <generator>libexpat.wasm benchmark</generator>
  </header>
  <books>${items}
  </books>
</catalog>`;
}

// Benchmark setup and helpers
let parser: Libexpat;
let simpleXml1000: string;
let simpleXml5000: string;
let complexXml1000: string;
let largeXml10000: string;

// Pre-generate test data
Deno.bench({
  name: "setup",
  fn() {
    simpleXml1000 = generateSimpleXML(1000);
    simpleXml5000 = generateSimpleXML(5000);
    complexXml1000 = generateComplexXML(1000);
    largeXml10000 = generateSimpleXML(10000);
  }
});

// Simple XML parsing benchmarks
Deno.bench({
  name: "parse simple XML (1000 items) - SIMD enabled",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize({ useSIMD: true });
    parser.createParser();

    let elementCount = 0;
    await parser.parseString(simpleXml1000, {
      onStartElement: () => { elementCount++; }
    });

    parser.cleanup();
  }
});

Deno.bench({
  name: "parse simple XML (1000 items) - SIMD disabled",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize({ useSIMD: false });
    parser.createParser();

    let elementCount = 0;
    await parser.parseString(simpleXml1000, {
      onStartElement: () => { elementCount++; }
    });

    parser.cleanup();
  }
});

Deno.bench({
  name: "parse simple XML (5000 items) - SIMD enabled",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize({ useSIMD: true });
    parser.createParser();

    let elementCount = 0;
    await parser.parseString(simpleXml5000, {
      onStartElement: () => { elementCount++; }
    });

    parser.cleanup();
  }
});

// Complex XML parsing benchmarks
Deno.bench({
  name: "parse complex XML (1000 items) - SIMD enabled",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize({ useSIMD: true });
    parser.createParser({ namespaceSeparator: "|" });

    let elementCount = 0;
    let attributeCount = 0;
    let cdataCount = 0;

    await parser.parseString(complexXml1000, {
      onStartElement: (_, attrs) => {
        elementCount++;
        attributeCount += Object.keys(attrs).length;
      },
      onStartCDATA: () => { cdataCount++; }
    });

    parser.cleanup();
  }
});

// Large document benchmarks
Deno.bench({
  name: "parse large XML (10000 items) - SIMD enabled",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize({ useSIMD: true });
    parser.createParser();

    let elementCount = 0;
    await parser.parseString(largeXml10000, {
      onStartElement: () => { elementCount++; }
    });

    parser.cleanup();
  }
});

// Convenience function benchmarks
Deno.bench({
  name: "parseXML convenience function (1000 items)",
  async fn() {
    let elementCount = 0;
    await parseXML(simpleXml1000, {
      onStartElement: () => { elementCount++; }
    });
  }
});

// Parser reuse benchmarks
Deno.bench({
  name: "parser reuse (multiple documents)",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize();

    const documents = [
      generateSimpleXML(100),
      generateSimpleXML(200),
      generateSimpleXML(150)
    ];

    for (const doc of documents) {
      parser.createParser();
      let elementCount = 0;
      await parser.parseString(doc, {
        onStartElement: () => { elementCount++; }
      });
      parser.destroyParser();
    }

    parser.cleanup();
  }
});

// Memory allocation benchmarks
Deno.bench({
  name: "repeated parser creation/destruction",
  async fn() {
    for (let i = 0; i < 10; i++) {
      const parser = new Libexpat();
      await parser.initialize();
      parser.createParser();

      await parser.parseString('<root><item>test</item></root>');

      parser.cleanup();
    }
  }
});

// Validation-only benchmarks
Deno.bench({
  name: "XML validation (1000 items)",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize();
    parser.createParser();

    // Parse without handlers (validation only)
    await parser.parseString(simpleXml1000);

    parser.cleanup();
  }
});

// Error handling benchmarks
Deno.bench({
  name: "error handling (malformed XML)",
  async fn() {
    const malformedXml = '<root><item>unclosed element</root>';

    const parser = new Libexpat();
    await parser.initialize();
    parser.createParser();

    try {
      await parser.parseString(malformedXml);
    } catch {
      // Expected to fail
    }

    parser.cleanup();
  }
});

// Feature detection benchmarks
Deno.bench({
  name: "SIMD capabilities detection",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize();

    const caps = parser.getSIMDCapabilities();
    const features = parser.getFeatures();
    const version = parser.getVersion();

    parser.cleanup();
  }
});

// Streaming-style parsing benchmark
Deno.bench({
  name: "streaming-style parsing (large document)",
  async fn() {
    const parser = new Libexpat();
    await parser.initialize({ streaming: true });
    parser.createParser();

    // Simulate streaming by parsing chunks
    const fullXml = generateSimpleXML(2000);
    const chunkSize = Math.floor(fullXml.length / 10);

    let totalElements = 0;

    // Parse in chunks (simulating streaming)
    for (let i = 0; i < fullXml.length; i += chunkSize) {
      const chunk = fullXml.slice(i, Math.min(i + chunkSize, fullXml.length));
      const isFinal = i + chunkSize >= fullXml.length;

      // For benchmark purposes, we'll parse the whole document
      // In real streaming, we'd parse incrementally
    }

    // Parse the complete document for this benchmark
    await parser.parseString(fullXml, {
      onStartElement: () => { totalElements++; }
    });

    parser.cleanup();
  }
});