# Security policy

## Vendored security-sensitive dependencies

### PptxGenJS 4.0.1 ESM

Hive vendors the official PptxGenJS 4.0.1 ESM artifact for the text-only
`office_escribir_pptx` tool. The upstream npm package declares the vulnerable
`image-size` package even though its ESM artifact does not import it. Vendoring
that artifact removes `image-size` from Hive's installable dependency graph.

The vendored copy, license, provenance, and update instructions live in
`packages/core/src/vendor/pptxgenjs/`. Do not expose PPTX image input without a
new security review.
