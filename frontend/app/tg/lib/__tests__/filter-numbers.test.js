import { filterNumbers } from '../filter-numbers.js';
const items = [
  { number: '017', name: 'PAVO', totalAmount: 6400, percentageOfSales: 28 },
  { number: '024', name: 'IGUANA', totalAmount: 0, percentageOfSales: 0 },
  { number: '125', name: '', totalAmount: 90000, percentageOfSales: 80 },
];
test('busca por número o nombre', () => {
  expect(filterNumbers(items, { q: 'pavo', filter: 'all' }).map(i => i.number)).toEqual(['017']);
  expect(filterNumbers(items, { q: '125', filter: 'all' }).map(i => i.number)).toEqual(['125']);
});
test('filtro "con ventas" excluye monto 0 y ordena por monto desc', () => {
  expect(filterNumbers(items, { q: '', filter: 'tk' }).map(i => i.number)).toEqual(['125', '017']);
});
test('filtro riesgo alto: % >= 70', () => {
  expect(filterNumbers(items, { q: '', filter: 'risk' }).map(i => i.number)).toEqual(['125']);
});
