# Office dependency hardening

## Scope

Remediate the five high-severity advisories reported for the Office tools without
changing their public names or successful result shapes. The XLSX reader is the
highest-priority path because it parses user-selected files synchronously. The
PDF reader only extracts text and does not render the viewer or annotation layer,
but its vulnerable dependency is still upgraded. The `image-size` findings are
documented rather than forcing a PPTX replacement because the dependency is not
loaded by the published `pptxgenjs` path used by Hive.

## Design

Use the current safe PDF.js major and the official SheetJS CE tarball, updating
both manifests so workspace and published metadata remain aligned. Before loading
PDF or XLSX data into memory, inspect the regular file and reject inputs above a
fixed byte limit. PDF processing explicitly disables scripting/eval, bounds the
number of pages returned per call, and checks a processing deadline between
pages. XLSX processing bounds workbook sheet count, rows returned per sheet, and
checks a deadline between sheets. These controls are defense in depth; dependency
updates remain the remediation for the reported CVEs.

Tests exercise rejection before parsing, page-range validation, XLSX row limits,
and normal PDF/XLSX behavior. A repository security note records the exact
`image-size` dependency chain, why it is currently unreachable, the evidence
required before suppressing it in scanners, and the conditions that invalidate
the exception (adding image input or an upstream package change).
