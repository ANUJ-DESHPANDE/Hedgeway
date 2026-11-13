import {expect,it} from 'vitest';
import type {AIRun} from '../src/intelligence-types';
import {conversationMemory} from '../server/conversation-memory';
const run=(id:number,question:string,privateRun=false)=>({id:String(id),question,createdAt:'2026-11-13T10:00:00Z',answer:{summary:'Original statement',findings:[],openQuestions:[]},coverage:{portfolioIncluded:privateRun}} as unknown as AIRun);
it('retrieves an earlier user correction beyond the recent tail without inventing a summary',()=>{const runs=[run(0,'Correction: my timeframe is weeks, not minutes'),...Array.from({length:50},(_,i)=>run(i+1,'Teach the next general concept'))];expect(conversationMemory(runs,'What should I consider next?',false).some(r=>r.turnId==='0')).toBe(true)});
it('excludes private prior content from both relevant retrieval and recent context',()=>{expect(conversationMemory([run(0,'Remember my private holdings',true)],'holdings',false)).toEqual([])});
it('selects relevant older context and keeps a bounded packet',()=>{const runs=[run(0,'Explain liquidity gaps'),...Array.from({length:50},(_,i)=>run(i+1,'General question'))];const memory=conversationMemory(runs,'Compare liquidity gaps',false);expect(memory[0].turnId).toBe('0');expect(JSON.stringify(memory).length).toBeLessThanOrEqual(14000)});
