import type { IconName } from '@/components/icon-map';

/**
 * El mapa del panel (spec DALI §7), tal como lo dibujan los diseños: en
 * escritorio, el sidebar con tres secciones; en tablet, el rail con lo de
 * operación y configuración; en móvil, la barra de cinco pestañas (la quinta,
 * «Más», abre el resto).
 */
export interface NavItem {
  to: string;
  label: string;
  /** El nombre corto para el rail y la barra («Chats», «Preguntas»). */
  short?: string;
  icon: IconName;
  /** El icono relleno/alternativo cuando está activo, si el diseño lo cambia. */
  iconActive?: IconName;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Operación',
    items: [
      { to: '/inicio', label: 'Inicio', icon: 'home' },
      { to: '/chats', label: 'Conversaciones', short: 'Chats', icon: 'chat' },
      { to: '/leads', label: 'Leads', icon: 'group' },
    ],
  },
  {
    title: 'Configurar',
    items: [
      { to: '/asistente', label: 'Asistente', icon: 'smart_toy' },
      { to: '/negocio', label: 'Negocio', icon: 'storefront' },
      { to: '/servicios', label: 'Servicios', icon: 'construction' },
      { to: '/faq', label: 'Preguntas frecuentes', short: 'Preguntas', icon: 'quiz' },
      { to: '/catalogo', label: 'Catálogo', icon: 'menu_book' },
      { to: '/whatsapp', label: 'WhatsApp', icon: 'phone_iphone' },
      { to: '/probar', label: 'Probar a Dali', short: 'Probar', icon: 'play_circle' },
    ],
  },
  {
    title: 'Cuenta',
    items: [
      { to: '/guia', label: 'Cómo funciona Dali', short: 'Guía', icon: 'route' },
      { to: '/equipo', label: 'Equipo', icon: 'badge' },
      { to: '/plan', label: 'Plan y uso', short: 'Plan', icon: 'credit_card' },
      { to: '/ajustes', label: 'Ajustes', icon: 'tune' },
    ],
  },
];

/** Lo que no está en el sidebar pero sí en el producto: llega desde «Más» y desde otras pantallas. */
export const NAV_MAS: NavItem[] = [
  { to: '/importar', label: 'Importar conocimiento', short: 'Importar', icon: 'upload_file' },
  { to: '/notificaciones', label: 'Notificaciones', icon: 'notifications' },
  { to: '/reportes', label: 'Reportes', icon: 'bar_chart' },
];

/** La barra inferior del móvil: cuatro destinos y «Más». */
export const NAV_MOBILE: NavItem[] = [
  { to: '/inicio', label: 'Inicio', icon: 'home' },
  { to: '/chats', label: 'Chats', icon: 'chat' },
  { to: '/leads', label: 'Leads', icon: 'group' },
  { to: '/asistente', label: 'Asistente', icon: 'smart_toy' },
  { to: '/mas', label: 'Más', icon: 'more_horiz' },
];

/** El rail de tablet: operación y configuración, con el nombre corto. */
export const NAV_RAIL: NavItem[] = [...NAV_SECTIONS[0].items, ...NAV_SECTIONS[1].items];
