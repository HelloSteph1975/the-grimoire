import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { ToastProvider } from './components/ToastProvider.jsx';
import { ConfirmProvider } from './components/ConfirmProvider.jsx';
import { SettingsProvider } from './components/SettingsProvider.jsx';
import { LeaveGuardProvider } from './components/LeaveGuardProvider.jsx';
import { Layout } from './components/Layout.jsx';
import { Placeholder } from './screens/Placeholder.jsx';
import { NotFound } from './screens/NotFound.jsx';
import { Settings } from './screens/Settings.jsx';
import { Trash } from './screens/Trash.jsx';

function Shell() {
  return (
    <SettingsProvider>
      <ToastProvider>
        <ConfirmProvider>
          <LeaveGuardProvider>
            <Layout />
          </LeaveGuardProvider>
        </ConfirmProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}

export const routes = [
  {
    element: <Shell />,
    children: [
      { path: '/', element: <Placeholder titleKey="nav.today" stage={4} /> },
      { path: 'spells', element: <Placeholder titleKey="nav.spells" stage={3} /> },
      { path: 'correspondences', element: <Placeholder titleKey="nav.correspondences" stage={2} /> },
      { path: 'calendar', element: <Placeholder titleKey="nav.calendar" stage={4} /> },
      { path: 'rituals', element: <Placeholder titleKey="nav.rituals" stage={5} /> },
      { path: 'journal', element: <Placeholder titleKey="nav.journal" stage={6} /> },
      { path: 'trash', element: <Trash /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
];

// createBrowserRouter inside App makes a new router per render. App renders once at the
// root, so that's fine. Don't put state above it.
export function App() {
  return <RouterProvider router={createBrowserRouter(routes)} />;
}
