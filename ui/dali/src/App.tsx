import { lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { SesionProvider, useSesion } from '@/lib/session';
import { AppShell } from '@/layout/AppShell';
import { EntrarScreen } from '@/screens/auth/EntrarScreen';
import { CodigoScreen } from '@/screens/auth/CodigoScreen';
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
  const { yo, cargando } = useSesion();
  const location = useLocation();
  if (cargando) return <div className="min-h-dvh bg-stone-100" aria-busy="true" />;
  if (!yo) return <Navigate to="/entrar" replace state={{ desde: location.pathname }} />;
  return <>{children}</>;
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
            <Route path="/registro/*" element={<PendienteScreen titulo="Registro" />} />
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
