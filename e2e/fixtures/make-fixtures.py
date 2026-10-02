from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
source = Image.open(root / "bench/data/srd-1040.jpg")
exif = Image.Exif()
exif[0x0112] = 6
source.rotate(90, expand=True).save(root / "e2e/fixtures/srd-1040-exif-rotated.jpg", quality=90, exif=exif.tobytes())
Image.new("RGB", (600, 800), "white").save(root / "e2e/fixtures/blank.png")

lines = [line.split("\t") for line in (root / "src/parse/fixtures/topgolf.tsv").read_text().strip().splitlines()]
font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 24)
receipt = Image.new("RGB", (900, 80 + 40 * len(lines)), "white")
draw = ImageDraw.Draw(receipt)
for row, (label, amount) in enumerate(lines):
    y = 40 + 40 * row
    draw.text((40, y), label, fill="black", font=font)
    draw.text((860, y), amount, fill="black", font=font, anchor="ra")
receipt.save(root / "e2e/fixtures/topgolf-synthetic.png")

short = Image.open(root / "bench/data/srd-1040.jpg").convert("RGB")
paper = short.getpixel((480, 700))
short.paste(paper, (95, 662, 640, 688))
short.save(root / "e2e/fixtures/srd-1040-no-sprite.jpg", quality=90)
