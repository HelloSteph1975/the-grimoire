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
import { Today } from './screens/today/Today.jsx';
import { Calendar } from './screens/calendar/Calendar.jsx';
import { OwnDatePageRoute } from './screens/calendar/OwnDatePage.jsx';
import { OwnDateFormRoute } from './screens/calendar/OwnDateForm.jsx';
import { Correspondences } from './screens/correspondences/Correspondences.jsx';
import { EntryPageRoute } from './screens/correspondences/EntryPage.jsx';
import { EntryFormRoute } from './screens/correspondences/EntryForm.jsx';
import { Spells } from './screens/spells/Spells.jsx';
import { SpellPageRoute } from './screens/spells/SpellPage.jsx';
import { SpellFormRoute } from './screens/spells/SpellForm.jsx';

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
      { path: '/', element: <Today /> },
      { path: 'spells', element: <Spells /> },
      { path: 'spells/new', element: <SpellFormRoute /> },
      { path: 'spells/:id', element: <SpellPageRoute /> },
      { path: 'spells/:id/edit', element: <SpellFormRoute /> },
      { path: 'correspondences', element: <Correspondences /> },
      { path: 'correspondences/new', element: <EntryFormRoute /> },
      { path: 'correspondences/:id', element: <EntryPageRoute /> },
      { path: 'correspondences/:id/edit', element: <EntryFormRoute /> },
      { path: 'calendar', element: <Calendar /> },
      { path: 'calendar/dates/new', element: <OwnDateFormRoute /> },
      { path: 'calendar/dates/:id', element: <OwnDatePageRoute /> },
      { path: 'calendar/dates/:id/edit', element: <OwnDateFormRoute /> },
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
