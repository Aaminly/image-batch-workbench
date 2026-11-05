function same(a,b){
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&same(a[key],b[key]));
}
export function createHistory(){
 let states=[],cursor=0,group=null;
 return {
  reset(state,loaded=[state],position=0){states=loaded;cursor=position;group=null;},
  record(state,key=null){
   const previous=states[cursor];
   if(state.project?previous&&same(previous.project,state.project)&&same(previous.ui.excludedExportSizes,state.ui.excludedExportSizes):same(previous,state))return false;
   const merge=key!==null&&key===group&&cursor===states.length-1;
   states=states.slice(0,cursor+1);if(merge)states[cursor]=state;else{states.push(state);cursor++;}
   if(states.length>11){states.shift();cursor--;}
   group=key;return true;
  },
  end(){group=null;},
  move(delta){group=null;const next=cursor+delta;if(next<0||next>=states.length)return null;cursor=next;return states[cursor];},
  get states(){return states;},get cursor(){return cursor;},get canUndo(){return cursor>0;},get canRedo(){return cursor<states.length-1;}
 };
}
