import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { SesionProvider, useSesion } from '@/lib/session';
import { AppShell } from '@/layout/AppShell';
import { AdminShell } from '@/layout/AdminShell';
import { irAConsola } from '@/lib/operador';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { EntrarScreen } from '@/screens/auth/EntrarScreen';
import { CodigoScreen } from '@/screens/auth/CodigoScreen';
import { RegistroScreen } from '@/screens/registro/RegistroScreen';
const RegistroWhatsAppScreen = lazy(() => import('@/screens/registro/RegistroWhatsAppScreen').then((m) => ({ default: m.RegistroWhatsAppScreen })));
const RegistroConocimientoScreen = lazy(() => import('@/screens/registro/RegistroConocimientoScreen').then((m) => ({ default: m.RegistroConocimientoScreen })));
import { InicioScreen } from '@/screens/inicio/InicioScreen';
import { PendienteScreen } from '@/screens/PendienteScreen';

const ChatsScreen = lazy(() => import('@/screens/chats/ChatsScreen').then((m) => ({ default: m.ChatsScreen })));
const ChatScreen = lazy(() => import('@/screens/chats/ChatScreen').then((m) => ({ default: m.ChatScreen })));
const LeadsScreen = lazy(() => import('@/screens/leads/LeadsScreen').then((m) => ({ default: m.LeadsScreen })));
const LeadScreen = lazy(() => import('@/screens/leads/LeadScreen').then((m) => ({ default: m.LeadScreen })));
const AsistenteScreen = lazy(() => import('@/screens/asistente/AsistenteScreen').then((m) => ({ default: m.AsistenteScreen })));
const GuionProvider = lazy(() => import('@/screens/servicios/GuionProvider').then((m) => ({ default: m.GuionProvider })));
const ServiciosScreen = lazy(() => import('@/screens/servicios/ServiciosScreen').then((m) => ({ default: m.ServiciosScreen })));
const GuionScreen = lazy(() => import('@/screens/servicios/GuionScreen').then((m) => ({ default: m.GuionScreen })));
const ProbarScreen = lazy(() => import('@/screens/probar/ProbarScreen').then((m) => ({ default: m.ProbarScreen })));
const NegocioScreen = lazy(() => import('@/screens/negocio/NegocioScreen').then((m) => ({ default: m.NegocioScreen })));
const FaqScreen = lazy(() => import('@/screens/faq/FaqScreen').then((m) => ({ default: m.FaqScreen })));
const CatalogoScreen = lazy(() => import('@/screens/catalogo/CatalogoScreen').then((m) => ({ default: m.CatalogoScreen })));
const ImportarScreen = lazy(() => import('@/screens/importar/ImportarScreen').then((m) => ({ default: m.ImportarScreen })));
const WhatsAppScreen = lazy(() => import('@/screens/whatsapp/WhatsAppScreen').then((m) => ({ default: m.WhatsAppScreen })));
const EquipoScreen = lazy(() => import('@/screens/equipo/EquipoScreen').then((m) => ({ default: m.EquipoScreen })));
const PlanScreen = lazy(() => import('@/screens/plan/PlanScreen').then((m) => ({ default: m.PlanScreen })));
const NotificacionesScreen = lazy(() => import('@/screens/notificaciones/NotificacionesScreen').then((m) => ({ default: m.NotificacionesScreen })));
const ReportesScreen = lazy(() => import('@/screens/reportes/ReportesScreen').then((m) => ({ default: m.ReportesScreen })));
const AjustesScreen = lazy(() => import('@/screens/ajustes/AjustesScreen').then((m) => ({ default: m.AjustesScreen })));
const EmpresasAdminScreen = lazy(() => import('@/screens/admin/EmpresasAdminScreen').then((m) => ({ default: m.EmpresasAdminScreen })));
const EmpresaAdminScreen = lazy(() => import('@/screens/admin/EmpresaAdminScreen').then((m) => ({ default: m.EmpresaAdminScreen })));
const VerticalesAdminScreen = lazy(() => import('@/screens/admin/VerticalesAdminScreen').then((m) => ({ default: m.VerticalesAdminScreen })));
const SaludAdminScreen = lazy(() => import('@/screens/admin/SaludAdminScreen').then((m) => ({ default: m.SaludAdminScreen })));
const MasAdminScreen = lazy(() => import('@/screens/admin/MasAdminScreen').then((m) => ({ default: m.MasAdminScreen })));

/** En móvil y tablet la conversación y el lead son pantallas enteras; en escritorio viven dentro de la lista. */
const ChatMovil = () => (
  <div className="lg:hidden">
    <ChatScreen />
  </div>
);
const LeadMovil = () => (
  <div className="xl:hidden">
    <LeadScreen />
  </div>
);

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } });

