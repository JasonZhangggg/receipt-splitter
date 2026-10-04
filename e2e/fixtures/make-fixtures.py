from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
source = Image.open(root / "bench/data/srd-1040.jpg")
exif = Image.Exif()
exif[0x0112] = 6
source.rotate(90, expand=True).save(root / "e2e/fixtures/srd-1040-exif-rotated.jpg", quality=90, exif=exif.tobytes())
Image.new("RGB", (600, 800), "white").save(root / "e2e/fixtures/blank.png")

font = ImageFont.truetype("/System/Library/Fonts/Menlo.ttc", 24)


def draw_receipt(tsv, path, **save):
    lines = [line.split("\t") for line in tsv.read_text().strip().splitlines()]
    receipt = Image.new("RGB", (900, 80 + 40 * len(lines)), "white")
    draw = ImageDraw.Draw(receipt)
    for row, (label, *amount) in enumerate(lines):
        y = 40 + 40 * row
        draw.text((40, y), label, fill="black", font=font)
        if amount:
            draw.text((860, y), amount[0], fill="black", font=font, anchor="ra")
    receipt.save(path, **save)


draw_receipt(root / "src/parse/fixtures/topgolf.tsv", root / "e2e/fixtures/topgolf-synthetic.png")

short = Image.open(root / "bench/data/srd-1040.jpg").convert("RGB")
paper = short.getpixel((480, 700))
short.paste(paper, (95, 662, 640, 688))
short.save(root / "e2e/fixtures/srd-1040-no-sprite.jpg", quality=90)

example = [
    ("1 Chicken Fried Rice And Egg", "7.99"),
    ("1 California Tropic And Miso", "7.99"),
    ("1 Add Two Tostones", "1.00"),
    ("1 Sprite", "2.50"),
    ("1 Perrier Sparkling Water", "3.50"),
    ("Subtotal", "22.98"),
    ("Tax", "1.61"),
    ("Service fees on tables", "3.45"),
    ("Total", "1,000,028.04"),
]
over = Image.new("RGB", (900, 80 + 40 * len(example)), "white")
draw = ImageDraw.Draw(over)
for row, (label, amount) in enumerate(example):
    y = 40 + 40 * row
    draw.text((40, y), label, fill="black", font=font)
    draw.text((860, y), amount, fill="black", font=font, anchor="ra")
over.save(root / "e2e/fixtures/example-total-over-limit.png")

scan = root / "bench/scan/fixtures"
for tsv in sorted(scan.glob("*.tsv")):
    draw_receipt(tsv, scan / f"{tsv.stem}.jpg", quality=90)
