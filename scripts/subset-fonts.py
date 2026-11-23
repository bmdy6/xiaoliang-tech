#!/usr/bin/env python3
"""重新截取首页用的思源宋体子集。

首页的宋体只保留页面里用得到的字，改了文字、博客加了书或文章后要重跑一次：
    pip install fonttools==4.* brotli
    python3 scripts/subset-fonts.py <放 NotoSerifSC-Black.otf 和 NotoSerifSC-SemiBold.otf 的目录>

收字范围：index.html 里的全部字符 + 博客 books.json / posts.json 里的书名、章节名、文章标题
（首页会动态显示这些），再加常用标点。
"""
import json
import sys
import time
import urllib.request
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parents[1]
BLOG = 'https://xiaoliang.tech/blog/'
WEIGHTS = {'Black': 'noto-serif-sc-900.woff2', 'SemiBold': 'noto-serif-sc-600.woff2'}


def blog_text():
    parts = []
    for name in ('books.json', 'posts.json'):
        for attempt in range(4):   # 服务器偶尔断 TLS，重试几次
            try:
                with urllib.request.urlopen(BLOG + name, timeout=20) as r:
                    data = json.load(r)
                break
            except OSError:
                if attempt == 3:
                    raise
                time.sleep(2)
        for item in data:
            parts.append(item.get('title', ''))
            parts.append(item.get('summary', ''))
            parts += [c.get('title', '') for c in item.get('chapters', [])]
    return ''.join(parts)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    src = Path(sys.argv[1])
    text = (ROOT / 'index.html').read_text(encoding='utf-8') + blog_text()
    text += '，。、：；？！“”‘’（）《》「」—…·0123456789'
    chars = ''.join(sorted(set(text)))
    for weight, out in WEIGHTS.items():
        opts = subset.Options()
        opts.flavor = 'woff2'
        opts.layout_features = ['*']
        font = subset.load_font(str(src / f'NotoSerifSC-{weight}.otf'), opts)
        sub = subset.Subsetter(opts)
        sub.populate(text=chars)
        sub.subset(font)
        target = ROOT / 'fonts' / out
        subset.save_font(font, str(target), opts)
        print(f'{out}: {target.stat().st_size // 1024} KB')
    print(f'{len(chars)} 个字符')


if __name__ == '__main__':
    main()
