import io
import os
import urllib.request

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SOURCE = (
    "https://raw.githubusercontent.com/google/fonts/"
    "95f4904fc8bcf26d3420fe315560c96417c6dec7/ofl/archivo/Archivo%5Bwdth,wght%5D.ttf"
)
UNICODES = "U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013-2014,U+2018-2019,U+201C-201D,U+2022,U+2026,U+2212"
FEATURES = ["kern", "liga", "ccmp", "locl", "tnum", "lnum", "case"]
FACES = {
    "Archivo-Medium.ttf": {"wght": 500, "wdth": 100},
    "Archivo-CondensedBlack.ttf": {"wght": 850, "wdth": 72},
}

here = os.path.dirname(os.path.abspath(__file__))
source = urllib.request.urlopen(SOURCE).read()

for name, axes in FACES.items():
    font = TTFont(io.BytesIO(source), recalcTimestamp=False)
    font = instancer.instantiateVariableFont(font, axes, updateFontNames=False)
    options = subset.Options()
    options.layout_features = FEATURES
    options.hinting = False
    options.desubroutinize = True
    options.name_IDs = [1, 2, 4, 6]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    path = os.path.join(here, name)
    font.save(path)
    print(name, os.path.getsize(path))
