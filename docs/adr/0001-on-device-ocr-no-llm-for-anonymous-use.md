# On-device OCR, and no LLM for anonymous use

Receipt photos never leave the device: OCR and parsing run on the phone, and no server receives the image. Anonymous use has no LLM fallback, so when the Total check fails, the Host fixes the highlighted rows by hand. We accept that cost in exchange for privacy, zero cost per scan, and no abuse surface to protect without accounts. An LLM fallback may come later for signed-in users only, where rate limits and cost can be tied to an account. Until then, accuracy gains go into the on-device OCR and parser, measured against the benchmark set.

Amended by ADR 0007 on 2026-10-01. OCR and parsing still run on the device, but a downscaled copy of the photo goes to the Split when the Host creates the link, so everyone in the Split can view it.

Amended on 2026-10-01. A failing Total check no longer highlights rows or blocks anything. It shows as a quiet note on home and on the Split page, and anyone fixes a line on the Split page.
