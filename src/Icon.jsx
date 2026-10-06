import React from 'react';
const paths = {
  add: 'M12 5v14M5 12h14', upload: 'M12 16V4m-5 5 5-5 5 5M4 16v4h16v-4',
  play: 'm8 5 11 7-11 7Z', pause: 'M8 5v14M16 5v14', prev: 'M5 5v14m14-14-10 7 10 7Z', next: 'M19 5v14M5 5l10 7-10 7Z',
  undo: 'M8 5 3 10l5 5M3 10h10a7 7 0 0 1 7 7', redo: 'm16 5 5 5-5 5m5-5H11a7 7 0 0 0-7 7',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7', copy: 'M9 9h11v11H9ZM4 15H3V3h12v1',
  arrow: 'M12 4v16m-6-6 6 6 6-6', up: 'm6 15 6-6 6 6', down: 'm6 9 6 6 6-6',
  film: 'M3 4h18v16H3ZM7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4', image: 'M3 3h18v18H3ZM3 16l6-6 6 6 3-3 3 3M16 7h.01',
  screen: 'M3 4h18v13H3Zm5 17h8m-4-4v4', check: 'm5 12 4 4L19 6', close: 'm6 6 12 12M6 18 18 6',
  settings: 'M4 6h16M4 12h16M4 18h16M8 3v6M16 9v6M10 15v6', scissors: 'm8 8 12 12M8 16 20 4M5 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM5 14a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  layers: 'm12 3 10 6-10 6L2 9Zm-10 12 10 6 10-6M2 15l10 6 10-6', save: 'M4 3h14l3 3v15H3V3Zm3 0v7h10V3M7 21v-7h10v7',
};
export function Icon({name, size = 18}) {return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.film}/></svg>;}