/** Sin sesión, a «Entrar»; mientras se sabe, nada parpadea. */
function ConSesion({ children }: { children: ReactNode }) {
  const { yo, cargando, suspendida } = useSesion();
  const location = useLocation();
  if (cargando) return <div className="min-h-dvh bg-stone-100" aria-busy="true" />;
  if (suspendida) return <EmpresaSuspendida />;
  if (!yo) return <Navigate to="/entrar" replace state={{ desde: location.pathname }} />;
  if (yo.usuario.rol === 'operator') return <Navigate to="/admin/empresas" replace />;
  return <>{children}</>;
}

/**
 * La consola (S1–S4) es del operador: con sesión de operador entra; si la
 * identidad es operador pero la sesión es de una empresa (llegó por la URL),
 * se le ofrece pasar (`POST auth/operador`; el cambio nunca es automático,
 * para que «Abrir su panel» no rebote); si no es operador, al inicio. Y al
 * revés: una sesión de operador que caiga en el panel de una empresa va a
 * la consola.
 */
function SoloOperador({ children }: { children: ReactNode }) {
  const { yo, cargando } = useSesion();
  if (cargando) return <div className="min-h-dvh bg-stone-100" aria-busy="true" />;
  if (!yo) return <Navigate to="/entrar" replace />;
  if (yo.usuario.rol === 'operator') return <>{children}</>;
  if (yo.esOperador) return <PasarALaConsola />;
  return <Navigate to="/inicio" replace />;
}

function PasarALaConsola() {
  const queryClient = useQueryClient();
  const [error, setError] = useState(false);
  const pasar = () => irAConsola(queryClient).catch(() => setError(true));
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <p className="font-headline text-2xl font-bold tracking-tight text-stone-900">Consola de Dali</p>
        <p className="mt-2 font-body text-[15px] text-stone-600">Estás en el panel de tu empresa. Para ver todas las empresas, pasa a la consola del operador.</p>
        {error && <p className="mt-3 font-body text-sm text-red-700">No se pudo cambiar de sesión. Intenta de nuevo.</p>}
        <div className="mt-5 flex justify-center gap-3">
          <Link to="/inicio" className="inline-flex h-11 items-center rounded-xl border border-stone-200 px-4 font-body text-[15px] font-semibold text-stone-700 hover:bg-stone-50">
            Volver a mi panel
          </Link>
          <button
            type="button"
            onClick={() => void pasar()}
            className="inline-flex h-11 items-center rounded-xl bg-teal-700 px-4 font-body text-[15px] font-semibold text-white hover:bg-teal-800"
          >
            Entrar a la consola
          </button>
        </div>
      </div>
    </div>
  );
}

/** E1: la empresa está suspendida por el operador de Dali; la sesión existe pero el panel no abre. */
function EmpresaSuspendida() {
  const { salir } = useSesion();
  return (
    <div className="flex min-h-dvh items-center justify-center bg-stone-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 text-center shadow-sm">
        <p className="font-headline text-2xl font-bold tracking-tight text-stone-900">Tu empresa está suspendida</p>
        <p className="mt-2 font-body text-[15px] text-stone-600">Dali dejó de atender y el panel está cerrado. Escríbele al equipo de Dali para reactivarla.</p>
        <button
          type="button"
          onClick={() => void salir()}
          className="mt-5 inline-flex h-11 items-center rounded-xl border border-stone-200 px-4 font-body text-[15px] font-semibold text-stone-700 hover:bg-stone-50"
        >
          Salir
        </button>
      </div>
    </div>
  );
}

