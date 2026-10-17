import { KindList } from './KindList.jsx';

export const SpellKinds = () => <KindList endpoint="/api/spell-kinds" keys="kinds" usageCount={u => u.spells} />;
