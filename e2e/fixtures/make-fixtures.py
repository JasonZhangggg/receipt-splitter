from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parents[2]
source = Image.open(root / "bench/data/srd-1040.jpg")
exif = Image.Exif()
exif[0x0112] = 6
source.rotate(90, expand=True).save(root / "e2e/fixtures/srd-1040-exif-rotated.jpg", quality=90, exif=exif.tobytes())
Image.new("RGB", (600, 800), "white").save(root / "e2e/fixtures/blank.png")