function SoloSinSesion({ children }: { children: ReactNode }) {
  const { yo, cargando } = useSesion();
  if (cargando) return <div className="min-h-dvh bg-stone-100" aria-busy="true" />;
  if (yo) return <Navigate to="/inicio" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SesionProvider>
        <BrowserRouter basename="/dali">
          <Routes>
            <Route
              path="/entrar"
              element={
                <SoloSinSesion>
                  <EntrarScreen />
                </SoloSinSesion>
              }
            />
            <Route
              path="/entrar/codigo"
              element={
                <SoloSinSesion>
                  <CodigoScreen />
                </SoloSinSesion>
              }
            />
            <Route
              path="/registro"
              element={
                <SoloSinSesion>
                  <RegistroScreen />
                </SoloSinSesion>
              }
            />
            <Route
              path="/registro/codigo"
              element={
                <SoloSinSesion>
                  <CodigoScreen />
                </SoloSinSesion>
              }
            />
            <Route
              path="/registro/whatsapp"
              element={
                <ConSesion>
                  <Suspense fallback={null}>
                    <RegistroWhatsAppScreen />
                  </Suspense>
                </ConSesion>
              }
            />
            <Route
              path="/registro/conocimiento"
              element={
                <ConSesion>
                  <Suspense fallback={null}>
                    <RegistroConocimientoScreen />
                  </Suspense>
                </ConSesion>
              }
            />
            <Route
              path="/admin"
              element={
                <SoloOperador>
                  <AdminShell />
                </SoloOperador>
              }
            >
              <Route index element={<Navigate to="/admin/empresas" replace />} />
              <Route
                path="empresas"
                element={
                  <Suspense fallback={null}>
                    <EmpresasAdminScreen />
                  </Suspense>
                }
              />
              <Route
                path="empresas/:id"
                element={
                  <Suspense fallback={null}>
                    <EmpresaAdminScreen />
                  </Suspense>
                }
              />
              <Route
                path="verticales"
                element={
                  <Suspense fallback={null}>
                    <VerticalesAdminScreen />
                  </Suspense>
                }
              />
              <Route
                path="salud"
                element={
                  <Suspense fallback={null}>
                    <SaludAdminScreen />
                  </Suspense>
                }
              />
              <Route
                path="mas"
                element={
                  <Suspense fallback={null}>
                    <MasAdminScreen />
                  </Suspense>
                }
              />
              <Route path="*" element={<Navigate to="/admin/empresas" replace />} />
            </Route>
            <Route
              element={
                <ConSesion>
                  <AppShell />
                </ConSesion>
              }
            >
              <Route path="/inicio" element={<InicioScreen />} />
              <Route
                path="/chats"
                element={
                  <Suspense fallback={null}>
                    <ChatsScreen />
                  </Suspense>
                }
              />
              <Route
                path="/chats/:id"
                element={
                  <Suspense fallback={null}>
                    <ChatsScreen />
                    <ChatMovil />
                  </Suspense>
                }
              />
              <Route
                path="/leads"
                element={
                  <Suspense fallback={null}>
                    <LeadsScreen />
                  </Suspense>
                }
              />
              <Route
                path="/leads/:id"
                element={
                  <Suspense fallback={null}>
                    <LeadsScreen />
                    <LeadMovil />
                  </Suspense>
                }
              />
              <Route
                path="/asistente"
                element={
                  <Suspense fallback={null}>
                    <AsistenteScreen />
                  </Suspense>
                }
              />
              <Route
                path="/servicios"
                element={
                  <Suspense fallback={null}>
                    <GuionProvider />
                  </Suspense>
                }
              >
                <Route index element={<ServiciosScreen />} />
                <Route path=":id" element={<GuionScreen />} />
                <Route path=":id/preguntas/:n" element={<GuionScreen />} />
              </Route>
              <Route
                path="/negocio"
                element={
                  <Suspense fallback={null}>
                    <NegocioScreen />
                  </Suspense>
                }
              />
              <Route
                path="/faq"
                element={
                  <Suspense fallback={null}>
                    <FaqScreen />
                  </Suspense>
                }
              />
              <Route
                path="/catalogo"
                element={
                  <Suspense fallback={null}>
                    <CatalogoScreen />
                  </Suspense>
                }
              />
              <Route
                path="/importar"
                element={
                  <Suspense fallback={null}>
                    <ImportarScreen />
                  </Suspense>
                }
              />
              <Route
                path="/probar"
                element={
                  <Suspense fallback={null}>
                    <ProbarScreen />
                  </Suspense>
                }
              />
              <Route
                path="/whatsapp"
                element={
                  <Suspense fallback={null}>
                    <WhatsAppScreen />
                  </Suspense>
                }
              />
              <Route
                path="/equipo"
                element={
                  <Suspense fallback={null}>
                    <EquipoScreen />
                  </Suspense>
                }
              />
              <Route
                path="/plan"
                element={
                  <Suspense fallback={null}>
                    <PlanScreen />
                  </Suspense>
                }
              />
              <Route
                path="/notificaciones"
                element={
                  <Suspense fallback={null}>
                    <NotificacionesScreen />
                  </Suspense>
                }
              />
              <Route
                path="/reportes"
                element={
                  <Suspense fallback={null}>
                    <ReportesScreen />
                  </Suspense>
                }
              />
              <Route
                path="/ajustes"
                element={
                  <Suspense fallback={null}>
                    <AjustesScreen />
                  </Suspense>
                }
              />
              {['/mas'].map((ruta) => (
                <Route key={ruta} path={`${ruta}/*`} element={<PendienteScreen titulo={ruta.slice(1)} />} />
              ))}
              <Route path="/" element={<Navigate to="/inicio" replace />} />
              <Route path="*" element={<Navigate to="/inicio" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
        <Toaster position="top-center" richColors />
      </SesionProvider>
    </QueryClientProvider>
  );
}
