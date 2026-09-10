// engine-smoke.mjs : sanity verification of miniprogram/lib/engine.js
import * as e from '../miniprogram/lib/engine.js';

const rt = e.jdeToGregorian(e.gregorianToJde(2023, 5, 4));
console.log('roundtrip 2023-05-04 ->', JSON.stringify(rt));

console.log('jdn 2000-01-01 =', e.gregorianToJde(2000, 1, 1));
console.log('day pillar 2000-01-01 =', JSON.stringify(e.dayPillar(e.gregorianToJde(2000, 1, 1))));
console.log('day pillar 2000-01-02 =', JSON.stringify(e.dayPillar(e.gregorianToJde(2000, 1, 2))));
console.log('solarLon 2023-03-20 =', e.solarLon(e.gregorianToJde(2023, 3, 20)).toFixed(3));

const lichun = e.termJde(2, 2023);
console.log('2023 立春 ->', JSON.stringify(e.jdeToGregorian(lichun)));
const chunfen = e.termJde(5, 2023);
console.log('2023 春分 ->', JSON.stringify(e.jdeToGregorian(chunfen)));
const xiaoman = e.termJde(9, 2023);
console.log('2023 小满 ->', JSON.stringify(e.jdeToGregorian(xiaoman)));

const f = e.buildFacts(2023, 5, 4);
console.log('facts=', JSON.stringify(f, null, 1));
console.log('EoT Feb11 2023 =', e.eotMinutes(e.gregorianToJde(2023, 2, 11)).toFixed(2), 'min (expect ~ -13.8)');
console.log('EoT May4  2023 =', e.eotMinutes(e.gregorianToJde(2023, 5, 4)).toFixed(2), 'min (expect ~ +3.3)');
console.log('EoT Nov3  2023 =', e.eotMinutes(e.gregorianToJde(2023, 11, 3)).toFixed(2), 'min (expect ~ +16.4)');