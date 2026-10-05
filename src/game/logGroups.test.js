import { groupLogByVisit, visitEnterMessage, visitLeaveMessage } from './logGroups';

const sys = (content) => ({ role: 'system', content });

describe('groupLogByVisit', () => {
  it('groups an enter..leave span and leaves the rest ungrouped', () => {
    const convo = [sys('road'), visitEnterMessage('You venture into Mossy Cave.', 'Mossy Cave'), sys('rat!'), visitLeaveMessage('You leave.'), sys('road again')];
    const items = groupLogByVisit(convo);
    expect(items.map((i) => i.type)).toEqual(['msg', 'visit', 'msg']);
    expect(items[1]).toMatchObject({ name: 'Mossy Cave', closed: true });
    expect(items[1].items.map((i) => i.index)).toEqual([1, 2, 3]);
  });

  it('keeps the current visit open while the party is inside', () => {
    const items = groupLogByVisit([visitEnterMessage('In.', 'Ashford'), sys('shop')]);
    expect(items[0]).toMatchObject({ type: 'visit', closed: false });
    expect(items[0].items).toHaveLength(2);
  });

  it('opens a new group when the same place is entered again', () => {
    const a = visitEnterMessage('In.', 'Mossy Cave');
    const b = visitEnterMessage('In again.', 'Mossy Cave');
    const items = groupLogByVisit([a, visitLeaveMessage('Out.'), sys('road'), b]);
    const visits = items.filter((i) => i.type === 'visit');
    expect(visits).toHaveLength(2);
    expect(visits[0].id).not.toBe(visits[1].id);
  });

  it('closes an unterminated visit when the next one starts', () => {
    const items = groupLogByVisit([visitEnterMessage('In.', 'A'), sys('x'), visitEnterMessage('In.', 'B')]);
    expect(items[0]).toMatchObject({ name: 'A', closed: true });
    expect(items[1]).toMatchObject({ name: 'B', closed: false });
  });

  it('renders old saves without markers unchanged', () => {
    const convo = [sys('a'), { role: 'ai', content: 'b' }];
    expect(groupLogByVisit(convo)).toEqual([{ type: 'msg', msg: convo[0], index: 0 }, { type: 'msg', msg: convo[1], index: 1 }]);
  });
});
