from PIL import Image, ImageOps
from pathlib import Path

src = Path('/mnt/data/orig/selected/extracted')
out = Path('/mnt/data/HOVAI-Netlify/public/assets')
out.mkdir(parents=True, exist_ok=True)

assets = {
    # category / still life
    'still-hero.webp': 'DSC01624 1.jpg',
    'still-01.webp': 'DSC01620.jpg',
    'still-02.webp': 'DSC01624.jpg',
    'still-03.webp': 'Frame 1509998418.jpg',
    'still-04.webp': '1 1001.jpg',
    'still-05.webp': '1 11.jpg',
    'still-06.webp': '2 8.jpg',
    'still-07.webp': '3 9.jpg',
    'still-08.webp': '3 8.jpg',
    # people & still life
    'people-hero.webp': 'DSC01681.jpg',
    'people-01.webp': 'DSC01662.jpg',
    'people-02.webp': 'DSC01679.jpg',
    'people-03.webp': 'DSC01695.jpg',
    'people-04.webp': 'DSC01724.jpg',
    'people-05.webp': 'DSC01123.jpg',
    'people-06.webp': 'DSC01142.jpg',
    'people-07.webp': 'DSC01204.jpg',
    'people-08.webp': 'DSC01389.jpg',
    'people-09.webp': 'DSC01427.jpg',
    'people-10.webp': 'DSC01499.jpg',
    # fashion
    'fashion-hero.webp': '2022-7-13韩笑2423ai 拷贝xxx.jpg',
    'fashion-01.webp': '2022-7-13韩笑2545ai 拷贝xxx.jpg',
    'fashion-02.webp': '2022-7-13韩笑2600.jpg',
    'fashion-03.webp': '2022-7-13韩笑26403ai xxx.jpg',
    'fashion-04.webp': '2022-7-13韩笑26403aixx.jpg',
    'fashion-05.webp': '2022-7-13韩笑2687.jpg',
    'fashion-06.webp': 'EDITORIAL (2)-72.jpg',
    'fashion-07.webp': 'EDITORIAL (2)-73.jpg',
    'fashion-08.webp': 'EDITORIAL (2)-74.jpg',
    'fashion-09.webp': 'EDITORIAL (2)-75.jpg',
    # past work / about
    'past-hero.webp': 'KV1.jpg',
    'past-01.webp': 'KV-2.jpg',
    'past-02.webp': 'Rectangle.jpg',
    'past-03.webp': 'p10-防摔.jpg',
    'past-04.webp': 'p11-磁吸.jpg',
    'past-05.webp': 'DSC01749.jpg',
    'past-06.webp': 'DSC01757.jpg',
    'past-07.webp': 'DSC01767.jpg',
    'past-08.webp': 'DSC01768.jpg',
    'about-01.webp': 'fashion-12011.9.jpg' if (src/'fashion-12011.9.jpg').exists() else 'EDITORIAL (2)-75.jpg',
    'about-02.webp': 'EDITORIAL (2)-72.jpg',
    'about-03.webp': 'DSC01539.jpg',
    'about-04.webp': 'DSC01605.jpg',
}

# fallback if one named asset isn't present
for output_name, source_name in list(assets.items()):
    p = src / source_name
    if not p.exists():
        print('MISSING', source_name, 'for', output_name)
        if output_name == 'past-hero.webp':
            p = src / 'KV-2.jpg'
        else:
            continue
    with Image.open(p) as im:
        im = ImageOps.exif_transpose(im)
        if im.mode not in ('RGB','RGBA'):
            im = im.convert('RGB')
        # Preserve enough pixels for crisp 2x desktop; homepage heroes get a bit more.
        max_edge = 3000 if 'hero' in output_name else 2400
        if max(im.size) > max_edge:
            scale = max_edge / max(im.size)
            im = im.resize((round(im.width*scale), round(im.height*scale)), Image.Resampling.LANCZOS)
        # WebP RGB avoids accidental alpha flattening inconsistencies on Netlify/CDN.
        if im.mode == 'RGBA':
            bg = Image.new('RGB', im.size, 'white')
            bg.paste(im, mask=im.getchannel('A'))
            im = bg
        else:
            im = im.convert('RGB')
        im.save(out/output_name, 'WEBP', quality=88, method=6)
        print(output_name, im.size, (out/output_name).stat().st_size)
