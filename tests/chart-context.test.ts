import {expect,it} from 'vitest';
import {openDatabase} from '../server/db/index';
import {saveChartContext,readChartContext} from '../server/chart-context';
it('pins immutable chart evidence and rejects another instrument',()=>{const db=openDatabase(':memory:');try{const data={symbol:'INFY',exchange:'NSE',interval:'5',source:'Upstox',fetchedAt:'2026-11-13T10:00:00Z',bars:[{time:'2026-11-13T09:55:00Z',open:10,high:12,low:9,close:11,volume:100}]};const id=saveChartContext(db,data);expect(readChartContext(db,id,'INFY').bars[0].close).toBe(11);expect(()=>readChartContext(db,id,'TCS')).toThrow('does not match');expect(saveChartContext(db,data)).toBe(id)}finally{db.close()}});
it('does not substitute a current chart when the selected evidence is missing',()=>{const db=openDatabase(':memory:');try{expect(()=>readChartContext(db,'missing','INFY')).toThrow('no longer available')}finally{db.close()}});
