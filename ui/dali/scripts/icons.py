#!/usr/bin/env python3
"""Genera src/components/icon-map.ts con los Material Symbols que usan los diseños (design/html)."""
import re, glob, os
ALIAS = {  # nombres que los diseños usan y que el paquete renombró
    'add_circle_outline': 'add_circle', 'auto_awesome': 'wand_stars', 'auto_fix_high': 'wand_shine',
    'chat_bubble_outline': 'chat_bubble', 'delete_outline': 'delete', 'error_outline': 'error', 'expand_more': 'keyboard_arrow_down',
    'file_download': 'download', 'help_outline': 'help', 'magic_button': 'wand_stars', 'magnet': 'filter_vintage',
    'people': 'group', 'person_outline': 'person', 'phone': 'call', 'phone_android': 'mobile', 'phone_iphone': 'mobile',
    'phonelink_erase': 'mobile_off', 'report_problem': 'warning', 'send_to_mobile': 'send', 'smartphone': 'mobile',
    'tips_and_updates': 'emoji_objects', 'whatsapp': 'chat',
}
names = set()
for f in glob.glob('design/html/*.html'):
    names.update(re.findall(r'material-symbols-outlined[^>]*>\s*([a-z_0-9]+)\s*<', open(f, encoding='utf-8').read()))
names = sorted(names)
def archivo(n):
    real = ALIAS.get(n, n)
    return real if os.path.exists(f'node_modules/@material-symbols/svg-400/outlined/{real}.svg') else None
def ident(n): return ''.join(p.capitalize() for p in n.split('_'))
ok = [(n, archivo(n)) for n in names]
faltan = [n for n, a in ok if not a]
ok = [(n, a) for n, a in ok if a]
importados = sorted(set(a for _, a in ok))
lines = ["// GENERADO por scripts/icons.py desde design/html: los Material Symbols que usan los diseños, como SVG autoalojado.",
         "// No editar a mano. Los nombres que el paquete renombró van por alias (ver el script).",
         "import type { FunctionComponent, SVGProps } from 'react';"]
lines += [f"import {ident(a)} from '@material-symbols/svg-400/outlined/{a}.svg?react';" for a in importados]
lines += ["", "export type IconName ="] + [f"  | '{n}'" for n, _ in ok]
lines[-1] += ';'
lines += ["", "export const ICONS: Record<IconName, FunctionComponent<SVGProps<SVGSVGElement>>> = {"] + [f"  {n}: {ident(a)}," for n, a in ok] + ["};", ""]
open('src/components/icon-map.ts', 'w', encoding='utf-8').write('\n'.join(lines))
print(len(ok), 'iconos;', 'sin archivo:', faltan)
