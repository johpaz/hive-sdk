# Security policy

## Dependency audit exceptions

### `image-size` through `pptxgenjs@4.0.1`

`image-size@1.2.1` is reported by GHSA-w3rx-r6r6-pgpr and
GHSA-5p2g-fcmc-qvqq. No patched `image-size` release is currently available.

Hive retains `pptxgenjs` because this dependency is not reachable in the current
Office tool:

- `office_escribir_pptx` accepts text, bullet points, and speaker notes only.
- It never calls `addImage` or passes image paths or buffers to `pptxgenjs`.
- The published `pptxgenjs@4.0.1` runtime does not import `image-size` along this
  generation path.

This is a documented, temporary audit exception rather than a claim that the
dependency itself is safe. Reassess it before adding PPTX image support, after a
`pptxgenjs` upgrade, or when a patched `image-size` release becomes available.
Review due: 2026-12-05.
