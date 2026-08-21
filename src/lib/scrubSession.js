export function createScrubSession(){
  let generation=0;
  let active=false;
  return {
    begin(){active=true;generation+=1;return generation},
    ensure(){return active?generation:this.begin()},
    finish(token){
      if(!active||token!==generation)return false;
      active=false;
      return true;
    },
    cancel(){active=false;generation+=1;return generation},
    owns(token){return token===generation},
    get active(){return active},
    get generation(){return generation}
  };
}
