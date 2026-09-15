import { ICONS, type IconName } from './icon-map';
import { cn } from '@/lib/utils';

/**
 * Un Material Symbol como en los diseños (`<span class="material-symbols-outlined">nombre</span>`),
 * pero autoalojado: el SVG del paquete, del tamaño y color del texto que lo rodea.
 */
export function Icon({ name, className, filled = false, ...rest }: { name: IconName; className?: string; filled?: boolean } & Omit<React.SVGProps<SVGSVGElement>, 'name'>) {
  const Svg = ICONS[name];
  return <Svg aria-hidden="true" focusable="false" className={cn('inline-block size-[1em] shrink-0 fill-current align-middle', filled && 'icon-filled', className)} {...rest} />;
}
