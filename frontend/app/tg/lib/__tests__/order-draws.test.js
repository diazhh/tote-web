import { orderDraws, isEditable } from '../order-draws.js';

const D = (t, status) => ({ id: t, drawTime: t, status });

test('próximo primero; pasados aparte y descendente', () => {
  const draws = [D('09:00:00','DRAWN'), D('21:00:00','SCHEDULED'), D('13:00:00','DRAWN'), D('16:00:00','SCHEDULED')];
  const { upcoming, past } = orderDraws(draws, '14:00');
  expect(upcoming.map(d => d.drawTime)).toEqual(['16:00:00','21:00:00']); // próximo (16) primero
  expect(past.map(d => d.drawTime)).toEqual(['13:00:00','09:00:00']);     // más reciente primero
});

test('isEditable: DRAWN no editable, resto sí', () => {
  expect(isEditable(D('16:00:00','SCHEDULED'))).toBe(true);
  expect(isEditable(D('16:00:00','CLOSED'))).toBe(true);
  expect(isEditable(D('09:00:00','DRAWN'))).toBe(false);
});
