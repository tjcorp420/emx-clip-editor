export function createPlaybackSession(){
  let generation=0;
  let active=false;
  return {
    begin(){active=true;generation+=1;return generation},
    stop(){active=false;generation+=1;return generation},
    owns(token){return active&&token===generation},
    get active(){return active},
    get generation(){return generation}
  };
}
