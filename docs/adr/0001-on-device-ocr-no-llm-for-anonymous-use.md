# On-device OCR, and no LLM for anonymous use

Receipt photos never leave the device: OCR and parsing run on the phone, and no server receives the image. Anonymous use has no LLM fallback, so when the Total check fails, the Host fixes the highlighted rows by hand. We accept that cost in exchange for privacy, zero cost per scan, and no abuse surface to protect without accounts. An LLM fallback may come later for signed-in users only, where rate limits and cost can be tied to an account. Until then, accuracy gains go into the on-device OCR and parser, measured against the benchmark set.
