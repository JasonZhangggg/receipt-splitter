# Benchmark data attribution

`bench/fetch.mjs` downloads every source below, selects 82 receipts, and writes the images in this folder and the labels in `bench/labels/`. Run it with `npm run bench:fetch`.

Changes to every image: `bench/fetch.mjs` scales images longer than 1280 px down to 1280 px, re-encodes an image as JPEG quality 70 when that makes it smaller, and removes EXIF metadata. Changes to every label: `bench/fetch.mjs` drafts each label as a `Receipt` from the source's transcription or annotation, and a person corrects the draft against the image. A label's `note` records each correction.

| Images | Source | License | Labels drafted from |
|---|---|---|---|
| `srd-*.jpg` (50) | ExpressExpense SRD | MIT | Zenodo 13688441 transcriptions (CC BY 4.0) |
| `cord-*.jpg` (20) | CORD-v2 test split | CC BY 4.0 | CORD-v2 gold labels (CC BY 4.0) |
| `docjay131-*.jpg` (12) | docjay131 receipts-ocr-dataset | MIT | docjay131 labels (MIT) |

## ExpressExpense SRD

- Page: https://expressexpense.com/blog/free-receipt-images-ocr-machine-learning-dataset/
- Download: https://expressexpense.com/large-receipt-image-dataset-SRD.zip (MD5 `c8eb0f2d286da5ab742e7a5b59f15147`)
- License: MIT. The page states that the dataset "is free for use under The MIT License (MIT)" and asks users to cite ExpressExpense.com as the source.

Source: ExpressExpense.com.

```text
The MIT License (MIT)

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Zenodo 13688441 transcriptions

- Record: https://zenodo.org/records/13688441, DOI `10.5281/zenodo.13688441`
- Download: https://zenodo.org/api/records/13688441/files/Dataset.zip/content (MD5 `b7a29ba1cfab963714782e1752ce8e62`)
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Creators: Manoela Auad, Sarah Alves, Gabriel Kakizaki, Julio Reis, and Michel Silva. "A labeled dataset of hand-captured images of restaurant receipts", Zenodo, 2024.

The SRD labels use the record's `Labels/*.txt` transcriptions and its `homography.csv` corners, which set the `skew` tag.

## CORD-v2

- Dataset: https://huggingface.co/datasets/naver-clova-ix/cord-v2, test split, read through https://datasets-server.huggingface.co/rows?dataset=naver-clova-ix/cord-v2&config=default&split=test
- Project: https://github.com/clovaai/cord
- License: Creative Commons Attribution 4.0 International, https://creativecommons.org/licenses/by/4.0/
- Citation: Seunghyun Park, Seung Shin, Bado Lee, Junyeop Lee, Jaeheung Surh, Minjoon Seo, and Hwalsuk Lee. "CORD: A Consolidated Receipt Dataset for Post-OCR Parsing." Document Intelligence Workshop at NeurIPS, 2019.

A CORD file name keeps the row index in the test split, so `cord-017.jpg` is test row 17. CORD amounts are Indonesian rupiah, stored as whole rupiah in the `cents` fields.

## docjay131 receipts-ocr-dataset

- Dataset: https://huggingface.co/datasets/docjay131/receipts-ocr-dataset, read through https://datasets-server.huggingface.co/rows?dataset=docjay131/receipts-ocr-dataset&config=default&split=train
- License: MIT, as the dataset card declares.
- The dataset card says Gemini extracted its labels. The benchmark uses them only as drafts.

A docjay131 file name keeps the row index in the train split. `bench/fetch.mjs` skips a row when a Zenodo transcription contains both its subtotal and its total, because the dataset reuses SRD photos.

Source: docjay131 on Hugging Face. The MIT License text above applies.
