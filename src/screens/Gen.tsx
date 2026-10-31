import ActionLayer, { type Actions } from '../components/ActionLayer';
import { G, type GId } from './generated';

/** Renders a converted design screen and makes its existing buttons functional. */
export default function Gen({ id, actions, replace }: { id: GId; actions: Actions; replace?: Record<string, string> }) {
  const Comp = G[id];
  return (
    <ActionLayer actions={actions} replace={replace}>
      <Comp />
    </ActionLayer>
  );
}
