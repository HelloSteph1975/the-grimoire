import { KindList } from './KindList.jsx';

export const JournalKinds = () => <KindList endpoint="/api/journal-kinds" keys="journalKinds" usageCount={u => u.entries} />;
